import express from 'express';
import {
  getNotifications,
  markNotificationsRead,
  markNotificationRead,
  deleteNotification,
} from '../controllers/notificationController.js';
import { protect } from '../middleware/authMiddleware.js';
import { validateObjectId } from '../utils/validators.js';

const router = express.Router();

router.get('/', protect, getNotifications);
router.put('/read', protect, markNotificationsRead);
router.put('/:id/read', protect, validateObjectId('id'), markNotificationRead);
router.delete('/:id', protect, validateObjectId('id'), deleteNotification);

export default router;
