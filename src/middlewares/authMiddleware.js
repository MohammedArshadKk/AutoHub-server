const Seller = require('../models/Seller');
const Admin = require('../models/Admin');
const User = require('../models/User');
const tokenService = require('../services/tokenService');
const { COOKIE_NAMES } = require('../utils/cookieConfig');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/AppError');

// Cookie names
const SELLER_COOKIES = {
    ACCESS_TOKEN: 'sellerAccessToken',
    FINGERPRINT: 'sellerFp',
};

const ADMIN_COOKIES = {
    ACCESS_TOKEN: 'adminAccessToken',
    FINGERPRINT: 'adminFp',
};

/**
 * Protect routes - Verify buyer access token
 */
exports.protect = catchAsync(async (req, res, next) => {
    const accessToken = req.cookies[COOKIE_NAMES.ACCESS_TOKEN];
    const fingerprint = req.cookies[COOKIE_NAMES.FINGERPRINT];

    if (!accessToken) {
        return next(AppError.unauthorized('Please login to access this resource'));
    }

    const { valid, decoded, error } = tokenService.verifyAccessToken(accessToken);

    if (!valid) {
        if (error === 'expired') {
            return next(AppError.unauthorized('Token expired. Please refresh your token.'));
        }
        return next(AppError.unauthorized('Invalid token'));
    }

    if (fingerprint && decoded.fp) {
        if (!tokenService.verifyFingerprint(fingerprint, decoded.fp)) {
            return next(AppError.unauthorized('Invalid token fingerprint'));
        }
    }

    const user = await User.findById(decoded.userId);

    if (!user) {
        return next(AppError.unauthorized('User no longer exists'));
    }

    if (!user.isActive) {
        return next(AppError.unauthorized('Your account has been deactivated'));
    }

    req.user = {
        id: user.id,
        email: user.email,
        role: user.role,
    };

    next();
});

/**
 * Protect buyer routes - Verify buyer access token and role
 */
exports.protectBuyer = catchAsync(async (req, res, next) => {
    const accessToken = req.cookies[COOKIE_NAMES.ACCESS_TOKEN];
    const fingerprint = req.cookies[COOKIE_NAMES.FINGERPRINT];

    if (!accessToken) {
        return next(AppError.unauthorized('Please login to access this resource'));
    }

    const { valid, decoded, error } = tokenService.verifyAccessToken(accessToken);

    if (!valid) {
        if (error === 'expired') {
            return next(AppError.unauthorized('Token expired. Please refresh your token.'));
        }
        return next(AppError.unauthorized('Invalid token'));
    }

    if (fingerprint && decoded.fp) {
        if (!tokenService.verifyFingerprint(fingerprint, decoded.fp)) {
            return next(AppError.unauthorized('Invalid token fingerprint'));
        }
    }

    const user = await User.findById(decoded.userId);

    if (!user) {
        return next(AppError.unauthorized('User no longer exists'));
    }

    if (!user.isActive) {
        return next(AppError.unauthorized('Your account has been deactivated'));
    }

    // Check if user is a buyer
    if (user.role !== 'buyer') {
        return next(AppError.forbidden('This resource is only accessible to buyers'));
    }

    req.user = user; // Attach full user object for buyer operations

    next();
});

/**
 * Protect seller routes
 */
exports.protectSeller = catchAsync(async (req, res, next) => {
    const accessToken = req.cookies[SELLER_COOKIES.ACCESS_TOKEN];
    const fingerprint = req.cookies[SELLER_COOKIES.FINGERPRINT];

    if (!accessToken) {
        return next(AppError.unauthorized('Please login to access this resource'));
    }

    const { valid, decoded, error } = tokenService.verifyAccessToken(accessToken);

    if (!valid) {
        if (error === 'expired') {
            return next(AppError.unauthorized('Token expired. Please refresh your token.'));
        }
        return next(AppError.unauthorized('Invalid token'));
    }

    if (fingerprint && decoded.fp) {
        if (!tokenService.verifyFingerprint(fingerprint, decoded.fp)) {
            return next(AppError.unauthorized('Invalid token fingerprint'));
        }
    }

    const seller = await Seller.findById(decoded.userId);

    if (!seller) {
        return next(AppError.unauthorized('Seller no longer exists'));
    }

    if (seller.isBlocked) {
        return next(
            AppError.forbidden(
                `Your account has been blocked. Reason: ${seller.blockReason || 'Violation of terms'}`
            )
        );
    }

    req.seller = {
        id: seller.id,
        email: seller.email,
        businessName: seller.businessName,
        verificationStatus: seller.verificationStatus,
        isActive: seller.isActive,
        isBlocked: seller.isBlocked,
        blockReason: seller.blockReason,
        canListProducts: seller.canListProducts,
    };

    next();
});

/**
 * Protect admin routes
 */
