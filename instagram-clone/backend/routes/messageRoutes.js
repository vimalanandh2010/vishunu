import express from 'express';
import {
  sendMessage,
  getConversations,
  getMessages,
  markConversationRead,
  editMessage,
  deleteMessage,
  reactToMessage,
  updateConversationSettings,
  getConversationSharedMedia,
} from '../controllers/messageController.js';
import { protect } from '../middleware/authMiddleware.js';
import upload from '../middleware/uploadMiddleware.js';
import { sendMessageValidator, validateObjectId } from '../utils/validators.js';

const router = express.Router();

router.post('/', protect, upload.single('media'), sendMessageValidator, sendMessage);
router.get('/conversations', protect, getConversations);
router.put('/conversations/:conversationId/settings', protect, validateObjectId('conversationId'), updateConversationSettings);
router.get('/conversations/:conversationId/media', protect, validateObjectId('conversationId'), getConversationSharedMedia);
router.get('/:conversationId', protect, validateObjectId('conversationId'), getMessages);
router.put('/:conversationId/read', protect, validateObjectId('conversationId'), markConversationRead);
router.put('/:messageId', protect, validateObjectId('messageId'), editMessage);
router.delete('/:messageId', protect, validateObjectId('messageId'), deleteMessage);
router.post('/:messageId/react', protect, validateObjectId('messageId'), reactToMessage);

export default router;
