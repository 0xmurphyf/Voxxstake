import { config } from '../config';
import { VOXX_TYPE } from '../types';

// ─── Low-level JSON-RPC call ────────────────────────────────────
async function rpcCall(method: string, params: unknown[]): Promise<unknown> {
  const res = await fetch(config.suiRpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  if (!res.ok) throw new Error(`RPC error: ${res.status}`);
  const data = (await res.json()) as { error?: { message: string }; result?: unknown };
  if (data.error) throw new Error(data.error.message);
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

// ─── Verify VOXX ownership ──────────────────────────────────────
export async function verifyVoxxOwnership(
  address: string,
  objectId: string
): Promise<boolean> {
  try {
    const obj = await getObject(objectId);
    const data = obj.data as Record<string, unknown> | undefined;
    if (!data) return false;
    if (data.type !== VOXX_TYPE) return false;

    const ownerInfo = data.owner as Record<string, unknown> | undefined;
    const ownerAddress =
      ownerInfo && 'AddressOwner' in ownerInfo
        ? (ownerInfo as Record<string, string>).AddressOwner
        : null;

    return ownerAddress === address;
  } catch {
    return false;
  }
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
    name:
      display.name || content.name || `VOXX #${objectId.slice(-6)}`,
    description:
      display.description ||
      content.description ||
      'VOXX Inc. Genesis NFT',
    image_url:
      display.image_url || content.image_url || content.url || null,
    project_url: display.project_url || null,
    attributes: content.attributes || {},
    raw_content: content,
  };
}

// ─── Get owned objects (paginated) ──────────────────────────────
export async function getOwnedObjects(
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

// ─── Signature verification ─────────────────────────────────────
//
// Sui signPersonalMessage format:
//   blake2b(intent_prefix || bcs(message))
//   intent_prefix = [3, 0, 0]  (IntentScope::PersonalMessage)
//   Serialized signature = flag(1) || sig(64) || pubkey(32)  (Ed25519)
//
// We use @mysten/sui/verify for this — it handles all scheme types.
//
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
