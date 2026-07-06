import { Router, Response, Request } from 'express';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { getNftMetadata, extractImageUrl } from '../services/sui';

const router = Router();

// Cache directory — persisted across restarts
const CACHE_DIR = path.resolve(__dirname, '../../cache/images');
if (!fs.existsSync(CACHE_DIR)) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
}

// In-memory cache of objectId → cached filename (survives within process lifetime)
const filenameCache = new Map<string, string>();

/**
 * GET /api/image/:objectId
 * Proxy an NFT image: fetch from IPFS/chain, cache locally, serve from cache.
 * Returns the image binary with correct Content-Type.
 */
router.get('/:objectId', async (req: Request, res: Response) => {
  try {
    const { objectId } = req.params;

    // 1. Check in-memory cache
    const cachedFile = filenameCache.get(objectId);
    if (cachedFile) {
      const filePath = path.join(CACHE_DIR, cachedFile);
      if (fs.existsSync(filePath)) {
        return sendFile(res, filePath);
      }
      // File deleted? Clear stale entry
      filenameCache.delete(objectId);
    }

    // 2. Check disk cache by scanning for objectId-based filenames
    const hash = crypto.createHash('md5').update(objectId).digest('hex');
    const diskFiles = fs.readdirSync(CACHE_DIR);
    const match = diskFiles.find(f => f.startsWith(hash));
    if (match) {
      const filePath = path.join(CACHE_DIR, match);
      filenameCache.set(objectId, match);
      return sendFile(res, filePath);
    }

    // 3. Fetch metadata from chain to get image URL
    const metadata = await getNftMetadata(objectId);
    const imageUrl = extractImageUrl(metadata as Record<string, unknown>);

    if (!imageUrl) {
      // Return a placeholder — transparent 1x1 pixel SVG
      res.set('Content-Type', 'image/svg+xml');
      res.set('Cache-Control', 'public, max-age=3600');
      res.send(`<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>`);
      return;
    }

    // 4. Download the image
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    let imageRes: globalThis.Response;
    try {
      imageRes = await fetch(imageUrl, { signal: controller.signal });
    } finally {
      clearTimeout(timeout);
    }

    if (!imageRes.ok) {
      res.status(502).json({ detail: `Failed to fetch image: ${imageRes.status}` });
      return;
    }

    const contentType = imageRes.headers.get('content-type') || 'image/png';
    const arrayBuf = await imageRes.arrayBuffer();
    const buffer = Buffer.from(arrayBuf);

    // 5. Determine file extension
    const ext = mimeToExt(contentType);
    const filename = `${hash}.${ext}`;
    const filePath = path.join(CACHE_DIR, filename);

    // 6. Save to disk cache
    fs.writeFileSync(filePath, buffer);
    filenameCache.set(objectId, filename);

    // 7. Serve
    res.set('Content-Type', contentType);
    res.set('Cache-Control', 'public, max-age=86400');
    res.send(buffer);
  } catch (err) {
    console.error('Image proxy error:', err);
    res.set('Content-Type', 'image/svg+xml');
    res.set('Cache-Control', 'public, max-age=3600');
    res.send(`<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>`);
  }
});

function sendFile(res: Response, filePath: string) {
  const ext = path.extname(filePath).toLowerCase();
  const contentType = extToMime(ext);
  res.set('Content-Type', contentType);
  res.set('Cache-Control', 'public, max-age=86400');
  res.sendFile(filePath);
}

function mimeToExt(mime: string): string {
  const map: Record<string, string> = {
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/gif': 'gif',
    'image/webp': 'webp',
    'image/svg+xml': 'svg',
    'image/avif': 'avif',
  };
  return map[mime] || 'png';
}

function extToMime(ext: string): string {
  const map: Record<string, string> = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.svg': 'image/svg+xml',
    '.avif': 'image/avif',
  };
  return map[ext] || 'image/png';
}

export default router;
