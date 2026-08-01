import assert from 'node:assert/strict';
import test from 'node:test';
import {
  collectKioskDynamicFields,
  extractKioskIdOwnedByAddressFromNftNode,
  mapWithConcurrency,
} from './sui';

const USER = `0x${'81'.repeat(32)}`;
const OTHER_USER = `0x${'42'.repeat(32)}`;
const KIOSK_ID = `0x${'ab'.repeat(32)}`;

function kioskAddressNode(owner: string) {
  return {
    address: KIOSK_ID,
    asObject: {
      asMoveObject: {
        contents: {
          type: {
            repr: '0x0000000000000000000000000000000000000000000000000000000000000002::kiosk::Kiosk',
          },
          json: { owner },
        },
      },
    },
  };
}

test('discovers a Kiosk through the NFT dynamic-field wrapper and confirms its content owner', () => {
  const nftNode = {
    owner: {
      __typename: 'ObjectOwner',
      address: {
        address: `0x${'cd'.repeat(32)}`,
        asObject: {
          owner: {
            __typename: 'ObjectOwner',
            address: kioskAddressNode(USER),
          },
        },
      },
    },
  };

  assert.equal(
    extractKioskIdOwnedByAddressFromNftNode(nftNode, USER),
    KIOSK_ID
  );
  assert.equal(
    extractKioskIdOwnedByAddressFromNftNode(nftNode, OTHER_USER),
    null
  );
});

test('accepts an NFT directly object-owned by a Kiosk with the matching content owner', () => {
  const nftNode = {
    owner: {
      __typename: 'ObjectOwner',
      address: kioskAddressNode(USER),
    },
  };

  assert.equal(
    extractKioskIdOwnedByAddressFromNftNode(nftNode, USER),
    KIOSK_ID
  );
});

test('does not infer Kiosk ownership from a cap-shaped or non-Kiosk object', () => {
  const nftNode = {
    owner: {
      __typename: 'ObjectOwner',
      address: {
        address: KIOSK_ID,
        asObject: {
          asMoveObject: {
            contents: {
              type: { repr: '0x2::fake::Kiosk' },
              json: { owner: USER, for: KIOSK_ID },
            },
          },
        },
      },
    },
  };

  assert.equal(extractKioskIdOwnedByAddressFromNftNode(nftNode, USER), null);
});

test('keeps Listing state across separate dynamic-field pages', () => {
  const itemIds = new Set<string>();
  const listedNftIds = new Set<string>();
  const nftId = `0x${'ab'.repeat(32)}`;
  const listingBcs = Uint8Array.from([
    ...Buffer.from(nftId.slice(2), 'hex'),
    0,
  ]);

  collectKioskDynamicFields(
    [{ $kind: 'DynamicObject', childId: nftId }],
    itemIds,
    listedNftIds
  );
  collectKioskDynamicFields(
    [{
      $kind: 'DynamicField',
      name: {
        type: '0x0000000000000000000000000000000000000000000000000000000000000002::kiosk::Listing',
        bcs: listingBcs,
      },
    }],
    itemIds,
    listedNftIds
  );

  assert.deepEqual([...itemIds], [nftId]);
  assert.equal(listedNftIds.has(nftId), true);
  assert.deepEqual([...itemIds].filter((id) => !listedNftIds.has(id)), []);
});

test('does not accept lookalike Listing types from another package', () => {
  const itemIds = new Set<string>();
  const listedNftIds = new Set<string>();

  collectKioskDynamicFields(
    [{
      $kind: 'DynamicField',
      name: {
        type: '0xdead::kiosk::Listing',
        bcs: Uint8Array.from(Buffer.from('ab'.repeat(32), 'hex')),
      },
    }],
    itemIds,
    listedNftIds
  );

  assert.equal(listedNftIds.size, 0);
});

test('bounds concurrent Kiosk work and preserves result order', async () => {
  let active = 0;
  let peak = 0;
  const results = await mapWithConcurrency([1, 2, 3, 4, 5], 2, async (value) => {
    active += 1;
    peak = Math.max(peak, active);
    await new Promise((resolve) => setTimeout(resolve, 5));
    active -= 1;
    return value * 10;
  });

  assert.equal(peak, 2);
  assert.deepEqual(results, [10, 20, 30, 40, 50]);
});
