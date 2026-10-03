import express from 'express';
import {
  createPost,
  updatePost,
  deletePost,
  getSinglePost,
  toggleLikePost,
  getFeedPosts,
  getUserPosts,
  toggleSavePost,
  getSavedPosts,
} from '../controllers/postController.js';
import { protect } from '../middleware/authMiddleware.js';
import upload from '../middleware/uploadMiddleware.js';

const router = express.Router();

router.post('/', protect, upload.single('media'), createPost);
router.get('/feed', protect, getFeedPosts);
router.get('/saved', protect, getSavedPosts);
router.get('/user/:username', protect, getUserPosts);
router.get('/:id', protect, getSinglePost);
router.post('/like/:id', protect, toggleLikePost);
router.post('/save/:id', protect, toggleSavePost);
router.put('/:id', protect, updatePost);
router.delete('/:id', protect, deletePost);

export default router;
