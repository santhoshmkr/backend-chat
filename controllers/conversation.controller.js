const Conversation = require('../models/Conversation');
const Message = require('../models/Message');
const User = require('../models/User');

// GET /api/conversations - get all conversations for current user
exports.getConversations = async (req, res, next) => {
  try {
    const currentUserId = req.user._id;

    const conversations = await Conversation.find({
      participants: currentUserId,
    })
      .populate('participants', 'name phone profilePhoto about online lastSeen privacySettings')
      .populate('lastMessage')
      .sort({ lastMessageAt: -1 });

    // Calculate unread count and sanitize for current user
    const result = await Promise.all(
      conversations.map(async (conv) => {
        const convObj = conv.toObject();

        // Count unread messages where receiver is current user and status !== 'read'
        const unreadCount = await Message.countDocuments({
          conversationId: conv._id,
          receiverId: currentUserId,
          status: { $in: ['sent', 'delivered'] },
          isDeleted: false,
          deletedFor: { $ne: currentUserId },
        });

        // Determine if pinned or muted by this user
        convObj.isPinned = conv.pinnedBy.some((id) => id.toString() === currentUserId.toString());
        convObj.isMuted = conv.mutedBy.some((id) => id.toString() === currentUserId.toString());
        convObj.unreadCount = unreadCount;

        // Apply privacy to participants
        convObj.participants = convObj.participants.map((p) => {
          if (p._id.toString() === currentUserId.toString()) return p;
          const priv = p.privacySettings || {};
          if (priv.profilePhoto === 'nobody') p.profilePhoto = '';
          if (priv.about === 'nobody') p.about = '';
          if (priv.onlineStatus === 'nobody') p.online = false;
          if (priv.lastSeen === 'nobody') p.lastSeen = null;
          return p;
        });

        return convObj;
      })
    );

    // Pinned conversations at the top
    result.sort((a, b) => {
      if (a.isPinned && !b.isPinned) return -1;
      if (!a.isPinned && b.isPinned) return 1;
      return new Date(b.lastMessageAt) - new Date(a.lastMessageAt);
    });

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

// POST /api/conversations/with/:userId - get or create 1-to-1 conversation
exports.getOrCreateConversation = async (req, res, next) => {
  try {
    const currentUserId = req.user._id;
    const targetUserId = req.params.userId;

    if (currentUserId.toString() === targetUserId.toString()) {
      return res.status(400).json({
        success: false,
        message: 'Cannot create a conversation with yourself',
        errorCode: 'SELF_CONVERSATION',
      });
    }

    const targetUser = await User.findById(targetUserId);
    if (!targetUser) {
      return res.status(404).json({
        success: false,
        message: 'Contact not found',
        errorCode: 'USER_NOT_FOUND',
      });
    }

    // Check if conversation already exists
    let conversation = await Conversation.findOne({
      isGroup: false,
      participants: { $all: [currentUserId, targetUserId], $size: 2 },
    })
      .populate('participants', 'name phone profilePhoto about online lastSeen privacySettings')
      .populate('lastMessage');

    if (!conversation) {
      conversation = await Conversation.create({
        participants: [currentUserId, targetUserId],
        lastMessageAt: new Date(),
      });

      conversation = await Conversation.findById(conversation._id).populate(
        'participants',
        'name phone profilePhoto about online lastSeen privacySettings'
      );
    }

    res.status(200).json({
      success: true,
      data: conversation,
    });
  } catch (error) {
    next(error);
  }
};

// PUT /api/conversations/:id/pin
exports.togglePin = async (req, res, next) => {
  try {
    const conversation = await Conversation.findById(req.params.id);
    if (!conversation) {
      return res.status(404).json({
        success: false,
        message: 'Conversation not found',
        errorCode: 'CONVERSATION_NOT_FOUND',
      });
    }

    const userIdStr = req.user._id.toString();
    const isPinned = conversation.pinnedBy.some((id) => id.toString() === userIdStr);

    if (isPinned) {
      conversation.pinnedBy = conversation.pinnedBy.filter((id) => id.toString() !== userIdStr);
    } else {
      conversation.pinnedBy.push(req.user._id);
    }

    await conversation.save();

    res.status(200).json({
      success: true,
      data: { isPinned: !isPinned },
    });
  } catch (error) {
    next(error);
  }
};

// PUT /api/conversations/:id/mute
exports.toggleMute = async (req, res, next) => {
  try {
    const conversation = await Conversation.findById(req.params.id);
    if (!conversation) {
      return res.status(404).json({
        success: false,
        message: 'Conversation not found',
        errorCode: 'CONVERSATION_NOT_FOUND',
      });
    }

    const userIdStr = req.user._id.toString();
    const isMuted = conversation.mutedBy.some((id) => id.toString() === userIdStr);

    if (isMuted) {
      conversation.mutedBy = conversation.mutedBy.filter((id) => id.toString() !== userIdStr);
    } else {
      conversation.mutedBy.push(req.user._id);
    }

    await conversation.save();

    res.status(200).json({
      success: true,
      data: { isMuted: !isMuted },
    });
  } catch (error) {
    next(error);
  }
};
