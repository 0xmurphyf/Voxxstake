import { config } from '../config';
import { VOXX_TYPE } from '../types';

// ─── RPC endpoint list (primary + failovers) ───────────────────
const RPC_URLS = [config.suiRpcUrl, ...config.suiRpcFailoverUrls].filter(Boolean);
const RPC_TIMEOUT_MS = config.suiRpcTimeoutMs;

// ─── IPFS gateway conversion ────────────────────────────────────
const IPFS_GATEWAYS = [
  'https://ipfs.io/ipfs/',
  'https://cloudflare-ipfs.com/ipfs/',
  'https://gateway.pinata.cloud/ipfs/',
];

/**
 * Convert ipfs:// URL to an HTTPS gateway URL.
 * Falls back through multiple gateways.
 */
export function ipfsToHttps(ipfsUrl: string): string {
  const cid = ipfsUrl.replace(/^ipfs:\/\//, '').replace(/^ipfs\//, '');
  return `${IPFS_GATEWAYS[0]}${cid}`;
}

/**
 * Extract image URL from an NFT object's data, trying multiple sources.
 * Sui Display standard → content.fields.media_url → content.fields.url
 */
export function extractImageUrl(objData: Record<string, unknown> | null | undefined): string | null {
  if (!objData) return null;

  // 1. Sui Display standard: data.display.data.image_url
  const display = (objData.display as Record<string, unknown> | undefined);
  const displayData = display?.data as Record<string, unknown> | undefined;
  if (displayData?.image_url) {
    const url = String(displayData.image_url);
    return url.startsWith('ipfs://') ? ipfsToHttps(url) : url;
  }

  // 2. Content fields: media_url (used by VOXX NFTs)
  const content = (objData.content as Record<string, unknown> | undefined);
  const fields = content?.fields as Record<string, unknown> | undefined;
  if (fields?.media_url) {
    const url = String(fields.media_url);
    return url.startsWith('ipfs://') ? ipfsToHttps(url) : url;
  }

  // 3. Content fields: url
  if (fields?.url) {
    const url = String(fields.url);
    return url.startsWith('ipfs://') ? ipfsToHttps(url) : url;
  }

  // 4. Content fields: image_url
  if (fields?.image_url) {
    const url = String(fields.image_url);
    return url.startsWith('ipfs://') ? ipfsToHttps(url) : url;
  }

  return null;
}

/**
 * Extract name from an NFT object's data.
 */
export function extractNftName(objData: Record<string, unknown> | null | undefined, objectId: string): string {
  if (!objData) return `VOXX #${objectId.slice(-6)}`;

  // Sui Display
  const display = (objData.display as Record<string, unknown> | undefined);
  const displayData = display?.data as Record<string, unknown> | undefined;
  if (displayData?.name) return String(displayData.name);

  // Content fields
  const content = (objData.content as Record<string, unknown> | undefined);
  const fields = content?.fields as Record<string, unknown> | undefined;
  if (fields?.name) return String(fields.name);

  return `VOXX #${objectId.slice(-6)}`;
}

// ─── Low-level JSON-RPC call with failover ──────────────────────
export async function rpcCall(method: string, params: unknown[]): Promise<unknown> {
  const body = JSON.stringify({ jsonrpc: '2.0', id: 1, method, params });

  let lastError: Error | null = null;

  for (let i = 0; i < RPC_URLS.length; i++) {
    const url = RPC_URLS[i];
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), RPC_TIMEOUT_MS);

      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!res.ok) {
        lastError = new Error(`RPC error: ${res.status} from ${url}`);
        continue; // try next endpoint
      }

      const data = (await res.json()) as { error?: { message: string }; result?: unknown };
      if (data.error) {
        lastError = new Error(data.error.message);
        // Some errors are not retryable (e.g. "Invalid params")
        if (data.error.message?.includes('Invalid params')) {
          throw lastError;
        }
        continue;
      }

      return data.result;
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') {
        lastError = new Error(`RPC timeout after ${RPC_TIMEOUT_MS}ms: ${url}`);
      } else {
        lastError = err instanceof Error ? err : new Error(String(err));
      }
      // If this looks like a non-retryable error, throw immediately
      if (lastError.message?.includes('Invalid params')) {
        throw lastError;
      }
    }
  }

  throw lastError || new Error('All RPC endpoints failed');
}

