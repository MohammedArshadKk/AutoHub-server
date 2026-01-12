const mongoose = require('mongoose');
const validator = require('validator');
const crypto = require('crypto');

const refreshTokenSchema = new mongoose.Schema(
    {
        token: {
            type: String,
            required: true,
        },
        fingerprint: {
            type: String,
            required: true,
        },
        expiresAt: {
            type: Date,
            required: true,
        },
        createdAt: {
            type: Date,
            default: Date.now,
        },
    },
    { _id: false }
);

const userSchema = new mongoose.Schema(
    {
        googleId: {
            type: String,
            unique: true,
            sparse: true, // Allows null values while maintaining uniqueness for non-null
        },
        email: {
            type: String,
            required: [true, 'Email is required'],
            unique: true,
            lowercase: true,
            trim: true,
            validate: [validator.isEmail, 'Please provide a valid email'],
        },
        name: {
            type: String,
            required: [true, 'Name is required'],
            trim: true,
            maxlength: [100, 'Name cannot exceed 100 characters'],
        },
        avatar: {
            type: String,
            default: null,
        },
        role: {
            type: String,
            enum: {
                values: ['buyer', 'seller', 'admin'],
                message: 'Role must be buyer, seller, or admin',
            },
            default: 'buyer',
        },
        isActive: {
            type: Boolean,
            default: true,
        },
        isEmailVerified: {
            type: Boolean,
            default: false,
        },
        refreshTokens: {
            type: [refreshTokenSchema],
            default: [],
            select: false, // Don't include in queries by default
        },
        lastLogin: {
            type: Date,
            default: null,
        },
        loginAttempts: {
            type: Number,
            default: 0,
        },
        lockUntil: {
            type: Date,
            default: null,
        },
        // Buyer-specific fields
        phone: {
            type: String,
            trim: true,
            default: null,
        },
        addresses: {
            type: [
                {
                    label: { type: String, default: 'Home' },
                    street: String,
                    city: String,
                    state: String,
                    postalCode: String,
                    country: { type: String, default: 'India' },
                    isDefault: { type: Boolean, default: false },
                },
            ],
            default: [],
        },
    },
    {
        timestamps: true,
        toJSON: { virtuals: true },
        toObject: { virtuals: true },
    }
);

userSchema.index({ role: 1, isActive: 1 });
userSchema.index({ 'refreshTokens.token': 1, 'refreshTokens.fingerprint': 1 });

// Virtual for checking if account is locked
userSchema.virtual('isLocked').get(function () {
    return !!(this.lockUntil && this.lockUntil > Date.now());
});

// Constants for account locking
const MAX_LOGIN_ATTEMPTS = 5;
const LOCK_TIME = 2 * 60 * 60 * 1000; // 2 hours

// Method to increment login attempts
userSchema.methods.incLoginAttempts = async function () {
    // If previous lock has expired, reset attempts
    if (this.lockUntil && this.lockUntil < Date.now()) {
        return this.updateOne({
            $set: { loginAttempts: 1 },
            $unset: { lockUntil: 1 },
        });
    }

    const updates = { $inc: { loginAttempts: 1 } };

    // Lock account if we've reached max attempts
    if (this.loginAttempts + 1 >= MAX_LOGIN_ATTEMPTS && !this.isLocked) {
        updates.$set = { lockUntil: Date.now() + LOCK_TIME };
    }

    return this.updateOne(updates);
};

// Method to add refresh token
userSchema.methods.addRefreshToken = async function (token, fingerprint, expiresAt) {
    // Hash the token for storage (we store hash, not actual token)
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

    // Remove expired tokens and limit to 5 active sessions
    const now = new Date();

    // Ensure array exists
    if (!this.refreshTokens) {
        this.refreshTokens = [];
    }

    this.refreshTokens = this.refreshTokens
        .filter((rt) => rt.expiresAt > now)
        .slice(-4); // Keep only last 4, we'll add 1 more

    this.refreshTokens.push({
        token: tokenHash,
        fingerprint,
        expiresAt,
    });

    return this.save();
};

// Method to verify and remove refresh token
userSchema.methods.verifyRefreshToken = function (token, fingerprint) {
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

    const tokenIndex = this.refreshTokens.findIndex(
        (rt) =>
            rt.token === tokenHash &&
            rt.fingerprint === fingerprint &&
            rt.expiresAt > new Date()
    );

    return tokenIndex !== -1;
};

// Method to remove specific refresh token (for logout)
userSchema.methods.removeRefreshToken = async function (token) {
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

    this.refreshTokens = this.refreshTokens.filter(
        (rt) => rt.token !== tokenHash
    );

    return this.save();
};

// Method to remove all refresh tokens (logout from all devices)
userSchema.methods.removeAllRefreshTokens = async function () {
    this.refreshTokens = [];
    return this.save();
};

// Static method to find user by refresh token
userSchema.statics.findByRefreshToken = async function (token, fingerprint) {
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

    return this.findOne({
        isActive: true,
        'refreshTokens.token': tokenHash,
        'refreshTokens.fingerprint': fingerprint,
        'refreshTokens.expiresAt': { $gt: new Date() },
    }).select('+refreshTokens');
};

// Pre-save middleware to sanitize data
userSchema.pre('save', function (next) {
    // Sanitize name
    if (this.isModified('name')) {
        this.name = this.name.replace(/[<>]/g, '');
    }
    next();
});

const User = mongoose.model('User', userSchema);

module.exports = User;
