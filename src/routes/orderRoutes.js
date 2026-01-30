const express = require('express');
const router = express.Router();
const orderController = require('../controllers/orderController');
const { protectBuyer, protectSeller } = require('../middlewares/authMiddleware');
const { validateCreateOrder, validatePaymentVerification } = require('../validators/orderValidation');

// ==================== SELLER ROUTES ====================
// Specific Seller routes must be defined before generic /:orderId to avoid matching conflict
router.get('/seller/my-orders', protectSeller, orderController.getSellerOrders);
router.get('/seller/:id', protectSeller, orderController.getSellerOrderById);
router.patch('/:id/status', protectSeller, orderController.updateOrderStatus);


// ==================== BUYER ROUTES ====================

// Order Creation
router.post('/', protectBuyer, validateCreateOrder, orderController.createOrder);
router.post('/create-for-payment', protectBuyer, validateCreateOrder, orderController.createOrderForPayment);

// Payment Flow
router.post('/payment/verify', protectBuyer, validatePaymentVerification, orderController.verifyPaymentAndUpdateOrder);
router.post('/:orderId/payment/verify', protectBuyer, validatePaymentVerification, orderController.verifyPaymentAndUpdateOrder);

// Order Management
router.get('/my-orders', protectBuyer, orderController.getMyOrders);

// Cancel Order
router.post('/:orderId/cancel', protectBuyer, orderController.cancelOrder);

// Get single order by ID
// Used by Buyer mainly, but controller checks permission. 
// We keep it protected by Buyer for now as mapped to getOrderById.
router.get('/:orderId', protectBuyer, orderController.getOrderById);


module.exports = router;
