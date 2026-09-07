const Message = require('../models/Message');
const Conversation = require('../models/Conversation');
const User = require('../models/User');

// GET /api/messages/:conversationId - cursor-based pagination
exports.getMessages = async (req, res, next) => {
  try {
    const { conversationId } = req.params;
    const { cursor, limit = 30 } = req.query;
    const currentUserId = req.user._id;

    // Verify user is in conversation
    const conversation = await Conversation.findOne({
      _id: conversationId,
      participants: currentUserId,
    });

    if (!conversation) {
      return res.status(403).json({
        success: false,
        message: 'Access denied or conversation not found',
        errorCode: 'CONVERSATION_ACCESS_DENIED',
      });
    }

    const query = {
      conversationId,
      deletedFor: { $ne: currentUserId },
    };

    if (cursor) {
      // Find cursor message to get its createdAt timestamp
      const cursorMessage = await Message.findById(cursor);
      if (cursorMessage) {
        query.createdAt = { $lt: cursorMessage.createdAt };
      }
    }

    const pageLimit = Math.min(parseInt(limit, 10) || 30, 100);

    const messages = await Message.find(query)
      .sort({ createdAt: -1 })
      .limit(pageLimit)
      .populate('replyTo', 'content senderId messageType mediaUrl fileName')
      .populate('senderId', 'name profilePhoto');

    const nextCursor = messages.length === pageLimit ? messages[messages.length - 1]._id : null;

    // Reverse so frontend receives in chronological order
    res.status(200).json({
      success: true,
      data: messages.reverse(),
      nextCursor,
      hasMore: Boolean(nextCursor),
    });
  } catch (error) {
    next(error);
  }
};

// POST /api/messages - send a message
exports.sendMessage = async (req, res, next) => {
  try {
    const {
      conversationId,
      receiverId,
      messageType = 'text',
      content = '',
      mediaUrl = '',
      thumbnailUrl = '',
      fileName = '',
      fileSize = 0,
      mimeType = '',
      audioDuration = 0,
      replyTo = null,
    } = req.body;

    const senderId = req.user._id;

    // Verify conversation
    const conversation = await Conversation.findOne({
      _id: conversationId,
      participants: senderId,
    });

    if (!conversation) {
      return res.status(403).json({
        success: false,
        message: 'You are not a participant in this conversation',
        errorCode: 'NOT_PARTICIPANT',
      });
    }

    // Check if recipient has blocked sender
    const recipient = await User.findById(receiverId);
    if (recipient && recipient.blockedUsers && recipient.blockedUsers.includes(senderId)) {
      return res.status(403).json({
        success: false,
        message: 'Cannot send message to this user',
        errorCode: 'USER_BLOCKED',
      });
    }

    const message = await Message.create({
      conversationId,
      senderId,
      receiverId,
      messageType,
      content,
      mediaUrl,
      thumbnailUrl,
      fileName,
      fileSize,
      mimeType,
      audioDuration,
      replyTo: replyTo || null,
      status: 'sent',
    });

    // Populate replyTo and sender for immediate return
    const populatedMessage = await Message.findById(message._id)
      .populate('replyTo', 'content senderId messageType mediaUrl fileName')
      .populate('senderId', 'name profilePhoto');

    // Update conversation lastMessage
    let preview = content;
    if (messageType === 'image') preview = '📷 Photo';
    else if (messageType === 'video') preview = '🎥 Video';
    else if (messageType === 'voice') preview = '🎤 Voice message';
    else if (messageType === 'audio') preview = '🎵 Audio';
    else if (messageType === 'file') preview = `📄 ${fileName || 'Document'}`;

    conversation.lastMessage = message._id;
    conversation.lastMessagePreview = preview;
    conversation.lastMessageAt = new Date();
    await conversation.save();

    res.status(201).json({
      success: true,
      data: populatedMessage,
    });
  } catch (error) {
    next(error);
  }
};

// PUT /api/messages/:conversationId/read - mark messages as read
exports.markAsRead = async (req, res, next) => {
  try {
    const { conversationId } = req.params;
    const currentUserId = req.user._id;

    const result = await Message.updateMany(
      {
        conversationId,
        receiverId: currentUserId,
        status: { $in: ['sent', 'delivered'] },
      },
      {
        $set: { status: 'read' },
      }
    );

    res.status(200).json({
      success: true,
      modifiedCount: result.modifiedCount,
    });
  } catch (error) {
    next(error);
  }
};

// DELETE /api/messages/:id - delete for me or everyone
exports.deleteMessage = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { forEveryone } = req.body;
    const currentUserId = req.user._id;

    const message = await Message.findById(id);
    if (!message) {
      return res.status(404).json({
        success: false,
        message: 'Message not found',
        errorCode: 'MESSAGE_NOT_FOUND',
      });
    }

    if (forEveryone) {
      if (message.senderId.toString() !== currentUserId.toString()) {
        return res.status(403).json({
          success: false,
          message: 'Only the sender can delete a message for everyone',
          errorCode: 'DELETE_FORBIDDEN',
        });
      }

      // Check time limit for delete for everyone (e.g., 2 hours)
      const twoHoursInMs = 2 * 60 * 60 * 1000;
      if (Date.now() - new Date(message.createdAt).getTime() > twoHoursInMs) {
        return res.status(400).json({
          success: false,
          message: 'Cannot delete for everyone after 2 hours',
          errorCode: 'DELETE_EXPIRED',
        });
      }

      message.isDeleted = true;
      message.deletedForEveryone = true;
      message.content = 'This message was deleted';
      message.mediaUrl = '';
      message.thumbnailUrl = '';
      await message.save();
    } else {
      // Delete for me
      if (!message.deletedFor.includes(currentUserId)) {
        message.deletedFor.push(currentUserId);
        await message.save();
      }
    }

    res.status(200).json({
      success: true,
      message: 'Message deleted successfully',
      data: {
        messageId: message._id,
        isDeleted: message.isDeleted,
        forEveryone: Boolean(forEveryone),
      },
    });
  } catch (error) {
    next(error);
  }
};

// GET /api/messages/:conversationId/search - search messages within conversation
exports.searchMessages = async (req, res, next) => {
  try {
    const { conversationId } = req.params;
    const { q } = req.query;
    const currentUserId = req.user._id;

    if (!q || !q.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Search query is required',
        errorCode: 'NO_QUERY',
      });
    }

    const messages = await Message.find({
      conversationId,
      deletedFor: { $ne: currentUserId },
      isDeleted: false,
      content: { $regex: q.trim(), $options: 'i' },
    })
      .sort({ createdAt: -1 })
      .limit(50)
      .populate('senderId', 'name');

    res.status(200).json({
      success: true,
      data: messages,
    });
  } catch (error) {
    next(error);
  }
};
