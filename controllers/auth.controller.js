const User = require('../models/User');
const { generateTokens, verifyRefreshToken } = require('../services/token.service');
const storageService = require('../services/storage.service');

// POST /api/auth/register
exports.register = async (req, res, next) => {
  try {
    const { name, phone, email, password } = req.body;

    if (!name || !phone || !password) {
      return res.status(400).json({
        success: false,
        message: 'Name, phone number, and password are required',
        errorCode: 'MISSING_FIELDS',
      });
    }

    // Check if phone or email already registered
    const existingUser = await User.findOne({
      $or: [{ phone: phone.trim() }, ...(email ? [{ email: email.trim().toLowerCase() }] : [])],
    });

    if (existingUser) {
      const field = existingUser.phone === phone.trim() ? 'Phone number' : 'Email address';
      return res.status(400).json({
        success: false,
        message: `${field} is already registered`,
        errorCode: 'USER_ALREADY_EXISTS',
      });
    }

    // Profile photo upload handling if provided
    let profilePhotoUrl = '';
    if (req.file) {
      profilePhotoUrl = storageService.getFileUrl(req, `/uploads/avatars/${req.file.filename}`);
    }

    const passwordHash = await User.hashValue(password);

    const user = await User.create({
      name: name.trim(),
      phone: phone.trim(),
      email: email ? email.trim().toLowerCase() : undefined,
      passwordHash,
      profilePhoto: profilePhotoUrl,
      online: true,
      lastSeen: new Date(),
    });

    const { accessToken, refreshToken } = generateTokens(user._id);

    res.status(201).json({
      success: true,
      message: 'Account registered successfully',
      data: {
        user: {
          _id: user._id,
          name: user.name,
          phone: user.phone,
          email: user.email,
          profilePhoto: user.profilePhoto,
          about: user.about,
          online: user.online,
          privacySettings: user.privacySettings,
        },
        accessToken,
        refreshToken,
      },
    });
  } catch (error) {
    next(error);
  }
};

// POST /api/auth/login
exports.login = async (req, res, next) => {
  try {
    const { identifier, password } = req.body;

    if (!identifier || !password) {
      return res.status(400).json({
        success: false,
        message: 'Phone number or email and password are required',
        errorCode: 'MISSING_CREDENTIALS',
      });
    }

    const cleanIdentifier = identifier.trim();
    const user = await User.findOne({
      $or: [{ phone: cleanIdentifier }, { email: cleanIdentifier.toLowerCase() }],
    }).select('+passwordHash +vaultPinHash');

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid login credentials',
        errorCode: 'INVALID_CREDENTIALS',
      });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: 'Invalid login credentials',
        errorCode: 'INVALID_CREDENTIALS',
      });
    }

    // Update status to online
    user.online = true;
    user.lastSeen = new Date();
    await user.save();

    const { accessToken, refreshToken } = generateTokens(user._id);

    res.status(200).json({
      success: true,
      message: 'Login successful',
      data: {
        user: {
          _id: user._id,
          name: user.name,
          phone: user.phone,
          email: user.email,
          profilePhoto: user.profilePhoto,
          about: user.about,
          online: user.online,
          privacySettings: user.privacySettings,
          hasVaultPin: Boolean(user.vaultPinHash),
        },
        accessToken,
        refreshToken,
      },
    });
  } catch (error) {
    next(error);
  }
};

// POST /api/auth/refresh
exports.refreshToken = async (req, res, next) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(400).json({
        success: false,
        message: 'Refresh token is required',
        errorCode: 'NO_REFRESH_TOKEN',
      });
    }

    const decoded = verifyRefreshToken(refreshToken);
    if (!decoded) {
      return res.status(401).json({
        success: false,
        message: 'Invalid or expired refresh token',
        errorCode: 'INVALID_REFRESH_TOKEN',
      });
    }

    const user = await User.findById(decoded.id);
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'User no longer exists',
        errorCode: 'USER_NOT_FOUND',
      });
    }

    const tokens = generateTokens(user._id);

    res.status(200).json({
      success: true,
      message: 'Token refreshed successfully',
      data: tokens,
    });
  } catch (error) {
    next(error);
  }
};

// POST /api/auth/logout
exports.logout = async (req, res, next) => {
  try {
    if (req.user) {
      await User.findByIdAndUpdate(req.user._id, {
        online: false,
        lastSeen: new Date(),
        socketId: null,
      });
    }

    res.status(200).json({
      success: true,
      message: 'Logged out successfully',
    });
  } catch (error) {
    next(error);
  }
};

// GET /api/auth/me
exports.getMe = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id).select('+vaultPinHash');
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
        errorCode: 'USER_NOT_FOUND',
      });
    }

    res.status(200).json({
      success: true,
      data: {
        _id: user._id,
        name: user.name,
        phone: user.phone,
        email: user.email,
        profilePhoto: user.profilePhoto,
        about: user.about,
        online: user.online,
        lastSeen: user.lastSeen,
        privacySettings: user.privacySettings,
        blockedUsers: user.blockedUsers,
        hasVaultPin: Boolean(user.vaultPinHash),
      },
    });
  } catch (error) {
    next(error);
  }
};
