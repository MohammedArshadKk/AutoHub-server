const express = require('express');
const sellerAuthController = require('../controllers/sellerAuthController');
const { protectSeller, checkBlockedSeller } = require('../middlewares/authMiddleware');
const { authLimiter, refreshLimiter } = require('../middlewares/securityMiddleware');

const router = express.Router();

// ==================== PUBLIC ROUTES ==================== //

// Register
router.post('/register', authLimiter, sellerAuthController.register);

// Login
router.post('/login', authLimiter, sellerAuthController.login);

// Refresh token
router.post('/refresh', refreshLimiter, sellerAuthController.refreshToken);

// ==================== PROTECTED ROUTES ==================== //

// Logout
router.post('/logout', protectSeller, sellerAuthController.logout);

// Profile
router.get('/me', protectSeller, checkBlockedSeller, sellerAuthController.getMe);
router.patch('/me', protectSeller, checkBlockedSeller, sellerAuthController.updateMe);

// KYC
router.patch('/kyc', protectSeller, checkBlockedSeller, sellerAuthController.submitKyc);

module.exports = router;
