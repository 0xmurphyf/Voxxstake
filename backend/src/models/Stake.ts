import mongoose, { Document, Schema } from 'mongoose';

export interface IStake extends Document {
  address: string;
  object_id: string;
  name: string | null;
  image_url: string | null;
  created_at: string | null;
  total_staked_seconds: number;
  current_session_start: string | null;
  status: 'active' | 'paused';
  last_synced: string | null;
  /** Locked points from completed sessions — never decreases */
  locked_points: number;
  /**
   * Multiplier frozen at the start of the current active session.
   * Only ever increases (max of historical multiplier). Used when computing
   * live session points so credits can never decrease when the global
   * holding multiplier drops (e.g. after selling an NFT).
   */
  session_multiplier: number;
}

const StakeSchema = new Schema<IStake>({
  address: { type: String, required: true, index: true },
  object_id: { type: String, required: true, unique: true },
  name: { type: String, default: null },
  image_url: { type: String, default: null },
  created_at: { type: String, default: null },
  total_staked_seconds: { type: Number, default: 0.0 },
  current_session_start: { type: String, default: null },
  status: { type: String, enum: ['active', 'paused'], default: 'active' },
  last_synced: { type: String, default: null },
  locked_points: { type: Number, default: 0.0 },
  session_multiplier: { type: Number, default: 1.0 },
});

StakeSchema.index({ address: 1, object_id: 1 });

// Strip _id and __v from JSON output
StakeSchema.set('toJSON', {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  transform(_doc: any, ret: any) {
    delete ret._id;
    delete ret.__v;
    return ret;
  },
});

export const Stake = mongoose.model<IStake>('Stake', StakeSchema, 'stakes');
