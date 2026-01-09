const Seller = require('../models/Seller');
const tokenService = require('../services/tokenService');
const { setAuthCookies, clearAuthCookies, COOKIE_NAMES } = require('../utils/cookieConfig');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/AppError');

// Cookie names specific to seller
const SELLER_COOKIES = {
    ACCESS_TOKEN: 'sellerAccessToken',
    REFRESH_TOKEN: 'sellerRefreshToken',
    FINGERPRINT: 'sellerFp',
};

/**
 * @desc    Register new seller
 * @route   POST /api/v1/seller/auth/register
 * @access  Public
 */
exports.register = catchAsync(async (req, res, next) => {
    const { email, password, businessName, ownerName, phone, businessType } = req.body;

    // Check if seller exists
    const existingSeller = await Seller.findOne({ email });
    if (existingSeller) {
        return next(AppError.conflict('Email already registered'));
    }

    // Create seller
    const seller = await Seller.create({
        email,
        password,
        businessName,
        ownerName,
        phone,
        businessType,
    });

    // Generate tokens
    const fingerprint = tokenService.generateFingerprint();
    const accessToken = tokenService.generateAccessToken(seller.id, 'seller', fingerprint);
    const refreshToken = tokenService.generateRefreshToken(seller.id, fingerprint);

    // Store refresh token
    const expiresAt = tokenService.getRefreshTokenExpiry();
    await seller.addRefreshToken(refreshToken, fingerprint, expiresAt);

    // Set cookies
    res.cookie(SELLER_COOKIES.ACCESS_TOKEN, accessToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 15 * 60 * 1000,
        path: '/',
    });
    res.cookie(SELLER_COOKIES.REFRESH_TOKEN, refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 90 * 24 * 60 * 60 * 1000,
        path: '/api/v1/seller/auth',
    });
    res.cookie(SELLER_COOKIES.FINGERPRINT, fingerprint, {
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 90 * 24 * 60 * 60 * 1000,
        path: '/api/v1/seller/auth',
    });

    res.status(201).json({
        status: 'success',
        message: 'Seller registered successfully. Please complete KYC for verification.',
        data: {
            seller: {
                id: seller.id,
                email: seller.email,
                businessName: seller.businessName,
                verificationStatus: seller.verificationStatus,
            },
        },
    });
});

/**
 * @desc    Login seller
 * @route   POST /api/v1/seller/auth/login
 * @access  Public
 */
exports.login = catchAsync(async (req, res, next) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return next(AppError.badRequest('Please provide email and password'));
    }

    // Find seller
    const seller = await Seller.findOne({ email }).select('+password +refreshTokens');

    if (!seller || !(await seller.comparePassword(password))) {
        return next(AppError.unauthorized('Invalid email or password'));
    }

    // Check if blocked
    if (seller.isBlocked) {
        return next(AppError.forbidden(`Account blocked: ${seller.blockReason || 'Contact support'}`));
    }

    // Update last login
    seller.lastLogin = new Date();
    await seller.save({ validateBeforeSave: false });

    // Generate tokens
    const fingerprint = tokenService.generateFingerprint();
    const accessToken = tokenService.generateAccessToken(seller.id, 'seller', fingerprint);
    const refreshToken = tokenService.generateRefreshToken(seller.id, fingerprint);

    // Store refresh token
    const expiresAt = tokenService.getRefreshTokenExpiry();
    await seller.addRefreshToken(refreshToken, fingerprint, expiresAt);

    // Set cookies
    res.cookie(SELLER_COOKIES.ACCESS_TOKEN, accessToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 15 * 60 * 1000,
        path: '/',
    });
    res.cookie(SELLER_COOKIES.REFRESH_TOKEN, refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 90 * 24 * 60 * 60 * 1000,
        path: '/api/v1/seller/auth',
    });
    res.cookie(SELLER_COOKIES.FINGERPRINT, fingerprint, {
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 90 * 24 * 60 * 60 * 1000,
        path: '/api/v1/seller/auth',
    });

    res.status(200).json({
        status: 'success',
        data: {
            seller: {
                id: seller.id,
                email: seller.email,
                businessName: seller.businessName,
                verificationStatus: seller.verificationStatus,
                isActive: seller.isActive,
            },
        },
    });
});

/**
 * @desc    Refresh token
 * @route   POST /api/v1/seller/auth/refresh
 * @access  Public (requires refresh token cookie)
 */
