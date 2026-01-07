const env = require('../config/env');

/**
 * Cookie configuration for authentication tokens
 * Implements security best practices
 */

// Parse duration string to milliseconds
const parseExpiry = (expiryString) => {
    const match = expiryString.match(/^(\d+)([smhd])$/);
    if (!match) return 15 * 60 * 1000; // Default 15 minutes

    const value = parseInt(match[1], 10);
    const unit = match[2];

    switch (unit) {
        case 's':
            return value * 1000;
        case 'm':
            return value * 60 * 1000;
        case 'h':
            return value * 60 * 60 * 1000;
        case 'd':
            return value * 24 * 60 * 60 * 1000;
        default:
            return 15 * 60 * 1000;
    }
};

const accessTokenMaxAge = parseExpiry(env.jwt.accessExpiresIn);
const refreshTokenMaxAge = parseExpiry(env.jwt.refreshExpiresIn);

// Access token cookie options
const accessTokenCookieOptions = {
    httpOnly: true, // Prevents JavaScript access (XSS protection)
    secure: env.isProduction, // HTTPS only in production
    sameSite: 'lax', // CSRF protection while allowing normal navigation
    maxAge: accessTokenMaxAge,
    path: '/',
};

// Refresh token cookie options (more restrictive)
const refreshTokenCookieOptions = {
    httpOnly: true,
    secure: env.isProduction,
    sameSite: 'strict', // Stricter CSRF protection for refresh token
    maxAge: refreshTokenMaxAge,
    path: '/api/v1/auth', // Limited path scope
};

// Cookie names
const COOKIE_NAMES = {
    ACCESS_TOKEN: 'accessToken',
    REFRESH_TOKEN: 'refreshToken',
    FINGERPRINT: 'fp', // Token fingerprint for additional security
};

// Set authentication cookies
const setAuthCookies = (res, accessToken, refreshToken, fingerprint) => {
    res.cookie(COOKIE_NAMES.ACCESS_TOKEN, accessToken, accessTokenCookieOptions);
    res.cookie(COOKIE_NAMES.REFRESH_TOKEN, refreshToken, refreshTokenCookieOptions);
    res.cookie(COOKIE_NAMES.FINGERPRINT, fingerprint, {
        ...refreshTokenCookieOptions,
        httpOnly: false, // Client needs to read this for fingerprint verification
    });
};

// Clear authentication cookies
const clearAuthCookies = (res) => {
    res.cookie(COOKIE_NAMES.ACCESS_TOKEN, '', { ...accessTokenCookieOptions, maxAge: 0 });
    res.cookie(COOKIE_NAMES.REFRESH_TOKEN, '', { ...refreshTokenCookieOptions, maxAge: 0 });
    res.cookie(COOKIE_NAMES.FINGERPRINT, '', {
        ...refreshTokenCookieOptions,
        httpOnly: false,
        maxAge: 0
    });
};

module.exports = {
    accessTokenCookieOptions,
    refreshTokenCookieOptions,
    accessTokenMaxAge,
    refreshTokenMaxAge,
    COOKIE_NAMES,
    setAuthCookies,
    clearAuthCookies,
};
