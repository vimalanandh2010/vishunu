import Post from '../models/Post.js';
import User from '../models/User.js';
import Notification from '../models/Notification.js';
import { fileUrl } from '../middleware/uploadMiddleware.js';

// @desc    Create a new post
// @route   POST /api/posts
// @access  Private
export const createPost = async (req, res, next) => {
  try {
    const { caption, location, tags } = req.body;

    if (!req.file) {
      return res.status(400).json({ success: false, message: 'Please upload an image or video' });
    }

    // Determine if uploaded file is image or video
    const mediaType = req.file.mimetype.startsWith('video/') ? 'video' : 'image';

    // Parse tags if provided as JSON or string
    let parsedTags = [];
    if (tags) {
      parsedTags = typeof tags === 'string' ? tags.split(',').map((t) => t.trim()) : tags;
    }

    const post = await Post.create({
      user: req.user.id,
      caption,
      mediaUrl: fileUrl(req, req.file),
      mediaType,
      location,
      tags: parsedTags,
    });

    const populatedPost = await Post.findById(post._id).populate('user', 'username avatar fullName isVerified');

    res.status(201).json({
      success: true,
      message: 'Post created successfully',
      post: populatedPost,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Delete a post
// @route   DELETE /api/posts/:id
// @access  Private
export const deletePost = async (req, res, next) => {
  try {
    const post = await Post.findById(req.params.id);

    if (!post) {
      return res.status(404).json({ success: false, message: 'Post not found' });
    }

    // Check post ownership
    if (post.user.toString() !== req.user.id) {
      return res.status(401).json({ success: false, message: 'User not authorized to delete this post' });
    }

    await post.deleteOne();

    // Clean up notifications related to this post
    await Notification.deleteMany({ post: req.params.id });

    // Clean up users who saved this post
    await User.updateMany(
      { savedPosts: req.params.id },
      { $pull: { savedPosts: req.params.id } }
    );

    res.json({ success: true, message: 'Post removed successfully' });
  } catch (error) {
    next(error);
  }
};

// @desc    Get post by ID
// @route   GET /api/posts/:id
// @access  Private
export const getSinglePost = async (req, res, next) => {
  try {
    const post = await Post.findById(req.params.id)
      .populate('user', 'username avatar fullName isVerified')
      .populate({
        path: 'commentsCount',
      });

    if (!post) {
      return res.status(404).json({ success: false, message: 'Post not found' });
    }

    res.json({ success: true, post });
  } catch (error) {
    next(error);
  }
};

// @desc    Toggle like on a post
// @route   POST /api/posts/like/:id
// @access  Private
export const toggleLikePost = async (req, res, next) => {
  try {
    const post = await Post.findById(req.params.id);

    if (!post) {
      return res.status(404).json({ success: false, message: 'Post not found' });
    }

    const isLiked = post.likes.includes(req.user.id);

    if (isLiked) {
      // Unlike post
      post.likes = post.likes.filter((id) => id.toString() !== req.user.id);
      await post.save();

      // Delete notification
      await Notification.findOneAndDelete({
        sender: req.user.id,
        receiver: post.user,
        type: 'like',
        post: post._id,
      });

      res.json({ success: true, message: 'Post unliked successfully', isLiked: false });
    } else {
      // Like post
      post.likes.push(req.user.id);
      await post.save();

      // Create notification (if liking someone else's post)
      if (post.user.toString() !== req.user.id) {
        const notification = await Notification.create({
          sender: req.user.id,
          receiver: post.user,
          type: 'like',
          post: post._id,
        });

        const populatedNotification = await Notification.findById(notification._id)
          .populate('sender', 'username avatar fullName')
          .lean();

        if (global.io && global.activeUsers) {
          const targetSocketId = global.activeUsers.get(post.user.toString());
          if (targetSocketId) {
            global.io.to(targetSocketId).emit('new_notification', populatedNotification);
          }
        }
      }

      res.json({ success: true, message: 'Post liked successfully', isLiked: true });
    }
  } catch (error) {
    next(error);
  }
};

// @desc    Get timeline feed posts (posts of self and followed users)
// @route   GET /api/posts/feed
// @access  Private
export const getFeedPosts = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const user = await User.findById(req.user.id);
    const followingUsers = [...user.following, req.user.id];

    const posts = await Post.find({ user: { $in: followingUsers } })
      .populate('user', 'username avatar fullName isVerified')
      .populate('commentsCount')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await Post.countDocuments({ user: { $in: followingUsers } });

    res.json({
      success: true,
      count: posts.length,
      page,
      pages: Math.ceil(total / limit),
      posts,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get all posts created by a specific user
// @route   GET /api/posts/user/:username
// @access  Private
export const getUserPosts = async (req, res, next) => {
  try {
    const { username } = req.params;

    const user = await User.findOne({ username });
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const posts = await Post.find({ user: user._id })
      .populate('user', 'username avatar fullName isVerified')
      .sort({ createdAt: -1 });

    res.json({ success: true, count: posts.length, posts });
  } catch (error) {
    next(error);
  }
};

// @desc    Toggle save/bookmark post
// @route   POST /api/posts/save/:id
// @access  Private
export const toggleSavePost = async (req, res, next) => {
  try {
    const post = await Post.findById(req.params.id);
    if (!post) {
      return res.status(404).json({ success: false, message: 'Post not found' });
    }

    const currentUser = await User.findById(req.user.id);
    const isSaved = currentUser.savedPosts.includes(req.params.id);

    if (isSaved) {
      currentUser.savedPosts = currentUser.savedPosts.filter((id) => id.toString() !== req.params.id);
      await currentUser.save();
      res.json({ success: true, message: 'Post unsaved successfully', isSaved: false });
    } else {
      currentUser.savedPosts.push(req.params.id);
      await currentUser.save();
      res.json({ success: true, message: 'Post saved successfully', isSaved: true });
    }
  } catch (error) {
    next(error);
  }
};

// @desc    Get all posts bookmarked/saved by user
// @route   GET /api/posts/saved
// @access  Private
export const getSavedPosts = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id).populate({
      path: 'savedPosts',
      populate: {
        path: 'user',
        select: 'username avatar fullName isVerified',
      },
    });

    res.json({ success: true, savedPosts: user.savedPosts });
  } catch (error) {
    next(error);
  }
};
