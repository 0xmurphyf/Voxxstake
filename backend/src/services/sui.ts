import { SuiGraphQLClient } from '@mysten/sui/graphql';
import { SuiGrpcClient } from '@mysten/sui/grpc';
import type { ClientWithCoreApi } from '@mysten/sui/client';
import { normalizeStructTag } from '@mysten/sui/utils';
import { verifyPersonalMessageSignature } from '@mysten/sui/verify';
import { config } from '../config';
import { VOXX_TYPE } from '../types';

const GRPC_URLS = [...new Set([
  config.suiGrpcUrl,
  ...config.suiGrpcFailoverUrls,
])].filter(Boolean);
const GRPC_CLIENTS = GRPC_URLS.map(
  (baseUrl) => new SuiGrpcClient({ baseUrl, network: config.suiNetwork })
);
const GRAPHQL_CLIENT = new SuiGraphQLClient({
  url: config.suiGraphqlUrl,
  network: config.suiNetwork,
});
const DATA_CLIENTS: Array<{
  label: string;
  client: ClientWithCoreApi;
}> = [
  ...GRPC_CLIENTS.map((client, index) => ({
    label: `gRPC ${GRPC_URLS[index]}`,
    client,
  })),
  { label: `GraphQL ${config.suiGraphqlUrl}`, client: GRAPHQL_CLIENT },
];
const grpcDisabledUntil = new Map<number, number>();
const GRPC_FAILURE_COOLDOWN_MS = 60_000;

type ObjectData = Record<string, unknown>;
type ObjectWrapper = { data: ObjectData };

function fromBase64(value: string): Uint8Array {
  return Uint8Array.from(Buffer.from(value, 'base64'));
}

async function withDataFailover<T>(
  operation: (client: ClientWithCoreApi, signal: AbortSignal) => Promise<T>
): Promise<T> {
  let lastError: Error | null = null;

  for (let index = 0; index < DATA_CLIENTS.length; index += 1) {
    if ((grpcDisabledUntil.get(index) || 0) > Date.now()) continue;
    const endpoint = DATA_CLIENTS[index];
    for (let attempt = 1; attempt <= config.suiGrpcMaxAttempts; attempt += 1) {
      const controller = new AbortController();
      let timeoutId: ReturnType<typeof setTimeout> | undefined;
      try {
        const timeout = new Promise<never>((_, reject) => {
          timeoutId = setTimeout(() => {
            controller.abort();
            reject(
              new Error(
                `Sui data timeout after ${config.suiGrpcTimeoutMs}ms: ${endpoint.label}`
              )
            );
          }, config.suiGrpcTimeoutMs);
        });
        const result = await Promise.race([
          operation(endpoint.client, controller.signal),
          timeout,
        ]);
        grpcDisabledUntil.delete(index);
        return result;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        const retrying = attempt < config.suiGrpcMaxAttempts;
        console.warn(
          `[Sui data] ${endpoint.label} attempt ${attempt}/${config.suiGrpcMaxAttempts} failed` +
            (retrying ? '; retrying' : index + 1 < DATA_CLIENTS.length ? '; trying failover' : ''),
          lastError.message
        );
        if (retrying) {
          await new Promise((resolve) => setTimeout(resolve, Math.min(250 * 2 ** (attempt - 1), 2_000)));
        }
      } finally {
        if (timeoutId) clearTimeout(timeoutId);
      }
    }
    if (index < GRPC_CLIENTS.length) {
      grpcDisabledUntil.set(index, Date.now() + GRPC_FAILURE_COOLDOWN_MS);
    }
  }

  throw lastError || new Error('All Sui data endpoints failed');
}

export async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  if (items.length === 0) return [];
  const results = new Array<R>(items.length);
  let nextIndex = 0;

  async function runWorker(): Promise<void> {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await worker(items[index], index);
    }
  }

  const workerCount = Math.min(Math.max(1, concurrency), items.length);
  await Promise.all(Array.from({ length: workerCount }, () => runWorker()));
  return results;
}

