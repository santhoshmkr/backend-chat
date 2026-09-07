const User = require('../models/User');
const PrivateMedia = require('../models/PrivateMedia');
const storageService = require('../services/storage.service');

// POST /api/vault/setup-pin - setup initial 4-digit PIN
exports.setupPin = async (req, res, next) => {
  try {
    const { pin } = req.body;

    if (!pin || !/^\d{4,6}$/.test(pin)) {
      return res.status(400).json({
        success: false,
        message: 'PIN must be 4 to 6 numeric digits',
        errorCode: 'INVALID_PIN_FORMAT',
      });
    }

    const user = await User.findById(req.user._id).select('+vaultPinHash');
    if (user.vaultPinHash) {
      return res.status(400).json({
        success: false,
        message: 'PIN is already configured. Use change PIN instead.',
        errorCode: 'PIN_ALREADY_SET',
      });
    }

    user.vaultPinHash = await User.hashValue(pin);
    await user.save();

    res.status(200).json({
      success: true,
      message: 'Vault PIN configured successfully',
    });
  } catch (error) {
    next(error);
  }
};

// POST /api/vault/verify-pin - verify vault PIN
exports.verifyPin = async (req, res, next) => {
  try {
    const { pin } = req.body;

    if (!pin) {
      return res.status(400).json({
        success: false,
        message: 'PIN is required',
        errorCode: 'MISSING_PIN',
      });
    }

    const user = await User.findById(req.user._id).select('+vaultPinHash');
    if (!user.vaultPinHash) {
      return res.status(400).json({
        success: false,
        message: 'Vault PIN has not been setup yet',
        errorCode: 'PIN_NOT_SET',
      });
    }

    const isMatch = await user.compareVaultPin(pin);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: 'Incorrect PIN',
        errorCode: 'INVALID_PIN',
      });
    }

    res.status(200).json({
      success: true,
      message: 'Vault unlocked successfully',
      data: { verified: true },
    });
  } catch (error) {
    next(error);
  }
};

// PUT /api/vault/change-pin - change vault PIN
exports.changePin = async (req, res, next) => {
  try {
    const { currentPin, newPin } = req.body;

    if (!newPin || !/^\d{4,6}$/.test(newPin)) {
      return res.status(400).json({
        success: false,
        message: 'New PIN must be 4 to 6 numeric digits',
        errorCode: 'INVALID_NEW_PIN',
      });
    }

    const user = await User.findById(req.user._id).select('+vaultPinHash');
    if (user.vaultPinHash) {
      const isMatch = await user.compareVaultPin(currentPin);
      if (!isMatch) {
        return res.status(401).json({
          success: false,
          message: 'Current PIN is incorrect',
          errorCode: 'INVALID_CURRENT_PIN',
        });
      }
    }

    user.vaultPinHash = await User.hashValue(newPin);
    await user.save();

    res.status(200).json({
      success: true,
      message: 'Vault PIN changed successfully',
    });
  } catch (error) {
    next(error);
  }
};

// GET /api/vault/media - list all private media
exports.getVaultMedia = async (req, res, next) => {
  try {
    const media = await PrivateMedia.find({ userId: req.user._id }).sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      data: media,
    });
  } catch (error) {
    next(error);
  }
};

// POST /api/vault/media - upload or move media to private vault
exports.uploadVaultMedia = async (req, res, next) => {
  try {
    const { title, existingMediaUrl } = req.body;
    let fileUrl = '';
    let fileSize = 0;
    let mimeType = 'image/jpeg';

    if (req.file) {
      fileUrl = storageService.getFileUrl(req, `/uploads/vault/${req.file.filename}`);
      fileSize = req.file.size;
      mimeType = req.file.mimetype;
    } else if (existingMediaUrl) {
      fileUrl = existingMediaUrl;
    } else {
      return res.status(400).json({
        success: false,
        message: 'No photo provided to add to vault',
        errorCode: 'NO_MEDIA_PROVIDED',
      });
    }

    const item = await PrivateMedia.create({
      userId: req.user._id,
      title: title || 'Private Photo',
      encryptedMediaUrl: fileUrl,
      thumbnailUrl: fileUrl,
      mimeType,
      fileSize,
    });

    res.status(201).json({
      success: true,
      message: 'Photo moved to private vault successfully',
      data: item,
    });
  } catch (error) {
    next(error);
  }
};

// DELETE /api/vault/media/:id - permanently delete from vault
exports.deleteVaultMedia = async (req, res, next) => {
  try {
    const item = await PrivateMedia.findOne({ _id: req.params.id, userId: req.user._id });
    if (!item) {
      return res.status(404).json({
        success: false,
        message: 'Vault item not found',
        errorCode: 'ITEM_NOT_FOUND',
      });
    }

    // Delete disk file
    await storageService.deleteFile(item.encryptedMediaUrl);
    await PrivateMedia.deleteOne({ _id: item._id });

    res.status(200).json({
      success: true,
      message: 'Photo permanently deleted from vault',
    });
  } catch (error) {
    next(error);
  }
};
