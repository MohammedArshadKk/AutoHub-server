const express = require('express');
const sellerAdminController = require('../controllers/sellerAdminController');
const { protectAdmin } = require('../middlewares/authMiddleware');

const router = express.Router();

// ============================================
// ADMIN ROUTES (Protected)
// ============================================

// Create seller
router.post('/admin/create', protectAdmin, sellerAdminController.createSeller);

// Get all sellers
router.get('/admin', protectAdmin, sellerAdminController.getAllSellers);

// Get seller by ID
router.get('/admin/:id', protectAdmin, sellerAdminController.getSellerById);

// Update seller
router.patch('/admin/:id', protectAdmin, sellerAdminController.updateSeller);

// Verify seller
router.patch('/admin/:id/verify', protectAdmin, sellerAdminController.verifySeller);

// Reject seller verification
router.patch('/admin/:id/reject', protectAdmin, sellerAdminController.rejectSeller);

// Block seller
router.patch('/admin/:id/block', protectAdmin, sellerAdminController.blockSeller);

// Unblock seller
router.patch('/admin/:id/unblock', protectAdmin, sellerAdminController.unblockSeller);

module.exports = router;
