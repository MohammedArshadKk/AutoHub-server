const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const validator = require('validator');
const crypto = require('crypto');

const sellerSchema = new mongoose.Schema(
    {
        // Authentication
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

        // Business Information
        businessName: {
            type: String,
            required: [true, 'Business name is required'],
            trim: true,
            maxlength: [200, 'Business name cannot exceed 200 characters'],
        },
        businessType: {
            type: String,
            enum: {
                values: ['Individual', 'Sole Proprietorship', 'Partnership', 'Private Limited', 'LLP'],
                message: 'Invalid business type',
            },
            default: 'Individual',
        },
        ownerName: {
            type: String,
            required: [true, 'Owner name is required'],
            trim: true,
        },
        description: {
            type: String,
            maxlength: [1000, 'Description cannot exceed 1000 characters'],
        },
        logo: {
            type: String,
        },

        // Contact Information
        phone: {
            type: String,
            required: [true, 'Phone number is required'],
            trim: true,
        },
        alternatePhone: {
            type: String,
            trim: true,
        },

        // Address
        address: {
            street: { type: String },
            city: { type: String },
            state: { type: String },
            postalCode: { type: String },
            country: { type: String, default: 'India' },
        },

        // KYC / Verification Documents
        kyc: {
            idType: {
                type: String,
                enum: ['Aadhaar', 'PAN', 'Passport', 'Driving License', 'Voter ID'],
            },
            idNumber: {
                type: String,
                select: false,
            },
            idDocument: {
                type: String,
            },
            businessLicense: {
                type: String,
            },
            gstin: {
                type: String,
                uppercase: true,
                trim: true,
            },
            bankName: {
                type: String,
                select: false,
            },
            accountNumber: {
                type: String,
                select: false,
            },
            ifscCode: {
                type: String,
                uppercase: true,
                select: false,
            },
            accountHolderName: {
                type: String,
                select: false,
            },
        },

        // Verification Status
        verificationStatus: {
            type: String,
            enum: {
                values: ['PENDING', 'UNDER_REVIEW', 'VERIFIED', 'REJECTED'],
                message: 'Invalid verification status',
            },
            default: 'PENDING',
        },
        verificationRejectionReason: {
            type: String,
            maxlength: 500,
        },
        verifiedAt: {
            type: Date,
        },
        verifiedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Admin',
        },

        // Seller Metrics
        metrics: {
            totalProducts: { type: Number, default: 0 },
            activeProducts: { type: Number, default: 0 },
            totalOrders: { type: Number, default: 0 },
            completedOrders: { type: Number, default: 0 },
            totalRevenue: { type: Number, default: 0 },
            rating: { type: Number, default: 0, min: 0, max: 5 },
            reviewCount: { type: Number, default: 0 },
        },

        // Commission & Payout
        commissionRate: {
            type: Number,
            default: 10,
            min: 0,
            max: 100,
        },
        pendingPayout: {
            type: Number,
            default: 0,
        },
        totalPaidOut: {
            type: Number,
            default: 0,
        },

        // Status
        isActive: {
            type: Boolean,
            default: false,
        },
        isBlocked: {
            type: Boolean,
            default: false,
        },
        blockReason: {
            type: String,
        },
        lastLogin: {
            type: Date,
        },
        passwordChangedAt: {
            type: Date,
        },

        // Refresh Tokens
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

        // Settings
        settings: {
            autoAcceptOrders: { type: Boolean, default: false },
            notifyOnNewOrder: { type: Boolean, default: true },
            notifyOnReview: { type: Boolean, default: true },
        },
    },
    {
        timestamps: true,
        toJSON: { virtuals: true },
        toObject: { virtuals: true },
    }
);

// Indexes
sellerSchema.index({ email: 1 });
sellerSchema.index({ verificationStatus: 1, isActive: 1 });
sellerSchema.index({ businessName: 'text' });

// Hash password before saving
sellerSchema.pre('save', async function (next) {
    if (!this.isModified('password')) return next();

    this.password = await bcrypt.hash(this.password, 12);
    this.passwordChangedAt = Date.now() - 1000;
    next();
});

// Compare password
sellerSchema.methods.comparePassword = async function (candidatePassword) {
    return await bcrypt.compare(candidatePassword, this.password);
};

// Check if password changed after token issued
sellerSchema.methods.changedPasswordAfter = function (tokenTimestamp) {
    if (this.passwordChangedAt) {
        const changedTimestamp = parseInt(this.passwordChangedAt.getTime() / 1000, 10);
        return tokenTimestamp < changedTimestamp;
    }
    return false;
};

// Virtual: Check if seller can list products
sellerSchema.virtual('canListProducts').get(function () {
    return this.verificationStatus === 'VERIFIED' && this.isActive && !this.isBlocked;
});

// Add refresh token
sellerSchema.methods.addRefreshToken = async function (token, fingerprint, expiresAt) {
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
sellerSchema.methods.removeRefreshToken = async function (token) {
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

    this.refreshTokens = this.refreshTokens.filter(
        (rt) => rt.token !== tokenHash
    );

    return this.save({ validateBeforeSave: false });
};

// Find by refresh token
sellerSchema.statics.findByRefreshToken = async function (token, fingerprint) {
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

    return this.findOne({
        'refreshTokens.token': tokenHash,
        'refreshTokens.fingerprint': fingerprint,
        'refreshTokens.expiresAt': { $gt: new Date() },
    }).select('+refreshTokens +password');
};

// Verify seller
sellerSchema.methods.verify = async function (adminId) {
    this.verificationStatus = 'VERIFIED';
    this.isActive = true;
    this.verifiedAt = new Date();
    this.verifiedBy = adminId;
    this.verificationRejectionReason = undefined;
    return this.save();
};

// Reject verification
sellerSchema.methods.rejectVerification = async function (reason) {
    this.verificationStatus = 'REJECTED';
    this.verificationRejectionReason = reason;
    return this.save();
};

// Block seller
sellerSchema.methods.block = async function (reason) {
    this.isBlocked = true;
    this.blockReason = reason;
    return this.save();
};

// Unblock seller
sellerSchema.methods.unblock = async function () {
    this.isBlocked = false;
    this.blockReason = undefined;
    return this.save();
};

const Seller = mongoose.model('Seller', sellerSchema);

module.exports = Seller;
