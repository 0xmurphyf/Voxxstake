import assert from 'node:assert/strict';
import test from 'node:test';
import {
  collectKioskDynamicFields,
  extractKioskIdFromTrustedCap,
} from './sui';

const MAINNET_PERSONAL_KIOSK_CAP =
  '0x0cb4bcc0560340eb1a1b929cabe56b33fc6449820ec8c1980d69bb98b649b802::personal_kiosk::PersonalKioskCap';

test('rejects a forged object with a cap-shaped fields.for value', () => {
  const forged = {
    data: {
      type: '0xdead::fake_cap::FakeCap',
      content: { fields: { for: '0xvictim-kiosk' } },
    },
  };

  assert.equal(extractKioskIdFromTrustedCap(forged), null);
});

test('extracts standard and allowlisted Personal Kiosk IDs', () => {
  const standard = {
    data: {
      type: '0x2::kiosk::KioskOwnerCap',
      content: { fields: { for: '0xstandard-kiosk' } },
    },
  };
  const personal = {
    data: {
      type: MAINNET_PERSONAL_KIOSK_CAP,
      content: {
        fields: { cap: { for: '0xpersonal-kiosk' } },
      },
    },
  };

  assert.equal(extractKioskIdFromTrustedCap(standard), '0xstandard-kiosk');
  assert.equal(extractKioskIdFromTrustedCap(personal), '0xpersonal-kiosk');
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
      name: { type: '0x2::kiosk::Listing', bcs: listingBcs },
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