/**
 * Preserve the service's existing internal shape while changing transports.
 * gRPC Core exposes Move JSON at `json` and Display data at `display.output`.
 */
function wrapGrpcObject(object: Record<string, unknown>): ObjectWrapper {
  const display = object.display as Record<string, unknown> | null | undefined;
  return {
    data: {
      objectId: object.objectId,
      type: object.type,
      owner: object.owner,
      display: { data: display?.output || null },
      content: { fields: object.json || {} },
    },
  };
}

const IPFS_GATEWAYS = [
  'https://ipfs.io/ipfs/',
  'https://cloudflare-ipfs.com/ipfs/',
  'https://gateway.pinata.cloud/ipfs/',
];

export function ipfsToHttps(ipfsUrl: string): string {
  const cid = ipfsUrl.replace(/^ipfs:\/\//, '').replace(/^ipfs\//, '');
  return `${IPFS_GATEWAYS[0]}${cid}`;
}

export function extractImageUrl(
  objData: Record<string, unknown> | null | undefined
): string | null {
  if (!objData) return null;

  const display = objData.display as Record<string, unknown> | undefined;
  const displayData = display?.data as Record<string, unknown> | undefined;
  if (displayData?.image_url) {
    const url = String(displayData.image_url);
    return url.startsWith('ipfs://') ? ipfsToHttps(url) : url;
  }

  const content = objData.content as Record<string, unknown> | undefined;
  const fields = content?.fields as Record<string, unknown> | undefined;
  for (const field of ['media_url', 'url', 'image_url']) {
    if (fields?.[field]) {
      const url = String(fields[field]);
      return url.startsWith('ipfs://') ? ipfsToHttps(url) : url;
    }
  }

  return null;
}

export function extractNftName(
  objData: Record<string, unknown> | null | undefined,
  objectId: string
): string {
  if (!objData) return `VOXX #${objectId.slice(-6)}`;

  const display = objData.display as Record<string, unknown> | undefined;
  const displayData = display?.data as Record<string, unknown> | undefined;
  if (displayData?.name) return String(displayData.name);

  const content = objData.content as Record<string, unknown> | undefined;
  const fields = content?.fields as Record<string, unknown> | undefined;
  if (fields?.name) return String(fields.name);

  return `VOXX #${objectId.slice(-6)}`;
}

export async function getObject(objectId: string): Promise<Record<string, unknown>> {
  const { object } = await withDataFailover((client, signal) =>
    client.core.getObject({
      objectId,
      include: { json: true, display: true },
      signal,
    })
  );
  return wrapGrpcObject(object as unknown as Record<string, unknown>);
}

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
    image_url: extractImageUrl(data),
    project_url: display.project_url || null,
    attributes: content.attributes || {},
    raw_content: content,
  };
}

async function getDirectlyOwnedObjects(
  address: string,
  typeFilter?: string,
  lite: boolean = true
): Promise<Record<string, unknown>[]> {
  const allObjects: Record<string, unknown>[] = [];
  let cursor: string | null = null;

  while (true) {
    const result = await withDataFailover((client, signal) =>
      client.core.listOwnedObjects({
        owner: address,
        type: typeFilter,
        cursor: cursor || undefined,
        include: { json: true, display: true },
        signal,
      })
    );

    allObjects.push(
      ...result.objects.map((object) =>
        wrapGrpcObject(object as unknown as Record<string, unknown>)
      )
    );
    if (!result.hasNextPage || !result.cursor) break;
    cursor = result.cursor;
  }

  void lite;
  return allObjects;
}

const STANDARD_KIOSK_OWNER_CAP_TYPE = normalizeStructTag(
  '0x2::kiosk::KioskOwnerCap'
);
const KIOSK_LISTING_TYPE = normalizeStructTag('0x2::kiosk::Listing');

const PERSONAL_KIOSK_CAP_TYPE_BY_NETWORK: Partial<
  Record<typeof config.suiNetwork, string>
