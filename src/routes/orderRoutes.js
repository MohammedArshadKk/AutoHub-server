const express = require('express');
const router = express.Router();
const orderController = require('../controllers/orderController');
const { protectBuyer } = require('../middlewares/authMiddleware');
const { validateCreateOrder, validatePaymentVerification } = require('../validators/orderValidation');

// All order routes require buyer authentication
router.use(protectBuyer);

// ==================== ORDER CREATION ====================

// Create COD order (direct)
router.post('/', validateCreateOrder, orderController.createOrder);

// Create order for online payment (before payment)
router.post('/create-for-payment', validateCreateOrder, orderController.createOrderForPayment);

// ==================== PAYMENT FLOW ====================

// Initiate payment for existing order
router.post('/:orderId/payment/initiate', orderController.initiatePayment);

// Verify payment and update order
router.post('/:orderId/payment/verify', validatePaymentVerification, orderController.verifyPaymentAndUpdateOrder);

// ==================== ORDER MANAGEMENT ====================

// Get buyer's orders (must be before /:orderId to avoid conflicts)
router.get('/my-orders', orderController.getMyOrders);

// Get single order by ID
router.get('/:orderId', orderController.getOrderById);

// Cancel order
router.post('/:orderId/cancel', orderController.cancelOrder);

module.exports = router;