// ─── Get single object ──────────────────────────────────────────
export async function getObject(objectId: string): Promise<Record<string, unknown>> {
  const result = await rpcCall('sui_getObject', [
    objectId,
    { showType: true, showOwner: true, showContent: true, showDisplay: true },
  ]);
  return (result as Record<string, unknown>) || {};
}

// ─── Get NFT metadata ───────────────────────────────────────────
export async function getNftMetadata(
  objectId: string
): Promise<Record<string, unknown>> {
  const obj = await getObject(objectId);
  const data = (obj.data || {}) as Record<string, unknown>;
  const display =
    ((data.display as Record<string, unknown>)?.data as Record<string, unknown>) || {};
  const content =
    ((data.content as Record<string, unknown>)?.fields as Record<string, unknown>) || {};

  const rawImageUrl = extractImageUrl(data);

  return {
    object_id: objectId,
    type: data.type,
    owner: data.owner,
    name: display.name || content.name || `VOXX #${objectId.slice(-6)}`,
    description: display.description || content.description || 'VOXX Inc. Genesis NFT',
    image_url: rawImageUrl,
    project_url: display.project_url || null,
    attributes: content.attributes || {},
    raw_content: content,
  };
}

// ─── Get directly owned objects (paginated) ─────────────────────
async function getDirectlyOwnedObjects(
  address: string,
  typeFilter?: string,
  lite: boolean = true
): Promise<Record<string, unknown>[]> {
  const allObjects: Record<string, unknown>[] = [];
  let cursor: string | null = null;

  const options: Record<string, boolean> = { showType: true, showDisplay: true, showContent: true };
  if (lite) {
    // Even in lite mode, we need content for image_url extraction
    // (VOXX NFTs store image in content.fields.media_url, not display.data.image_url)
  }
  if (!lite) {
    options.showOwner = true;
  }

  while (true) {
    const params: unknown[] = [
      address,
      {
        filter: typeFilter ? { StructType: typeFilter } : null,
        options,
      },
    ];
    if (cursor) params.push(cursor);

    const result = (await rpcCall('suix_getOwnedObjects', params)) as {
      data?: Record<string, unknown>[];
      hasNextPage?: boolean;
      nextCursor?: string | null;
    };

    if (result.data) allObjects.push(...result.data);
    if (!result.hasNextPage || !result.nextCursor) break;
    cursor = result.nextCursor;
  }

  return allObjects;
}

// ─── Get Kiosk-owned NFTs for an address ────────────────────────
//
// Sui Kiosk: NFTs placed in a Kiosk are owned by the Kiosk object,
// not the address directly. Kiosk is a *shared object* so
// suix_getOwnedObjects won't find it. Instead:
//   1a. Find KioskOwnerCap objects owned by the address
//       (type: 0x2::kiosk::KioskOwnerCap) → read content.fields.for
//   1b. Also find PersonalKioskCap objects
//       (type: <PKG>::personal_kiosk::PersonalKioskCap) → read content.fields.cap.fields.for
//   2. For each Kiosk, query dynamic fields to list items inside
//   3. Filter items by VOXX type
//
const STANDARD_KIOSK_OWNER_CAP_TYPE = '0x2::kiosk::KioskOwnerCap';
const KIOSK_LISTING_TYPE = '0x2::kiosk::Listing';

// Official Mysten Personal Kiosk packages. Keep this an exact allowlist: trusting
// arbitrary objects that merely contain fields.for would let a forged Move object
// point at somebody else's Kiosk and claim its NFTs.
const PERSONAL_KIOSK_CAP_TYPES = [
  // Mainnet
  '0x0cb4bcc0560340eb1a1b929cabe56b33fc6449820ec8c1980d69bb98b649b802::personal_kiosk::PersonalKioskCap',
  // Testnet
  '0x06f6bdd3f2e2e759d8a4b9c252f379f7a05e72dfe4c0b9311cdac27b8eb791b1::personal_kiosk::PersonalKioskCap',
] as const;

const TRUSTED_KIOSK_CAP_TYPES = new Set<string>([
  STANDARD_KIOSK_OWNER_CAP_TYPE,
  ...PERSONAL_KIOSK_CAP_TYPES,
]);

