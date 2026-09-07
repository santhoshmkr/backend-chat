const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Please provide a name'],
      trim: true,
      maxlength: [50, 'Name cannot exceed 50 characters'],
    },
    phone: {
      type: String,
      required: [true, 'Please provide a phone number'],
      unique: true,
      trim: true,
      index: true,
    },
    email: {
      type: String,
      trim: true,
      lowercase: true,
      sparse: true,
      match: [/^\S+@\S+\.\S+$/, 'Please provide a valid email'],
    },
    passwordHash: {
      type: String,
      required: [true, 'Please provide a password'],
      select: false,
    },
    profilePhoto: {
      type: String,
      default: '',
    },
    about: {
      type: String,
      default: 'Hey there! I am using AuraChat.',
      maxlength: [150, 'About text cannot exceed 150 characters'],
    },
    lastSeen: {
      type: Date,
      default: Date.now,
    },
    online: {
      type: Boolean,
      default: false,
    },
    socketId: {
      type: String,
      default: null,
    },
    privacySettings: {
      lastSeen: {
        type: String,
        enum: ['everyone', 'contacts', 'nobody'],
        default: 'everyone',
      },
      profilePhoto: {
        type: String,
        enum: ['everyone', 'contacts', 'nobody'],
        default: 'everyone',
      },
      about: {
        type: String,
        enum: ['everyone', 'contacts', 'nobody'],
        default: 'everyone',
      },
      readReceipts: {
        type: Boolean,
        default: true,
      },
      onlineStatus: {
        type: String,
        enum: ['everyone', 'nobody'],
        default: 'everyone',
      },
      typingIndicator: {
        type: Boolean,
        default: true,
      },
    },
    blockedUsers: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
    ],
    vaultPinHash: {
      type: String,
      default: null,
      select: false,
    },
  },
  {
    timestamps: true,
  }
);

// Method to verify password
userSchema.methods.comparePassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.passwordHash);
};

// Method to verify vault pin
userSchema.methods.compareVaultPin = async function (enteredPin) {
  if (!this.vaultPinHash) return false;
  return await bcrypt.compare(enteredPin, this.vaultPinHash);
};

// Static helper to hash passwords/PINs
userSchema.statics.hashValue = async function (plainValue) {
  const salt = await bcrypt.genSalt(10);
  return await bcrypt.hash(plainValue, salt);
};

const User = mongoose.model('User', userSchema);

module.exports = User;
