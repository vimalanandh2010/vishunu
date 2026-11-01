import mongoose from 'mongoose';

const commentSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Comment must belong to a user'],
    },
    post: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Post',
      required: [true, 'Comment must belong to a post'],
    },
    text: {
      type: String,
      required: [true, 'Comment text cannot be empty'],
      trim: true,
      maxlength: [1000, 'Comment text cannot exceed 1000 characters'],
    },
    likes: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
    ],
    parent: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Comment',
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// Add index for fast retrieval of comments by post
commentSchema.index({ post: 1, createdAt: -1 });

// Index for cascade-deleting replies when a parent comment is deleted
commentSchema.index({ parent: 1 });

const Comment = mongoose.model('Comment', commentSchema);
export default Comment;