export function extractKioskIdFromTrustedCap(
  capWrapper: Record<string, unknown>
): string | null {
  const capData = capWrapper.data as Record<string, unknown> | undefined;
  if (!capData) return null;
  const capType = capData.type as string | undefined;
  if (!capType || !TRUSTED_KIOSK_CAP_TYPES.has(capType)) return null;

  const content = capData.content as Record<string, unknown> | undefined;
  const fields = content?.fields as Record<string, unknown> | undefined;

  if (capType === STANDARD_KIOSK_OWNER_CAP_TYPE) {
    return typeof fields?.for === 'string' ? fields.for : null;
  }

  const cap = fields?.cap as Record<string, unknown> | undefined;
  const capFields = cap?.fields as Record<string, unknown> | undefined;
  return typeof capFields?.for === 'string' ? capFields.for : null;
}

export function collectKioskDynamicFields(
  fields: Array<Record<string, unknown>>,
  itemIds: Set<string>,
  listedNftIds: Set<string>
): void {
  for (const field of fields) {
    if (field.type === 'DynamicObject') {
      const objectId = field.objectId;
      if (typeof objectId === 'string') itemIds.add(objectId);
      continue;
    }

    if (field.type !== 'DynamicField') continue;
    const name = field.name as Record<string, unknown> | undefined;
    if (name?.type !== KIOSK_LISTING_TYPE) continue;

    const nameValue = name.value as Record<string, unknown> | undefined;
    const listedId = nameValue?.id;
    if (typeof listedId === 'string') listedNftIds.add(listedId);
  }
}

async function getKioskOwnedObjects(
  address: string,
  typeFilter: string
): Promise<Record<string, unknown>[]> {
  const allObjects: Record<string, unknown>[] = [];

    // 1. Query only genuine, allowlisted cap types. Besides closing the forged
    //    cap vulnerability, this avoids downloading every object in a wallet.
    const allCaps: Record<string, unknown>[] = [];
    for (const capType of TRUSTED_KIOSK_CAP_TYPES) {
      const caps = await getDirectlyOwnedObjects(address, capType, false);
      allCaps.push(...caps);
    }

    // Extract unique Kiosk IDs from all cap wrappers
    const kioskIds = new Set<string>();
    for (const wrapper of allCaps) {
      const kid = extractKioskIdFromTrustedCap(wrapper);
      if (kid) kioskIds.add(kid);
    }

    for (const kioskId of kioskIds) {

      // Listing and item fields can land on different RPC pages. Accumulate
      // both sets across every page before deciding whether an NFT is staked.
      const itemIds = new Set<string>();
      const listedNftIds = new Set<string>();
      let cursor: string | null = null;
      while (true) {
        const params: unknown[] = [kioskId];
        if (cursor) params.push(cursor);

        const dfResult = (await rpcCall('suix_getDynamicFields', params)) as {
          data?: Array<Record<string, unknown>>;
          hasNextPage?: boolean;
          nextCursor?: string | null;
        };

        if (!dfResult.data) break;

        collectKioskDynamicFields(dfResult.data, itemIds, listedNftIds);

        if (!dfResult.hasNextPage || !dfResult.nextCursor) break;
        cursor = dfResult.nextCursor;
      }

      // A Listing immediately stops staking, even though the item remains in
      // the Kiosk until sold. Chunk requests to stay within multiGet limits.
      const unlistedItemIds = [...itemIds].filter((id) => !listedNftIds.has(id));
      const MULTI_GET_CHUNK_SIZE = 50;
      for (let offset = 0; offset < unlistedItemIds.length; offset += MULTI_GET_CHUNK_SIZE) {
        const chunk = unlistedItemIds.slice(offset, offset + MULTI_GET_CHUNK_SIZE);
        if (chunk.length > 0) {
          const multiResult = (await rpcCall('sui_multiGetObjects', [
            chunk,
            { showType: true, showDisplay: true, showContent: true },
          ])) as Record<string, unknown>[];

          for (const obj of multiResult) {
            const data = obj.data as Record<string, unknown>;
            if (!data) continue;

            // Listed objects were removed before this request.
            if (data.type === typeFilter) {
              const objId = data.objectId as string;
              if (objId) allObjects.push({ data });
            }
          }
        }
      }
    }

  return allObjects;
}

