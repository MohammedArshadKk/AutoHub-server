const passport = require('passport');
const User = require('../models/User');
const tokenService = require('../services/tokenService');
const { setAuthCookies, clearAuthCookies, COOKIE_NAMES } = require('../utils/cookieConfig');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/AppError');
const env = require('../config/env');

/**
 * @desc    Initiate Google OAuth flow
 * @route   GET /api/v1/auth/google
 * @access  Public
 */
exports.initiateGoogleAuth = passport.authenticate('google', {
    scope: ['profile', 'email'],
    prompt: 'select_account', // Always show account selection
});

/**
 * @desc    Handle Google OAuth callback
 * @route   GET /api/v1/auth/google/callback
 * @access  Public
 */
exports.googleCallback = (req, res, next) => {
    passport.authenticate('google', { session: false }, async (err, user, info) => {
        try {
            if (err) {
                console.error('Google OAuth Error:', err);
                return res.redirect(`${env.frontendUrl}/login?error=oauth_error`);
            }

            if (!user) {
                return res.redirect(`${env.frontendUrl}/login?error=no_user`);
            }

            // Check if user is active
            if (!user.isActive) {
                return res.redirect(`${env.frontendUrl}/login?error=account_disabled`);
            }

            // Check if account is locked
            if (user.isLocked) {
                return res.redirect(`${env.frontendUrl}/login?error=account_locked`);
            }

            // Generate fingerprint for token binding
            const fingerprint = tokenService.generateFingerprint();

            // Generate tokens
            const accessToken = tokenService.generateAccessToken(user.id, user.role, fingerprint);
            const refreshToken = tokenService.generateRefreshToken(user.id, fingerprint);

            // Store refresh token in database
            const expiresAt = tokenService.getRefreshTokenExpiry();
            await user.addRefreshToken(refreshToken, fingerprint, expiresAt);

            // Set cookies
            setAuthCookies(res, accessToken, refreshToken, fingerprint);

            // Redirect to frontend
            res.redirect(`${env.frontendUrl}/auth/success`);
        } catch (error) {
            console.error('Callback Error:', error);
            res.redirect(`${env.frontendUrl}/login?error=server_error`);
        }
    })(req, res, next);
};

/**
 * @desc    Refresh access token using refresh token
 * @route   POST /api/v1/auth/refresh
 * @access  Public (requires valid refresh token cookie)
 */
exports.refreshToken = catchAsync(async (req, res, next) => {
    const refreshToken = req.cookies[COOKIE_NAMES.REFRESH_TOKEN];
    const fingerprint = req.cookies[COOKIE_NAMES.FINGERPRINT];

    if (!refreshToken || !fingerprint) {
        return next(AppError.unauthorized('No refresh token provided'));
    }

    // Verify refresh token
    const { valid, decoded, error } = tokenService.verifyRefreshToken(refreshToken);

    if (!valid) {
        clearAuthCookies(res);
        return next(
            AppError.unauthorized(error === 'expired' ? 'Refresh token expired' : 'Invalid refresh token')
        );
    }

    // Verify fingerprint
    if (!tokenService.verifyFingerprint(fingerprint, decoded.fp)) {
        clearAuthCookies(res);
        return next(AppError.unauthorized('Invalid token fingerprint'));
    }

    // Find user and verify refresh token exists
    const user = await User.findByRefreshToken(refreshToken, fingerprint);

    if (!user) {
        clearAuthCookies(res);
        return next(AppError.unauthorized('Invalid refresh token'));
    }

    // Check if user is still active
    if (!user.isActive) {
        clearAuthCookies(res);
        return next(AppError.unauthorized('Account is disabled'));
    }

    // Token Rotation: Remove old refresh token
    await user.removeRefreshToken(refreshToken);

    // Generate new fingerprint for rotation
    const newFingerprint = tokenService.generateFingerprint();

    // Generate new tokens
    const newAccessToken = tokenService.generateAccessToken(user.id, user.role, newFingerprint);
    const newRefreshToken = tokenService.generateRefreshToken(user.id, newFingerprint);

    // Store new refresh token
    const expiresAt = tokenService.getRefreshTokenExpiry();
    await user.addRefreshToken(newRefreshToken, newFingerprint, expiresAt);

    // Set new cookies
    setAuthCookies(res, newAccessToken, newRefreshToken, newFingerprint);

    res.status(200).json({
        status: 'success',
        message: 'Token refreshed successfully',
    });
});

