const mongoose = require('mongoose');

const privateMediaSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    title: {
      type: String,
      default: 'Private Photo',
    },
    encryptedMediaUrl: {
      type: String,
      required: true,
    },
    thumbnailUrl: {
      type: String,
      default: '',
    },
    mimeType: {
      type: String,
      default: 'image/jpeg',
    },
    fileSize: {
      type: Number,
      default: 0,
    },
    iv: {
      type: String, // Initialization vector if client or server encrypted
      default: '',
    },
  },
  {
    timestamps: true,
  }
);

privateMediaSchema.index({ userId: 1, createdAt: -1 });

const PrivateMedia = mongoose.model('PrivateMedia', privateMediaSchema);

module.exports = PrivateMedia;
