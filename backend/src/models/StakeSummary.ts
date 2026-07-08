import mongoose, { Document, Schema } from 'mongoose';

export interface IStakeSummary extends Document {
  address: string;
  /** Number of NFTs the wallet actually owns on-chain (from last successful sync). */
  nft_count: number;
  last_synced: Date | null;
}

const StakeSummarySchema = new Schema<IStakeSummary>({
  address: { type: String, required: true, unique: true, index: true },
  nft_count: { type: Number, default: 0 },
  last_synced: { type: Date, default: null },
});

export const StakeSummary = mongoose.model<IStakeSummary>(
  'StakeSummary',
  StakeSummarySchema,
  'stake_summaries'
);
