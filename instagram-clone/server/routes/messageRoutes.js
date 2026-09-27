import express from 'express';
import {
  sendMessage,
  getConversations,
  getMessages,
} from '../controllers/messageController.js';
import { protect } from '../middleware/authMiddleware.js';
import upload from '../middleware/uploadMiddleware.js';

const router = express.Router();

router.post('/', protect, upload.single('media'), sendMessage);
router.get('/conversations', protect, getConversations);
router.get('/:conversationId', protect, getMessages);

export default router;
