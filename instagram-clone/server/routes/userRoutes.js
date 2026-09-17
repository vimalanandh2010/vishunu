import express from 'express';
import {
  getUserProfile,
  updateUserProfile,
  followUnfollowUser,
  searchUsers,
  getSuggestedUsers,
} from '../controllers/userController.js';
import { protect } from '../middleware/authMiddleware.js';
import { updateProfileValidator } from '../utils/validators.js';
import upload from '../middleware/uploadMiddleware.js';

const router = express.Router();

router.get('/profile/:username', protect, getUserProfile);
router.put('/profile', protect, upload.single('avatar'), updateProfileValidator, updateUserProfile);
router.post('/follow/:id', protect, followUnfollowUser);
router.get('/search', protect, searchUsers);
router.get('/suggested', protect, getSuggestedUsers);

export default router;
