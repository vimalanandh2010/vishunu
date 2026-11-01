import mongoose from 'mongoose';
import Conversation from '../models/Conversation.js';
import Message from '../models/Message.js';
import User from '../models/User.js';
import { fileUrl } from '../middleware/uploadMiddleware.js';

// @desc    Send a message (Starts conversation if new)
// @route   POST /api/messages
// @access  Private
export const sendMessage = async (req, res, next) => {
  try {
    const { receiverId, text, conversationId, replyTo, isForwarded, voiceDuration, callDetails, fileName, fileSize } = req.body;
    const senderId = req.user.id;

    if (!text?.trim() && !req.file && !callDetails) {
      return res.status(400).json({ success: false, message: 'Message must contain text, an attachment, or call details' });
    }

    let conversation;

    // 1. Resolve conversation
    if (conversationId) {
      conversation = await Conversation.findById(conversationId);
      if (!conversation) {
        return res.status(404).json({ success: false, message: 'Conversation not found' });
      }
      const isParticipant = conversation.participants.some(
        (p) => (p._id || p).toString() === senderId
      );
      if (!isParticipant) {
        return res.status(403).json({ success: false, message: 'Not authorized to post to this conversation' });
      }
    } else if (receiverId) {
      if (receiverId === senderId) {
        return res.status(400).json({ success: false, message: 'Cannot message yourself' });
      }

      const receiver = await User.findById(receiverId).lean();
      if (!receiver) {
        return res.status(404).json({ success: false, message: 'Recipient not found' });
      }

      // Check if blocked
      const senderUser = await User.findById(senderId).select('blockedUsers').lean();
      if (receiver.blockedUsers?.some((id) => id.toString() === senderId)) {
        return res.status(403).json({ success: false, message: 'You have been blocked by this user.' });
      }
      if (senderUser?.blockedUsers?.some((id) => id.toString() === receiverId)) {
        return res.status(403).json({ success: false, message: 'You have blocked this user. Unblock them first.' });
      }

      conversation = await Conversation.findOne({
        participants: { $all: [senderId, receiverId] },
      });

      if (!conversation) {
        conversation = await Conversation.create({
          participants: [senderId, receiverId],
        });
      }
    }

    if (!conversation) {
      return res.status(400).json({ success: false, message: 'No conversation or receiver specified' });
    }

    // Check block list among participants
    const otherParticipantId = conversation.participants.find((p) => (p._id || p).toString() !== senderId);
    if (otherParticipantId) {
      const otherUser = await User.findById(otherParticipantId).select('blockedUsers').lean();
      const meUser = await User.findById(senderId).select('blockedUsers').lean();
      if (otherUser?.blockedUsers?.some((id) => id.toString() === senderId)) {
        return res.status(403).json({ success: false, message: 'You have been blocked by this user.' });
      }
      if (meUser?.blockedUsers?.some((id) => id.toString() === otherParticipantId.toString())) {
        return res.status(403).json({ success: false, message: 'You have blocked this user.' });
      }
    }

    // 2. Handle file / media attachment
    let mediaUrl = null;
    let mediaType = null;
    let attachedFileName = fileName || null;
    let attachedFileSize = fileSize || null;

    if (req.file) {
      mediaUrl = fileUrl(req, req.file);
      attachedFileName = req.file.originalname;
      const sizeBytes = req.file.size;
      attachedFileSize = sizeBytes > 1024 * 1024
        ? `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`
        : `${Math.round(sizeBytes / 1024)} KB`;

      if (req.file.mimetype.startsWith('image/')) mediaType = 'image';
      else if (req.file.mimetype.startsWith('video/')) mediaType = 'video';
      else if (req.file.mimetype.startsWith('audio/')) mediaType = 'audio';
      else mediaType = 'file';
    }

    // Handle parsed replyTo
    let parsedReply = null;
    if (replyTo) {
      try {
        parsedReply = typeof replyTo === 'string' ? JSON.parse(replyTo) : replyTo;
      } catch {
        parsedReply = null;
      }
    }

    // Handle parsed callDetails
    let parsedCall = null;
    if (callDetails) {
      try {
        parsedCall = typeof callDetails === 'string' ? JSON.parse(callDetails) : callDetails;
        mediaType = 'call';
      } catch {
        parsedCall = null;
      }
    }

    // 3. Create message
    const message = await Message.create({
      conversation: conversation._id,
      sender: senderId,
      text: text?.trim() || '',
      mediaUrl,
      mediaType,
      fileName: attachedFileName,
      fileSize: attachedFileSize,
      voiceDuration: Number(voiceDuration) || 0,
      replyTo: parsedReply,
      isForwarded: Boolean(isForwarded === true || isForwarded === 'true'),
      callDetails: parsedCall,
      readBy: [senderId],
    });

    // 4. Update lastMessage in conversation
    conversation.lastMessage = message._id;
    await conversation.save();

    // 5. Populate sender details
    await message.populate('sender', 'username avatar fullName isVerified');
    const populatedMessage = message.toObject();

    // 6. Broadcast via Socket.io
    conversation.participants.forEach((participantId) => {
      const pIdStr = (participantId._id || participantId).toString();
      if (pIdStr !== senderId) {
        global.emitToUser?.(pIdStr, 'receive_message', populatedMessage);
        global.emitToUser?.(pIdStr, 'update_conversation_order', {
          conversationId: conversation._id,
          lastMessage: populatedMessage,
          updatedAt: conversation.updatedAt,
        });
      }
    });

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
    const userId = new mongoose.Types.ObjectId(req.user.id);

    const conversations = await Conversation.aggregate([
      { $match: { participants: userId } },
      { $sort: { updatedAt: -1 } },
      // Populate lastMessage
      {
        $lookup: {
          from: 'messages',
          localField: 'lastMessage',
          foreignField: '_id',
          as: 'lastMessage',
        },
      },
      {
        $unwind: { path: '$lastMessage', preserveNullAndEmptyArrays: true },
      },
      // Populate lastMessage.sender
      {
        $lookup: {
          from: 'users',
          localField: 'lastMessage.sender',
          foreignField: '_id',
          pipeline: [{ $project: { username: 1, avatar: 1, fullName: 1 } }],
          as: 'lastMessage.sender',
        },
      },
      {
        $addFields: {
          'lastMessage.sender': { $arrayElemAt: ['$lastMessage.sender', 0] },
        },
      },
      // Count unread messages (excluding messages deleted for current user)
      {
        $lookup: {
          from: 'messages',
          let: { convId: '$_id' },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ['$conversation', '$$convId'] },
                    { $ne: ['$sender', userId] },
                    { $not: { $in: [userId, '$readBy'] } },
                    { $not: { $in: [userId, { $ifNull: ['$deletedFor', []] }] } },
                  ],
                },
              },
            },
            { $count: 'n' },
          ],
          as: '_unread',
        },
      },
      { $addFields: { unreadCount: { $ifNull: [{ $arrayElemAt: ['$_unread', 0] }, { n: 0 }] } } },
      { $addFields: { unreadCount: '$unreadCount.n' } },
      { $project: { _unread: 0 } },
      // Populate the other participant
      {
        $lookup: {
          from: 'users',
          let: { parts: '$participants' },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $in: ['$_id', '$$parts'] },
                    { $ne: ['$_id', userId] },
                  ],
                },
              },
            },
            {
              $project: {
                username: 1,
                avatar: 1,
                fullName: 1,
                bio: 1,
                isVerified: 1,
                lastSeen: 1,
                onlineStatusPrivacy: 1,
                lastSeenPrivacy: 1,
                blockedUsers: 1,
              },
            },
          ],
          as: 'otherParticipants',
        },
      },
      { $addFields: { otherParticipant: { $arrayElemAt: ['$otherParticipants', 0] } } },
      { $project: { otherParticipants: 0 } },
    ]);

    // Attach active socket online status
    const augmented = conversations.map((c) => {
      const otherId = c.otherParticipant?._id ? c.otherParticipant._id.toString() : null;
      const isOnline = otherId && global.activeUsers ? global.activeUsers.has(otherId) : false;
      const showOnline = c.otherParticipant?.onlineStatusPrivacy !== false;
      const isBlocked = c.otherParticipant?.blockedUsers?.some((b) => b.toString() === req.user.id);
      return {
        ...c,
        isOnline: showOnline && isOnline && !isBlocked,
        isMuted: Array.isArray(c.mutedBy) && c.mutedBy.some((id) => id.toString() === req.user.id),
      };
    });

    res.json({ success: true, conversations: augmented });
  } catch (error) {
    next(error);
  }
};

