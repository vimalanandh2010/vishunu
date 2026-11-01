import express from 'express';
import {
  createStory,
  getActiveStories,
  markStoryAsViewed,
  deleteStory,
} from '../controllers/storyController.js';
import { protect } from '../middleware/authMiddleware.js';
import upload from '../middleware/uploadMiddleware.js';

const router = express.Router();

router.post('/', protect, upload.single('media'), createStory);
router.get('/active', protect, getActiveStories);
router.post('/view/:id', protect, markStoryAsViewed);
router.delete('/:id', protect, deleteStory);

export default router;
