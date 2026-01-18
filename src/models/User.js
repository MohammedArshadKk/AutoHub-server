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
        phone: {
            type: String,
            trim: true,
            default: null,
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

userSchema.virtual('isLocked').get(function () {
    return !!(this.lockUntil && this.lockUntil > Date.now());
});
const MAX_LOGIN_ATTEMPTS = 5;
const LOCK_TIME = 2 * 60 * 60 * 1000;
userSchema.methods.incLoginAttempts = async function () {
    if (this.lockUntil && this.lockUntil < Date.now()) {
        return this.updateOne({
            $set: { loginAttempts: 1 },
            $unset: { lockUntil: 1 },
        });
    }

    const updates = { $inc: { loginAttempts: 1 } };
    if (this.loginAttempts + 1 >= MAX_LOGIN_ATTEMPTS && !this.isLocked) {
        updates.$set = { lockUntil: Date.now() + LOCK_TIME };
    }

    return this.updateOne(updates);
};

userSchema.methods.addRefreshToken = async function (token, fingerprint, expiresAt) {

    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

    const now = new Date();

    if (!this.refreshTokens) {
        this.refreshTokens = [];
    }

    this.refreshTokens = this.refreshTokens
        .filter((rt) => rt.expiresAt > now)
        .slice(-4);

    this.refreshTokens.push({
        token: tokenHash,
        fingerprint,
        expiresAt,
    });

    return this.save();
};

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

userSchema.methods.removeRefreshToken = async function (token) {
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

    this.refreshTokens = this.refreshTokens.filter(
        (rt) => rt.token !== tokenHash
    );

    return this.save();
};

userSchema.methods.removeAllRefreshTokens = async function () {
    this.refreshTokens = [];
    return this.save();
};
userSchema.statics.findByRefreshToken = async function (token, fingerprint) {
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

    return this.findOne({
        isActive: true,
        'refreshTokens.token': tokenHash,
        'refreshTokens.fingerprint': fingerprint,
        'refreshTokens.expiresAt': { $gt: new Date() },
    }).select('+refreshTokens');
};

userSchema.pre('save', function (next) {
    if (this.isModified('name')) {
        this.name = this.name.replace(/[<>]/g, '');
    }
    next();
});

const User = mongoose.model('User', userSchema);

module.exports = User;
