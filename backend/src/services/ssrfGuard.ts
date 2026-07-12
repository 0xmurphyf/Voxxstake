import dns from 'dns';

// ─── SSRF guard — shared by image proxy + download-images script ──
//
// DNS-REBINDING NOTE: We resolve the hostname ONCE here, then the caller MUST
// use the returned IP to construct the fetch URL (replacing the hostname with
// the resolved IP). A second DNS lookup (e.g. fetch's own resolution) could
// return a different, private address if the attacker controls a domain with
// a short TTL — that's the classic DNS rebinding attack.
//
// The return type includes the pinned IP so callers can construct a safe URL.

export interface SafeUrl {
  /** Original URL object (for Host header, path, etc.) */
  original: URL;
  /** Pinned IP address — use THIS to connect, never re-resolve */
  ip: string;
  /** Protocol (http/https) */
  protocol: string;
}

function isPrivateIp(ip: string): boolean {
  const v = ip.toLowerCase();
  if (v === '::1' || v === '::' || v.startsWith('fe80:') || v.startsWith('fc') || v.startsWith('fd')) return true;
  // IPv4-mapped IPv6: strip the prefix and re-check (e.g. ::ffff:127.0.0.1)
  if (v.startsWith('::ffff:')) {
    const ipv4 = v.slice(7);
    return isPrivateIp(ipv4);
  }
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

/**
 * Validate an image URL for SSRF safety.
 * Returns a SafeUrl with a pinned IP — the caller must use this IP to connect,
 * NOT the original hostname, to prevent DNS rebinding.
 */
export async function assertSafeImageUrl(rawUrl: string): Promise<SafeUrl> {
  const u = new URL(rawUrl);
  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    throw new Error('unsupported protocol');
  }
  const resolved = await dns.promises.lookup(u.hostname, { all: true });
  if (resolved.some((r) => isPrivateIp(r.address))) {
    throw new Error('blocked private/loopback address');
  }
  // Pick the first public IPv4 address if available, otherwise the first result.
  // IPv4 is preferred because fetch(https://[::1]/...) with pinned IPs is less
  // universally supported across Node versions and TLS SNI.
  const ipv4 = resolved.find((r) => r.family === 4 && !isPrivateIp(r.address));
  const ip = ipv4 ? ipv4.address : resolved[0].address;
  return { original: u, ip, protocol: u.protocol };
}
