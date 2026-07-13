/**
 * Bulk download script: fetches and caches all NFT images from MongoDB stakes
 * AND from on-chain wallet scans of all registered users.
 *
 * Usage: npx tsx src/scripts/download-images.ts [--watch]
 *
 * Without --watch: one-shot download of all known NFTs (DB + chain scan).
 * With --watch: keeps running, re-scans every 30 minutes for new NFTs.
 *
 * Images are stored in backend/cache/images/ with immutable Cache-Control.
 */

import mongoose from 'mongoose';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { config } from '../config';
import { Stake } from '../models/Stake';
import { getNftMetadata, extractImageUrl, getOwnedObjects } from '../services/sui';
import { assertSafeImageUrl } from '../services/ssrfGuard';
import { VOXX_TYPE } from '../types';

const CACHE_DIR = path.resolve(__dirname, '../../cache/images');
if (!fs.existsSync(CACHE_DIR)) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
}

function mimeToExt(mime: string): string {
  // Raster formats only — SVG excluded (see image.ts for rationale).
  const map: Record<string, string> = {
    'image/png': 'png', 'image/jpeg': 'jpg', 'image/jpg': 'jpg',
    'image/gif': 'gif', 'image/webp': 'webp', 'image/avif': 'avif',
  };
  return map[mime] || 'png';
}

type DownloadResult = 'cached' | 'downloaded' | 'failed';

