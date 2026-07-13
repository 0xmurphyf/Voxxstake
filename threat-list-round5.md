# 第五轮安全审计报告 — Voxxstake

**审计日期**: 2026-07-13  
**审计范围**: commit `c909798`  
**方法**: 全量代码审查 (24 个 .ts 文件) + agent 辅助 + 实时测试

---

## 总体评估

经过四轮修复，安全态势已非常稳固。本轮发现 **4 个 High**、**3 个 Medium**、**4 个 Low**，无 Critical。

| 严重级别 | 数量 | 
|---------|------|
| Critical | 0 |
| High | 4 |
| Medium | 3 |
| Low | 4 |
| **合计** | **11** |

> Agent 原始发现 21 个，经人工审核排除 10 个（误报/已修复/设计如此）。

---

## 已排除的误报

| # | 声称 | 实际 |
|---|------|------|
| #3 | 排名 multiplier 显示不一致 | **误报** — `computePoints` 使用 `session_multiplier` 而非传入的 `holdingMultiplier`，传入的 multiplier 仅用于响应中的 `multiplier` 字段（展示当前倍率），不影响积分计算。设计如此。 |
| #6 | image 错误信息泄露 | **极低风险** — SSRF guard 已阻止私有 IP，HTTP status code 泄露的信息量微乎其微，且仅对已认证的链上 NFT URL 有效 |
| #7 | debug/nfts address 校验缺失 | **非问题** — admin-only 端点，admin 不会恶意攻击自己 |
| #8 | holding multiplier 公式 | **确认正确** — 1 NFT = 1.0x 是设计意图 |
| #9 | image.ts 磁盘探测 | **确认安全** — MD5 hash 防路径遍历，in-memory cache 绕过磁盘探测，6 次 existsSync 可忽略 |
| #11 | console.error 泄露敏感信息 | **极低风险** — RPC URL 是公开端点，MongoDB URL 来自 env 不会出现在错误消息中 |
| #16 | TTL + unique 索引冲突 | **确认安全** — MongoDB 允许共存，两者操作不同字段 |
| #18 | JWT_EXPIRY_HOURS env 未被读取 | **非问题** — 注释说的是"可通过 env 覆盖"，但代码用常量。注释不准确但非安全风险 |
| #20 | backgroundSync 不更新 last_seen_at | **设计如此** — 后台同步不是用户活动 |
| #21 | IPv6 私有范围不完整 | **低风险** — NAT64/文档前缀在云环境中不可达，核心的 ::ffff: 已处理 |

---

## 高危 (High)

### H-1: Nonce `findOneAndUpdate` + upsert 竞态 — E11000 导致认证失败

**文件**: `backend/src/routes/auth.ts:83-87`, `backend/src/models/Nonce.ts:30-37`

**问题**: 两个并发 `/nonce` 请求对同一地址，当两者都找不到已有未使用 nonce 时，都会尝试 upsert insert。唯一索引导致第二个请求抛出 `E11000 duplicate key error`，用户收到 500 错误无法登录。

**触发条件**: 同一用户两个浏览器 tab 同时加载 → 同时触发 `/nonce` → 极其精确的时序（两个 find 都在第一个 insert 之前完成）

**修复**: catch `E11000` 并重试为 `updateOne`（非 upsert）

---

### H-2: `filenameCache` 无界增长 — 永久内存泄漏

**文件**: `backend/src/routes/image.ts:23`

**问题**: `filenameCache` Map 从未被清理。每请求一个唯一的 objectId，就永久占用一条记录。如果 image proxy 在进程生命周期内服务 100k 个不同 NFT，就占用 100k 条记录的内存。

**对比**: 其他 Map（authLastSeen, imageLastSeen 等）都有周期性清理，唯独 `filenameCache` 没有。

**修复**: 添加 LRU 上限（如 `lru-cache` 包或手动 Map size 限制 + 淘汰）

---

### H-3: 所有限速 Map 的清理策略存在 IPv6 耗尽攻击

**文件**: `backend/src/routes/staking.ts:19`, `auth.ts:17`, `image.ts:31`, `ranking.ts:14`, `visitor.ts:7`

**问题**: 所有 per-IP 限速 Map 使用"每 N 次写入清理一次过期条目"的模式。攻击者拥有 IPv6 /64 子网（18 quintillion 个地址），可以：
1. 每次请求换一个新 IP
2. 每个请求间隔略大于 throttle 阈值（避免 429）
3. Map 不断增长但清理条件永远不触发（因为清理阈值基于 `size % N === 0`）

以 `authLastSeen` 为例：清理条件是 `size % 100 === 0`。攻击者用 10 万个不同 IPv6 地址各发一次 `/nonce`，Map 增长到 100k 条目，直到第 100k 次才触发清理。在此之前内存已被消耗。

**修复**: 使用 `setInterval` 定时清理（如每 60 秒），而非基于 size 阈值的清理

---

### H-4: 缺少 objectId 格式校验 — RPC 配额滥用

**文件**: `backend/src/routes/staking.ts:332-335`, `backend/src/services/sui.ts:136`

**问题**: `GET /api/staking/nft/:objectId` 不校验 objectId 格式，直接将任意字符串传给 `sui_getObject` RPC。已认证的攻击者可以枚举随机字符串消耗 RPC 配额。

