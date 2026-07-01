import express from 'express';
import path from 'path';
import cors from 'cors';
import { config } from './config';
import { connectDB } from './db';
import authRouter from './routes/auth';
import stakingRouter from './routes/staking';
import adminRouter from './routes/admin';

async function main() {
  await connectDB();

  const app = express();

  // CORS
  app.use(
    cors({
      origin: config.corsOrigins,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
      allowedHeaders: ['*'],
    })
  );

  // Body parsing
  app.use(express.json());

  // API routes under /api
  const apiRouter = express.Router();

  apiRouter.get('/', (_req, res) => {
    res.json({ message: 'Sui NFT Staking API' });
  });

  apiRouter.get('/health', (_req, res) => {
    res.json({ status: 'ok', service: 'sui-nft-staking' });
  });

  apiRouter.use('/auth', authRouter);
  apiRouter.use('/staking', stakingRouter);
  apiRouter.use('/admin', adminRouter);

  app.use('/api', apiRouter);

  // Serve frontend static files in production
  const frontendBuild = path.resolve(__dirname, '../../frontend/build');
  app.use(express.static(frontendBuild));

  // SPA fallback: all non-API routes serve index.html
  app.get('*', (_req, res) => {
    res.sendFile(path.join(frontendBuild, 'index.html'));
  });

  app.listen(config.port, () => {
    console.log(`Voxxstake server listening on port ${config.port}`);
    console.log(`Frontend served from ${frontendBuild}`);
  });
}

main().catch(console.error);
