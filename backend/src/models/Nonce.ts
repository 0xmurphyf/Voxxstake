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

// TTL index: auto-delete nonces after expiry + 60s buffer
NonceSchema.index({ created_at: 1 }, { expireAfterSeconds: NONCE_EXPIRY_SECONDS + 60 });

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
