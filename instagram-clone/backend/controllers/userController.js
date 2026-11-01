import User from '../models/User.js';
import Post from '../models/Post.js';
import Notification from '../models/Notification.js';
import { fileUrl } from '../middleware/uploadMiddleware.js';

// @desc    Get user profile by username
// @route   GET /api/users/profile/:username
// @access  Private
export const getUserProfile = async (req, res, next) => {
  try {
    const { username } = req.params;

    const user = await User.findOne({ username })
      .populate('followers', '_id username fullName avatar')
      .populate('following', '_id username fullName avatar');

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    // Get posts count
    const postsCount = await Post.countDocuments({ user: user._id });

    // Determine if requesting user follows this profile
    const isFollowing = user.followers.some((f) => f._id.toString() === req.user.id);

    res.json({
      success: true,
      profile: {
        _id: user._id,
        username: user.username,
        fullName: user.fullName,
        bio: user.bio,
        website: user.website,
        avatar: user.avatar,
        postsCount,
        followersCount: user.followers.length,
        followingCount: user.following.length,
        followers: user.followers,
        following: user.following,
        isFollowing,
        isPrivate: user.isPrivate,
        isVerified: user.isVerified,
      },
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Update user profile details (bio, website, fullName, avatar)
// @route   PUT /api/users/profile
// @access  Private
export const updateUserProfile = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const { fullName, bio, website, username, isPrivate } = req.body;

    // Check if new username is already taken by someone else
    if (username && username !== user.username) {
      const usernameExists = await User.findOne({ username });
      if (usernameExists) {
        return res.status(400).json({ success: false, message: 'Username is already taken' });
      }
      user.username = username;
    }

    if (fullName) user.fullName = fullName;
    if (bio !== undefined) user.bio = bio;
    if (website !== undefined) user.website = website;
    if (isPrivate !== undefined) user.isPrivate = isPrivate;

    // Handle avatar upload via Cloudinary or local disk fallback
    if (req.file) {
      user.avatar = fileUrl(req, req.file);
    }

    await user.save();

    res.json({
      success: true,
      message: 'Profile updated successfully',
      user: {
        _id: user._id,
        username: user.username,
        fullName: user.fullName,
        bio: user.bio,
        website: user.website,
        avatar: user.avatar,
        isPrivate: user.isPrivate,
        followersCount: user.followers.length,
        followingCount: user.following.length,
      },
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Follow or Unfollow a user
// @route   POST /api/users/follow/:id
// @access  Private
export const followUnfollowUser = async (req, res, next) => {
  try {
    const targetUserId = req.params.id;
    const currentUserId = req.user.id;

    if (targetUserId === currentUserId) {
      return res.status(400).json({ success: false, message: 'You cannot follow yourself' });
    }

    const targetUser = await User.findById(targetUserId).select('_id').lean();
    const currentUser = await User.findById(currentUserId).select('following').lean();

    if (!targetUser || !currentUser) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const isFollowing = currentUser.following.some((id) => id.toString() === targetUserId);

    if (isFollowing) {
      // Unfollow atomically
      await Promise.all([
        User.findByIdAndUpdate(currentUserId, { $pull: { following: targetUserId } }),
        User.findByIdAndUpdate(targetUserId, { $pull: { followers: currentUserId } }),
      ]);

      // Optionally delete the follow notification
      await Notification.findOneAndDelete({
        sender: currentUserId,
        receiver: targetUserId,
        type: 'follow',
      });

      res.json({ success: true, message: 'User unfollowed successfully', isFollowing: false });
    } else {
      // Follow atomically
      await Promise.all([
        User.findByIdAndUpdate(currentUserId, { $addToSet: { following: targetUserId } }),
        User.findByIdAndUpdate(targetUserId, { $addToSet: { followers: currentUserId } }),
      ]);

      // Create notification — populate inline to avoid a second DB round-trip
      const notif = await Notification.create({
        sender: currentUserId,
        receiver: targetUserId,
        type: 'follow',
      });
      await notif.populate('sender', 'username avatar fullName');
      const payload = notif.toObject();

      global.emitToUser?.(targetUserId, 'new_notification', payload);

      res.json({ success: true, message: 'User followed successfully', isFollowing: true });
    }
  } catch (error) {
    next(error);
  }
};

// @desc    Search users by name or username
// @route   GET /api/users/search
// @access  Private
export const searchUsers = async (req, res, next) => {
  try {
    const { query } = req.query;
    if (!query || typeof query !== 'string') {
      return res.json({ success: true, users: [] });
    }

    const sanitized = query.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (!sanitized) {
      return res.json({ success: true, users: [] });
    }

    const users = await User.find({
      $or: [
        { username: { $regex: sanitized, $options: 'i' } },
        { fullName: { $regex: sanitized, $options: 'i' } },
      ],
      _id: { $ne: req.user.id },
    })
      .select('username fullName avatar followers isVerified')
      .limit(10);

    const currentUserIdStr = req.user.id.toString();
    const usersWithFollowingState = users.map((u) => ({
      _id: u._id,
      username: u.username,
      fullName: u.fullName,
      avatar: u.avatar,
      isVerified: u.isVerified,
      isFollowing: u.followers.some((fId) => fId.toString() === currentUserIdStr),
    }));

    res.json({ success: true, users: usersWithFollowingState });
  } catch (error) {
    next(error);
  }
};

// @desc    Get suggested users to follow (non-followed, excluding self)
// @route   GET /api/users/suggested
// @access  Private
export const getSuggestedUsers = async (req, res, next) => {
  try {
    const currentUser = await User.findById(req.user.id).select('following').lean();
    const excludeIds = [...(currentUser?.following || []), req.user.id];

    // Find random users who are not followed by this user
    const suggested = await User.find({ _id: { $nin: excludeIds } })
      .select('username fullName avatar isVerified')
      .limit(5);

    res.json({ success: true, suggestions: suggested });
  } catch (error) {
    next(error);
  }
};

// @desc    Toggle block user
// @route   POST /api/users/block/:userId
// @access  Private
export const toggleBlockUser = async (req, res, next) => {
  try {
    const { userId } = req.params;
    const currentUserId = req.user.id;

    if (userId === currentUserId) {
      return res.status(400).json({ success: false, message: 'Cannot block yourself' });
    }

    const currentUser = await User.findById(currentUserId);
    if (!currentUser) return res.status(404).json({ success: false, message: 'User not found' });

    const isBlocked = currentUser.blockedUsers?.some((id) => id.toString() === userId);
    if (isBlocked) {
      currentUser.blockedUsers = currentUser.blockedUsers.filter((id) => id.toString() !== userId);
    } else {
      currentUser.blockedUsers.push(userId);
    }

    await currentUser.save();
    res.json({ success: true, isBlocked: !isBlocked, message: isBlocked ? 'User unblocked' : 'User blocked' });
  } catch (error) {
    next(error);
  }
};

// @desc    Report user
// @route   POST /api/users/report/:userId
// @access  Private
export const reportUser = async (req, res, next) => {
  try {
    const { userId } = req.params;
    const { reason } = req.body;
    // Log report securely
    console.log(`[Report] User ${req.user.id} reported user ${userId} for: ${reason || 'unspecified'}`);
    res.json({ success: true, message: 'Thank you for your report. Our safety team will review it.' });
  } catch (error) {
    next(error);
  }
};

// @desc    Update privacy settings (online status & last seen)
// @route   PUT /api/users/privacy
// @access  Private
export const updatePrivacySettings = async (req, res, next) => {
  try {
    const { onlineStatusPrivacy, lastSeenPrivacy } = req.body;
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    if (typeof onlineStatusPrivacy === 'boolean') user.onlineStatusPrivacy = onlineStatusPrivacy;
    if (typeof lastSeenPrivacy === 'boolean') user.lastSeenPrivacy = lastSeenPrivacy;

    await user.save();
    res.json({
      success: true,
      onlineStatusPrivacy: user.onlineStatusPrivacy,
      lastSeenPrivacy: user.lastSeenPrivacy,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get detailed user info for chat info page
// @route   GET /api/users/info/:userId
// @access  Private
export const getUserChatInfo = async (req, res, next) => {
  try {
    const { userId } = req.params;
    const currentUserId = req.user.id;

    const user = await User.findById(userId).select('-password').lean();
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    const currentUser = await User.findById(currentUserId).select('blockedUsers').lean();
    const isBlockedByMe = currentUser.blockedUsers?.some((id) => id.toString() === userId);
    const isBlockedByThem = user.blockedUsers?.some((id) => id.toString() === currentUserId);

    const isOnline = global.activeUsers ? global.activeUsers.has(userId) : false;
    const showOnline = user.onlineStatusPrivacy !== false && !isBlockedByThem && !isBlockedByMe;
    const showLastSeen = user.lastSeenPrivacy !== false && !isBlockedByThem && !isBlockedByMe;

    res.json({
      success: true,
      user: {
        _id: user._id,
        username: user.username,
        fullName: user.fullName,
        bio: user.bio,
        avatar: user.avatar,
        isVerified: user.isVerified,
        isOnline: showOnline && isOnline,
        lastSeen: showLastSeen ? user.lastSeen : null,
        isBlockedByMe,
        isBlockedByThem,
      },
    });
  } catch (error) {
    next(error);
  }
};

