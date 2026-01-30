const crypto = require('crypto');
const Order = require('../models/Order');
const Product = require('../models/Product');
const Seller = require('../models/Seller');
const razorpayService = require('../services/razorpayService');
const catchAsync = require('../utils/catchAsync');

/**
 * Razorpay Webhook Controller
 * Handles asynchronous notifications from Razorpay (captured, failed, etc.)
 */
exports.handleRazorpayWebhook = catchAsync(async (req, res) => {
    const signature = req.headers['x-razorpay-signature'];
    const bodyString = JSON.stringify(req.body);

    // 1. Verify webhook signature
    const isValid = razorpayService.verifyWebhookSignature(bodyString, signature);

    if (!isValid) {
        console.error('❌ Invalid Razorpay webhook signature');
        return res.status(400).json({ status: 'error', message: 'Invalid signature' });
    }

    const event = req.body.event;
    console.log(`🔔 Received Razorpay Webhook Event: ${event}`);

    // Process different event types
    switch (event) {
        case 'payment.captured':
        case 'order.paid':
            await handlePaymentSuccess(req.body.payload);
            break;
        case 'payment.failed':
            await handlePaymentFailure(req.body.payload);
            break;
        default:
            console.log(`ℹ️ Unhandled Razorpay event: ${event}`);
    }

    // Always respond with 200 OK to Razorpay
    res.status(200).json({ status: 'ok' });
});

/**
 * Handle successful payment event
 */
async function handlePaymentSuccess(payload) {
    const payment = payload.payment ? payload.payment.entity : null;
    const razorpayOrderId = payment ? payment.order_id : (payload.order ? payload.order.entity.id : null);

    if (!razorpayOrderId) return;

    // Find all orders linked to this razorpayOrderId
    const orders = await Order.find({ razorpayOrderId });

    if (orders.length === 0) {
        console.log(`📦 No orders found for Razorpay Order ID: ${razorpayOrderId}`);
        return;
    }

    // Use the same logic as verifyPaymentUpdateOrder but without needing a session/buyer context
    // because webhooks are server-to-server
    for (const order of orders) {
        // Idempotency: skip if already paid
        if (order.paymentStatus === 'paid') continue;

        console.log(`✅ Webhook: Updating order ${order.orderNumber} to paid`);

        order.paymentStatus = 'paid';
        order.orderStatus = 'confirmed';
        order.razorpayPaymentId = payment.id;
        order.transactionId = payment.acquirer_data?.bank_transaction_id || payment.id;
        order.paidAt = new Date();
        order.confirmedAt = new Date();
        order.paymentCompletedAt = new Date(payment.created_at * 1000);
        order.paymentGatewayResponse = payment;

        order.paymentDetails = {
            method: payment.method,
            bank: payment.bank,
            wallet: payment.wallet,
            vpa: payment.vpa,
            card: payment.card ? {
                network: payment.card.network,
                last4: payment.card.last4,
                issuer: payment.card.issuer
            } : undefined
        };

        order.statusHistory.push({
            status: 'confirmed',
            note: 'Order confirmed via Razorpay Webhook',
            timestamp: new Date(),
            userModel: 'Admin' // System update
        });

        // Decrement stock
        for (const item of order.items) {
            await Product.findByIdAndUpdate(item.product, {
                $inc: { stock: -item.quantity },
                $set: { lastSoldAt: new Date() }
            });

            // Update metrics
            Seller.findByIdAndUpdate(order.seller, {
                $inc: { 'metrics.totalOrders': 1, 'metrics.totalRevenue': order.totalAmount }
            }).exec().catch(() => { });
        }

        await order.save();
    }
}

/**
 * Handle failed payment event
 */
async function handlePaymentFailure(payload) {
    const payment = payload.payment.entity;
    const razorpayOrderId = payment.order_id;

    if (!razorpayOrderId) return;

    const orders = await Order.find({ razorpayOrderId });

    for (const order of orders) {
        if (order.paymentStatus === 'paid') continue;

        order.paymentStatus = 'failed';
        order.orderStatus = 'payment_failed';
        order.paymentFailedAt = new Date();
        order.paymentGatewayResponse = payment;

        order.statusHistory.push({
            status: 'payment_failed',
            note: `Payment failed: ${payment.error_description || 'Razorpay notification'}`,
            timestamp: new Date(),
            userModel: 'Admin'
        });

        await order.save();
    }
}
