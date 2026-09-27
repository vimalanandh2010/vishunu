import express from 'express';
import {
  getNotifications,
  markNotificationsRead,
  deleteNotification,
} from '../controllers/notificationController.js';
import { protect } from '../middleware/authMiddleware.js';

const router = express.Router();

router.get('/', protect, getNotifications);
router.put('/read', protect, markNotificationsRead);
router.delete('/:id', protect, deleteNotification);

export default router;