exports.refreshToken = catchAsync(async (req, res, next) => {
    const refreshToken = req.cookies[SELLER_COOKIES.REFRESH_TOKEN];
    const fingerprint = req.cookies[SELLER_COOKIES.FINGERPRINT];

    if (!refreshToken || !fingerprint) {
        return next(AppError.unauthorized('No refresh token'));
    }

    // Verify token
    const { valid, decoded, error } = tokenService.verifyRefreshToken(refreshToken);
    if (!valid) {
        return next(AppError.unauthorized(error === 'expired' ? 'Token expired' : 'Invalid token'));
    }

    // Verify fingerprint
    if (!tokenService.verifyFingerprint(fingerprint, decoded.fp)) {
        return next(AppError.unauthorized('Invalid fingerprint'));
    }

    // Find seller
    const seller = await Seller.findByRefreshToken(refreshToken, fingerprint);
    if (!seller) {
        return next(AppError.unauthorized('Invalid refresh token'));
    }

    // Remove old token
    await seller.removeRefreshToken(refreshToken);

    // Generate new tokens
    const newFingerprint = tokenService.generateFingerprint();
    const newAccessToken = tokenService.generateAccessToken(seller.id, 'seller', newFingerprint);
    const newRefreshToken = tokenService.generateRefreshToken(seller.id, newFingerprint);

    // Store new refresh token
    const expiresAt = tokenService.getRefreshTokenExpiry();
    await seller.addRefreshToken(newRefreshToken, newFingerprint, expiresAt);

    // Set cookies
    res.cookie(SELLER_COOKIES.ACCESS_TOKEN, newAccessToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 15 * 60 * 1000,
        path: '/',
    });
    res.cookie(SELLER_COOKIES.REFRESH_TOKEN, newRefreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 90 * 24 * 60 * 60 * 1000,
        path: '/api/v1/seller/auth',
    });
    res.cookie(SELLER_COOKIES.FINGERPRINT, newFingerprint, {
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 90 * 24 * 60 * 60 * 1000,
        path: '/api/v1/seller/auth',
    });

    res.status(200).json({
        status: 'success',
        message: 'Token refreshed',
    });
});

/**
 * @desc    Logout
 * @route   POST /api/v1/seller/auth/logout
 * @access  Private
 */
exports.logout = catchAsync(async (req, res, next) => {
    const refreshToken = req.cookies[SELLER_COOKIES.REFRESH_TOKEN];

    if (refreshToken && req.seller) {
        const seller = await Seller.findById(req.seller.id).select('+refreshTokens');
        if (seller) {
            await seller.removeRefreshToken(refreshToken);
        }
    }

    // Clear cookies
    res.cookie(SELLER_COOKIES.ACCESS_TOKEN, '', { maxAge: 0, path: '/' });
    res.cookie(SELLER_COOKIES.REFRESH_TOKEN, '', { maxAge: 0, path: '/api/v1/seller/auth' });
    res.cookie(SELLER_COOKIES.FINGERPRINT, '', { maxAge: 0, path: '/api/v1/seller/auth' });

    res.status(200).json({
        status: 'success',
        message: 'Logged out successfully',
    });
});

/**
 * @desc    Get current seller profile
 * @route   GET /api/v1/seller/auth/me
 * @access  Private
 */
exports.getMe = catchAsync(async (req, res, next) => {
    const seller = await Seller.findById(req.seller.id);

    if (!seller) {
        return next(AppError.notFound('Seller not found'));
    }

    res.status(200).json({
        status: 'success',
        data: {
            seller,
        },
    });
});

/**
 * @desc    Update seller profile
 * @route   PATCH /api/v1/seller/auth/me
 * @access  Private
 */
exports.updateMe = catchAsync(async (req, res, next) => {
    // Fields allowed to update
    const allowedFields = [
        'businessName', 'businessType', 'ownerName', 'description', 'logo',
        'phone', 'alternatePhone', 'address', 'settings',
    ];

    const updates = {};
    Object.keys(req.body).forEach((key) => {
        if (allowedFields.includes(key)) {
            updates[key] = req.body[key];
        }
    });

    // Don't allow password update here
    delete updates.password;
    delete updates.email;

    const seller = await Seller.findByIdAndUpdate(req.seller.id, updates, {
        new: true,
        runValidators: true,
    });

    res.status(200).json({
        status: 'success',
        data: {
            seller,
        },
    });
});

/**
 * @desc    Submit KYC documents
 * @route   PATCH /api/v1/seller/auth/kyc
 * @access  Private
 */
exports.submitKyc = catchAsync(async (req, res, next) => {
    const { kyc, address } = req.body;

    const seller = await Seller.findById(req.seller.id);

    if (!seller) {
        return next(AppError.notFound('Seller not found'));
    }

    // Update KYC and address
    if (kyc) seller.kyc = { ...seller.kyc, ...kyc };
    if (address) seller.address = { ...seller.address, ...address };

    // Move to under review
    seller.verificationStatus = 'UNDER_REVIEW';

    await seller.save();

    res.status(200).json({
        status: 'success',
        message: 'KYC submitted for review',
        data: {
            seller,
        },
    });
});

// Export cookie names for middleware
exports.SELLER_COOKIES = SELLER_COOKIES;
