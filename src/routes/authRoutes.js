const express = require('express');
const authController = require('../controllers/authController');
const { protect } = require('../middlewares/authMiddleware');
const { authLimiter, refreshLimiter } = require('../middlewares/securityMiddleware');

const router = express.Router();

// ==================== PUBLIC ROUTES ==================== //

// Google OAuth
router.get('/google', authLimiter, authController.initiateGoogleAuth);
router.get('/google/callback', authController.googleCallback);

// Token refresh
router.post('/refresh', refreshLimiter, authController.refreshToken);

// Auth status check (public - returns isAuthenticated: true/false)
router.get('/status', authController.checkAuthStatus);

// ==================== PROTECTED ROUTES ==================== //

// Logout
router.post('/logout', protect, authController.logout);
router.post('/logout-all', protect, authController.logoutAll);

// User profile
router.get('/me', protect, authController.getMe);
router.patch('/me', protect, authController.updateMe);

module.exports = router;
