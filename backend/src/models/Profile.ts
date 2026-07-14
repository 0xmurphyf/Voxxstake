import mongoose, { Schema, Document } from 'mongoose';

export interface IProfile extends Document {
  address: string;
  name: string;
  pfp_url: string | null;
  pfp_object_id: string | null;
  updated_at: string;
  // Last observed client IP + timestamp (captured at wallet login for anti-abuse).
  // Privacy-minimal: only the most recent IP is kept, not a full history.
  last_ip: string | null;
  last_seen_at: string | null;
  // Admin overrides (set via File Z). Persist across sync cycles.
  // credit_override: delta added to auto-computed total_credits (can be negative).
  // multiplier_override: replaces auto-computed multiplier when set.
  credit_override: number | null;
  multiplier_override: number | null;
}

const ProfileSchema = new Schema<IProfile>(
  {
    address: { type: String, required: true, unique: true, index: true },
    name: { type: String, default: '', maxlength: 32 },
    pfp_url: { type: String, default: null },
    pfp_object_id: { type: String, default: null },
    updated_at: { type: String, default: () => new Date().toISOString() },
    last_ip: { type: String, default: null, index: true },
    last_seen_at: { type: String, default: null },
    credit_override: { type: Number, default: null },
    multiplier_override: { type: Number, default: null },
  },
  { timestamps: false }
);

ProfileSchema.set('toJSON', {
  transform: (_doc, ret) => {
    ret.id = ret._id?.toString();
    delete (ret as any)._id;
    delete (ret as any).__v;
    return ret;
  },
});

export const Profile = mongoose.model<IProfile>('Profile', ProfileSchema, 'profiles');
