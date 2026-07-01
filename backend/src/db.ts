import mongoose from 'mongoose';
import { config } from './config';

export async function connectDB(): Promise<void> {
  await mongoose.connect(config.mongoUrl, { dbName: config.dbName });
  console.log('MongoDB connected');
}
