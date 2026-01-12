const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const passport = require('passport');
const compression = require('compression');
const morgan = require('morgan');

const configurePassport = require('./config/passport');
const authRoutes = require('./routes/authRoutes');
const sellerAuthRoutes = require('./routes/sellerAuthRoutes');
const adminAuthRoutes = require('./routes/adminAuthRoutes');
const productRoutes = require('./routes/productRoutes');
const uploadRoutes = require('./routes/uploadRoutes');
const AppError = require('./utils/AppError');

const {
    securityHeaders,
    generalLimiter,
    sanitizeData,
    preventParamPollution,
} = require('./middlewares/securityMiddleware');

const env = require('./config/env');

const app = express();

// ==================== TRUST PROXY (for production behind load balancer) ==================== //
if (env.isProduction) {
    app.set('trust proxy', 1);
}

// ==================== COMPRESSION ==================== //
app.use(compression());

// ==================== LOGGING ==================== //
if (env.isProduction) {
    // Production: minimal logging
    app.use(morgan('combined', {
        skip: (req) => req.path === '/api/v1/health',
    }));
} else {
    // Development: detailed logging
    app.use(morgan('dev'));
}

// ==================== SECURITY MIDDLEWARE ==================== //

// Security HTTP headers
app.use(securityHeaders);

// Rate limiting
app.use('/api', generalLimiter);

// ==================== BODY PARSING ==================== //

// JSON body parser with size limit
app.use(express.json({ limit: '10kb' }));

// URL-encoded body parser
app.use(express.urlencoded({ extended: true, limit: '10kb' }));

// Cookie parser
app.use(cookieParser());

// ==================== CORS CONFIGURATION ==================== //

const corsOptions = {
    origin: (origin, callback) => {
        // Allow requests with no origin (mobile apps, curl, server-to-server)
        if (!origin) return callback(null, true);

        const allowedOrigins = env.isProduction
            ? [env.frontendUrl]
            : [env.frontendUrl, 'http://localhost:3000', 'http://localhost:5173'];

        if (allowedOrigins.includes(origin)) {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    exposedHeaders: ['set-cookie'],
    maxAge: 86400,
};

app.use(cors(corsOptions));

// ==================== DATA SANITIZATION ==================== //

// Prevent NoSQL injection
app.use(sanitizeData);

// Prevent parameter pollution
app.use(preventParamPollution);

// ==================== PASSPORT INITIALIZATION ==================== //

configurePassport();
app.use(passport.initialize());

// ==================== HEALTH CHECK ==================== //

app.get('/api/v1/health', (req, res) => {
    res.status(200).json({
        status: 'success',
        message: 'Server is running',
        timestamp: new Date().toISOString(),
        environment: env.nodeEnv,
        uptime: process.uptime(),
    });
});

// ==================== API ROUTES ==================== //

// Buyer auth (Google OAuth)
app.use('/api/v1/auth', authRoutes);

// Seller auth (Email/Password)
app.use('/api/v1/seller/auth', sellerAuthRoutes);

// Admin auth (Email/Password)
app.use('/api/v1/admin/auth', adminAuthRoutes);

// Products
app.use('/api/v1/products', productRoutes);

// Upload (S3 pre-signed URLs)
app.use('/api/v1/upload', uploadRoutes);

// ==================== 404 HANDLER ==================== //

app.all('*', (req, res, next) => {
    next(AppError.notFound(`Cannot find ${req.originalUrl} on this server`));
});

// ==================== GLOBAL ERROR HANDLER ==================== //

app.use((err, req, res, next) => {
    err.statusCode = err.statusCode || 500;
    err.status = err.status || 'error';

    // Log error
    if (env.isProduction) {
        if (err.statusCode >= 500) {
            console.error('SERVER ERROR:', {
                message: err.message,
                stack: err.stack,
                path: req.path,
                method: req.method,
                timestamp: new Date().toISOString(),
            });
        }
    } else {
        console.error('Error:', err);
    }

    // Operational, trusted error: send message to client
    if (err.isOperational) {
        return res.status(err.statusCode).json({
            status: err.status,
            message: err.message,
        });
    }

    // Production: don't leak error details
    if (env.isProduction) {
        // Handle specific error types
        if (err.name === 'ValidationError') {
            const errors = Object.values(err.errors).map((el) => el.message);
            return res.status(400).json({
                status: 'fail',
                message: `Validation error: ${errors.join('. ')}`,
            });
        }

        if (err.code === 11000) {
            const field = Object.keys(err.keyValue)[0];
            return res.status(409).json({
                status: 'fail',
                message: `${field} already exists`,
            });
        }

        if (err.name === 'CastError') {
            return res.status(400).json({
                status: 'fail',
                message: 'Invalid ID format',
            });
        }

        if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
            return res.status(401).json({
                status: 'fail',
                message: 'Authentication failed',
            });
        }

        // Generic error response for production
        return res.status(500).json({
            status: 'error',
            message: 'Something went wrong',
        });
    }

    // Development: send full error details
    return res.status(err.statusCode).json({
        status: err.status,
        message: err.message,
        error: err,
        stack: err.stack,
    });
});

module.exports = app;