exports.protectAdmin = catchAsync(async (req, res, next) => {
    const accessToken = req.cookies[ADMIN_COOKIES.ACCESS_TOKEN];
    const fingerprint = req.cookies[ADMIN_COOKIES.FINGERPRINT];

    if (!accessToken) {
        return next(AppError.unauthorized('Please login to access this resource'));
    }

    const { valid, decoded, error } = tokenService.verifyAccessToken(accessToken);

    if (!valid) {
        if (error === 'expired') {
            return next(AppError.unauthorized('Token expired. Please refresh your token.'));
        }
        return next(AppError.unauthorized('Invalid token'));
    }

    if (fingerprint && decoded.fp) {
        if (!tokenService.verifyFingerprint(fingerprint, decoded.fp)) {
            return next(AppError.unauthorized('Invalid token fingerprint'));
        }
    }

    const admin = await Admin.findById(decoded.userId);

    if (!admin) {
        return next(AppError.unauthorized('Admin no longer exists'));
    }

    if (!admin.isActive) {
        return next(AppError.unauthorized('Your account has been deactivated'));
    }

    req.admin = {
        id: admin.id,
        email: admin.email,
        name: admin.name,
        role: admin.role,
        permissions: admin.permissions,
    };

    next();
});

/**
 * Global block check for sellers (middleware)
 */
exports.checkBlockedSeller = (req, res, next) => {
    if (req.seller && req.seller.isBlocked) {
        return next(
            AppError.forbidden(
                `Your account has been blocked. Reason: ${req.seller.blockReason || 'Violation of terms'}`
            )
        );
    }
    next();
};

/**
 * Require verified seller
 */
exports.requireVerifiedSeller = (req, res, next) => {
    if (!req.seller.canListProducts) {
        return next(
            AppError.forbidden('Your seller account must be verified to perform this action')
        );
    }
    next();
};

/**
 * Check admin permission
 */
exports.hasPermission = (...permissions) => {
    return (req, res, next) => {
        if (req.admin.role === 'super_admin') {
            return next(); // Super admin has all permissions
        }

        const hasAllPermissions = permissions.every((p) =>
            req.admin.permissions.includes(p)
        );

        if (!hasAllPermissions) {
            return next(
                AppError.forbidden('You do not have permission to perform this action')
            );
        }

        next();
    };
};

/**
 * Restrict access to specific roles
 */
exports.restrictTo = (...roles) => {
    return (req, res, next) => {
        const userRole = req.user?.role || req.admin?.role;
        if (!roles.includes(userRole)) {
            return next(
                AppError.forbidden('You do not have permission to perform this action')
            );
        }
        next();
    };
};

/**
 * Optional authentication
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

/**
 * Protect routes - Accept both admin and seller authentication
 * Used for endpoints that both admins and sellers can access (like image upload)
 */
exports.protectAdminOrSeller = catchAsync(async (req, res, next) => {
    // Check for admin cookies first
    const adminAccessToken = req.cookies[ADMIN_COOKIES.ACCESS_TOKEN];
    const adminFingerprint = req.cookies[ADMIN_COOKIES.FINGERPRINT];

    console.log("adminAccessToken", adminAccessToken);
    console.log("adminFingerprint", adminFingerprint);


    if (adminAccessToken) {
        // Try admin authentication
        const { valid, decoded, error } = tokenService.verifyAccessToken(adminAccessToken);

        if (valid) {
            if (adminFingerprint && decoded.fp) {
                if (!tokenService.verifyFingerprint(adminFingerprint, decoded.fp)) {
                    return next(AppError.unauthorized('Invalid token fingerprint'));
                }
            }

            const admin = await Admin.findById(decoded.userId);

            if (admin && admin.isActive) {
                req.admin = {
                    id: admin.id,
                    email: admin.email,
                    name: admin.name,
                    role: admin.role,
                    permissions: admin.permissions,
                };
                return next();
            }
        }
    }

    // Check for seller cookies
    const sellerAccessToken = req.cookies[SELLER_COOKIES.ACCESS_TOKEN];
    const sellerFingerprint = req.cookies[SELLER_COOKIES.FINGERPRINT];

    if (sellerAccessToken) {
        // Try seller authentication
        const { valid, decoded, error } = tokenService.verifyAccessToken(sellerAccessToken);

        if (valid) {
            if (sellerFingerprint && decoded.fp) {
                if (!tokenService.verifyFingerprint(sellerFingerprint, decoded.fp)) {
                    return next(AppError.unauthorized('Invalid token fingerprint'));
                }
            }

            const seller = await Seller.findById(decoded.userId);

            if (seller) {
                if (seller.isBlocked) {
                    return next(
                        AppError.forbidden(
                            `Your account has been blocked. Reason: ${seller.blockReason || 'Violation of terms'}`
                        )
                    );
                }

                req.seller = {
                    id: seller.id,
                    email: seller.email,
                    businessName: seller.businessName,
                    verificationStatus: seller.verificationStatus,
                    isActive: seller.isActive,
                    isBlocked: seller.isBlocked,
                    blockReason: seller.blockReason,
                    canListProducts: seller.canListProducts,
                };
                return next();
            }
        }
    }

    // No valid authentication found
    return next(AppError.unauthorized('Please login to access this resource'));
});
