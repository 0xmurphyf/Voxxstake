# 第四轮安全审计报告 — Voxxstake

**审计日期**: 2026-07-12  
**审计范围**: commit `8cee048` (已修复 12+8 个漏洞后的代码库)  
**方法**: 全量代码审查 + 实时攻击测试

---

## 总体评估

经过三轮修复后，代码库安全态势**大幅改善**。本轮审计发现 **0 个严重 (Critical)** 漏洞，**0 个高危 (High)** 漏洞，**2 个中危 (Medium)** 问题，**3 个低危 (Low)** 问题。

| 严重级别 | 数量 | 状态 |
|---------|------|------|
| Critical | 0 | — |
| High | 0 | — |
| Medium | 2 | 待修复 |
| Low | 3 | 建议修复 |
| **合计** | **5** | |

---

## 已验证的安全控制 (全部通过)

| 测试项 | 结果 |
|--------|------|
| JWT `alg:none` 攻击 → `/api/profile` | ✅ 401 (jwt v9 拒绝 + `algorithms: ['HS256']`) |
| JWT `alg:RS256` 混淆攻击 → `/api/profile` | ✅ 401 |
| 伪造 root JWT → `/api/root/query` | ✅ 401 |
| NoSQL 注入 `?address[$ne]=null` → `/api/ranking` | ✅ 400 "Invalid address parameter" |
| Root 终端爆破 (5次后锁死) | ✅ 429 (全局锁, 15分钟) |
| Image proxy 并行限速 (5 req/s) | ✅ 429 (并行测试 3/6 被拒绝) |
| Oracle 枚举防护 (unregistered → rank=total+1) | ✅ `current_user_rank: 6` (total_stakers=5) |
| SVG 占位符已替换为 PNG | ✅ `content-type: image/png` |
| `/api/debug/config` 生产环境隐藏 | ✅ 404 |
| 请求体大小限制 (1MB) | ✅ 413 |
| 排名分页边界 clamp (limit=9999→500, skip=-100→0) | ✅ 正确 |
| 排名 NaN 参数 (limit=abc→100) | ✅ 默认值回退 |
| Auth nonce 缺失字段 → 400 | ✅ "Address is required" / "Missing required fields" |
| 前端 build 无敏感信息泄露 | ✅ 0 匹配 |
| `dangerouslySetInnerHTML` / `innerHTML` | ✅ 前端代码中未使用 |

---

## 中危 (Medium) 发现

### M-1: 排名接口全量加载 — 内存 DoS 风险

**文件**: `backend/src/routes/ranking.ts:83,90`  
**问题**: 每次请求 `/api/ranking` 都执行 `Profile.find({})` 和 `Stake.find({})` 加载全部数据到内存再排序分页。当用户量增长到数千时，每次请求都会消耗大量内存和数据库带宽。

**当前缓解**: 已有 per-IP 1.5s 限速，且代码注释中已标注了未来优化方向（MongoDB aggregation pipeline）。

**风险**: 虽然有限速，但多个不同 IP 仍可并发触发。10 个不同 IP 同时请求 = 10 次全量加载。

**建议**: 实现 MongoDB aggregation pipeline 替代内存排序，参考代码中已有的 TODO 注释（第 78-82 行）。

**严重级别**: Medium (需要用户量增长到数千才会触发)

---

### M-2: `pfp_object_id` 无类型校验 — 数据污染风险

**文件**: `backend/src/routes/profile.ts:46`  
**问题**: `pfp_object_id` 直接接受 `req.body` 中的任意值并写入 `$set`：

```typescript
if (pfp_object_id !== undefined) update.pfp_object_id = pfp_object_id || null;
```

攻击者可以提交 `{"pfp_object_id": {"$ne": "anything"}}`，Mongoose 的 `$set` 会把它当作字面值写入 MongoDB，导致数据库中存储的是 MongoDB 操作符对象而非字符串。虽然不直接导致注入（因为是 `$set` 而非查询），但会：
1. 污染数据完整性
2. 后续读取该字段的代码可能因类型不匹配而异常

**对比**: `pfp_url` 有严格的类型和协议校验（第 34-44 行），`name` 也有 `String()` 转换。

**建议**: 添加 `typeof pfp_object_id === 'string' || pfp_object_id === null` 校验。

**严重级别**: Medium (数据完整性 + 潜在的后端异常)

---

## 低危 (Low) 发现

### L-1: `image.ts` 同步 `readdirSync` — 大量缓存文件时阻塞事件循环

**文件**: `backend/src/routes/image.ts:72`  
**问题**: 每次缓存未命中时，`fs.readdirSync(CACHE_DIR)` 同步扫描整个缓存目录。如果缓存积累了大量文件（数千个），这个同步操作会阻塞事件循环。

