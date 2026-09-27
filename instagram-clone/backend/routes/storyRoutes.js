import express from 'express';
import {
  createStory,
  getActiveStories,
  markStoryAsViewed,
} from '../controllers/storyController.js';
import { protect } from '../middleware/authMiddleware.js';
import upload from '../middleware/uploadMiddleware.js';

const router = express.Router();

router.post('/', protect, upload.single('media'), createStory);
router.get('/active', protect, getActiveStories);
router.post('/view/:id', protect, markStoryAsViewed);

export default router;
