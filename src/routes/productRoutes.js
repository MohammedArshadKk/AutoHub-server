const express = require('express');
const productController = require('../controllers/productController');
const { protect, protectSeller, protectAdmin, requireVerifiedSeller, hasPermission, checkBlockedSeller } = require('../middlewares/authMiddleware');

const router = express.Router();

// ==================== PUBLIC ROUTES ==================== //

// Get all products (with filters)
router.get('/', productController.getProducts);

// ==================== SELLER ROUTES ==================== //

// My products (seller view)
router.get('/seller/my-products', protectSeller, checkBlockedSeller, productController.getMyProducts);

// Create product (seller - requires verification)
router.post('/seller', protectSeller, checkBlockedSeller, requireVerifiedSeller, productController.createProductSeller);

// Update product (seller)
router.get('/seller/:id', protectSeller, checkBlockedSeller, productController.getProductByIdSeller);
router.patch('/seller/:id', protectSeller, checkBlockedSeller, productController.updateProductSeller);

// Delete product (seller)
router.delete('/seller/:id', protectSeller, checkBlockedSeller, productController.deleteProductSeller);

// ==================== ADMIN ROUTES ==================== //

// Get all seller products (with pagination and filters)
router.get('/admin/all', protectAdmin, hasPermission('products'), productController.getAllProductsAdmin);
router.get('/admin/pending', protectAdmin, hasPermission('products'), productController.getPendingProducts);

// Create product (admin)
router.post('/admin', productController.createProductAdmin);

// Admin specific product operations (ID based)
router.get('/admin/:id', protectAdmin, hasPermission('products'), productController.getProductAdmin);
router.patch('/admin/:id', protectAdmin, hasPermission('products'), productController.updateProductAdmin);
router.put('/admin/:id', protectAdmin, hasPermission('products'), productController.updateProductAdmin); // Support PUT as well
router.delete('/admin/:id', protectAdmin, hasPermission('products'), productController.deleteProductAdmin);

// Approval workflow
router.patch('/admin/:id/approve', protectAdmin, hasPermission('products'), productController.approveProduct);
router.patch('/admin/:id/reject', protectAdmin, hasPermission('products'), productController.rejectProduct);

// ==================== PUBLIC ROUTES (Generic) ==================== //

// Get single product (Keep this last to avoid shadowing other routes)
router.get('/:id', productController.getProduct);

module.exports = router;
