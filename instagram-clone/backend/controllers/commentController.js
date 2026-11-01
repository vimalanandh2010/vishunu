import Comment from '../models/Comment.js';
import Post from '../models/Post.js';
import Notification from '../models/Notification.js';

// @desc    Add a comment to a post (or reply to a comment)
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

    let parentComment = null;
    if (parentId) {
      parentComment = await Comment.findById(parentId);
      if (!parentComment) {
        return res.status(404).json({ success: false, message: 'Parent comment not found' });
      }
      if (parentComment.post.toString() !== postId) {
        return res.status(400).json({ success: false, message: 'Parent comment does not belong to this post' });
      }
    }

    // Keep thread 1-level deep by attaching to root comment
    const effectiveParentId = parentComment ? (parentComment.parent || parentComment._id) : null;

    const comment = await Comment.create({
      user: req.user.id,
      post: postId,
      text,
      parent: effectiveParentId,
    });

    const populatedComment = await Comment.findById(comment._id).populate('user', 'username avatar fullName isVerified');

    // Notify:
    // Case 1: If it is a reply, notify the author of the parent comment
    if (parentComment && parentComment.user.toString() !== req.user.id) {
      const notif = await Notification.create({
        sender: req.user.id,
        receiver: parentComment.user,
        type: 'comment',
        post: post._id,
        comment: comment._id,
      });
      await notif.populate('sender', 'username avatar fullName');
      global.emitToUser?.(parentComment.user.toString(), 'new_notification', notif.toObject());

    } else if (!parentComment && post.user.toString() !== req.user.id) {
      // Case 2: Direct comment on post, notify post author
      const notif = await Notification.create({
        sender: req.user.id,
        receiver: post.user,
        type: 'comment',
        post: post._id,
        comment: comment._id,
      });
      await notif.populate('sender', 'username avatar fullName');
      global.emitToUser?.(post.user.toString(), 'new_notification', notif.toObject());
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

    const comments = await Comment.find({ post: postId })
      .populate('user', 'username avatar fullName isVerified')
      .sort({ createdAt: 1 })
      .lean();

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
    if (comment.user.toString() !== req.user.id && (!post || post.user.toString() !== req.user.id)) {
      return res.status(403).json({ success: false, message: 'User not authorized to delete this comment' });
    }

    // Delete comment
    await comment.deleteOne();

    // If it's a parent comment, cascade delete its replies
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

    const isLiked = comment.likes.some((id) => id.toString() === req.user.id);

    if (isLiked) {
      await Comment.updateOne({ _id: comment._id }, { $pull: { likes: req.user.id } });
      const updated = await Comment.findById(comment._id).select('likes');
      res.json({
        success: true,
        message: 'Comment unliked successfully',
        isLiked: false,
        likesCount: updated.likes.length,
      });
    } else {
      await Comment.updateOne({ _id: comment._id }, { $addToSet: { likes: req.user.id } });
      const updated = await Comment.findById(comment._id).select('likes');
      res.json({
        success: true,
        message: 'Comment liked successfully',
        isLiked: true,
        likesCount: updated.likes.length,
      });
    }
  } catch (error) {
    next(error);
  }
};
