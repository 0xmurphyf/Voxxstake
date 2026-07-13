import mongoose, { Document, Schema } from 'mongoose';
import { NONCE_EXPIRY_SECONDS } from '../types';

export interface INonce extends Document {
  address: string;
  nonce: string;
  created_at: Date;
  used: boolean;
}

const NonceSchema = new Schema<INonce>({
  address: { type: String, required: true, index: true },
  nonce: { type: String, required: true },
  created_at: { type: Date, default: () => new Date() },
  used: { type: Boolean, default: false },
});

// TTL index: auto-delete nonces shortly after expiry (defense-in-depth even
// though /verify already rejects used/expired nonces). Prevents unbounded
// collection growth from abandoned nonce rows.
NonceSchema.index({ created_at: 1 }, { expireAfterSeconds: NONCE_EXPIRY_SECONDS + 60 });
// Secondary index so the "delete existing unused nonces for this address" path
// and the lookup-by-(address,nonce,used) path are both covered.
NonceSchema.index({ address: 1, used: 1 });
// Unique compound index on unused nonces per address — closes the race window
// between deleteMany and create in /api/auth/nonce. With this index, a second
// concurrent /nonce call for the same address will fail with a duplicate key
// error instead of inserting a second unused nonce. The partialFilterExpression
// ensures used=true rows are never constrained (they're cleaned up by TTL anyway).
NonceSchema.index(
  { address: 1 },
  {
    unique: true,
    partialFilterExpression: { used: false },
    name: 'unique_unused_nonce_per_address',
  }
);

// Strip _id and __v from JSON output
NonceSchema.set('toJSON', {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  transform(_doc: any, ret: any) {
    delete ret._id;
    delete ret.__v;
    return ret;
  },
});

export const Nonce = mongoose.model<INonce>('Nonce', NonceSchema, 'nonces');
