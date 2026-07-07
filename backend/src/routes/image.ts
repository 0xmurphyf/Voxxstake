import { Router, Response, Request } from 'express';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import dns from 'dns';
import { getNftMetadata, extractImageUrl } from '../services/sui';

const router = Router();

// ─── SSRF guard ────────────────────────────────────────────────
// imageUrl is derived from attacker-controllable on-chain NFT metadata, so we
// must never fetch it blindly. Allow only http(s), resolve the hostname and
// reject private/loopback/link-local addresses, and refuse redirects.
function isPrivateIp(ip: string): boolean {
  const v = ip.toLowerCase();
  if (v === '::1' || v === '::' || v.startsWith('fe80:') || v.startsWith('fc') || v.startsWith('fd')) return true;
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(ip);
  if (m) {
    const p = [Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4])];
    if (p[0] === 0 || p[0] === 10) return true;
    if (p[0] === 127) return true;
    if (p[0] === 169 && p[1] === 254) return true; // link-local (cloud metadata)
    if (p[0] === 172 && p[1] >= 16 && p[1] <= 31) return true;
    if (p[0] === 192 && p[1] === 168) return true;
  }
  return false;
}

async function assertSafeImageUrl(rawUrl: string): Promise<URL> {
  const u = new URL(rawUrl);
  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    throw new Error('unsupported protocol');
  }
  const resolved = await dns.promises.lookup(u.hostname, { all: true });
  if (resolved.some((r) => isPrivateIp(r.address))) {
    throw new Error('blocked private/loopback address');
  }
  return u;
}

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
    // getNftMetadata already extracts image_url to the top level.
    // Try that first, then fall back to raw content fields.
    let imageUrl = metadata.image_url as string | null | undefined;
    if (!imageUrl) {
      imageUrl = extractImageUrl(metadata.raw_content as Record<string, unknown>);
    }

    if (!imageUrl) {
      // Return a placeholder — transparent 1x1 pixel SVG
      res.set('Content-Type', 'image/svg+xml');
      res.set('Cache-Control', 'public, max-age=3600');
      res.send(`<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>`);
      return;
    }

    // 4. Download the image — guard against SSRF (attacker-controlled URL)
    const safeUrl = await assertSafeImageUrl(imageUrl);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    let imageRes: globalThis.Response;
    try {
      imageRes = await fetch(safeUrl, { signal: controller.signal, redirect: 'manual' });
    } finally {
      clearTimeout(timeout);
    }

    // Refuse redirects (prevents bounce-to-internal SSRF)
    if (imageRes.status >= 300 || imageRes.type === 'opaqueredirect') {
      res.status(502).json({ detail: 'Image redirect not allowed' });
      return;
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

    // 7. Serve — cache forever (images are immutable by objectId)
    res.set('Content-Type', contentType);
    res.set('Cache-Control', 'public, max-age=31536000, immutable');
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
  res.set('Cache-Control', 'public, max-age=31536000, immutable');
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
