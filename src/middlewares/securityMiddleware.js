const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const mongoSanitize = require('express-mongo-sanitize');
const hpp = require('hpp');
const env = require('../config/env');

/**
 * Helmet - Security headers
 */
const securityHeaders = helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            scriptSrc: ["'self'"],
            imgSrc: ["'self'", 'data:', 'https:'],
            connectSrc: ["'self'"],
            fontSrc: ["'self'"],
            objectSrc: ["'none'"],
            mediaSrc: ["'self'"],
            frameSrc: ["'none'"],
        },
    },
    crossOriginEmbedderPolicy: false, // Disable for development
    hsts: {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true,
    },
});

/**
 * Rate Limiter - General API
 */
const generalLimiter = rateLimit({
    windowMs: env.rateLimit.windowMs,
    max: env.rateLimit.maxRequests,
    message: {
        status: 'error',
        message: 'Too many requests, please try again later.',
        code: 'RATE_LIMIT_EXCEEDED',
    },
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => {
        // Skip rate limiting for health check
        return req.path === '/api/v1/health';
    },
});

/**
 * Rate Limiter - Auth endpoints (stricter)
 */
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 10, // 10 attempts per 15 minutes
    message: {
        status: 'error',
        message: 'Too many authentication attempts, please try again later.',
        code: 'AUTH_RATE_LIMIT_EXCEEDED',
    },
    standardHeaders: true,
    legacyHeaders: false,
});

/**
 * Rate Limiter - Token refresh (moderate)
 */
const refreshLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 5, // 5 refresh attempts per minute
    message: {
        status: 'error',
        message: 'Too many token refresh attempts.',
        code: 'REFRESH_RATE_LIMIT_EXCEEDED',
    },
    standardHeaders: true,
    legacyHeaders: false,
});

/**
 * MongoDB Sanitize - Prevent NoSQL injection
 */
const sanitizeData = mongoSanitize({
    replaceWith: '_',
    onSanitize: ({ req, key }) => {
        console.warn(`Sanitized key "${key}" in request to ${req.path}`);
    },
});

/**
 * HPP - Prevent HTTP Parameter Pollution
 */
const preventParamPollution = hpp({
    whitelist: ['category', 'make', 'model', 'year', 'sort', 'fields', 'page', 'limit'],
});

module.exports = {
    securityHeaders,
    generalLimiter,
    authLimiter,
    refreshLimiter,
    sanitizeData,
    preventParamPollution,
};
