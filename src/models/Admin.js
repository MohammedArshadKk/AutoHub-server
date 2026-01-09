const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const validator = require('validator');

const adminSchema = new mongoose.Schema(
    {
        email: {
            type: String,
            required: [true, 'Email is required'],
            unique: true,
            lowercase: true,
            trim: true,
            validate: [validator.isEmail, 'Please provide a valid email'],
        },
        password: {
            type: String,
            required: [true, 'Password is required'],
            minlength: [8, 'Password must be at least 8 characters'],
            select: false,
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
                values: ['admin', 'super_admin'],
                message: 'Role must be admin or super_admin',
            },
            default: 'admin',
        },
        permissions: {
            type: [String],
            default: ['products', 'orders', 'sellers'],
            enum: ['products', 'orders', 'sellers', 'users', 'payouts', 'settings'],
        },
        isActive: {
            type: Boolean,
            default: true,
        },
        lastLogin: {
            type: Date,
            default: null,
        },
        passwordChangedAt: {
            type: Date,
        },
        refreshTokens: {
            type: [
                {
                    token: String,
                    fingerprint: String,
                    expiresAt: Date,
                    createdAt: { type: Date, default: Date.now },
                },
            ],
            default: [],
            select: false,
        },
    },
    {
        timestamps: true,
    }
);

// Index
adminSchema.index({ email: 1 });

// Hash password before saving
adminSchema.pre('save', async function (next) {
    if (!this.isModified('password')) return next();

    this.password = await bcrypt.hash(this.password, 12);
    this.passwordChangedAt = Date.now() - 1000;
    next();
});

// Compare password
adminSchema.methods.comparePassword = async function (candidatePassword) {
    return await bcrypt.compare(candidatePassword, this.password);
};

// Check if password changed after token issued
adminSchema.methods.changedPasswordAfter = function (tokenTimestamp) {
    if (this.passwordChangedAt) {
        const changedTimestamp = parseInt(this.passwordChangedAt.getTime() / 1000, 10);
        return tokenTimestamp < changedTimestamp;
    }
    return false;
};

// Add refresh token
adminSchema.methods.addRefreshToken = async function (token, fingerprint, expiresAt) {
    const crypto = require('crypto');
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

    const now = new Date();
    this.refreshTokens = this.refreshTokens
        .filter((rt) => rt.expiresAt > now)
        .slice(-4);

    this.refreshTokens.push({
        token: tokenHash,
        fingerprint,
        expiresAt,
    });

    return this.save({ validateBeforeSave: false });
};

// Remove refresh token
adminSchema.methods.removeRefreshToken = async function (token) {
    const crypto = require('crypto');
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

    this.refreshTokens = this.refreshTokens.filter(
        (rt) => rt.token !== tokenHash
    );

    return this.save({ validateBeforeSave: false });
};

// Find by refresh token
adminSchema.statics.findByRefreshToken = async function (token, fingerprint) {
    const crypto = require('crypto');
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

    return this.findOne({
        isActive: true,
        'refreshTokens.token': tokenHash,
        'refreshTokens.fingerprint': fingerprint,
        'refreshTokens.expiresAt': { $gt: new Date() },
    }).select('+refreshTokens +password');
};

const Admin = mongoose.model('Admin', adminSchema);

module.exports = Admin;