/**
 * @desc    Logout user (single device)
 * @route   POST /api/v1/auth/logout
 * @access  Private
 */
exports.logout = catchAsync(async (req, res, next) => {
    const refreshToken = req.cookies[COOKIE_NAMES.REFRESH_TOKEN];

    if (refreshToken && req.user) {
        // Remove refresh token from database
        const user = await User.findById(req.user.id).select('+refreshTokens');
        if (user) {
            await user.removeRefreshToken(refreshToken);
        }
    }

    // Clear cookies
    clearAuthCookies(res);

    res.status(200).json({
        status: 'success',
        message: 'Logged out successfully',
    });
});

/**
 * @desc    Logout from all devices
 * @route   POST /api/v1/auth/logout-all
 * @access  Private
 */
exports.logoutAll = catchAsync(async (req, res, next) => {
    const user = await User.findById(req.user.id).select('+refreshTokens');

    if (user) {
        await user.removeAllRefreshTokens();
    }

    // Clear cookies
    clearAuthCookies(res);

    res.status(200).json({
        status: 'success',
        message: 'Logged out from all devices',
    });
});

/**
 * @desc    Get current user profile
 * @route   GET /api/v1/auth/me
 * @access  Private
 */
exports.getMe = catchAsync(async (req, res, next) => {
    const user = await User.findById(req.user.id);

    if (!user) {
        return next(AppError.notFound('User not found'));
    }

    res.status(200).json({
        status: 'success',
        data: {
            user: {
                id: user.id,
                email: user.email,
                name: user.name,
                avatar: user.avatar,
                role: user.role,
                isEmailVerified: user.isEmailVerified,
                lastLogin: user.lastLogin,
                createdAt: user.createdAt,
            },
        },
    });
});

/**
 * @desc    Update current user profile
 * @route   PATCH /api/v1/auth/me
 * @access  Private
 */
exports.updateMe = catchAsync(async (req, res, next) => {
    // Fields allowed to be updated
    const allowedFields = ['name', 'phone', 'addresses'];
    const updates = {};

    Object.keys(req.body).forEach((key) => {
        if (allowedFields.includes(key)) {
            updates[key] = req.body[key];
        }
    });

    if (Object.keys(updates).length === 0) {
        return next(AppError.badRequest('No valid fields to update'));
    }

    const user = await User.findByIdAndUpdate(req.user.id, updates, {
        new: true,
        runValidators: true,
    });

    res.status(200).json({
        status: 'success',
        data: {
            user: {
                id: user.id,
                email: user.email,
                name: user.name,
                avatar: user.avatar,
                phone: user.phone,
                addresses: user.addresses,
                role: user.role,
            },
        },
    });
});

/**
 * @desc    Check authentication status
 * @route   GET /api/v1/auth/status
 * @access  Public
 */
exports.checkAuthStatus = catchAsync(async (req, res, next) => {
    const accessToken = req.cookies[COOKIE_NAMES.ACCESS_TOKEN];

    if (!accessToken) {
        return res.status(200).json({
            status: 'success',
            data: {
                isAuthenticated: false,
            },
        });
    }

    const { valid, decoded } = tokenService.verifyAccessToken(accessToken);

    if (!valid) {
        return res.status(200).json({
            status: 'success',
            data: {
                isAuthenticated: false,
            },
        });
    }

    const user = await User.findById(decoded.userId);

    if (!user || !user.isActive) {
        return res.status(200).json({
            status: 'success',
            data: {
                isAuthenticated: false,
            },
        });
    }

    res.status(200).json({
        status: 'success',
        data: {
            isAuthenticated: true,
            user: {
                id: user.id,
                email: user.email,
                name: user.name,
                avatar: user.avatar,
                role: user.role,
            },
        },
    });
});
