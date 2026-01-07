const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const env = require('../config/env');

/**
 * Token Service
 * Handles JWT access and refresh token generation/verification
 */

// Parse duration string to seconds (for JWT)
const parseExpiryToSeconds = (expiryString) => {
    const match = expiryString.match(/^(\d+)([smhd])$/);
    if (!match) return 900; // Default 15 minutes

    const value = parseInt(match[1], 10);
    const unit = match[2];

    switch (unit) {
        case 's':
            return value;
        case 'm':
            return value * 60;
        case 'h':
            return value * 60 * 60;
        case 'd':
            return value * 24 * 60 * 60;
        default:
            return 900;
    }
};

/**
 * Generate a cryptographic fingerprint
 * Used to bind tokens to a specific client session
 */
const generateFingerprint = () => {
    return crypto.randomBytes(32).toString('hex');
};

/**
 * Generate Access Token (short-lived)
 * Contains user ID and role for authorization
 */
const generateAccessToken = (userId, role, fingerprint) => {
    const payload = {
        userId,
        role,
        fp: crypto.createHash('sha256').update(fingerprint).digest('hex').substring(0, 16),
        type: 'access',
    };

    return jwt.sign(payload, env.jwt.accessSecret, {
        expiresIn: parseExpiryToSeconds(env.jwt.accessExpiresIn),
        issuer: 'auto-hub',
        audience: 'auto-hub-client',
        jwtid: uuidv4(),
    });
};

/**
 * Generate Refresh Token (long-lived)
 * Used only to obtain new access tokens
 */
const generateRefreshToken = (userId, fingerprint) => {
    const payload = {
        userId,
        fp: crypto.createHash('sha256').update(fingerprint).digest('hex').substring(0, 16),
        type: 'refresh',
    };

    return jwt.sign(payload, env.jwt.refreshSecret, {
        expiresIn: parseExpiryToSeconds(env.jwt.refreshExpiresIn),
        issuer: 'auto-hub',
        audience: 'auto-hub-client',
        jwtid: uuidv4(),
    });
};

/**
 * Verify Access Token
 */
const verifyAccessToken = (token) => {
    try {
        const decoded = jwt.verify(token, env.jwt.accessSecret, {
            issuer: 'auto-hub',
            audience: 'auto-hub-client',
        });

        if (decoded.type !== 'access') {
            throw new Error('Invalid token type');
        }

        return { valid: true, decoded };
    } catch (error) {
        return {
            valid: false,
            error: error.name === 'TokenExpiredError' ? 'expired' : 'invalid',
        };
    }
};

/**
 * Verify Refresh Token
 */
const verifyRefreshToken = (token) => {
    try {
        const decoded = jwt.verify(token, env.jwt.refreshSecret, {
            issuer: 'auto-hub',
            audience: 'auto-hub-client',
        });

        if (decoded.type !== 'refresh') {
            throw new Error('Invalid token type');
        }

        return { valid: true, decoded };
    } catch (error) {
        return {
            valid: false,
            error: error.name === 'TokenExpiredError' ? 'expired' : 'invalid',
        };
    }
};

/**
 * Calculate refresh token expiry date
 */
const getRefreshTokenExpiry = () => {
    const expirySeconds = parseExpiryToSeconds(env.jwt.refreshExpiresIn);
    return new Date(Date.now() + expirySeconds * 1000);
};

/**
 * Verify fingerprint matches token
 */
const verifyFingerprint = (fingerprint, tokenFingerprint) => {
    const fingerprintHash = crypto
        .createHash('sha256')
        .update(fingerprint)
        .digest('hex')
        .substring(0, 16);
    return fingerprintHash === tokenFingerprint;
};

module.exports = {
    generateFingerprint,
    generateAccessToken,
    generateRefreshToken,
    verifyAccessToken,
    verifyRefreshToken,
    getRefreshTokenExpiry,
    verifyFingerprint,
};