// @desc    Get message history for a conversation (paginated)
// @route   GET /api/messages/:conversationId
// @access  Private
export const getMessages = async (req, res, next) => {
  try {
    const { conversationId } = req.params;
    const userId = req.user.id;
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 50));
    const before = req.query.before ? new Date(req.query.before) : null;

    // Verify participant
    const conversation = await Conversation.findById(conversationId).lean();
    if (!conversation) {
      return res.status(404).json({ success: false, message: 'Conversation not found' });
    }

    const isParticipant = conversation.participants.some(
      (p) => (p._id || p).toString() === userId
    );
    if (!isParticipant) {
      return res.status(403).json({ success: false, message: 'Not authorized to access this conversation' });
    }

    // Build query filter — exclude messages deleted for this user
    const filter = {
      conversation: conversationId,
      deletedFor: { $ne: new mongoose.Types.ObjectId(userId) },
    };
    if (before) filter.createdAt = { $lt: before };

    // Mark unread messages as read
    const updateResult = await Message.updateMany(
      { conversation: conversationId, sender: { $ne: userId }, readBy: { $ne: userId } },
      { $addToSet: { readBy: userId } }
    );

    if (updateResult.modifiedCount > 0) {
      conversation.participants.forEach((participantId) => {
        const pIdStr = (participantId._id || participantId).toString();
        if (pIdStr !== userId) {
          global.emitToUser?.(pIdStr, 'messages_read', {
            conversationId: conversation._id,
            readBy: userId,
          });
        }
      });
    }

    const messages = await Message.find(filter)
      .populate('sender', 'username avatar fullName isVerified')
      .populate('reactions.user', 'username avatar fullName')
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    messages.reverse();

    const hasMore = messages.length === limit;
    const nextCursor = hasMore ? messages[0].createdAt.toISOString() : null;

    res.json({
      success: true,
      messages,
      hasMore,
      nextCursor,
      conversation: {
        _id: conversation._id,
        nicknames: conversation.nicknames || [],
        wallpaper: conversation.wallpaper || 'default',
        isMuted: (conversation.mutedBy || []).some((id) => id.toString() === userId),
      },
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Edit a message
// @route   PUT /api/messages/:messageId
// @access  Private
export const editMessage = async (req, res, next) => {
  try {
    const { messageId } = req.params;
    const { text } = req.body;
    const userId = req.user.id;

    if (!text?.trim()) {
      return res.status(400).json({ success: false, message: 'Message text cannot be empty' });
    }

    const message = await Message.findById(messageId);
    if (!message) {
      return res.status(404).json({ success: false, message: 'Message not found' });
    }

    if (message.sender.toString() !== userId) {
      return res.status(403).json({ success: false, message: 'You can only edit your own messages' });
    }

    if (message.deletedForEveryone) {
      return res.status(400).json({ success: false, message: 'Cannot edit a deleted message' });
    }

    message.text = text.trim();
    message.isEdited = true;
    message.editedAt = new Date();
    await message.save();

    await message.populate('sender', 'username avatar fullName isVerified');
    const updated = message.toObject();

    // Broadcast edit to participants
    const conversation = await Conversation.findById(message.conversation).lean();
    if (conversation) {
      conversation.participants.forEach((pId) => {
        global.emitToUser?.(pId.toString(), 'message_edited', updated);
      });
    }

    res.json({ success: true, message: updated });
  } catch (error) {
    next(error);
  }
};

// @desc    Delete a message (Delete for Me or Delete for Everyone)
// @route   DELETE /api/messages/:messageId
// @access  Private
export const deleteMessage = async (req, res, next) => {
  try {
    const { messageId } = req.params;
    const { deleteFor } = req.query; // 'me' | 'everyone'
    const userId = req.user.id;

    const message = await Message.findById(messageId);
    if (!message) {
      return res.status(404).json({ success: false, message: 'Message not found' });
    }

    const conversation = await Conversation.findById(message.conversation).lean();
    if (!conversation) {
      return res.status(404).json({ success: false, message: 'Conversation not found' });
    }

    const isParticipant = conversation.participants.some((p) => p.toString() === userId);
    if (!isParticipant) {
      return res.status(403).json({ success: false, message: 'Not authorized' });
    }

    if (deleteFor === 'everyone') {
      if (message.sender.toString() !== userId) {
        return res.status(403).json({ success: false, message: 'Only sender can delete for everyone' });
      }
      message.deletedForEveryone = true;
      message.text = 'This message was deleted';
      message.mediaUrl = null;
      message.mediaType = null;
      await message.save();

      conversation.participants.forEach((pId) => {
        global.emitToUser?.(pId.toString(), 'message_deleted', {
          messageId: message._id,
          conversationId: message.conversation,
          deletedForEveryone: true,
        });
      });
    } else {
      // Delete for Me
      if (!message.deletedFor.includes(userId)) {
        message.deletedFor.push(userId);
        await message.save();
      }

      global.emitToUser?.(userId, 'message_deleted', {
        messageId: message._id,
        conversationId: message.conversation,
        deletedForMe: true,
      });
    }

    res.json({ success: true, message: 'Message deleted successfully' });
  } catch (error) {
    next(error);
  }
};

// @desc    React to a message
// @route   POST /api/messages/:messageId/react
// @access  Private
export const reactToMessage = async (req, res, next) => {
  try {
    const { messageId } = req.params;
    const { emoji } = req.body;
    const userId = req.user.id;

    if (!emoji) {
      return res.status(400).json({ success: false, message: 'Emoji is required' });
    }

    const message = await Message.findById(messageId);
    if (!message) {
      return res.status(404).json({ success: false, message: 'Message not found' });
    }

    const existingIndex = message.reactions.findIndex(
      (r) => r.user.toString() === userId && r.emoji === emoji
    );

    if (existingIndex > -1) {
      // Toggle off if clicking the exact same emoji
      message.reactions.splice(existingIndex, 1);
    } else {
      // Replace any existing reaction by this user or add new
      const userReactionIndex = message.reactions.findIndex((r) => r.user.toString() === userId);
      if (userReactionIndex > -1) {
        message.reactions[userReactionIndex].emoji = emoji;
      } else {
        message.reactions.push({ user: userId, emoji });
      }
    }

    await message.save();
    await message.populate('reactions.user', 'username avatar fullName');

    const conversation = await Conversation.findById(message.conversation).lean();
    if (conversation) {
      conversation.participants.forEach((pId) => {
        global.emitToUser?.(pId.toString(), 'message_reaction', {
          messageId: message._id,
          conversationId: message.conversation,
          reactions: message.reactions,
        });
      });
    }

    res.json({ success: true, reactions: message.reactions });
  } catch (error) {
    next(error);
  }
};

// @desc    Update conversation settings (custom nickname, wallpaper, mute)
// @route   PUT /api/messages/conversations/:conversationId/settings
// @access  Private
export const updateConversationSettings = async (req, res, next) => {
  try {
    const { conversationId } = req.params;
    const { nickname, targetUserId, wallpaper, isMuted } = req.body;
    const userId = req.user.id;

    const conversation = await Conversation.findById(conversationId);
    if (!conversation) {
      return res.status(404).json({ success: false, message: 'Conversation not found' });
    }

    const isParticipant = conversation.participants.some((p) => p.toString() === userId);
    if (!isParticipant) {
      return res.status(403).json({ success: false, message: 'Not authorized' });
    }

    // 1. Update synchronized nickname
    if (targetUserId && nickname !== undefined) {
      const idx = conversation.nicknames.findIndex((n) => n.user.toString() === targetUserId.toString());
      if (idx > -1) {
        conversation.nicknames[idx].nickname = nickname.trim();
      } else {
        conversation.nicknames.push({ user: targetUserId, nickname: nickname.trim() });
      }
    }

    // 2. Update wallpaper
    if (wallpaper !== undefined) {
      conversation.wallpaper = wallpaper;
    }

    // 3. Update mute
    if (isMuted !== undefined) {
      if (isMuted) {
        if (!conversation.mutedBy.includes(userId)) conversation.mutedBy.push(userId);
      } else {
        conversation.mutedBy = conversation.mutedBy.filter((id) => id.toString() !== userId);
      }
    }

    await conversation.save();

    // Broadcast updated settings to both participants
    conversation.participants.forEach((pId) => {
      global.emitToUser?.(pId.toString(), 'conversation_settings_updated', {
        conversationId: conversation._id,
        nicknames: conversation.nicknames,
        wallpaper: conversation.wallpaper,
      });
    });

    res.json({
      success: true,
      settings: {
        nicknames: conversation.nicknames,
        wallpaper: conversation.wallpaper,
        isMuted: conversation.mutedBy.some((id) => id.toString() === userId),
      },
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get shared media (images, videos, files, audio) in conversation
// @route   GET /api/messages/conversations/:conversationId/media
// @access  Private
export const getConversationSharedMedia = async (req, res, next) => {
  try {
    const { conversationId } = req.params;
    const userId = req.user.id;

    const conversation = await Conversation.findById(conversationId).lean();
    if (!conversation) {
      return res.status(404).json({ success: false, message: 'Conversation not found' });
    }

    const isParticipant = conversation.participants.some((p) => p.toString() === userId);
    if (!isParticipant) {
      return res.status(403).json({ success: false, message: 'Not authorized' });
    }

    const mediaMessages = await Message.find({
      conversation: conversationId,
      mediaUrl: { $ne: null },
      deletedForEveryone: { $ne: true },
      deletedFor: { $ne: new mongoose.Types.ObjectId(userId) },
    })
      .sort({ createdAt: -1 })
      .select('mediaUrl mediaType fileName fileSize createdAt sender')
      .lean();

    res.json({ success: true, media: mediaMessages });
  } catch (error) {
    next(error);
  }
};

// @desc    Mark conversation messages as read
// @route   PUT /api/messages/:conversationId/read
// @access  Private
export const markConversationRead = async (req, res, next) => {
  try {
    const { conversationId } = req.params;
    const userId = req.user.id;

    const conversation = await Conversation.findById(conversationId).lean();
    if (!conversation) {
      return res.status(404).json({ success: false, message: 'Conversation not found' });
    }

    const isParticipant = conversation.participants.some(
      (p) => (p._id || p).toString() === userId
    );
    if (!isParticipant) {
      return res.status(403).json({ success: false, message: 'Not authorized to access this conversation' });
    }

    await Message.updateMany(
      { conversation: conversationId, sender: { $ne: userId }, readBy: { $ne: userId } },
      { $addToSet: { readBy: userId } }
    );

    conversation.participants.forEach((participantId) => {
      const pIdStr = (participantId._id || participantId).toString();
      if (pIdStr !== userId) {
        global.emitToUser?.(pIdStr, 'messages_read', {
          conversationId: conversation._id,
          readBy: userId,
        });
      }
    });

    res.json({ success: true, message: 'Messages marked as read' });
  } catch (error) {
    next(error);
  }
};
