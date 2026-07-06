import mongoose, { Schema, Document } from 'mongoose';

export interface IVisitor extends Document {
  /** Unique key for the counter (always "global") */
  _key: string;
  /** Total visit count */
  count: number;
}

const VisitorSchema = new Schema<IVisitor>(
  {
    _key: { type: String, default: 'global', unique: true },
    count: { type: Number, default: 0 },
  },
  { timestamps: true }
);

export const Visitor = mongoose.model<IVisitor>('Visitor', VisitorSchema, 'visitors');