> = {
  mainnet:
    '0x0cb4bcc0560340eb1a1b929cabe56b33fc6449820ec8c1980d69bb98b649b802::personal_kiosk::PersonalKioskCap',
  testnet:
    '0x06f6bdd3f2e2e759d8a4b9c252f379f7a05e72dfe4c0b9311cdac27b8eb791b1::personal_kiosk::PersonalKioskCap',
};

const activePersonalKioskCapType =
  PERSONAL_KIOSK_CAP_TYPE_BY_NETWORK[config.suiNetwork]
    ? normalizeStructTag(PERSONAL_KIOSK_CAP_TYPE_BY_NETWORK[config.suiNetwork]!)
    : undefined;

const TRUSTED_KIOSK_CAP_TYPES = new Set<string>([
  STANDARD_KIOSK_OWNER_CAP_TYPE,
  ...(activePersonalKioskCapType ? [activePersonalKioskCapType] : []),
]);

export function extractKioskIdFromTrustedCap(
  capWrapper: Record<string, unknown>
): string | null {
  const capData = capWrapper.data as Record<string, unknown> | undefined;
  if (!capData) return null;
  const rawCapType = capData.type as string | undefined;
  if (!rawCapType) return null;

  let capType: string;
  try {
    capType = normalizeStructTag(rawCapType);
  } catch {
    return null;
  }
  if (!TRUSTED_KIOSK_CAP_TYPES.has(capType)) return null;

  const content = capData.content as Record<string, unknown> | undefined;
  const fields = content?.fields as Record<string, unknown> | undefined;

  if (capType === STANDARD_KIOSK_OWNER_CAP_TYPE) {
    return typeof fields?.for === 'string' ? fields.for : null;
  }

  const cap = fields?.cap as Record<string, unknown> | undefined;
  const capFields =
    (cap?.fields as Record<string, unknown> | undefined) || cap;
  return typeof capFields?.for === 'string' ? capFields.for : null;
}

export function collectKioskIdsFromTrustedCaps(
  caps: Record<string, unknown>[]
): Set<string> {
  const kioskIds = new Set<string>();
  for (const cap of caps) {
    const kioskId = extractKioskIdFromTrustedCap(cap);
    if (kioskId) kioskIds.add(kioskId);
  }
  return kioskIds;
}

type GrpcDynamicField = {
  $kind?: string;
  childId?: string;
  name?: {
    type?: string;
    bcs?: Uint8Array;
  };
};

function listingIdFromBcs(value: Uint8Array | undefined): string | null {
  if (!value || value.length < 32) return null;
  return `0x${Buffer.from(value.subarray(0, 32)).toString('hex')}`;
}

export function collectKioskDynamicFields(
  fields: GrpcDynamicField[],
  itemIds: Set<string>,
  listedNftIds: Set<string>
): void {
  for (const field of fields) {
    if (field.$kind === 'DynamicObject') {
      if (field.childId) itemIds.add(field.childId);
      continue;
    }

    if (field.$kind !== 'DynamicField' || !field.name?.type) {
      continue;
    }

    try {
      if (normalizeStructTag(field.name.type) !== KIOSK_LISTING_TYPE) continue;
    } catch {
      continue;
    }

    const listedId = listingIdFromBcs(field.name.bcs);
    if (listedId) listedNftIds.add(listedId);
  }
}

