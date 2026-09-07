const User = require('../models/User');
const storageService = require('../services/storage.service');

// GET /api/users - search or list contacts
exports.getUsers = async (req, res, next) => {
  try {
    const { search } = req.query;
    const currentUserId = req.user._id;

    let query = { _id: { $ne: currentUserId } };

    if (search && search.trim()) {
      const searchRegex = new RegExp(search.trim(), 'i');
      query.$or = [{ name: searchRegex }, { phone: searchRegex }, { email: searchRegex }];
    }

    const users = await User.find(query)
      .select('name phone email profilePhoto about online lastSeen privacySettings')
      .limit(50);

    // Apply privacy filters
    const sanitizedUsers = users.map((u) => {
      const userObj = u.toObject();
      const privacy = userObj.privacySettings || {};

      if (privacy.profilePhoto === 'nobody') {
        userObj.profilePhoto = '';
      }
      if (privacy.about === 'nobody') {
        userObj.about = '';
      }
      if (privacy.onlineStatus === 'nobody') {
        userObj.online = false;
      }
      if (privacy.lastSeen === 'nobody') {
        userObj.lastSeen = null;
      }

      return userObj;
    });

    res.status(200).json({
      success: true,
      count: sanitizedUsers.length,
      data: sanitizedUsers,
    });
  } catch (error) {
    next(error);
  }
};

// GET /api/users/:id - get single user details
exports.getUserById = async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id).select(
      'name phone email profilePhoto about online lastSeen privacySettings'
    );

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
        errorCode: 'USER_NOT_FOUND',
      });
    }

    const userObj = user.toObject();
    const privacy = userObj.privacySettings || {};

    if (privacy.profilePhoto === 'nobody') {
      userObj.profilePhoto = '';
    }
    if (privacy.about === 'nobody') {
      userObj.about = '';
    }
    if (privacy.onlineStatus === 'nobody') {
      userObj.online = false;
    }
    if (privacy.lastSeen === 'nobody') {
      userObj.lastSeen = null;
    }

    res.status(200).json({
      success: true,
      data: userObj,
    });
  } catch (error) {
    next(error);
  }
};

// PUT /api/users/profile - update name, about, phone
exports.updateProfile = async (req, res, next) => {
  try {
    const { name, about, phone } = req.body;
    const updates = {};

    if (name) updates.name = name.trim();
    if (about !== undefined) updates.about = about.trim();
    if (phone) {
      // Check if phone already taken by another user
      const existing = await User.findOne({ phone: phone.trim(), _id: { $ne: req.user._id } });
      if (existing) {
        return res.status(400).json({
          success: false,
          message: 'This phone number is already registered by another user',
          errorCode: 'PHONE_ALREADY_EXISTS',
        });
      }
      updates.phone = phone.trim();
    }

    const user = await User.findByIdAndUpdate(req.user._id, updates, {
      new: true,
      runValidators: true,
    }).select('-passwordHash -vaultPinHash');

    res.status(200).json({
      success: true,
      message: 'Profile updated successfully',
      data: user,
    });
  } catch (error) {
    next(error);
  }
};

// POST /api/users/avatar - upload new profile photo
exports.uploadAvatar = async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'Please provide an image file',
        errorCode: 'NO_FILE_UPLOADED',
      });
    }

    const photoUrl = storageService.getFileUrl(req, `/uploads/avatars/${req.file.filename}`);

    // If user already had a custom uploaded photo, remove old one
    const user = await User.findById(req.user._id);
    if (user && user.profilePhoto) {
      await storageService.deleteFile(user.profilePhoto);
    }

    const updatedUser = await User.findByIdAndUpdate(
      req.user._id,
      { profilePhoto: photoUrl },
      { new: true }
    ).select('-passwordHash -vaultPinHash');

    res.status(200).json({
      success: true,
      message: 'Profile photo updated successfully',
      data: updatedUser,
    });
  } catch (error) {
    next(error);
  }
};

// PUT /api/users/password - change password
exports.changePassword = async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        message: 'Current password and new password are required',
        errorCode: 'MISSING_PASSWORD_FIELDS',
      });
    }

    const user = await User.findById(req.user._id).select('+passwordHash');
    const isMatch = await user.comparePassword(currentPassword);
    if (!isMatch) {
      return res.status(400).json({
        success: false,
        message: 'Current password is incorrect',
        errorCode: 'INVALID_CURRENT_PASSWORD',
      });
    }

    user.passwordHash = await User.hashValue(newPassword);
    await user.save();

    res.status(200).json({
      success: true,
      message: 'Password changed successfully',
    });
  } catch (error) {
    next(error);
  }
};
