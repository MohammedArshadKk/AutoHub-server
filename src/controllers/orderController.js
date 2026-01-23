const Order = require('../models/Order');
const Product = require('../models/Product');
const razorpayService = require('../services/razorpayService');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/AppError');

/**
 * Create COD order (direct placement)
 * POST /api/v1/orders
 */
exports.createOrder = catchAsync(async (req, res, next) => {
    const { items, shippingAddress, pricing } = req.body;
    const buyerId = req.user._id;

    // Validate input
    if (!items || items.length === 0) {
        return next(AppError.badRequest('Order must contain at least one item'));
    }

    if (!shippingAddress) {
        return next(AppError.badRequest('Shipping address is required'));
    }

    // Verify products exist and build order items with actual prices
    const orderItems = [];
    let calculatedSubtotal = 0;

    for (const item of items) {
        const product = await Product.findById(item._id);

        if (!product) {
            return next(AppError.notFound(`Product "${item.name}" not found`));
        }

        if (product.status !== 'ACTIVE') {
            return next(AppError.badRequest(`Product "${item.name}" is not available for purchase`));
        }

        if (product.stock < item.quantity) {
            return next(
                AppError.badRequest(`Insufficient stock for "${item.name}". Available: ${product.stock}`)
            );
        }

        // Use actual product price from database (never trust frontend)
        const actualPrice = product.price;

        orderItems.push({
            product: product._id,
            name: product.name,
            price: actualPrice,
            quantity: item.quantity,
            images: product.images || [],
        });

        calculatedSubtotal += actualPrice * item.quantity;
    }

    // Calculate charges
    const shippingCharge = calculatedSubtotal >= 1000 ? 0 : 50;
    const handlingCharge = 20;
    const tax = 0;
    const totalAmount = calculatedSubtotal + shippingCharge + handlingCharge + tax;

    // Create order
    const order = new Order({
        buyer: buyerId,
        items: orderItems,
        shippingAddress,
        subtotal: calculatedSubtotal,
        shippingCharge,
        handlingCharge,
        tax,
        totalAmount,
        paymentMethod: 'cod',
        paymentStatus: 'pending',
        orderStatus: 'pending',
    });

    await order.save();

    res.status(201).json({
        status: 'success',
        message: 'Order placed successfully',
        data: {
            order: {
                _id: order._id,
                orderNumber: order.orderNumber,
                totalAmount: order.totalAmount,
                orderStatus: order.orderStatus,
                paymentStatus: order.paymentStatus,
                orderedAt: order.orderedAt,
            },
        },
    });
});

/**
 * Create order for online payment (before payment)
 * POST /api/v1/orders/create-for-payment
 */
exports.createOrderForPayment = catchAsync(async (req, res, next) => {
    const { items, shippingAddress, pricing } = req.body;
    const buyerId = req.user._id;

    // Validate input
    if (!items || items.length === 0) {
        return next(AppError.badRequest('Order must contain at least one item'));
    }

    if (!shippingAddress) {
        return next(AppError.badRequest('Shipping address is required'));
    }

    // Verify products exist and build order items
    const orderItems = [];
    let calculatedSubtotal = 0;

    for (const item of items) {
        const product = await Product.findById(item._id);

        if (!product) {
            return next(AppError.notFound(`Product "${item.name}" not found`));
        }

        if (product.status !== 'ACTIVE') {
            return next(AppError.badRequest(`Product "${item.name}" is not available for purchase`));
        }

        if (product.stock < item.quantity) {
            return next(
                AppError.badRequest(`Insufficient stock for "${item.name}". Available: ${product.stock}`)
            );
        }

        const actualPrice = product.price;

        orderItems.push({
            product: product._id,
            name: product.name,
            price: actualPrice,
            quantity: item.quantity,
            images: product.images || [],
        });

        calculatedSubtotal += actualPrice * item.quantity;
    }

    // Calculate charges
    const shippingCharge = calculatedSubtotal >= 1000 ? 0 : 50;
    const handlingCharge = 20;
    const tax = 0;
    const totalAmount = calculatedSubtotal + shippingCharge + handlingCharge + tax;

    // Create order with pending payment status
    const order = new Order({
        buyer: buyerId,
        items: orderItems,
        shippingAddress,
        subtotal: calculatedSubtotal,
        shippingCharge,
        handlingCharge,
        tax,
        totalAmount,
        paymentMethod: 'online',
        paymentStatus: 'pending_payment',
        orderStatus: 'payment_pending',
    });

    await order.save();

    res.status(201).json({
        status: 'success',
        message: 'Order created, awaiting payment',
        data: {
            order: {
                _id: order._id,
                orderNumber: order.orderNumber,
                totalAmount: order.totalAmount,
                orderStatus: order.orderStatus,
                paymentStatus: order.paymentStatus,
            },
        },
    });
});

