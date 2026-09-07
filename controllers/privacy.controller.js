const User = require('../models/User');

// GET /api/privacy
exports.getPrivacySettings = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id)
      .select('privacySettings blockedUsers')
      .populate('blockedUsers', 'name phone profilePhoto about');

    res.status(200).json({
      success: true,
      data: {
        privacySettings: user.privacySettings,
        blockedUsers: user.blockedUsers,
      },
    });
  } catch (error) {
    next(error);
  }
};

// PUT /api/privacy
exports.updatePrivacySettings = async (req, res, next) => {
  try {
    const { lastSeen, profilePhoto, about, readReceipts, onlineStatus, typingIndicator } = req.body;
    const updates = {};

    if (lastSeen !== undefined) updates['privacySettings.lastSeen'] = lastSeen;
    if (profilePhoto !== undefined) updates['privacySettings.profilePhoto'] = profilePhoto;
    if (about !== undefined) updates['privacySettings.about'] = about;
    if (readReceipts !== undefined) updates['privacySettings.readReceipts'] = Boolean(readReceipts);
    if (onlineStatus !== undefined) updates['privacySettings.onlineStatus'] = onlineStatus;
    if (typingIndicator !== undefined) updates['privacySettings.typingIndicator'] = Boolean(typingIndicator);

    const user = await User.findByIdAndUpdate(req.user._id, { $set: updates }, { new: true })
      .select('privacySettings blockedUsers')
      .populate('blockedUsers', 'name phone profilePhoto');

    res.status(200).json({
      success: true,
      message: 'Privacy settings updated',
      data: user.privacySettings,
    });
  } catch (error) {
    next(error);
  }
};

// POST /api/privacy/block/:userId
exports.blockUser = async (req, res, next) => {
  try {
    const targetUserId = req.params.userId;
    const currentUserId = req.user._id;

    if (targetUserId.toString() === currentUserId.toString()) {
      return res.status(400).json({
        success: false,
        message: 'You cannot block yourself',
        errorCode: 'CANNOT_BLOCK_SELF',
      });
    }

    const user = await User.findById(currentUserId);
    if (!user.blockedUsers.includes(targetUserId)) {
      user.blockedUsers.push(targetUserId);
      await user.save();
    }

    res.status(200).json({
      success: true,
      message: 'User blocked successfully',
      data: { blockedUsers: user.blockedUsers },
    });
  } catch (error) {
    next(error);
  }
};

// POST /api/privacy/unblock/:userId
exports.unblockUser = async (req, res, next) => {
  try {
    const targetUserId = req.params.userId;
    const currentUserId = req.user._id;

    const user = await User.findById(currentUserId);
    user.blockedUsers = user.blockedUsers.filter((id) => id.toString() !== targetUserId.toString());
    await user.save();

    res.status(200).json({
      success: true,
      message: 'User unblocked successfully',
      data: { blockedUsers: user.blockedUsers },
    });
  } catch (error) {
    next(error);
  }
};
