import Conversation from '../models/Conversation.js';
import Message from '../models/Message.js';
import User from '../models/User.js';

// @desc    Send a message (Starts conversation if new)
// @route   POST /api/messages
// @access  Private
export const sendMessage = async (req, res, next) => {
  try {
    const { receiverId, text, conversationId } = req.body;
    const senderId = req.user.id;

    let conversation;

    // 1. Resolve conversation
    if (conversationId) {
      conversation = await Conversation.findById(conversationId);
    } else if (receiverId) {
      // Find conversation between sender and receiver
      conversation = await Conversation.findOne({
        participants: { $all: [senderId, receiverId] },
      });

      // Create new conversation if none exists
      if (!conversation) {
        conversation = await Conversation.create({
          participants: [senderId, receiverId],
        });
      }
    }

    if (!conversation) {
      return res.status(400).json({ success: false, message: 'No conversation or receiver specified' });
    }

    // 2. Upload file attachment if any
    let mediaUrl = null;
    let mediaType = null;
    if (req.file) {
      mediaUrl = req.file.path;
      if (req.file.mimetype.startsWith('image/')) mediaType = 'image';
      else if (req.file.mimetype.startsWith('video/')) mediaType = 'video';
      else mediaType = 'file';
    }

    // 3. Create message
    const message = await Message.create({
      conversation: conversation._id,
      sender: senderId,
      text: text || '',
      mediaUrl,
      mediaType,
      readBy: [senderId],
    });

    // 4. Update lastMessage in conversation
    conversation.lastMessage = message._id;
    await conversation.save();

    // 5. Populate sender details for socket & response
    const populatedMessage = await Message.findById(message._id)
      .populate('sender', 'username avatar fullName')
      .lean();

    // 6. Broadcast via Socket.io
    if (global.io && global.activeUsers) {
      conversation.participants.forEach((participantId) => {
        const pIdStr = participantId.toString();
        // Don't send to sender via socket (optional, but good practice since sender gets HTTP response)
        if (pIdStr !== senderId) {
          const socketId = global.activeUsers.get(pIdStr);
          if (socketId) {
            global.io.to(socketId).emit('receive_message', populatedMessage);
            global.io.to(socketId).emit('update_conversation_order', {
              conversationId: conversation._id,
              lastMessage: populatedMessage,
              updatedAt: conversation.updatedAt,
            });
          }
        }
      });
    }

    res.status(201).json({ success: true, message: populatedMessage });
  } catch (error) {
    next(error);
  }
};

// @desc    Get all conversations for user
// @route   GET /api/messages/conversations
// @access  Private
export const getConversations = async (req, res, next) => {
  try {
    const userId = req.user.id;

    // Find all conversations where user is a participant
    const conversations = await Conversation.find({ participants: userId })
      .populate({
        path: 'participants',
        select: 'username avatar fullName isVerified',
      })
      .populate({
        path: 'lastMessage',
        populate: {
          path: 'sender',
          select: 'username avatar',
        },
      })
      .sort({ updatedAt: -1 });

    // Clean conversations to only show other participant and unread count
    const cleanedConversations = await Promise.all(
      conversations.map(async (conv) => {
        // Exclude the current user from participants array for display
        const otherParticipant = conv.participants.find(
          (p) => p._id.toString() !== userId
        );

        // Count unread messages in this conversation for current user
        const unreadCount = await Message.countDocuments({
          conversation: conv._id,
          sender: { $ne: userId },
          readBy: { $ne: userId },
        });

        return {
          _id: conv._id,
          otherParticipant,
          lastMessage: conv.lastMessage,
          unreadCount,
          updatedAt: conv.updatedAt,
        };
      })
    );

    res.json({ success: true, conversations: cleanedConversations });
  } catch (error) {
    next(error);
  }
};

// @desc    Get message history for a conversation
// @route   GET /api/messages/:conversationId
// @access  Private
export const getMessages = async (req, res, next) => {
  try {
    const { conversationId } = req.params;
    const userId = req.user.id;

    // Verify user is participant in conversation
    const conversation = await Conversation.findById(conversationId);
    if (!conversation) {
      return res.status(404).json({ success: false, message: 'Conversation not found' });
    }

    if (!conversation.participants.includes(userId)) {
      return res.status(401).json({ success: false, message: 'Not authorized to access this conversation' });
    }

    const messages = await Message.find({ conversation: conversationId })
      .populate('sender', 'username avatar fullName')
      .sort({ createdAt: 1 });

    // Mark messages from other users in this conversation as read
    await Message.updateMany(
      { conversation: conversationId, sender: { $ne: userId }, readBy: { $ne: userId } },
      { $addToSet: { readBy: userId } }
    );

    res.json({ success: true, messages });
  } catch (error) {
    next(error);
  }
};