/**
 * Initiate Razorpay payment for order
 * POST /api/v1/orders/:orderId/payment/initiate
 */
exports.initiatePayment = catchAsync(async (req, res, next) => {
    const { orderId } = req.params;
    const buyerId = req.user._id;

    // Find order
    const order = await Order.findOne({ _id: orderId, buyer: buyerId });

    if (!order) {
        return next(AppError.notFound('Order not found'));
    }

    // Check order is in payment_pending status
    if (order.orderStatus !== 'payment_pending') {
        return next(AppError.badRequest('Order is not awaiting payment'));
    }

    // Check if Razorpay is configured
    if (!razorpayService.isConfigured()) {
        return next(AppError.internalError('Payment gateway not configured'));
    }

    // Create Razorpay order
    const razorpayOrder = await razorpayService.createRazorpayOrder(
        order.totalAmount,
        'INR',
        order.orderNumber
    );

    // Update order with Razorpay order ID and timestamp
    order.razorpayOrderId = razorpayOrder.id;
    order.paymentInitiatedAt = new Date();
    await order.save();

    res.json({
        status: 'success',
        message: 'Payment initiated',
        data: {
            razorpayOrderId: razorpayOrder.id,
            amount: razorpayOrder.amount,
            currency: razorpayOrder.currency,
            keyId: process.env.RAZORPAY_KEY_ID,
        },
    });
});

/**
 * Verify payment and update order
 * POST /api/v1/orders/:orderId/payment/verify
 */
exports.verifyPaymentAndUpdateOrder = catchAsync(async (req, res, next) => {
    const { orderId } = req.params;
    const { razorpayOrderId, razorpayPaymentId, razorpaySignature } = req.body;
    const buyerId = req.user._id;

    // Validate input
    if (!razorpayOrderId || !razorpayPaymentId || !razorpaySignature) {
        return next(AppError.badRequest('Missing payment verification details'));
    }

    // Find order
    const order = await Order.findOne({ _id: orderId, buyer: buyerId });

    if (!order) {
        return next(AppError.notFound('Order not found'));
    }

    // Verify signature
    const isValid = razorpayService.verifyPaymentSignature(
        razorpayOrderId,
        razorpayPaymentId,
        razorpaySignature
    );

    if (!isValid) {
        // Mark order as payment failed
        order.paymentStatus = 'failed';
        order.orderStatus = 'payment_failed';
        await order.save();

        return next(AppError.badRequest('Payment verification failed. Invalid signature.'));
    }

    // Fetch payment details from Razorpay
    const paymentDetails = await razorpayService.getPaymentDetails(razorpayPaymentId);

    if (paymentDetails.status !== 'captured') {
        // Payment failed or not captured
        order.paymentStatus = 'failed';
        order.orderStatus = 'payment_failed';
        order.paymentFailedAt = new Date();

        // Record failed attempt
        order.paymentAttempts.push({
            attemptedAt: new Date(),
            paymentId: razorpayPaymentId,
            status: paymentDetails.status,
            errorCode: paymentDetails.error_code,
            errorDescription: paymentDetails.error_description,
        });

        await order.save();

        return next(AppError.badRequest('Payment not captured. Please try again.'));
    }

    // ========== PAYMENT SUCCESSFUL - EXTRACT DETAILS ==========

    // Basic payment info
    order.paymentStatus = 'paid';
    order.orderStatus = 'confirmed';
    order.razorpayPaymentId = razorpayPaymentId;
    order.razorpaySignature = razorpaySignature;
    order.transactionId = paymentDetails.acquirer_data?.bank_transaction_id || paymentDetails.id;

    // Timestamps
    order.paidAt = new Date();
    order.confirmedAt = new Date();
    order.paymentCompletedAt = new Date(paymentDetails.created_at * 1000);

    // Extract payment method details
    const methodDetails = {};
    methodDetails.method = paymentDetails.method; // 'card', 'upi', 'netbanking', 'wallet'

    // Card details
    if (paymentDetails.method === 'card' && paymentDetails.card) {
        methodDetails.card = {
            type: paymentDetails.card.type, // 'credit' or 'debit'
            network: paymentDetails.card.network, // 'Visa', 'MasterCard', 'RuPay'
            last4: paymentDetails.card.last4,
            name: paymentDetails.card.name,
            issuer: paymentDetails.card.issuer,
            emi: paymentDetails.card.emi || false,
        };
        methodDetails.bank = paymentDetails.bank;
    }

    // UPI details
    if (paymentDetails.method === 'upi' && paymentDetails.vpa) {
        methodDetails.upi = {
            vpa: paymentDetails.vpa, // user@paytm
        };
    }

    // Netbanking details
    if (paymentDetails.method === 'netbanking') {
        methodDetails.bank = paymentDetails.bank;
    }

    // Wallet details
    if (paymentDetails.method === 'wallet') {
        methodDetails.wallet = paymentDetails.wallet;
    }

    order.paymentDetails = methodDetails;

    // Store full payment response for audit (excluded from default queries)
    order.paymentGatewayResponse = paymentDetails;

    await order.save();

    res.json({
        status: 'success',
        message: 'Payment verified successfully. Order confirmed!',
        data: {
            order: {
                _id: order._id,
                orderNumber: order.orderNumber,
                orderStatus: order.orderStatus,
                paymentStatus: order.paymentStatus,
                razorpayPaymentId: order.razorpayPaymentId,
                transactionId: order.transactionId,
                paymentMethod: order.paymentDetails?.method,
            },
        },
    });
});