async function getKioskOwnedObjects(
  address: string,
  typeFilter: string
): Promise<Record<string, unknown>[]> {
  const allCaps: Record<string, unknown>[] = [];

  for (const capType of TRUSTED_KIOSK_CAP_TYPES) {
    const caps = await getDirectlyOwnedObjects(address, capType, false);
    allCaps.push(...caps);
  }

  const kioskIds = collectKioskIdsFromTrustedCaps(allCaps);

  const kioskObjects = await mapWithConcurrency(
    [...kioskIds],
    config.suiKioskConcurrency,
    async (kioskId) => {
    const objects: Record<string, unknown>[] = [];
    const itemIds = new Set<string>();
    const listedNftIds = new Set<string>();
    let cursor: string | null = null;

    while (true) {
      const result = await withDataFailover((client, signal) =>
        client.core.listDynamicFields({
          parentId: kioskId,
          cursor: cursor || undefined,
          signal,
        })
      );

      collectKioskDynamicFields(result.dynamicFields, itemIds, listedNftIds);
      if (!result.hasNextPage || !result.cursor) break;
      cursor = result.cursor;
    }

    const unlistedItemIds = [...itemIds].filter((id) => !listedNftIds.has(id));
    // Keep the request comfortably below GraphQL providers' 5 KB payload
    // limit when gRPC has to fail over. A 50-ID query can exceed that limit.
    const chunkSize = 25;

    for (let offset = 0; offset < unlistedItemIds.length; offset += chunkSize) {
      const objectIds = unlistedItemIds.slice(offset, offset + chunkSize);
      const result = await withDataFailover((client, signal) =>
        client.core.getObjects({
          objectIds,
          include: { json: true, display: true },
          signal,
        })
      );

      for (const object of result.objects) {
        if (object instanceof Error || object.type !== typeFilter) continue;
        objects.push(
          wrapGrpcObject(object as unknown as Record<string, unknown>)
        );
      }
    }
    return objects;
  });

  return kioskObjects.flat();
}

export async function getOwnedObjects(
  address: string,
  typeFilter?: string,
  lite: boolean = true
): Promise<{
  objects: Record<string, unknown>[];
  kioskError: boolean;
  kioskErrorMessage: string | null;
}> {
  const direct = await getDirectlyOwnedObjects(address, typeFilter, lite);

  let kiosk: Record<string, unknown>[] = [];
  let kioskError = false;
  let kioskErrorMessage: string | null = null;
  if (typeFilter) {
    try {
      kiosk = await getKioskOwnedObjects(address, typeFilter);
    } catch (error) {
      console.error(
        `[Kiosk] Scan failed for ${address.slice(0, 10)}...; skipping Kiosk NFTs this round:`,
        error
      );
      kioskError = true;
      kioskErrorMessage = error instanceof Error ? error.message : String(error);
    }
  }

  const seen = new Set<string>();
  const merged: Record<string, unknown>[] = [];
  for (const object of [...direct, ...kiosk]) {
    const data = object.data as Record<string, unknown>;
    const objectId = data?.objectId as string;
    if (objectId && !seen.has(objectId)) {
      seen.add(objectId);
      merged.push(object);
    }
  }

  return { objects: merged, kioskError, kioskErrorMessage };
}

export async function getSuiBalance(address: string): Promise<string> {
  const { balance } = await withDataFailover((client, signal) =>
    client.core.getBalance({ owner: address, signal })
  );
  return balance.balance;
}

export async function verifyVoxxOwnership(
  address: string,
  objectId: string
): Promise<boolean> {
  try {
    const { objects } = await getOwnedObjects(address, VOXX_TYPE, false);
    return objects.some((object) => {
      const data = object.data as Record<string, unknown>;
      return data?.objectId === objectId;
    });
  } catch {
    return false;
  }
}

const ZKLOGIN_FLAG = 0x05;

export async function verifySignature(
  address: string,
  _nonce: string,
  signatureB64: string,
  bytesB64: string
): Promise<boolean> {
  try {
    const signatureBytes = fromBase64(signatureB64);
    const messageBytes = fromBase64(bytesB64);
    const isZkLogin = signatureBytes.length > 0 && signatureBytes[0] === ZKLOGIN_FLAG;

    await verifyPersonalMessageSignature(messageBytes, signatureB64, {
      address,
      ...(isZkLogin ? { client: GRAPHQL_CLIENT } : {}),
    });
    return true;
  } catch (error) {
    console.error(
      'Signature verification failed:',
      error instanceof Error ? error.message : error
    );
    return false;
  }
}
