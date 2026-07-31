import { Router, Response } from 'express';
import { authMiddleware, AuthRequest } from '../middleware/auth';

const router = Router();

/**
 * GET /api/balance/:address
 *
 * Returns the SUI balance for the given address.
 * Uses the Sui gRPC Core API.
 *
 * Auth required — prevents abuse of backend RPC resources.
 */
router.get('/:address', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { address } = req.params;

    // Basic address validation
    if (!address || !address.startsWith('0x') || address.length !== 66) {
      res.status(400).json({ detail: 'Invalid Sui address' });
      return;
    }

    const { getSuiBalance } = await import('../services/sui');
    const mist = await getSuiBalance(address);
    const balance = (parseInt(mist, 10) / 1e9).toFixed(4);

    res.json({
      address,
      balance,
      balance_mist: mist,
    });
  } catch (err) {
    console.error('Balance fetch error:', err);
    res.status(500).json({ detail: 'Failed to fetch balance' });
  }
});

export default router;
