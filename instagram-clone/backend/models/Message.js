import mongoose from 'mongoose';

const messageSchema = new mongoose.Schema(
  {
    conversation: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Conversation',
      required: [true, 'Message must belong to a conversation'],
    },
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Message must have a sender'],
    },
    text: {
      type: String,
      trim: true,
      default: '',
    },
    mediaUrl: {
      type: String,
      default: null,
    },
    mediaType: {
      type: String,
      enum: ['image', 'video', 'file', 'audio', 'call'],
      default: null,
    },
    fileName: {
      type: String,
      default: null,
    },
    fileSize: {
      type: String,
      default: null,
    },
    voiceDuration: {
      type: Number,
      default: 0,
    },
    callDetails: {
      callType: { type: String, enum: ['audio', 'video'], default: 'audio' },
      status: { type: String, enum: ['ended', 'missed', 'rejected'], default: 'ended' },
      duration: { type: Number, default: 0 },
    },
    replyTo: {
      messageId: { type: mongoose.Schema.Types.ObjectId, ref: 'Message' },
      senderName: { type: String, default: '' },
      text: { type: String, default: '' },
      mediaUrl: { type: String, default: null },
      mediaType: { type: String, default: null },
    },
    isForwarded: {
      type: Boolean,
      default: false,
    },
    isEdited: {
      type: Boolean,
      default: false,
    },
    editedAt: {
      type: Date,
      default: null,
    },
    reactions: [
      {
        user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        emoji: { type: String, required: true },
      },
    ],
    deletedFor: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
    ],
    deletedForEveryone: {
      type: Boolean,
      default: false,
    },
    readBy: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
    ],
  },
  {
    timestamps: true,
  }
);

// Index to quickly fetch messages for a conversation
messageSchema.index({ conversation: 1, createdAt: 1 });

const Message = mongoose.model('Message', messageSchema);
export default Message;
