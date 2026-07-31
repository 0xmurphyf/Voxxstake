import assert from 'node:assert/strict';
import test from 'node:test';
import { Stake } from '../models/Stake';
import { reconcileOwnedStakes } from './ownershipSync';

test('claims an NFT recorded under a previous owner without inserting a duplicate', async () => {
  const originalFind = Stake.find;
  const originalBulkWrite = Stake.bulkWrite;
  const batches: unknown[][] = [];
  const objectId = `0x${'12'.repeat(32)}`;

  try {
    Stake.find = ((query: Record<string, unknown>) => {
      if ('object_id' in query) {
        return Promise.resolve([{
          _id: 'stake-id',
          address: '0xprevious',
          object_id: objectId,
          name: 'VOXX old',
          image_url: null,
          status: 'active',
          current_session_start: '2026-01-01T00:00:00.000Z',
          session_multiplier: 1,
          total_staked_seconds: 0,
          locked_points: 0,
        }]);
      }
      return Promise.resolve([]);
    }) as typeof Stake.find;
    Stake.bulkWrite = (async (operations: unknown[]) => {
      batches.push(operations);
      return {};
    }) as typeof Stake.bulkWrite;

    const result = await reconcileOwnedStakes({
      address: '0xcurrent',
      ownedMap: new Map([[objectId, { name: 'VOXX current', image_url: 'https://image' }]]),
      scanComplete: true,
      now: new Date('2026-07-31T12:00:00.000Z'),
    });

    assert.equal(result.nftCount, 1);
    assert.equal(batches.length, 1);
    const operation = batches[0][0] as {
      updateOne: {
        filter: { object_id: string };
        update: { $set: { address: string; name: string; status: string } };
        upsert: boolean;
      };
    };
    assert.equal(operation.updateOne.filter.object_id, objectId);
    assert.equal(operation.updateOne.update.$set.address, '0xcurrent');
    assert.equal(operation.updateOne.update.$set.name, 'VOXX current');
    assert.equal(operation.updateOne.update.$set.status, 'active');
    assert.equal(operation.updateOne.upsert, true);
  } finally {
    Stake.find = originalFind;
    Stake.bulkWrite = originalBulkWrite;
  }
});
