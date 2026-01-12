const Admin = require('../models/Admin');
const tokenService = require('../services/tokenService');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/AppError');

// Cookie names specific to admin
const ADMIN_COOKIES = {
    ACCESS_TOKEN: 'adminAccessToken',
    REFRESH_TOKEN: 'adminRefreshToken',
    FINGERPRINT: 'adminFp',
};

/**
 * @desc    Login admin
 * @route   POST /api/v1/admin/auth/login
 * @access  Public
 */
exports.login = catchAsync(async (req, res, next) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return next(AppError.badRequest('Please provide email and password'));
    }

    // Find admin
    const admin = await Admin.findOne({ email }).select('+password +refreshTokens');

    if (!admin || !(await admin.comparePassword(password))) {
        return next(AppError.unauthorized('Invalid email or password'));
    }

    // Check if active
    if (!admin.isActive) {
        return next(AppError.forbidden('Account is disabled'));
    }

    // Update last login
    admin.lastLogin = new Date();
    await admin.save({ validateBeforeSave: false });

    // Generate tokens
    const fingerprint = tokenService.generateFingerprint();
    const accessToken = tokenService.generateAccessToken(admin.id, admin.role, fingerprint);
    const refreshToken = tokenService.generateRefreshToken(admin.id, fingerprint);

    // Store refresh token
    const expiresAt = tokenService.getRefreshTokenExpiry();
    await admin.addRefreshToken(refreshToken, fingerprint, expiresAt);

    // Set cookies
    res.cookie(ADMIN_COOKIES.ACCESS_TOKEN, accessToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 2 * 24 * 60 * 60 * 1000, // 2 days
        path: '/',
    });
    res.cookie(ADMIN_COOKIES.REFRESH_TOKEN, refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days for admin
        path: '/api/v1/admin/auth',
    });
    res.cookie(ADMIN_COOKIES.FINGERPRINT, fingerprint, {
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 7 * 24 * 60 * 60 * 1000,
        path: '/',
    });

    res.status(200).json({
        status: 'success',
        data: {
            admin: {
                id: admin.id,
                email: admin.email,
                name: admin.name,
                role: admin.role,
                permissions: admin.permissions,
            },
        },
    });
});

/**
 * @desc    Refresh token
 * @route   POST /api/v1/admin/auth/refresh
 * @access  Public (requires refresh token cookie)
 */
exports.refreshToken = catchAsync(async (req, res, next) => {
    const refreshToken = req.cookies[ADMIN_COOKIES.REFRESH_TOKEN];
    const fingerprint = req.cookies[ADMIN_COOKIES.FINGERPRINT];

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

    // Find admin
    const admin = await Admin.findByRefreshToken(refreshToken, fingerprint);
    if (!admin) {
        return next(AppError.unauthorized('Invalid refresh token'));
    }

    // Remove old token
    await admin.removeRefreshToken(refreshToken);

    // Generate new tokens
    const newFingerprint = tokenService.generateFingerprint();
    const newAccessToken = tokenService.generateAccessToken(admin.id, admin.role, newFingerprint);
    const newRefreshToken = tokenService.generateRefreshToken(admin.id, newFingerprint);

    // Store new refresh token
    const expiresAt = tokenService.getRefreshTokenExpiry();
    await admin.addRefreshToken(newRefreshToken, newFingerprint, expiresAt);

    // Set cookies
    res.cookie(ADMIN_COOKIES.ACCESS_TOKEN, newAccessToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 2 * 24 * 60 * 60 * 1000, // 2 days
        path: '/',
    });
    res.cookie(ADMIN_COOKIES.REFRESH_TOKEN, newRefreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 7 * 24 * 60 * 60 * 1000,
        path: '/api/v1/admin/auth',
    });
    res.cookie(ADMIN_COOKIES.FINGERPRINT, newFingerprint, {
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 7 * 24 * 60 * 60 * 1000,
        path: '/',
    });

    res.status(200).json({
        status: 'success',
        message: 'Token refreshed',
    });
});

/**
 * @desc    Logout
 * @route   POST /api/v1/admin/auth/logout
 * @access  Private
 */
exports.logout = catchAsync(async (req, res, next) => {
    const refreshToken = req.cookies[ADMIN_COOKIES.REFRESH_TOKEN];

    if (refreshToken && req.admin) {
        const admin = await Admin.findById(req.admin.id).select('+refreshTokens');
        if (admin) {
            await admin.removeRefreshToken(refreshToken);
        }
    }

    // Clear cookies
    res.cookie(ADMIN_COOKIES.ACCESS_TOKEN, '', { maxAge: 0, path: '/' });
    res.cookie(ADMIN_COOKIES.REFRESH_TOKEN, '', { maxAge: 0, path: '/api/v1/admin/auth' });
    res.cookie(ADMIN_COOKIES.FINGERPRINT, '', { maxAge: 0, path: '/' });

    res.status(200).json({
        status: 'success',
        message: 'Logged out successfully',
    });
});

/**
 * @desc    Get current admin profile
 * @route   GET /api/v1/admin/auth/me
 * @access  Private
 */
exports.getMe = catchAsync(async (req, res, next) => {
    const admin = await Admin.findById(req.admin.id);

    if (!admin) {
        return next(AppError.notFound('Admin not found'));
    }

    res.status(200).json({
        status: 'success',
        data: {
            admin,
        },
    });
});

/**
 * @desc    Create new admin (super_admin only)
 * @route   POST /api/v1/admin/auth/create
 * @access  Private (super_admin)
 */
exports.createAdmin = catchAsync(async (req, res, next) => {
    // Only super_admin can create admins
    if (req.admin.role !== 'super_admin') {
        return next(AppError.forbidden('Only super admin can create admin accounts'));
    }

    const { email, password, name, permissions } = req.body;

    const existingAdmin = await Admin.findOne({ email });
    if (existingAdmin) {
        return next(AppError.conflict('Email already registered'));
    }

    const admin = await Admin.create({
        email,
        password,
        name,
        permissions: permissions || ['products', 'orders', 'sellers'],
        role: 'admin', // Can only create regular admins
    });

    res.status(201).json({
        status: 'success',
        data: {
            admin: {
                id: admin.id,
                email: admin.email,
                name: admin.name,
                role: admin.role,
                permissions: admin.permissions,
            },
        },
    });
});

// Export cookie names for middleware
exports.ADMIN_COOKIES = ADMIN_COOKIES;
