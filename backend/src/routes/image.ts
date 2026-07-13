import { Router, Response, Request } from 'express';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { getNftMetadata, extractImageUrl } from '../services/sui';
import { assertSafeImageUrl } from '../services/ssrfGuard';

const router = Router();

// ─── SSRF guard ────────────────────────────────────────────────
// imageUrl is derived from attacker-controllable on-chain NFT metadata, so we
// must never fetch it blindly. The shared assertSafeImageUrl (services/ssrfGuard.ts)
// resolves the hostname once, rejects private/loopback/link-local addresses,
// and the caller below additionally refuses redirects.

// Cache directory — persisted across restarts
const CACHE_DIR = path.resolve(__dirname, '../../cache/images');
if (!fs.existsSync(CACHE_DIR)) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
}

// In-memory cache of objectId → cached filename (survives within process lifetime)
const filenameCache = new Map<string, string>();

// ─── Per-IP rate limit for the image proxy ──────────────────────
// No auth, no login — anyone can call this endpoint. Without a throttle it's
// a free RPC-proxy: an attacker can enumerate random objectIds and burn our
// Sui RPC quota. Capped at 5 req/s per IP (generous for normal use, tight
// enough to prevent abuse).
const IMAGE_MIN_INTERVAL_MS = 200; // 5 req/s
const imageLastSeen = new Map<string, number>();

function imageThrottle(req: Request, res: Response): boolean {
  const ip = req.ip || req.socket?.remoteAddress || 'unknown';
  const now = Date.now();
  const last = imageLastSeen.get(ip) || 0;
  if (now - last < IMAGE_MIN_INTERVAL_MS) {
    res.status(429).json({ detail: 'Too many image requests, slow down.' });
    return false;
  }
  imageLastSeen.set(ip, now);
  if (imageLastSeen.size % 500 === 0) {
    const cutoff = now - IMAGE_MIN_INTERVAL_MS * 4;
    for (const [k, v] of imageLastSeen) if (v < cutoff) imageLastSeen.delete(k);
  }
  return true;
}

/**
 * GET /api/image/:objectId
 * Proxy an NFT image: fetch from IPFS/chain, cache locally, serve from cache.
 * Returns the image binary with correct Content-Type.
 */
router.get('/:objectId', async (req: Request, res: Response) => {
  if (!imageThrottle(req, res)) return;
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
      // Return a placeholder — transparent 1x1 pixel PNG (NOT SVG — SVG can
      // contain executable JS and we've removed it from the allowlist).
      res.set('Content-Type', 'image/png');
      res.set('Cache-Control', 'public, max-age=3600');
      // 1x1 transparent PNG (smallest valid PNG, 68 bytes base64)
      res.send(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64'));
      return;
    }

    // 4. Download the image — guard against SSRF (attacker-controlled URL)
    //    assertSafeImageUrl returns a pinned IP so we never re-resolve DNS,
    //    preventing DNS rebinding attacks (where a short-TTL domain flips from
    //    a public IP during the check to 127.0.0.1 when fetch resolves it).
    const safe = await assertSafeImageUrl(imageUrl);
    const pinnedUrl = `${safe.protocol}://${safe.ip}${safe.original.pathname}${safe.original.search}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    let imageRes: globalThis.Response;
    try {
      imageRes = await fetch(pinnedUrl, {
        signal: controller.signal,
        redirect: 'manual',
        headers: { Host: safe.original.host }, // preserve original Host for virtual-hosting
      });
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
    res.set('Content-Type', 'image/png');
    res.set('Cache-Control', 'public, max-age=3600');
    res.send(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64'));
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
  // Raster formats only — SVG is excluded because it can contain executable JS
  // and the image proxy caches content forever (immutable, 1-year max-age).
  // If an attacker-controlled NFT image_url points to a malicious SVG, it would
  // be cached and served perpetually as an attack surface on the frontend.
  const map: Record<string, string> = {
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/gif': 'gif',
    'image/webp': 'webp',
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
    '.avif': 'image/avif',
  };
  return map[ext] || 'image/png';
}

export default router;
