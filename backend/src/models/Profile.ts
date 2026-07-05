import mongoose, { Schema, Document } from 'mongoose';

export interface IProfile extends Document {
  address: string;
  name: string;
  pfp_url: string | null;
  pfp_object_id: string | null;
  updated_at: string;
}

const ProfileSchema = new Schema<IProfile>(
  {
    address: { type: String, required: true, unique: true, index: true },
    name: { type: String, default: '', maxlength: 32 },
    pfp_url: { type: String, default: null },
    pfp_object_id: { type: String, default: null },
    updated_at: { type: String, default: () => new Date().toISOString() },
  },
  { timestamps: false }
);

ProfileSchema.set('toJSON', {
  transform: (_doc, ret) => {
    ret.id = ret._id?.toString();
    delete ret._id;
    delete ret.__v;
    return ret;
  },
});

export const Profile = mongoose.model<IProfile>('Profile', ProfileSchema, 'profiles');
