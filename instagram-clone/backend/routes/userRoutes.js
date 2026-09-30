import express from 'express';
import {
  getUserProfile,
  updateUserProfile,
  followUnfollowUser,
  searchUsers,
  getSuggestedUsers,
} from '../controllers/userController.js';
import User from '../models/User.js';
import { protect } from '../middleware/authMiddleware.js';
import { updateProfileValidator } from '../utils/validators.js';
import upload from '../middleware/uploadMiddleware.js';

const router = express.Router();

// @route   GET /api/user/username-available?username=x
// @access  Public (used during signup / onboarding)
router.get('/username-available', async (req, res, next) => {
  try {
    const { username } = req.query;
    if (!username || String(username).length < 3) {
      return res.json({ success: true, available: false, reason: 'too_short' });
    }
    const exists = await User.findOne({ username: String(username).toLowerCase() });
    res.json({ success: true, available: !exists });
  } catch (error) {
    next(error);
  }
});

router.get('/profile/:username', protect, getUserProfile);
router.put('/profile', protect, upload.single('avatar'), updateProfileValidator, updateUserProfile);
router.post('/follow/:id', protect, followUnfollowUser);
router.get('/search', protect, searchUsers);
router.get('/suggested', protect, getSuggestedUsers);

export default router;
