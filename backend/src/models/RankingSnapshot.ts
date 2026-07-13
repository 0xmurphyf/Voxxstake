import mongoose, { Document, Schema } from 'mongoose';

/**
 * Precomputed ranking snapshot — updated by backgroundSync every cycle.
 * The ranking endpoint reads from this collection with a simple
 * .find().sort().skip().limit() instead of full-table-scanning
 * Profile + Stake on every request.
 */
export interface IRankingSnapshot extends Document {
  address: string;
  display_address: string;
  display_name: string;
  credential_count: number;
  multiplier: number;
  total_credits: number;
  max_duration_days: number;
  updated_at: Date;
}

const RankingSnapshotSchema = new Schema<IRankingSnapshot>({
  address: { type: String, required: true, unique: true, index: true },
  display_address: { type: String, required: true },
  display_name: { type: String, default: '' },
  credential_count: { type: Number, default: 0 },
  multiplier: { type: Number, default: 1.0 },
  total_credits: { type: Number, default: 0, index: true },
  max_duration_days: { type: Number, default: 0 },
  updated_at: { type: Date, default: () => new Date() },
});

// Index for the ranking query: sort by total_credits DESC, then address ASC for tie-breaking
RankingSnapshotSchema.index({ total_credits: -1, address: 1 });

export const RankingSnapshot = mongoose.model<IRankingSnapshot>(
  'RankingSnapshot',
  RankingSnapshotSchema,
  'ranking_snapshots'
);
