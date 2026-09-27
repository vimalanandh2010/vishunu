import mongoose from 'mongoose';

const storySchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Story must belong to a user'],
    },
    mediaUrl: {
      type: String,
      required: [true, 'Story must contain a media URL'],
    },
    mediaType: {
      type: String,
      enum: ['image', 'video'],
      default: 'image',
    },
    views: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
    ],
    createdAt: {
      type: Date,
      default: Date.now,
      expires: 86400, // 24 hours in seconds (MongoDB automatically deletes)
    },
  }
);

const Story = mongoose.model('Story', storySchema);
export default Story;
