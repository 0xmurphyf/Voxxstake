import type { AnyBulkWriteOperation } from 'mongoose';
import { Stake, IStake } from '../models/Stake';
import { POINTS_PER_NFT_PER_HOUR } from '../types';
import { getHoldingMultiplier } from './staking';

export type OwnedNftMetadata = {
  name: string;
  image_url: string | null;
};

type ReconcileOptions = {
  address: string;
  ownedMap: Map<string, OwnedNftMetadata>;
  scanComplete: boolean;
  now?: Date;
};

export async function reconcileOwnedStakes({
  address,
  ownedMap,
  scanComplete,
  now = new Date(),
}: ReconcileOptions): Promise<{ sellAlerts: string[]; nftCount: number }> {
  const nowIso = now.toISOString();
  const ownedIds = [...ownedMap.keys()];
  const [ownedStakes, addressStakes] = await Promise.all([
    ownedIds.length > 0
      ? Stake.find({ object_id: { $in: ownedIds } })
      : Promise.resolve([]),
    Stake.find({ address }),
  ]);
  const ownedStakeMap = new Map(ownedStakes.map((stake) => [stake.object_id, stake]));
  const knownActiveCount = addressStakes.filter((stake) => stake.status === 'active').length;
  const nftCount = scanComplete
    ? ownedMap.size
    : Math.max(ownedMap.size, knownActiveCount);
  const currentMultiplier = getHoldingMultiplier(nftCount);

  const ownershipOps: AnyBulkWriteOperation<IStake>[] = [];
  for (const [objectId, metadata] of ownedMap) {
    const existing = ownedStakeMap.get(objectId);
    const sessionMultiplier = existing?.status === 'active'
      ? Math.max(existing.session_multiplier || 1, currentMultiplier)
      : currentMultiplier;
    const currentSessionStart = existing?.status === 'active'
      ? existing.current_session_start || nowIso
      : nowIso;

    ownershipOps.push({
      updateOne: {
        filter: { object_id: objectId },
        update: {
          $set: {
            address,
            name: metadata.name,
            image_url: metadata.image_url,
            current_session_start: currentSessionStart,
            status: 'active',
            session_multiplier: sessionMultiplier,
            last_synced: nowIso,
          },
          $setOnInsert: {
            object_id: objectId,
            created_at: nowIso,
            total_staked_seconds: 0,
            locked_points: 0,
          },
        },
        upsert: true,
      },
    });
  }

  if (ownershipOps.length > 0) {
    await Stake.bulkWrite(ownershipOps, { ordered: false });
  }

  const sellAlerts: string[] = [];
  if (scanComplete) {
    const pauseOps: AnyBulkWriteOperation<IStake>[] = [];
    for (const stake of addressStakes) {
      if (ownedMap.has(stake.object_id) || stake.status !== 'active') continue;

      let sessionSeconds = 0;
      if (stake.current_session_start) {
        const sessionStart = new Date(stake.current_session_start);
        sessionSeconds = Math.max(0, (now.getTime() - sessionStart.getTime()) / 1000);
      }
      const lockMultiplier = stake.session_multiplier > 0
        ? stake.session_multiplier
        : currentMultiplier;
      const sessionPoints = Math.round(
        (sessionSeconds / 3600) * POINTS_PER_NFT_PER_HOUR * lockMultiplier
      );

      pauseOps.push({
        updateOne: {
          filter: { _id: stake._id, status: 'active' },
          update: {
            $set: {
              status: 'paused',
              current_session_start: null,
              total_staked_seconds: (stake.total_staked_seconds || 0) + sessionSeconds,
              locked_points: (stake.locked_points || 0) + sessionPoints,
              last_synced: nowIso,
            },
          },
        },
      });
      sellAlerts.push(stake.name || `VOXX #${stake.object_id.slice(-6)}`);
    }

    if (pauseOps.length > 0) {
      await Stake.bulkWrite(pauseOps, { ordered: false });
    }
  }

  return { sellAlerts, nftCount };
}