/**
 * Get buyer's orders
 * GET /api/v1/orders/my-orders
 */
exports.getMyOrders = catchAsync(async (req, res, next) => {
    const buyerId = req.user._id;
    const { status, page = 1, limit = 10 } = req.query;

    const query = { buyer: buyerId };

    if (status) {
        query.orderStatus = status;
    }

    const skip = (page - 1) * limit;

    const orders = await Order.find(query)
        .sort({ orderedAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .populate('items.product', 'name images price');

    const total = await Order.countDocuments(query);

    res.json({
        status: 'success',
        data: {
            orders,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                pages: Math.ceil(total / limit),
            },
        },
    });
});

/**
 * Get single order by ID
 * GET /api/v1/orders/:orderId
 */
exports.getOrderById = catchAsync(async (req, res, next) => {
    const { orderId } = req.params;
    const buyerId = req.user._id;

    const order = await Order.findOne({ _id: orderId, buyer: buyerId }).populate(
        'items.product',
        'name images price description'
    );

    if (!order) {
        return next(AppError.notFound('Order not found'));
    }

    res.json({
        status: 'success',
        data: { order },
    });
});

/**
 * Cancel order
 * POST /api/v1/orders/:orderId/cancel
 */
exports.cancelOrder = catchAsync(async (req, res, next) => {
    const { orderId } = req.params;
    const { reason } = req.body;
    const buyerId = req.user._id;

    const order = await Order.findOne({ _id: orderId, buyer: buyerId });

    if (!order) {
        return next(AppError.notFound('Order not found'));
    }

    // Check if order can be cancelled
    if (!order.canBeCancelled()) {
        return next(
            AppError.badRequest(
                `Order cannot be cancelled. Current status: ${order.orderStatus}`
            )
        );
    }

    // If paid, process refund
    if (order.paymentStatus === 'paid' && order.razorpayPaymentId) {
        try {
            await razorpayService.refundPayment(order.razorpayPaymentId);
            // Note: Refund status will be updated via webhook in production
        } catch (refundError) {
            console.error('Refund failed:', refundError);
            // Continue with cancellation even if refund fails
            // Admin can manually process refund
        }
    }

    // Cancel the order
    await order.cancel(reason);

    res.json({
        status: 'success',
        message: 'Order cancelled successfully',
        data: { order },
    });
});
