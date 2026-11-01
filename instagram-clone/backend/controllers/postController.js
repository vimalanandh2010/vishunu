import mongoose from 'mongoose';
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

    const populatedPost = await Post.findById(post._id)
      .populate('user', 'username avatar fullName isVerified')
      .lean();

    res.status(201).json({
      success: true,
      message: 'Post created successfully',
      post: { ...populatedPost, commentsCount: 0 },
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Update a post (caption)
// @route   PUT /api/posts/:id
// @access  Private (owner only)
export const updatePost = async (req, res, next) => {
  try {
    const post = await Post.findById(req.params.id);

    if (!post) {
      return res.status(404).json({ success: false, message: 'Post not found' });
    }

    // Check post ownership
    if (post.user.toString() !== req.user.id) {
      return res.status(403).json({ success: false, message: 'User not authorized to edit this post' });
    }

    const { caption } = req.body;
    if (typeof caption !== 'string' || !caption.trim()) {
      return res.status(400).json({ success: false, message: 'Caption is required' });
    }
    if (caption.length > 2200) {
      return res.status(400).json({ success: false, message: 'Caption cannot exceed 2200 characters' });
    }

    post.caption = caption.trim();
    await post.save();

    const populatedPost = await Post.findById(post._id)
      .populate('user', 'username avatar fullName isVerified')
      .lean();

    res.json({ success: true, message: 'Post updated successfully', post: populatedPost });
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
      return res.status(403).json({ success: false, message: 'User not authorized to delete this post' });
    }

    // Run all cleanup in parallel — no data dependencies between them
    await Promise.all([
      post.deleteOne(),
      Notification.deleteMany({ post: req.params.id }),
      User.updateMany({ savedPosts: req.params.id }, { $pull: { savedPosts: req.params.id } }),
    ]);

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
    // Use aggregation to count comments in the same query — no virtual populate round-trip
    const [post] = await Post.aggregate([
      { $match: { _id: new mongoose.Types.ObjectId(req.params.id) } },
      {
        $lookup: {
          from: 'comments',
          localField: '_id',
          foreignField: 'post',
          as: '_comments',
        },
      },
      { $addFields: { commentsCount: { $size: '$_comments' } } },
      { $project: { _comments: 0 } },
      {
        $lookup: {
          from: 'users',
          localField: 'user',
          foreignField: '_id',
          pipeline: [{ $project: { username: 1, avatar: 1, fullName: 1, isVerified: 1 } }],
          as: 'user',
        },
      },
      { $unwind: '$user' },
    ]);

    if (!post) {
      return res.status(404).json({ success: false, message: 'Post not found' });
    }

    res.json({ success: true, post });
  } catch (error) {
    next(error);
  }
};

// @desc    Get the users who liked a post (liked-by list)
// @route   GET /api/posts/:id/likes
// @access  Private
export const getPostLikers = async (req, res, next) => {
  try {
    const post = await Post.findById(req.params.id).select('likes').populate({
      path: 'likes',
      select: 'username fullName avatar isVerified',
      options: { sort: { createdAt: -1 } },
    }).lean();

    if (!post) {
      return res.status(404).json({ success: false, message: 'Post not found' });
    }

    res.json({ success: true, count: post.likes.length, users: post.likes });
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

    const isLiked = post.likes.some((id) => id.toString() === req.user.id);

    if (isLiked) {
      // Unlike post
      await Post.updateOne({ _id: post._id }, { $pull: { likes: req.user.id } });

      // Delete notification
      await Notification.findOneAndDelete({
        sender: req.user.id,
        receiver: post.user,
        type: 'like',
        post: post._id,
      });

      const updated = await Post.findById(post._id).select('likes').lean();
      const likesCount = updated ? updated.likes.length : Math.max(0, post.likes.length - 1);

      res.json({ success: true, message: 'Post unliked successfully', isLiked: false, likesCount });
    } else {
      const upd = await Post.updateOne(
        { _id: post._id, likes: { $ne: req.user.id } },
        { $push: { likes: req.user.id } }
      );
      if (upd.modifiedCount === 0) {
        const current = await Post.findById(post._id).select('likes').lean();
        return res.json({
          success: true,
          message: 'Post already liked',
          isLiked: true,
          likesCount: current ? current.likes.length : post.likes.length,
        });
      }

      if (post.user.toString() !== req.user.id) {
        // Build socket payload directly from known data — avoids create + refetch round-trip
        const notif = await Notification.create({
          sender: req.user.id,
          receiver: post.user,
          type: 'like',
          post: post._id,
        });

        // Populate inline rather than fetching by _id again
        await notif.populate('sender', 'username avatar fullName');
        const payload = notif.toObject();

        global.emitToUser?.(post.user.toString(), 'new_notification', payload);
      }

      const updated = await Post.findById(post._id).select('likes').lean();
      const likesCount = updated ? updated.likes.length : post.likes.length + 1;

      res.json({ success: true, message: 'Post liked successfully', isLiked: true, likesCount });
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
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 10));
    const skip = (page - 1) * limit;

    const user = await User.findById(req.user.id).select('following').lean();
    const followingUsers = [...(user?.following || []), new mongoose.Types.ObjectId(req.user.id)];

    // Single aggregation replaces:
    //   Post.find().populate('user').populate('commentsCount') — N+1 comment counts
    // The $lookup + $size pattern counts comments in one pipeline stage.
    const [result] = await Post.aggregate([
      { $match: { user: { $in: followingUsers } } },
      { $sort: { createdAt: -1 } },
      {
        $facet: {
          posts: [
            { $skip: skip },
            { $limit: limit },
            {
              $lookup: {
                from: 'comments',
                localField: '_id',
                foreignField: 'post',
                as: '_comments',
              },
            },
            { $addFields: { commentsCount: { $size: '$_comments' } } },
            { $project: { _comments: 0 } },
            {
              $lookup: {
                from: 'users',
                localField: 'user',
                foreignField: '_id',
                pipeline: [{ $project: { username: 1, avatar: 1, fullName: 1, isVerified: 1 } }],
                as: 'user',
              },
            },
            { $unwind: '$user' },
          ],
          total: [{ $count: 'n' }],
        },
      },
    ]);

    const posts = result?.posts || [];
    const total = result?.total?.[0]?.n || 0;

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
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 12));
    const skip = (page - 1) * limit;

    const user = await User.findOne({ username }).select('_id').lean();
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const [posts, total] = await Promise.all([
      Post.find({ user: user._id })
        .select('_id mediaUrl mediaType likes createdAt')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Post.countDocuments({ user: user._id }),
    ]);

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

// @desc    Toggle save/bookmark post
// @route   POST /api/posts/save/:id
// @access  Private
export const toggleSavePost = async (req, res, next) => {
  try {
    const post = await Post.findById(req.params.id).lean();
    if (!post) {
      return res.status(404).json({ success: false, message: 'Post not found' });
    }

    const currentUser = await User.findById(req.user.id).select('savedPosts').lean();
    const isSaved = currentUser.savedPosts.some((id) => id.toString() === req.params.id);

    if (isSaved) {
      await User.findByIdAndUpdate(req.user.id, { $pull: { savedPosts: req.params.id } });
      res.json({ success: true, message: 'Post unsaved successfully', isSaved: false });
    } else {
      await User.findByIdAndUpdate(req.user.id, { $addToSet: { savedPosts: req.params.id } });
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
    const user = await User.findById(req.user.id).select('savedPosts').lean();
    const savedIds = (user?.savedPosts || []).filter(Boolean);

    const posts = await Post.find({ _id: { $in: savedIds } })
      .populate('user', 'username avatar fullName isVerified')
      .lean();

    res.json({ success: true, count: posts.length, savedPosts: posts, posts });
  } catch (error) {
    next(error);
  }
};
