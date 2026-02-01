const express = require('express');
const router = express.Router();
const orderController = require('../controllers/orderController');
const webhookController = require('../controllers/webhookController');
const { protectBuyer, protectSeller, protectAdmin } = require('../middlewares/authMiddleware');
const { validateCreateOrder, validatePaymentVerification } = require('../validators/orderValidation');

// ==================== WEBHOOK ROUTES ====================
// Public routes protected by signature verification
// Public routes protected by signature verification
router.post('/webhook/razorpay', webhookController.handleRazorpayWebhook);
router.post('/payment/callback', orderController.handlePaymentCallback); // Handle Redirect Callback


// ==================== ADMIN ROUTES ====================
router.get('/admin/all', protectAdmin, orderController.getAdminOrders);
router.get('/admin/:id', protectAdmin, orderController.getAdminOrderById);
router.patch('/admin/:id/status', protectAdmin, orderController.adminUpdateOrderStatus);

// ==================== SELLER ROUTES ====================
// Specific Seller routes must be defined before generic /:orderId to avoid matching conflict
router.get('/seller/my-orders', protectSeller, orderController.getSellerOrders);
router.get('/seller/:id', protectSeller, orderController.getSellerOrderById);
router.patch('/:id/status', protectSeller, orderController.updateOrderStatus);


// ==================== BUYER ROUTES ====================

// Order Creation
router.post('/preview', protectBuyer, validateCreateOrder, orderController.previewOrder);
router.post('/', protectBuyer, validateCreateOrder, orderController.createOrder);
router.post('/create-for-payment', protectBuyer, validateCreateOrder, orderController.createOrderForPayment);

// Payment Flow
router.post('/payment/verify', protectBuyer, validatePaymentVerification, orderController.verifyPaymentAndUpdateOrder);
router.post('/payment/sync', protectBuyer, orderController.syncOrderPayment);
router.post('/:orderId/payment/verify', protectBuyer, validatePaymentVerification, orderController.verifyPaymentAndUpdateOrder);

// Order Management
router.get('/my-orders', protectBuyer, orderController.getMyOrders);

// Cancel Order
router.post('/:orderId/cancel', protectBuyer, orderController.cancelOrder);

// Download Invoice
router.get('/:orderId/invoice', protectBuyer, orderController.downloadInvoice);

// Get single order by ID
// Used by Buyer mainly, but controller checks permission. 
// We keep it protected by Buyer for now as mapped to getOrderById.
router.get('/:orderId', protectBuyer, orderController.getOrderById);


module.exports = router;
