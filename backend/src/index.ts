import express from 'express';
import path from 'path';
import fs from 'fs';
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

  // Serve frontend static files
  // Railway: /app/frontend/build, local: ../../frontend/build
  const frontendBuild = path.resolve(__dirname, '../../frontend/build');
  console.log(`Frontend path: ${frontendBuild}`);
  console.log(`Frontend exists: ${fs.existsSync(frontendBuild)}`);
  if (fs.existsSync(frontendBuild)) {
    console.log(`Frontend files: ${fs.readdirSync(frontendBuild).join(', ')}`);
  }

  app.use(express.static(frontendBuild));

  // SPA fallback
  app.get('*', (_req, res) => {
    const indexPath = path.join(frontendBuild, 'index.html');
    if (fs.existsSync(indexPath)) {
      res.sendFile(indexPath);
    } else {
      res.status(404).json({ detail: 'Frontend not built', path: indexPath });
    }
  });

  app.listen(config.port, () => {
    console.log(`Voxxstake server listening on port ${config.port}`);
  });
}

main().catch(console.error);
