import express from 'express';
import path from 'path';
import fs from 'fs';
import cors from 'cors';
import helmet from 'helmet';
import { config } from './config';
import { connectDB } from './db';
import authRouter from './routes/auth';
import stakingRouter from './routes/staking';
import rankingRouter from './routes/ranking';
import profileRouter from './routes/profile';
import adminRouter from './routes/admin';
import visitorRouter from './routes/visitor';
import imageRouter from './routes/image';
import balanceRouter from './routes/balance';
import rootRouter from './routes/root';
import { startBackgroundSync } from './services/backgroundSync';

async function main() {
  await connectDB();

  // SECURITY: several safety controls are gated on NODE_ENV==='production'
  // (CORS fallback, /api/debug/config exposure, JWT secret handling). If it's
  // not set on the deployed service, those controls silently relax. Fail loud.
  if (process.env.NODE_ENV !== 'production') {
    console.warn(
      '⚠️  SECURITY: NODE_ENV is not "production" — dev relaxations ACTIVE ' +
      '(CORS may be "*", /api/debug/config is exposed, ephemeral JWT secret if JWT_SECRET unset). ' +
      'Set NODE_ENV=production on the deployed service.'
    );
  }

  const app = express();

  // Trust the Railway proxy so req.protocol/req.ip reflect the real client
  // (needed for HSTS behind TLS-terminating proxy and correct client IPs).
  app.set('trust proxy', 1);

  // Security headers. CSP/COEP/COOP disabled to avoid breaking the CRA inline
  // runtime and cross-origin image loading; frameguard / HSTS / noSniff /
  // referrer-policy still apply.
  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginEmbedderPolicy: false,
      crossOriginOpenerPolicy: false,
    })
  );

  // CORS — production must explicitly set CORS_ORIGINS
  const corsOrigin = config.corsOrigins.length === 0 ? false : config.corsOrigins;
  app.use(
    cors({
      origin: corsOrigin,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
      allowedHeaders: ['*'],
    })
  );

  // Body parsing — cap payload size to limit memory-exhaustion / abuse vectors
  // (e.g. a giant nonce/verify body). 1mb is far more than any legit request needs.
  app.use(express.json({ limit: '1mb' }));

  // API routes under /api
  const apiRouter = express.Router();

  apiRouter.get('/', (_req, res) => {
    res.json({ message: 'Sui NFT Staking API' });
  });

  apiRouter.get('/health', (_req, res) => {
    res.json({ status: 'ok', service: 'sui-nft-staking' });
  });

  // Debug config dump — only in non-production. In production this is an
  // unnecessary info-disclosure surface (DB name, RPC, port), so we hide it.
  apiRouter.get('/debug/config', (_req, res) => {
    if (process.env.NODE_ENV === 'production') {
      res.status(404).json({ detail: 'Not found' });
      return;
    }
    res.json({
      suiRpcUrl: config.suiRpcUrl,
      port: config.port,
      mongoDb: config.dbName,
      corsOrigins: config.corsOrigins,
    });
  });

  apiRouter.use('/auth', authRouter);
  apiRouter.use('/staking', stakingRouter);
  apiRouter.use('/ranking', rankingRouter);
  apiRouter.use('/profile', profileRouter);
  apiRouter.use('/admin', adminRouter);
  apiRouter.use('/visitor', visitorRouter);
  apiRouter.use('/image', imageRouter);
  apiRouter.use('/balance', balanceRouter);
  apiRouter.use('/root', rootRouter);

  app.use('/api', apiRouter);

  // Serve frontend static files
  const frontendBuild = path.resolve(__dirname, '../../frontend/build');
  console.log(`Frontend path: ${frontendBuild}`);
  console.log(`Frontend exists: ${fs.existsSync(frontendBuild)}`);
  if (fs.existsSync(frontendBuild)) {
    console.log(`Frontend files: ${fs.readdirSync(frontendBuild).join(', ')}`);
  }

  app.use(express.static(frontendBuild));

  // SPA fallback — but never swallow unmatched /api/* routes (otherwise a
  // mistyped API path returns 200 + HTML, masking real 404s and confusing clients).
  app.get('*', (req, res) => {
    if (req.originalUrl.startsWith('/api')) {
      res.status(404).json({ detail: 'Not found' });
      return;
    }
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

  // Start background sync (every 10 minutes by default)
  startBackgroundSync();
}

main().catch(console.error);