async function downloadImage(objectId: string): Promise<DownloadResult> {
  const hash = crypto.createHash('md5').update(objectId).digest('hex');

  // Skip if already cached on disk
  const existing = fs.readdirSync(CACHE_DIR).filter(f => f.startsWith(hash));
  if (existing.length > 0) {
    return 'cached';
  }

  try {
    // Fetch metadata from chain
    const metadata = await getNftMetadata(objectId);
    let imageUrl = metadata.image_url as string | null | undefined;
    if (!imageUrl) {
      imageUrl = extractImageUrl(metadata.raw_content as Record<string, unknown>);
    }
    if (!imageUrl) {
      console.log(`  [SKIP] ${objectId.slice(-8)} — no image URL`);
      return 'failed';
    }

    // Download — guarded against SSRF (attacker-controlled on-chain image_url)
    //    Uses the pinned IP from assertSafeImageUrl to prevent DNS rebinding.
    let safe: { ip: string; protocol: string; original: URL };
    try {
      safe = await assertSafeImageUrl(imageUrl);
    } catch (err) {
      console.log(`  [BLOCKED] ${objectId.slice(-8)} — ${err instanceof Error ? err.message : String(err)}`);
      return 'failed';
    }
    const pinnedUrl = `${safe.protocol}://${safe.ip}${safe.original.pathname}${safe.original.search}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);
    const res = await fetch(pinnedUrl, {
      signal: controller.signal,
      redirect: 'manual',
      headers: { Host: safe.original.host },
    });
    clearTimeout(timeout);

    if (!res.ok) {
      console.log(`  [FAIL] ${objectId.slice(-8)} — HTTP ${res.status}`);
      return 'failed';
    }

    const contentType = res.headers.get('content-type') || 'image/png';
    const ext = mimeToExt(contentType);
    const filename = `${hash}.${ext}`;
    const filePath = path.join(CACHE_DIR, filename);

    const arrayBuf = await res.arrayBuffer();
    fs.writeFileSync(filePath, Buffer.from(arrayBuf));

    const sizeKB = (arrayBuf.byteLength / 1024).toFixed(1);
    console.log(`  [OK] ${objectId.slice(-8)} → ${filename} (${sizeKB} KB)`);
    return 'downloaded';
  } catch (err) {
    console.log(`  [ERR] ${objectId.slice(-8)} — ${err instanceof Error ? err.message : String(err)}`);
    return 'failed';
  }
}

/**
 * Scan all registered addresses' wallets on-chain to discover NFT object IDs.
 * This finds NFTs that haven't been synced to the Stake collection yet.
 */
async function discoverNftIdsFromChain(): Promise<string[]> {
  const addresses = await Stake.distinct('address');
  console.log(`Scanning ${addresses.length} registered addresses for VOXX NFTs...`);

  const allIds = new Set<string>();
  let scanned = 0;

  for (const address of addresses) {
    try {
      const { objects } = await getOwnedObjects(address, VOXX_TYPE, true);
      for (const nft of objects) {
        const data = (nft as Record<string, unknown>).data as Record<string, unknown>;
        const objId = data?.objectId as string;
        if (objId) allIds.add(objId);
      }
      scanned++;
      if (scanned % 10 === 0) {
        console.log(`  Scanned ${scanned}/${addresses.length} addresses, ${allIds.size} NFTs found so far`);
      }
    } catch (err) {
      console.log(`  [WARN] Failed to scan ${address.slice(0, 10)}... — ${err instanceof Error ? err.message : String(err)}`);
    }
    // Delay between addresses to avoid RPC rate limiting
    await new Promise(r => setTimeout(r, 300));
  }

  console.log(`Chain scan complete: ${allIds.size} unique NFTs from ${scanned} addresses`);
  return Array.from(allIds);
}

async function runDownloadPass(ids: string[]): Promise<{ success: number; skipped: number; failed: number }> {
  let success = 0;
  let skipped = 0;
  let failed = 0;

  for (let i = 0; i < ids.length; i++) {
    const pct = ((i / ids.length) * 100).toFixed(0);
    const result = await downloadImage(ids[i]);
    if (result === 'downloaded') success++;
    else if (result === 'cached') skipped++;
    else failed++;

    // Progress update every 10 items or at end
    if ((i + 1) % 10 === 0 || i === ids.length - 1) {
      console.log(`[${i + 1}/${ids.length} ${pct}%] OK:${success} CACHED:${skipped} FAIL:${failed}`);
    }

    // Small delay to avoid rate-limiting RPC/IPFS
    await new Promise(r => setTimeout(r, 200));
  }

  return { success, skipped, failed };
}

async function main() {
  const watchMode = process.argv.includes('--watch');

  console.log('Connecting to MongoDB...');
  await mongoose.connect(config.mongoUrl, { dbName: config.dbName });
  console.log('Connected.');

  // Phase 1: Download all NFTs already in the Stake collection
  const dbIds = await Stake.distinct('object_id');
  console.log(`\n=== Phase 1: DB stake records (${dbIds.length} NFTs) ===`);
  const dbResult = await runDownloadPass(dbIds);

  // Phase 2: Scan all registered wallets on-chain for additional NFTs
  console.log(`\n=== Phase 2: On-chain wallet scan ===`);
  const chainIds = await discoverNftIdsFromChain();

  // Filter out IDs we already processed from DB
  const dbIdSet = new Set(dbIds);
  const newIds = chainIds.filter(id => !dbIdSet.has(id));

  if (newIds.length > 0) {
    console.log(`\n=== Phase 3: New NFTs from chain (${newIds.length} not in DB) ===`);
    const chainResult = await runDownloadPass(newIds);

    const totalSuccess = dbResult.success + chainResult.success;
    const totalSkipped = dbResult.skipped + chainResult.skipped;
    const totalFailed = dbResult.failed + chainResult.failed;
    const grandTotal = dbIds.length + newIds.length;

    console.log(`\n=== DONE ===`);
    console.log(`DB records:      ${dbIds.length} (OK:${dbResult.success} CACHED:${dbResult.skipped} FAIL:${dbResult.failed})`);
    console.log(`Chain discovered: ${newIds.length} (OK:${chainResult.success} CACHED:${chainResult.skipped} FAIL:${chainResult.failed})`);
    console.log(`Total processed:  ${grandTotal}`);
    console.log(`Total downloaded: ${totalSuccess}`);
    console.log(`Total cached:     ${totalSkipped}`);
    console.log(`Total failed:     ${totalFailed}`);
  } else {
    console.log(`\n=== DONE ===`);
    console.log(`Total processed:  ${dbIds.length}`);
    console.log(`Downloaded: ${dbResult.success}`);
    console.log(`Cached:     ${dbResult.skipped}`);
    console.log(`Failed:     ${dbResult.failed}`);
  }

  if (watchMode) {
    const INTERVAL_MS = 30 * 60 * 1000; // 30 minutes
    const intervalMin = INTERVAL_MS / 60000;
    console.log(`\n[WATCH] Running every ${intervalMin} minutes. Press Ctrl+C to stop.`);

    // Track already-seen IDs across cycles so we don't re-download every time.
    // Cleared periodically to avoid unbounded growth (the filesystem cache is
    // the source of truth — this is just an optimisation to skip redundant
    // chain fetches within a watch session).
    const seenAcrossCycles = new Set<string>();

    const runCycle = async () => {
      console.log(`\n=== Watch cycle at ${new Date().toISOString()} ===`);
      try {
        const ids = await discoverNftIdsFromChain();
        const newIds = ids.filter(id => !seenAcrossCycles.has(id));
        console.log(`Found ${ids.length} NFTs on chain (${newIds.length} new this session)`);
        if (newIds.length > 0) {
          await runDownloadPass(newIds);
          for (const id of newIds) seenAcrossCycles.add(id);
        }
        // Prune the seen-set if it grows beyond 100k entries — this is a
        // script-level optimisation, the disk cache is the real dedup layer.
        if (seenAcrossCycles.size > 100_000) {
          console.log('[WATCH] Pruning seen-set (size > 100k)');
          seenAcrossCycles.clear();
        }
      } catch (err) {
        console.error('Watch cycle error:', err);
      }
    };

    setInterval(runCycle, INTERVAL_MS);
  } else {
    await mongoose.disconnect();
    process.exit(0);
  }
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
