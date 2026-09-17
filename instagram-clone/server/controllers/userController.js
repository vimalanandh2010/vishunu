import User from '../models/User.js';
import Post from '../models/Post.js';
import Notification from '../models/Notification.js';

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

    // Handle avatar upload via Cloudinary (multer-storage-cloudinary attaches file.path)
    if (req.file) {
      user.avatar = req.file.path;
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

    const targetUser = await User.findById(targetUserId);
    const currentUser = await User.findById(currentUserId);

    if (!targetUser || !currentUser) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const isFollowing = currentUser.following.includes(targetUserId);

    if (isFollowing) {
      // Unfollow
      currentUser.following = currentUser.following.filter((id) => id.toString() !== targetUserId);
      targetUser.followers = targetUser.followers.filter((id) => id.toString() !== currentUserId);
      await currentUser.save();
      await targetUser.save();

      // Optionally delete the follow notification
      await Notification.findOneAndDelete({
        sender: currentUserId,
        receiver: targetUserId,
        type: 'follow',
      });

      res.json({ success: true, message: 'User unfollowed successfully', isFollowing: false });
    } else {
      // Follow
      currentUser.following.push(targetUserId);
      targetUser.followers.push(currentUserId);
      await currentUser.save();
      await targetUser.save();

      // Create notification
      const notification = await Notification.create({
        sender: currentUserId,
        receiver: targetUserId,
        type: 'follow',
      });

      // We'll dispatch socket notification in server.js or emit helper
      // If target user is connected, we can send real-time update
      const populatedNotification = await Notification.findById(notification._id)
        .populate('sender', 'username avatar fullName')
        .lean();

      if (global.io && global.activeUsers) {
        const targetSocketId = global.activeUsers.get(targetUserId);
        if (targetSocketId) {
          global.io.to(targetSocketId).emit('new_notification', populatedNotification);
        }
      }

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
    if (!query) {
      return res.json({ success: true, users: [] });
    }

    const users = await User.find({
      $or: [
        { username: { $regex: query, $options: 'i' } },
        { fullName: { $regex: query, $options: 'i' } },
      ],
      _id: { $ne: req.user.id },
    })
      .select('username fullName avatar followers isVerified')
      .limit(10);

    const usersWithFollowingState = users.map((u) => ({
      _id: u._id,
      username: u.username,
      fullName: u.fullName,
      avatar: u.avatar,
      isVerified: u.isVerified,
      isFollowing: u.followers.includes(req.user.id),
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
    const currentUser = await User.findById(req.user.id);
    const excludeIds = [...currentUser.following, req.user.id];

    // Find random users who are not followed by this user
    const suggested = await User.find({ _id: { $nin: excludeIds } })
      .select('username fullName avatar isVerified')
      .limit(5);

    res.json({ success: true, suggestions: suggested });
  } catch (error) {
    next(error);
  }
};