**修复**: 添加 Sui object ID 格式校验（64 字符 hex 或 66 字符 0x 前缀）

---

## 中危 (Medium)

### M-1: Background sync 与用户 sync 竞态 — 可能丢失积分

**文件**: `backend/src/services/backgroundSync.ts:41-153`, `backend/src/routes/staking.ts:43-151`

**问题**: 后台同步和用户触发同步可能同时操作同一地址的 stake 记录，双方都执行 find → modify → save 模式，后写入的覆盖先写入的。

**场景**:
1. 后台同步开始处理地址 A
2. 用户触发 `/sync` 对地址 A
3. 两者都读到 `existingStakes`（相同状态）
4. 后台同步 pause 一个 NFT，锁住积分
5. 用户同步也操作同一个 NFT，用旧的 `locked_points` 值覆盖
6. 积分丢失

**当前缓解**: 单实例 Railway 部署，事件循环单线程 — 两个 async 操作不会真正"同时"执行 JS 代码。但 `await existing.save()` 之间的 `await` 点会切换上下文。

**修复**: 使用 MongoDB `findOneAndUpdate` 替代 find + modify + save，或添加 per-address 互斥锁

---

### M-2: `/api/staking/nft/:objectId` 无限速

**文件**: `backend/src/routes/staking.ts:332`

**问题**: 这是唯一一个有 auth 但没有 rate limit 的 staking 端点。`/sync` 和 `/positions` 有 `syncRateLimitMap`，但 `/nft/:objectId` 没有任何限制。

**修复**: 添加 per-user 冷却（如 500ms）

---

### M-3: `download-images.ts` 仍使用 `readdirSync`

**文件**: `backend/src/scripts/download-images.ts:43`

**问题**: 第四轮修复了 `image.ts` 的 `readdirSync`，但 `download-images.ts` 的 `downloadImage()` 函数中仍使用 `fs.readdirSync(CACHE_DIR).filter(...)`。在 `--watch` 模式下，缓存文件增长后每次扫描都阻塞。

**修复**: 使用与 image.ts 相同的 hash+extension 探测模式

---

## 低危 (Low)

### L-1: debug/nfts 内联 admin 检查 vs requireAdmin 复用

**文件**: `backend/src/routes/staking.ts:370`

**问题**: 代码重复，维护风险。如果 admin 检查逻辑变更，此处可能遗漏。

---

### L-2: `SYNC_RATE_LIMIT_SEC` 无范围校验

**文件**: `backend/src/config.ts:50`

**问题**: 如果运维误设 `SYNC_RATE_LIMIT_SEC=0`，所有用户都无法同步。

---

### L-3: `computePoints` 使用 `Math.round` 导致极短会话积分归零

**文件**: `backend/src/services/staking.ts:59`

**问题**: 如果会话仅持续几秒，`Math.round` 可能将积分舍入为 0。当前 `POINTS_PER_NFT_PER_HOUR=1.0` 影响极小，但未来如果调整速率则可能显著。

---

### L-4: `download-images.ts` watch 模式 seenAcrossCycles 全量清空

**文件**: `backend/src/scripts/download-images.ts:226-229`

**问题**: 达到 100k 时 `clear()` 全部清空，导致下一周期重新扫描所有 NFT 的链上元数据（RPC 配额消耗）。虽然磁盘缓存阻止实际重新下载，但 RPC 调用仍会执行。

---

## 已验证的安全控制 (全部通过)

| 测试项 | 结果 |
|--------|------|
| JWT alg:none | ✅ 401 |
| NoSQL 注入 | ✅ 400 |
| Debug config 隐藏 | ✅ 404 |
| Admin 无认证 | ✅ 401 |
| Image proxy 正常服务 | ✅ 200 |
| Nonce atomic upsert 正常 | ✅ 200 (非并发场景) |

---

## 修复优先级

| 优先级 | ID | 问题 | 修复难度 |
|--------|----|------|---------|
| **P0** | H-1 | Nonce E11000 竞态 | 简单 — catch + retry |
| **P0** | H-4 | objectId 校验缺失 | 简单 — 正则校验 |
| **P1** | H-2 | filenameCache 内存泄漏 | 简单 — LRU 上限 |
| **P1** | M-2 | NFT detail 无限速 | 简单 — 加 throttle |
| **P2** | H-3 | Map 清理策略 | 中等 — 改 setInterval |
| **P2** | M-1 | 同步竞态 | 中等 — per-address 锁 |
| **P3** | M-3 | download-images readdirSync | 简单 — 复用 image.ts 模式 |
| **P3** | L1-L4 | 低危项 | 简单 |

---

## 与历史对比

| 轮次 | Critical | High | Medium | Low | 合计 |
|------|----------|------|--------|-----|------|
| 第一轮 | 3 | 4 | 3 | 2 | **12** |
| 第二轮 | 1 | 3 | 3 | 1 | **8** |
| 第四轮 | 0 | 0 | 2 | 3 | **5** |
| **第五轮** | **0** | **4** | **3** | **4** | **11** |

> 第五轮数量回升是因为 agent 做了更彻底的代码审查（24 文件全覆盖），发现了之前遗漏的内存/竞态类问题。4 个 High 中 3 个是资源耗尽/竞态类，在之前的攻击面测试中不易发现。
