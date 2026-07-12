import { Router, Response } from 'express';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { Profile } from '../models/Profile';

const router = Router();

/**
 * GET /api/profile — get current user's profile (name, pfp)
 */
router.get('/', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const profile = await Profile.findOne({ address: req.address! }).lean();
    res.json({
      address: req.address!,
      name: profile?.name || '',
      pfp_url: profile?.pfp_url || null,
      pfp_object_id: profile?.pfp_object_id || null,
    });
  } catch (err) {
    console.error('Get profile error:', err);
    res.status(500).json({ detail: 'Failed to load profile' });
  }
});

/**
 * PUT /api/profile — update name and/or pfp
 */
router.put('/', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { name, pfp_url, pfp_object_id } = req.body;

    const update: Record<string, unknown> = {};
    if (name !== undefined) update.name = String(name).trim().slice(0, 32);
    if (pfp_url !== undefined) {
      // Only allow http/https URLs — reject javascript:, data:, file:, etc.
      // Null/empty is allowed (clears the pfp).
      if (pfp_url === null || pfp_url === '') {
        update.pfp_url = null;
      } else if (typeof pfp_url === 'string' && (pfp_url.startsWith('http://') || pfp_url.startsWith('https://'))) {
        update.pfp_url = pfp_url;
      } else {
        res.status(400).json({ detail: 'pfp_url must be an http/https URL or null' });
        return;
      }
    }
    if (pfp_object_id !== undefined) update.pfp_object_id = pfp_object_id || null;

    const profile = await Profile.findOneAndUpdate(
      { address: req.address! },
      { $set: update },
      { upsert: true, new: true }
    ).lean();

    res.json({
      address: req.address!,
      name: profile?.name || '',
      pfp_url: profile?.pfp_url || null,
      pfp_object_id: profile?.pfp_object_id || null,
    });
  } catch (err) {
    console.error('Update profile error:', err);
    res.status(500).json({ detail: 'Failed to update profile' });
  }
});

export default router;
