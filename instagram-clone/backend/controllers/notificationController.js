import Notification from '../models/Notification.js';

// @desc    Get user notifications
// @route   GET /api/notifications
// @access  Private
// Query params:
//   limit  — max to return (default 30, max 100)
//   skip   — offset for simple pagination (default 0)
export const getNotifications = async (req, res, next) => {
  try {
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 30));
    const skip = Math.max(0, parseInt(req.query.skip, 10) || 0);

    const notifications = await Notification.find({ receiver: req.user.id })
      .populate('sender', 'username avatar fullName isVerified')
      .populate({ path: 'post', select: 'mediaUrl mediaType caption' })
      .populate({ path: 'comment', select: 'text' })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    // Count total unread — cheap index scan, no document hydration
    const unreadCount = await Notification.countDocuments({
      receiver: req.user.id,
      isRead: false,
    });

    res.json({ success: true, count: notifications.length, unreadCount, notifications });
  } catch (error) {
    next(error);
  }
};

// @desc    Mark all user notifications as read
// @route   PUT /api/notifications/read
// @access  Private
export const markNotificationsRead = async (req, res, next) => {
  try {
    await Notification.updateMany({ receiver: req.user.id, isRead: false }, { isRead: true });

    res.json({ success: true, message: 'All notifications marked as read' });
  } catch (error) {
    next(error);
  }
};

// @desc    Mark a single notification as read
// @route   PUT /api/notifications/:id/read
// @access  Private
export const markNotificationRead = async (req, res, next) => {
  try {
    const notification = await Notification.findById(req.params.id);
    if (!notification) {
      return res.status(404).json({ success: false, message: 'Notification not found' });
    }

    if (notification.receiver.toString() !== req.user.id) {
      return res.status(403).json({ success: false, message: 'User not authorized to update this notification' });
    }

    notification.isRead = true;
    await notification.save();

    res.json({ success: true, message: 'Notification marked as read' });
  } catch (error) {
    next(error);
  }
};

// @desc    Delete a notification
// @route   DELETE /api/notifications/:id
// @access  Private
export const deleteNotification = async (req, res, next) => {
  try {
    const notification = await Notification.findById(req.params.id);
    if (!notification) {
      return res.status(404).json({ success: false, message: 'Notification not found' });
    }

    if (notification.receiver.toString() !== req.user.id) {
      return res.status(403).json({ success: false, message: 'User not authorized to delete this notification' });
    }

    await notification.deleteOne();

    res.json({ success: true, message: 'Notification deleted' });
  } catch (error) {
    next(error);
  }
};
