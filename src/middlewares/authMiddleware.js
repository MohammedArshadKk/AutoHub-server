const User = require('../models/User');
const tokenService = require('../services/tokenService');
const { COOKIE_NAMES } = require('../utils/cookieConfig');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/AppError');

/**
 * Protect routes - Verify access token
 */
exports.protect = catchAsync(async (req, res, next) => {
    // Get token from cookie
    const accessToken = req.cookies[COOKIE_NAMES.ACCESS_TOKEN];
    const fingerprint = req.cookies[COOKIE_NAMES.FINGERPRINT];

    if (!accessToken) {
        return next(AppError.unauthorized('Please login to access this resource'));
    }

    // Verify token
    const { valid, decoded, error } = tokenService.verifyAccessToken(accessToken);

    if (!valid) {
        if (error === 'expired') {
            return next(AppError.unauthorized('Token expired. Please refresh your token.'));
        }
        return next(AppError.unauthorized('Invalid token'));
    }

    // Verify fingerprint if present
    if (fingerprint && decoded.fp) {
        if (!tokenService.verifyFingerprint(fingerprint, decoded.fp)) {
            return next(AppError.unauthorized('Invalid token fingerprint'));
        }
    }

    // Check if user still exists
    const user = await User.findById(decoded.userId);

    if (!user) {
        return next(AppError.unauthorized('User no longer exists'));
    }

    // Check if user is active
    if (!user.isActive) {
        return next(AppError.unauthorized('Your account has been deactivated'));
    }

    // Check if account is locked
    if (user.isLocked) {
        return next(
            AppError.unauthorized('Your account is temporarily locked. Please try again later.')
        );
    }

    // Attach user to request
    req.user = {
        id: user.id,
        email: user.email,
        role: user.role,
    };

    next();
});

/**
 * Restrict access to specific roles
 */
exports.restrictTo = (...roles) => {
    return (req, res, next) => {
        if (!roles.includes(req.user.role)) {
            return next(
                AppError.forbidden('You do not have permission to perform this action')
            );
        }
        next();
    };
};

/**
 * Optional authentication - Attaches user if authenticated, but doesn't fail if not
 */
exports.optionalAuth = catchAsync(async (req, res, next) => {
    const accessToken = req.cookies[COOKIE_NAMES.ACCESS_TOKEN];

    if (!accessToken) {
        return next();
    }

    const { valid, decoded } = tokenService.verifyAccessToken(accessToken);

    if (!valid) {
        return next();
    }

    const user = await User.findById(decoded.userId);

    if (user && user.isActive) {
        req.user = {
            id: user.id,
            email: user.email,
            role: user.role,
        };
    }

    next();
});
