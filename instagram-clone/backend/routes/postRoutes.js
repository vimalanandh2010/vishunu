import express from 'express';
import {
  createPost,
  updatePost,
  deletePost,
  getSinglePost,
  getPostLikers,
  toggleLikePost,
  getFeedPosts,
  getUserPosts,
  toggleSavePost,
  getSavedPosts,
} from '../controllers/postController.js';
import { protect } from '../middleware/authMiddleware.js';
import upload from '../middleware/uploadMiddleware.js';
import {
  createPostValidator,
  updatePostValidator,
  validateObjectId,
} from '../utils/validators.js';

const router = express.Router();

router.post('/', protect, upload.single('media'), createPostValidator, createPost);
router.get('/feed', protect, getFeedPosts);
router.get('/saved', protect, getSavedPosts);
router.get('/user/:username', protect, getUserPosts);
router.get('/:id', protect, validateObjectId('id'), getSinglePost);
router.get('/:id/likes', protect, validateObjectId('id'), getPostLikers);
router.post('/like/:id', protect, validateObjectId('id'), toggleLikePost);
router.post('/save/:id', protect, validateObjectId('id'), toggleSavePost);
router.put('/:id', protect, validateObjectId('id'), updatePostValidator, updatePost);
router.delete('/:id', protect, validateObjectId('id'), deletePost);

export default router;