**当前缓解**: 
- 已有内存缓存 (`filenameCache`) 作为第一层
- 文件以 MD5 hash 前缀命名，`find()` 是 O(n)
- 缓存目录目前为空

**建议**: 将 `readdirSync` 改为 `fs.promises.readdir`，或用 `fs.existsSync(path.join(CACHE_DIR, hash + '.png'))` 等直接探测替代全量扫描。

**严重级别**: Low (需要大量缓存文件才会触发)

---

### L-2: Auth nonce 竞态窗口 — 已在注释中记录但未修复

**文件**: `backend/src/routes/auth.ts:74-79`  
**问题**: `/api/auth/nonce` 先 `deleteMany` 再 `create`，中间存在竞态窗口。代码注释已详细说明：

```typescript
// NOTE: there is a narrow race window between deleteMany and create below —
// concurrent requests for the same address could both pass the delete and
// both insert, leaving two valid nonces. The per-IP 3s throttle (authThrottle)
// makes this extremely unlikely in practice...
```

**当前缓解**: per-IP 3s throttle 使同 IP 并发几乎不可能。但如果攻击者使用多个 IP 对同一地址同时发起 nonce 请求，仍可能成功。

**建议**: 代码注释中已提供方案 — 添加 MongoDB 复合唯一索引 `{ address: 1, used: 1 }` with `partialFilterExpression: { used: false }`。

**严重级别**: Low (利用难度高，需要精确时间控制 + 多 IP)

---

### L-3: `download-images.ts` 脚本 watch 模式下内存泄漏风险

**文件**: `backend/src/scripts/download-images.ts:220`  
**问题**: `--watch` 模式下使用 `setInterval` 每 30 分钟执行一次，但每次 `runCycle` 调用 `discoverNftIdsFromChain()` 都会重新扫描所有地址。没有对 `allIds` Set 做跨周期清理，且每次创建新的 `AbortController`。

**实际风险**: 极低 — 这是一个手动运行的维护脚本，不是常驻服务的一部分。

**建议**: 如长期使用 watch 模式，考虑添加 `mongoose.disconnect()` + `mongoose.connect()` 周期或使用连接池健康检查。

**严重级别**: Low (维护脚本，非核心服务)

---

## 已确认安全的攻击面

以下攻击向量已经过测试或代码审查，确认安全：

| 攻击向量 | 防御机制 |
|---------|---------|
| JWT 算法混淆 (none/RS256/HS256) | `algorithms: ['HS256']` 硬编码 |
| NoSQL 注入 (ranking) | `typeof address === 'string'` 前置校验 |
| NoSQL 注入 (root/query) | `$regex` 使用 `escapeRegex` 转义 |
| SSRF (image proxy) | `assertSafeImageUrl` + 固定 IP + 拒绝重定向 |
| DNS rebinding | 解析一次后使用固定 IP 发起请求 |
| Root 终端爆破 | 全局失败计数器 + 15 分钟锁死 |
| 路径遍历 (image) | Express `:objectId` 不匹配 `/`，SPA fallback 返回 HTML |
| Oracle 地址枚举 | unregistered → `entries.length + 1` |
| SVG XSS | 仅允许光栅格式 (PNG/JPEG/GIF/WebP/AVIF) |
| 请求体炸弹 | `express.json({ limit: '1mb' })` |
| 生产环境信息泄露 | `/api/debug/config` → 404 |
| IP 伪造绕过限速 | `req.ip` (trust proxy) 替代 `x-forwarded-for` |
| CORS 宽松配置 | 生产环境 `CORS_ORIGINS` 必须显式设置 |
| 前端 XSS | 无 `dangerouslySetInnerHTML` / `innerHTML` |
| 前端密钥泄露 | build 中无 JWT_SECRET / MONGO_URL / ROOT_TERMINAL_PASSWORD |

---

## 与上一轮对比

| 轮次 | Critical | High | Medium | Low | 合计 |
|------|----------|------|--------|-----|------|
| 第一轮 (初始) | 3 | 4 | 3 | 2 | 12 |
| 第二轮 (8cee048 前) | 1 | 3 | 3 | 1 | 8 |
| **第四轮 (本次)** | **0** | **0** | **2** | **3** | **5** |

安全态势从 12 个漏洞 → 8 个 → **5 个**，且无严重/高危漏洞。

---

## 建议修复优先级

1. **M-2 (pfp_object_id)** — 一行代码修复，建议立即处理
2. **M-1 (排名全量加载)** — 用户增长前应实现 aggregation pipeline
3. **L-2 (nonce 竞态)** — 低优先级，已有有效缓解
4. **L-1 (readdirSync)** — 缓存量增大前修复
5. **L-3 (download-images)** — 维护脚本，最低优先级
