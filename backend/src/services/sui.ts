import { config } from '../config';
import { VOXX_TYPE } from '../types';

// ─── Low-level JSON-RPC call ────────────────────────────────────
async function rpcCall(method: string, params: unknown[]): Promise<unknown> {
  const body = { jsonrpc: '2.0', id: 1, method, params };
  console.log(`[SUI RPC] ${method} → ${config.suiRpcUrl}`);
  console.log(`[SUI RPC] params:`, JSON.stringify(params, null, 2));
  const res = await fetch(config.suiRpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`RPC error: ${res.status}`);
  const data = (await res.json()) as { error?: { message: string }; result?: unknown };
  if (data.error) throw new Error(data.error.message);
  console.log(`[SUI RPC] ${method} → OK, result:`, JSON.stringify(data.result).slice(0, 500));
  return data.result;
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

  return {
    object_id: objectId,
    type: data.type,
    owner: data.owner,
    name: display.name || content.name || `VOXX #${objectId.slice(-6)}`,
    description: display.description || content.description || 'VOXX Inc. Genesis NFT',
    image_url: display.image_url || content.image_url || content.url || null,
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

  const options: Record<string, boolean> = { showType: true, showDisplay: true };
  if (!lite) {
    options.showContent = true;
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
//   1. Find KioskOwnerCap objects owned by the address
//      (type: 0x2::kiosk::KioskOwnerCap) → read content.fields.for
//   2. For each Kiosk, query dynamic fields to list items inside
//   3. Filter items by VOXX type
//
async function getKioskOwnedObjects(
  address: string,
  typeFilter: string
): Promise<Record<string, unknown>[]> {
  const allObjects: Record<string, unknown>[] = [];

  try {
    // 1. Find KioskOwnerCap objects (NOT Kiosk — Kiosk is shared!)
    const caps = await getDirectlyOwnedObjects(address, '0x2::kiosk::KioskOwnerCap', false);
    console.log(`[SUI Kiosk] Found ${caps.length} KioskOwnerCap objects`);

    // Extract unique Kiosk IDs from caps
    const kioskIds = new Set<string>();
    for (const capWrapper of caps) {
      const capData = (capWrapper as Record<string, unknown>).data as Record<string, unknown>;
      const content = capData?.content as Record<string, unknown> | undefined;
      const fields = content?.fields as Record<string, unknown> | undefined;
      const kioskId = fields?.for as string;
      if (kioskId) kioskIds.add(kioskId);
    }
    console.log(`[SUI Kiosk] Unique Kiosk IDs: ${kioskIds.size}`);

    for (const kioskId of kioskIds) {

      // 2. Query dynamic fields of the kiosk (paginated)
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

        // 3. For each dynamic field, get the object and check if it's a VOXX NFT
        const itemIds: string[] = [];
        for (const field of dfResult.data) {
          // Only DynamicObject fields point to actual NFT objects.
          // DynamicField (e.g. Lock, Listing) are kiosk internals.
          if (field.type === 'DynamicObject') {
            const objectId = field.objectId as string;
            if (objectId) itemIds.push(objectId);
          }
        }

        // Batch fetch objects to check type
        if (itemIds.length > 0) {
          const multiResult = (await rpcCall('sui_multiGetObjects', [
            itemIds,
            { showType: true, showDisplay: true },
          ])) as Record<string, unknown>[];

          for (const obj of multiResult) {
            const data = obj.data as Record<string, unknown>;
            if (!data) continue;

            // Check if this is the target NFT type
            if (data.type === typeFilter) {
              allObjects.push({ data });
            }
          }
        }

        if (!dfResult.hasNextPage || !dfResult.nextCursor) break;
        cursor = dfResult.nextCursor;
      }
    }
  } catch (err) {
    // Kiosk scanning is best-effort — don't fail the whole sync
    console.error('Kiosk scan error (non-fatal):', err);
  }

  return allObjects;
}

// ─── Get all owned objects (direct + kiosk) ─────────────────────
export async function getOwnedObjects(
  address: string,
  typeFilter?: string,
  lite: boolean = true
): Promise<Record<string, unknown>[]> {
  console.log(`[SUI] getOwnedObjects called: address=${address}, type=${typeFilter}, lite=${lite}`);
  // 1. Directly owned NFTs
  const direct = await getDirectlyOwnedObjects(address, typeFilter, lite);
  console.log(`[SUI] Direct NFTs found: ${direct.length}`);

  // 2. Kiosk-owned NFTs (only if we have a type filter, since kiosk
  //    items need to be filtered by type)
  let kiosk: Record<string, unknown>[] = [];
  if (typeFilter) {
    kiosk = await getKioskOwnedObjects(address, typeFilter);
    console.log(`[SUI] Kiosk NFTs found: ${kiosk.length}`);
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

  console.log(`[SUI] Total NFTs after merge: ${merged.length}`);
  return merged;
}

// ─── Verify VOXX ownership (direct or kiosk) ────────────────────
export async function verifyVoxxOwnership(
  address: string,
  objectId: string
): Promise<boolean> {
  try {
    // Check direct ownership first
    const owned = await getOwnedObjects(address, VOXX_TYPE, false);
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

export async function verifySignature(
  address: string,
  _nonce: string,
  signatureB64: string,
  bytesB64: string
): Promise<boolean> {
  try {
    const messageBytes = fromBase64(bytesB64);
    await verifyPersonalMessageSignature(messageBytes, signatureB64, {
      address,
    });
    return true;
  } catch {
    return false;
  }
}
