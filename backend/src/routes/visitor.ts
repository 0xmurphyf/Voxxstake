import { Router, Response, Request } from 'express';
import { Visitor } from '../models/Visitor';

const router = Router();

/**
 * GET /api/visitor/count
 * Increment the global visitor counter and return the new count.
 * Public — no auth required.
 */
router.get('/count', async (_req: Request, res: Response) => {
  try {
    const doc = await Visitor.findOneAndUpdate(
      { _key: 'global' },
      { $inc: { count: 1 } },
      { upsert: true, new: true }
    ).lean();

    res.json({ count: doc?.count || 1 });
  } catch (err) {
    console.error('Visitor count error:', err);
    // Fallback: return a placeholder so the UI doesn't break
    res.json({ count: 0, error: 'Failed to update counter' });
  }
});

export default router;
