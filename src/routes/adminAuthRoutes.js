const express = require('express');
const adminAuthController = require('../controllers/adminAuthController');
const { protectAdmin } = require('../middlewares/authMiddleware');
const { authLimiter, refreshLimiter } = require('../middlewares/securityMiddleware');

const router = express.Router();

// ==================== PUBLIC ROUTES ==================== //

// Login
router.post('/login', authLimiter, adminAuthController.login);

// Refresh token
router.post('/refresh', refreshLimiter, adminAuthController.refreshToken);

// ==================== PROTECTED ROUTES ==================== //

// Logout
router.post('/logout', protectAdmin, adminAuthController.logout);

// Profile
router.get('/me', protectAdmin, adminAuthController.getMe);

// Create new admin (super_admin only)
router.post('/create', protectAdmin, adminAuthController.createAdmin);

module.exports = router;
