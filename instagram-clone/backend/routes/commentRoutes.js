import express from 'express';
import {
  addComment,
  getPostComments,
  deleteComment,
  toggleLikeComment,
} from '../controllers/commentController.js';
import { protect } from '../middleware/authMiddleware.js';

const router = express.Router();

router.post('/:postId', protect, addComment);
router.get('/:postId', protect, getPostComments);
router.post('/like/:id', protect, toggleLikeComment);
router.delete('/:id', protect, deleteComment);

export default router;