// ─── Get all owned objects (direct + kiosk) ─────────────────────
export async function getOwnedObjects(
  address: string,
  typeFilter?: string,
  lite: boolean = true
): Promise<{
  objects: Record<string, unknown>[];
  kioskError: boolean;
  kioskErrorMessage: string | null;
}> {
  // 1. Directly owned NFTs
  const direct = await getDirectlyOwnedObjects(address, typeFilter, lite);

  // 2. Kiosk-owned NFTs (only if we have a type filter, since kiosk
  //    items need to be filtered by type)
  let kiosk: Record<string, unknown>[] = [];
  let kioskError = false;
  let kioskErrorMessage: string | null = null;
  if (typeFilter) {
    try {
      kiosk = await getKioskOwnedObjects(address, typeFilter);
    } catch (err) {
      console.error(`[Kiosk] Scan failed for ${address.slice(0, 10)}... — skipping Kiosk NFTs this round:`, err);
      kioskError = true;
      kioskErrorMessage = err instanceof Error ? err.message : String(err);
    }
  }

  // 3. Merge, dedupe by objectId
  const seen = new Set<string>();
  const merged: Record<string, unknown>[] = [];

  for (const obj of [...direct, ...kiosk]) {
    const data = (obj as Record<string, unknown>).data as Record<string, unknown>;
    const objId = data?.objectId as string;
    if (objId && !seen.has(objId)) {
      seen.add(objId);
      merged.push(obj);
    }
  }

  return { objects: merged, kioskError, kioskErrorMessage };
}

// ─── Verify VOXX ownership (direct or kiosk) ────────────────────
export async function verifyVoxxOwnership(
  address: string,
  objectId: string
): Promise<boolean> {
  try {
    // Check direct ownership first
    const { objects: owned } = await getOwnedObjects(address, VOXX_TYPE, false);
    return owned.some((obj) => {
      const data = (obj as Record<string, unknown>).data as Record<string, unknown>;
      return data?.objectId === objectId;
    });
  } catch {
    return false;
  }
}

// ─── Signature verification ─────────────────────────────────────
import { verifyPersonalMessageSignature } from '@mysten/sui/verify';
import { fromBase64 } from '@mysten/bcs';

// Signature flag byte for zkLogin (from SIGNATURE_SCHEME_TO_FLAG.ZkLogin = 0x05)
const ZKLOGIN_FLAG = 0x05;

/**
 * Verify a Sui wallet signature for a personal message (nonce).
 *
 * For standard wallets (Ed25519, Secp256k1, Secp256r1, Passkey, MultiSig):
 *   uses @mysten/sui/verify which handles them natively.
 *
 * For zkLogin (Google ZKP) wallets:
 *   uses the Sui RPC method sui_verifyZkLoginSignature directly, because
 *   @mysten/sui v2 requires a GraphQL/gRPC client for zkLogin verification.
 */
export async function verifySignature(
  address: string,
  _nonce: string,  // nonce is validated by the caller (auth.ts:136 compares decoded bytes)
  signatureB64: string,
  bytesB64: string
): Promise<boolean> {
  try {
    const signatureBytes = fromBase64(signatureB64);

    // Check if this is a zkLogin signature (first byte = 0x05)
    if (signatureBytes.length > 0 && signatureBytes[0] === ZKLOGIN_FLAG) {
      // Use RPC directly for zkLogin verification
      const result = await rpcCall('sui_verifyZkLoginSignature', [
        bytesB64,               // bytes (base64)
        signatureB64,           // signature (base64)
        'PersonalMessage',      // intent_scope
        address,                // author
      ]) as { success?: boolean; errors?: unknown[] };

      if (!result.success || (result.errors && result.errors.length > 0)) {
        console.error('zkLogin verification failed:', JSON.stringify(result.errors));
        return false;
      }
      return true;
    }

    // Standard signature verification (Ed25519, Secp256k1, etc.)
    const messageBytes = fromBase64(bytesB64);
    await verifyPersonalMessageSignature(messageBytes, signatureB64, { address });
    return true;
  } catch (err) {
    console.error('Signature verification failed:', err instanceof Error ? err.message : err);
    return false;
  }
}
