import express from 'express';
import {
  addComment,
  getPostComments,
  deleteComment,
  toggleLikeComment,
} from '../controllers/commentController.js';
import { protect } from '../middleware/authMiddleware.js';
import { commentValidator, validateObjectId } from '../utils/validators.js';

const router = express.Router();

router.post('/:postId', protect, validateObjectId('postId'), commentValidator, addComment);
router.get('/:postId', protect, validateObjectId('postId'), getPostComments);
router.post('/like/:id', protect, validateObjectId('id'), toggleLikeComment);
router.delete('/:id', protect, validateObjectId('id'), deleteComment);

export default router;
