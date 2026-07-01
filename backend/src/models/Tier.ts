import mongoose, { Document, Schema } from 'mongoose';

export interface ITier extends Document {
  name: string;
  multiplier: number;
  min_days: number;
  apy: number;
}

const TierSchema = new Schema<ITier>(
  {
    name: { type: String, required: true },
    multiplier: { type: Number, required: true },
    min_days: { type: Number, required: true },
    apy: { type: Number, required: true },
  },
  { _id: false }
);

// Strip __v from JSON output
TierSchema.set('toJSON', {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  transform(_doc: any, ret: any) {
    delete ret.__v;
    return ret;
  },
});

export const Tier = mongoose.model<ITier>('Tier', TierSchema, 'tiers');
