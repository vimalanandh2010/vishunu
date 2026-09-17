import Comment from '../models/Comment.js';
import Post from '../models/Post.js';
import Notification from '../models/Notification.js';

// @desc    Add a comment to a post
// @route   POST /api/comments/:postId
// @access  Private
export const addComment = async (req, res, next) => {
  try {
    const { text, parentId } = req.body;
    const { postId } = req.params;

    const post = await Post.findById(postId);
    if (!post) {
      return res.status(404).json({ success: false, message: 'Post not found' });
    }

    const comment = await Comment.create({
      user: req.user.id,
      post: postId,
      text,
      parent: parentId || null,
    });

    const populatedComment = await Comment.findById(comment._id).populate('user', 'username avatar fullName isVerified');

    // Notify post owner (if comment is on someone else's post and not a reply)
    if (post.user.toString() !== req.user.id && !parentId) {
      const notification = await Notification.create({
        sender: req.user.id,
        receiver: post.user,
        type: 'comment',
        post: post._id,
        comment: comment._id,
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

    res.status(201).json({ success: true, comment: populatedComment });
  } catch (error) {
    next(error);
  }
};

// @desc    Get comments for a specific post
// @route   GET /api/comments/:postId
// @access  Private
export const getPostComments = async (req, res, next) => {
  try {
    const { postId } = req.params;

    // Load top-level comments first, then replies can be loaded dynamically or together.
    // For simplicity, let's load all comments for this post and return them.
    const comments = await Comment.find({ post: postId })
      .populate('user', 'username avatar fullName isVerified')
      .sort({ createdAt: -1 });

    res.json({ success: true, comments });
  } catch (error) {
    next(error);
  }
};

// @desc    Delete a comment
// @route   DELETE /api/comments/:id
// @access  Private
export const deleteComment = async (req, res, next) => {
  try {
    const comment = await Comment.findById(req.params.id);
    if (!comment) {
      return res.status(404).json({ success: false, message: 'Comment not found' });
    }

    const post = await Post.findById(comment.post);

    // Comment owner or Post owner can delete comments
    if (comment.user.toString() !== req.user.id && post.user.toString() !== req.user.id) {
      return res.status(401).json({ success: false, message: 'User not authorized to delete this comment' });
    }

    // Delete comment
    await comment.deleteOne();

    // If it's a parent comment, delete its replies
    if (!comment.parent) {
      await Comment.deleteMany({ parent: comment._id });
    }

    // Clean up notifications related to this comment
    await Notification.deleteMany({ comment: req.params.id });

    res.json({ success: true, message: 'Comment deleted successfully' });
  } catch (error) {
    next(error);
  }
};

// @desc    Toggle like on comment
// @route   POST /api/comments/like/:id
// @access  Private
export const toggleLikeComment = async (req, res, next) => {
  try {
    const comment = await Comment.findById(req.params.id);
    if (!comment) {
      return res.status(404).json({ success: false, message: 'Comment not found' });
    }

    const isLiked = comment.likes.includes(req.user.id);

    if (isLiked) {
      comment.likes = comment.likes.filter((id) => id.toString() !== req.user.id);
      await comment.save();
      res.json({ success: true, message: 'Comment unliked successfully', isLiked: false });
    } else {
      comment.likes.push(req.user.id);
      await comment.save();
      res.json({ success: true, message: 'Comment liked successfully', isLiked: true });
    }
  } catch (error) {
    next(error);
  }
};
