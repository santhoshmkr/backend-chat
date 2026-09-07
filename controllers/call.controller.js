const Call = require('../models/Call');

// GET /api/calls/history
exports.getCallHistory = async (req, res, next) => {
  try {
    const currentUserId = req.user._id;

    const calls = await Call.find({
      $or: [{ callerId: currentUserId }, { receiverId: currentUserId }],
    })
      .sort({ startedAt: -1 })
      .limit(50)
      .populate('callerId', 'name profilePhoto phone')
      .populate('receiverId', 'name profilePhoto phone');

    res.status(200).json({
      success: true,
      data: calls,
    });
  } catch (error) {
    next(error);
  }
};

// POST /api/calls/log - record a new call or call update
exports.logCall = async (req, res, next) => {
  try {
    const { receiverId, callType, status, startedAt, answeredAt, endedAt, duration } = req.body;
    const callerId = req.user._id;

    const call = await Call.create({
      callerId,
      receiverId,
      callType: callType || 'audio',
      status: status || 'completed',
      startedAt: startedAt || new Date(),
      answeredAt: answeredAt || null,
      endedAt: endedAt || new Date(),
      duration: duration || 0,
    });

    const populatedCall = await Call.findById(call._id)
      .populate('callerId', 'name profilePhoto phone')
      .populate('receiverId', 'name profilePhoto phone');

    res.status(201).json({
      success: true,
      data: populatedCall,
    });
  } catch (error) {
    next(error);
  }
};
