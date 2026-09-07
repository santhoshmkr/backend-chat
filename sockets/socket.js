const { Server } = require('socket.io');
const { verifyAccessToken } = require('../services/token.service');
const User = require('../models/User');
const Conversation = require('../models/Conversation');
const Message = require('../models/Message');

// Map of userId -> Set of socketIds (supports multiple tabs / devices)
const onlineUsers = new Map();

const initSocket = (server, corsOrigin) => {
  const io = new Server(server, {
    cors: {
      origin: corsOrigin || '*',
      methods: ['GET', 'POST'],
      credentials: true,
    },
    pingTimeout: 60000,
    pingInterval: 25000,
  });

  // Authentication middleware
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token || socket.handshake.query.token;
      if (!token) {
        return next(new Error('Authentication token required'));
      }

      const decoded = verifyAccessToken(token);
      if (!decoded) {
        return next(new Error('Invalid or expired authentication token'));
      }

      const user = await User.findById(decoded.id).select('name phone profilePhoto');
      if (!user) {
        return next(new Error('User not found'));
      }

      socket.user = user;
      next();
    } catch (err) {
      next(new Error('Socket authentication failed'));
    }
  });

  io.on('connection', async (socket) => {
    const userId = socket.user._id.toString();
    console.log(`[Socket] User connected: ${socket.user.name} (${userId}) - Socket: ${socket.id}`);

    // Track online user sockets
    if (!onlineUsers.has(userId)) {
      onlineUsers.set(userId, new Set());
    }
    onlineUsers.get(userId).add(socket.id);

    // Join personal room
    socket.join(`user:${userId}`);

    // Update database status
    await User.findByIdAndUpdate(userId, { online: true, socketId: socket.id });

    // Notify contacts / active conversations that this user is online
    socket.broadcast.emit('user:status_change', {
      userId,
      online: true,
      lastSeen: new Date(),
    });

    // Handle joining conversation rooms
    socket.on('conversation:join', (conversationId) => {
      socket.join(`conversation:${conversationId}`);
    });

    socket.on('conversation:leave', (conversationId) => {
      socket.leave(`conversation:${conversationId}`);
    });

    // Real-time message sending
    socket.on('message:send', async (data, callback) => {
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
          tempId,
        } = data;

        // Verify conversation participation
        const conversation = await Conversation.findOne({
          _id: conversationId,
          participants: userId,
        });

        if (!conversation) {
          if (callback) callback({ success: false, error: 'Conversation not found or access denied' });
          return;
        }

        let targetReceiverId = receiverId;
        if (!targetReceiverId && conversation.participants) {
          const otherParticipant = conversation.participants.find(
            (p) => p.toString() !== userId.toString()
          );
          if (otherParticipant) {
            targetReceiverId = otherParticipant.toString();
          }
        }

        // Create message in DB
        const message = await Message.create({
          conversationId,
          senderId: userId,
          receiverId: targetReceiverId || userId,
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

        const populatedMessage = await Message.findById(message._id)
          .populate('replyTo', 'content senderId messageType mediaUrl fileName')
          .populate('senderId', 'name profilePhoto');

        // Update conversation summary
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

        // Check if receiver is online, update status to delivered if so
        const isReceiverOnline = targetReceiverId
          ? onlineUsers.has(targetReceiverId.toString()) && onlineUsers.get(targetReceiverId.toString()).size > 0
          : false;

        if (isReceiverOnline) {
          message.status = 'delivered';
          await message.save();
          populatedMessage.status = 'delivered';
        }

        // Emit to conversation room (for anyone actively in the chat room)
        io.to(`conversation:${conversationId}`).emit('message:new', {
          message: populatedMessage,
          conversationId,
        });

        // Also emit to receiver personal room (for conversation list or notifications)
        if (targetReceiverId) {
          io.to(`user:${targetReceiverId}`).emit('message:new', {
            message: populatedMessage,
            conversationId,
          });
        }

        // Emit confirmation to sender for instant sync
        socket.emit('message:sent_confirm', {
          tempId,
          message: populatedMessage,
          conversationId,
        });

        if (callback) {
          callback({ success: true, message: populatedMessage });
        }
      } catch (err) {
        console.error('[Socket] message:send error:', err);
        if (callback) callback({ success: false, error: err.message });
      }
    });

    // Mark messages as delivered
    socket.on('message:delivered', async ({ messageId, senderId }) => {
      try {
        await Message.findByIdAndUpdate(messageId, { status: 'delivered' });
        io.to(`user:${senderId}`).emit('message:status_update', {
          messageId,
          status: 'delivered',
        });
      } catch (err) {
        console.error('[Socket] message:delivered error:', err);
      }
    });

    // Mark messages as read
    socket.on('message:read', async ({ conversationId, senderId }) => {
      try {
        await Message.updateMany(
          {
            conversationId,
            receiverId: userId,
            status: { $in: ['sent', 'delivered'] },
          },
          { $set: { status: 'read' } }
        );

        io.to(`user:${senderId}`).emit('message:read_all', {
          conversationId,
          readerId: userId,
        });
      } catch (err) {
        console.error('[Socket] message:read error:', err);
      }
    });

    // Typing indicators
    socket.on('typing:start', ({ conversationId, receiverId }) => {
      io.to(`user:${receiverId}`).emit('typing:status', {
        conversationId,
        userId,
        isTyping: true,
      });
    });

    socket.on('typing:stop', ({ conversationId, receiverId }) => {
      io.to(`user:${receiverId}`).emit('typing:status', {
        conversationId,
        userId,
        isTyping: false,
      });
    });

    // WebRTC Calling Signaling
    socket.on('call:initiate', async (data) => {
      const { receiverId, callType, offer } = data;
      console.log(`[Call] Call initiated from ${socket.user.name} to ${receiverId} (${callType})`);

      if (!receiverId) {
        socket.emit('call:unavailable', {
          receiverId,
          reason: 'Invalid recipient',
        });
        return;
      }

      const isReceiverOnline = onlineUsers.has(receiverId.toString()) && onlineUsers.get(receiverId.toString()).size > 0;

      // Always deliver incoming call signal to receiver user room
      io.to(`user:${receiverId}`).emit('call:incoming', {
        caller: {
          _id: socket.user._id,
          name: socket.user.name,
          profilePhoto: socket.user.profilePhoto,
        },
        callType, // 'audio' or 'video'
        offer,
      });

      // If receiver is not currently online, give a 25s window for device wake/reconnect
      if (!isReceiverOnline) {
        console.log(`[Call] Receiver ${receiverId} not in onlineUsers at initiate time`);
        setTimeout(() => {
          const stillOffline = !onlineUsers.has(receiverId.toString()) || onlineUsers.get(receiverId.toString()).size === 0;
          if (stillOffline) {
            socket.emit('call:unavailable', {
              receiverId,
              reason: 'User is not answering or offline',
            });
          }
        }, 25000);
      }
    });

    socket.on('call:accept', (data) => {
      const { callerId, answer } = data;
      console.log(`[Call] Call accepted by ${socket.user.name} for ${callerId}`);
      io.to(`user:${callerId}`).emit('call:accepted', {
        receiver: {
          _id: socket.user._id,
          name: socket.user.name,
          profilePhoto: socket.user.profilePhoto,
        },
        answer,
      });
    });

    socket.on('call:reject', (data) => {
      const { callerId, reason } = data;
      console.log(`[Call] Call rejected by ${socket.user.name} for ${callerId}`);
      io.to(`user:${callerId}`).emit('call:rejected', {
        receiverId: userId,
        reason: reason || 'Call declined',
      });
    });

    socket.on('call:ice_candidate', (data) => {
      const { targetUserId, candidate } = data;
      io.to(`user:${targetUserId}`).emit('call:ice_candidate', {
        senderId: userId,
        candidate,
      });
    });

    socket.on('call:end', (data) => {
      const { targetUserId, duration } = data;
      console.log(`[Call] Call ended between ${userId} and ${targetUserId}`);
      io.to(`user:${targetUserId}`).emit('call:ended', {
        endedBy: userId,
        duration,
      });
    });

    socket.on('call:busy', (data) => {
      const { callerId } = data;
      io.to(`user:${callerId}`).emit('call:busy', {
        receiverId: userId,
      });
    });

    // Disconnection handling
    socket.on('disconnect', async () => {
      console.log(`[Socket] Disconnected: ${socket.user.name} - Socket: ${socket.id}`);
      if (onlineUsers.has(userId)) {
        const userSockets = onlineUsers.get(userId);
        userSockets.delete(socket.id);

        if (userSockets.size === 0) {
          onlineUsers.delete(userId);
          const lastSeen = new Date();
          await User.findByIdAndUpdate(userId, { online: false, lastSeen, socketId: null });

          socket.broadcast.emit('user:status_change', {
            userId,
            online: false,
            lastSeen,
          });
        }
      }
    });
  });

  return io;
};

module.exports = { initSocket };
