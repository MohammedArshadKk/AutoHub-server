const express = require('express');
const productController = require('../controllers/productController');
const { protect, protectSeller, protectAdmin, requireVerifiedSeller, hasPermission } = require('../middlewares/authMiddleware');

const router = express.Router();

// ==================== PUBLIC ROUTES ==================== //

// Get all products (with filters)
router.get('/', productController.getProducts);

// Get single product
router.get('/:id', productController.getProduct);

// ==================== SELLER ROUTES ==================== //

// My products (seller view)
router.get('/seller/my-products', protectSeller, productController.getMyProducts);

// Create product (seller - requires verification)
router.post('/seller', protectSeller, requireVerifiedSeller, productController.createProductSeller);

// Update product (seller)
router.get('/seller/:id', protectSeller, productController.getProductByIdSeller);
router.patch('/seller/:id', protectSeller, productController.updateProductSeller);

// Delete product (seller)
router.delete('/seller/:id', protectSeller, productController.deleteProductSeller);

// ==================== ADMIN ROUTES ==================== //

// Get pending products
router.get('/admin/pending', protectAdmin, hasPermission('products'), productController.getPendingProducts);

// Create product (admin - direct publish)
// hasPermission('products')
// protectAdmin
router.post('/admin', productController.createProductAdmin);

// Update any product (admin)
router.patch('/admin/:id', protectAdmin, hasPermission('products'), productController.updateProductAdmin);

// Delete any product (admin)
router.delete('/admin/:id', protectAdmin, hasPermission('products'), productController.deleteProductAdmin);

// Approve product
router.patch('/admin/:id/approve', protectAdmin, hasPermission('products'), productController.approveProduct);

// Reject product
router.patch('/admin/:id/reject', protectAdmin, hasPermission('products'), productController.rejectProduct);

module.exports = router;
