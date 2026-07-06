/**
 * Bulk download script: fetches and caches all NFT images from MongoDB stakes.
 *
 * Usage: npx tsx src/scripts/download-images.ts
 *
 * Reads all unique object_ids from the Stake collection, downloads each
 * image via the same proxy logic used by /api/image/:objectId, and stores
 * them in backend/cache/images/.
 */

import mongoose from 'mongoose';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { config } from '../config';
import { Stake } from '../models/Stake';
import { getNftMetadata, extractImageUrl } from '../services/sui';

const CACHE_DIR = path.resolve(__dirname, '../../cache/images');
if (!fs.existsSync(CACHE_DIR)) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
}

function mimeToExt(mime: string): string {
  const map: Record<string, string> = {
    'image/png': 'png', 'image/jpeg': 'jpg', 'image/jpg': 'jpg',
    'image/gif': 'gif', 'image/webp': 'webp', 'image/svg+xml': 'svg', 'image/avif': 'avif',
  };
  return map[mime] || 'png';
}

type DownloadResult = 'cached' | 'downloaded' | 'failed';

async function downloadImage(objectId: string): Promise<DownloadResult> {
  const hash = crypto.createHash('md5').update(objectId).digest('hex');

  // Skip if already cached on disk
  const existing = fs.readdirSync(CACHE_DIR).filter(f => f.startsWith(hash));
  if (existing.length > 0) {
    console.log(`  [CACHED] ${objectId.slice(-8)}`);
    return 'cached';
  }

  try {
    // Fetch metadata from chain
    const metadata = await getNftMetadata(objectId);
    // getNftMetadata already extracts image_url to the top level.
    // Try that first, then fall back to raw content fields.
    let imageUrl = metadata.image_url as string | null | undefined;
    if (!imageUrl) {
      imageUrl = extractImageUrl(metadata.raw_content as Record<string, unknown>);
    }
    if (!imageUrl) {
      console.log(`  [SKIP] ${objectId.slice(-8)} — no image URL`);
      return 'failed';
    }

    // Download
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);
    const res = await fetch(imageUrl, { signal: controller.signal });
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

async function main() {
  console.log('Connecting to MongoDB...');
  await mongoose.connect(config.mongoUrl, { dbName: config.dbName });
  console.log('Connected.');

  // Get all unique object_ids from stakes
  const ids = await Stake.distinct('object_id');
  console.log(`Found ${ids.length} unique NFT images to download.\n`);

  let success = 0;
  let skipped = 0;
  let failed = 0;

  for (let i = 0; i < ids.length; i++) {
    const pct = ((i / ids.length) * 100).toFixed(0);
    console.log(`[${i + 1}/${ids.length} ${pct}%] ${ids[i]}`);
    const result = await downloadImage(ids[i]);
    if (result === 'downloaded') success++;
    else if (result === 'cached') skipped++;
    else failed++;
    // Small delay to avoid rate-limiting RPC/IPFS
    await new Promise(r => setTimeout(r, 200));
  }

  console.log(`\n=== DONE ===`);
  console.log(`Downloaded: ${success}`);
  console.log(`Skipped (cached): ${skipped}`);
  console.log(`Failed: ${failed}`);
  console.log(`Total: ${ids.length}`);

  await mongoose.disconnect();
  process.exit(0);
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
