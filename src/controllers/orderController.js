const Order = require('../models/Order');
const Product = require('../models/Product');
const Seller = require('../models/Seller');
const razorpayService = require('../services/razorpayService');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/AppError');
const mongoose = require('mongoose');
const { supportsTransactions } = require('../config/database');

// Helper to group items by seller
const groupItemsBySeller = (items) => {
    const grouped = {};
    for (const item of items) {
        // item.seller is expected to be populated with seller ID from product
        const sellerId = item.seller.toString();
        if (!grouped[sellerId]) {
            grouped[sellerId] = [];
        }
        grouped[sellerId].push(item);
    }
    return grouped;
};

// Helper to calculate pricing for a group of items
const calculateOrderPricing = (items) => {
    let subtotal = 0;
    for (const item of items) {
        subtotal += item.price * item.quantity;
    }
    const shippingCharge = subtotal >= 1000 ? 0 : 50;
    const handlingCharge = 20;
    const tax = 0;
    const totalAmount = subtotal + shippingCharge + handlingCharge + tax;

    return { subtotal, shippingCharge, handlingCharge, tax, totalAmount };
};

/**
 * Create COD order (direct placement) - Split by Seller
 * POST /api/v1/orders
 */
exports.createOrder = catchAsync(async (req, res, next) => {
    const { items, shippingAddress } = req.body;
    const buyerId = req.user._id;

    // Validate input
    if (!items || items.length === 0) {
        return next(AppError.badRequest('Order must contain at least one item'));
    }

    if (!shippingAddress) {
        return next(AppError.badRequest('Shipping address is required'));
    }

    // Verify products exist and build validated items
    const validatedItems = [];

    for (const item of items) {
        const product = await Product.findById(item._id).populate('seller'); // Need seller info for grouping

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

        validatedItems.push({
            product: product._id,
            seller: product.seller._id, // Grouping key
            sellerInfo: product.seller, // For snapshot
            name: product.name,
            price: product.price,
            quantity: item.quantity,
            images: product.images || [],
        });
    }

    // Group items by Seller
    const sellerGroups = groupItemsBySeller(validatedItems);
    const createdOrders = [];

    // Check for transaction support
    const canUseTransactions = supportsTransactions();
    const session = canUseTransactions ? await mongoose.startSession() : null;

    if (session) {
        session.startTransaction();
    }

    try {
        for (const [sellerId, groupItems] of Object.entries(sellerGroups)) {
            const pricing = calculateOrderPricing(groupItems);
            const sellerInfo = groupItems[0].sellerInfo;

            const sellerSnapshot = {
                businessName: sellerInfo.businessName,
                email: sellerInfo.email,
                phone: sellerInfo.phone,
                address: sellerInfo.address ? `${sellerInfo.address.street || ''}, ${sellerInfo.address.city || ''}` : '',
                gstNumber: sellerInfo.kyc?.gstin
            };

            const order = new Order({
                buyer: buyerId,
                seller: sellerId,
                sellerDetails: sellerSnapshot,
                items: groupItems.map(i => ({
                    product: i.product,
                    name: i.name,
                    price: i.price,
                    quantity: i.quantity,
                    images: i.images
                })),
                shippingAddress,
                ...pricing,
                paymentMethod: 'cod',
                paymentStatus: 'pending',
                orderStatus: 'pending',
                statusHistory: [{
                    status: 'pending',
                    note: 'Order placed using Cash on Delivery',
                    updatedBy: buyerId,
                    userModel: 'User'
                }]
            });

            await order.save(session ? { session } : {});

            // Update Stock for COD
            for (const item of groupItems) {
                await Product.findByIdAndUpdate(item.product,
                    { $inc: { stock: -item.quantity } },
                    session ? { session } : {}
                );
            }

            // Update Seller Metrics
            await Seller.findByIdAndUpdate(sellerId,
                { $inc: { 'metrics.totalOrders': 1, 'metrics.totalRevenue': pricing.totalAmount } },
                session ? { session } : {}
            );

            createdOrders.push(order);
        }

        if (session) await session.commitTransaction();
    } catch (error) {
        if (session) await session.abortTransaction();
        throw error;
    } finally {
        if (session) session.endSession();
    }

    res.status(201).json({
        status: 'success',
        message: 'Order placed successfully',
        data: {
            orders: createdOrders.map(o => ({
                _id: o._id,
                orderNumber: o.orderNumber,
                totalAmount: o.totalAmount,
                orderStatus: o.orderStatus,
                seller: o.sellerDetails?.businessName
            })),
            isSplitOrder: createdOrders.length > 1
        },
    });
});

/**
 * Create order for online payment (before payment) - Split by Seller
 * POST /api/v1/orders/create-for-payment
 */
exports.createOrderForPayment = catchAsync(async (req, res, next) => {
    const { items, shippingAddress } = req.body;
    const buyerId = req.user._id;

    if (!items || items.length === 0) return next(AppError.badRequest('Order must contain at least one item'));
    if (!shippingAddress) return next(AppError.badRequest('Shipping address is required'));

    const validatedItems = [];
    let grandTotal = 0;

    for (const item of items) {
        const product = await Product.findById(item._id).populate('seller');

        if (!product) return next(AppError.notFound(`Product "${item.name}" not found`));
        if (product.status !== 'ACTIVE') return next(AppError.badRequest(`Product "${item.name}" is not availble`));
        if (product.stock < item.quantity) return next(AppError.badRequest(`Insufficient stock for "${item.name}"`));

        validatedItems.push({
            product: product._id,
            seller: product.seller._id,
            sellerInfo: product.seller,
            name: product.name,
            price: product.price,
            quantity: item.quantity,
            images: product.images || [],
        });
    }

    const sellerGroups = groupItemsBySeller(validatedItems);
    const pendingOrders = [];

    // Calculate Grand Total for Razorpay Order
    for (const groupItems of Object.values(sellerGroups)) {
        const pricing = calculateOrderPricing(groupItems);
        grandTotal += pricing.totalAmount;
    }

    // 1. Create Razorpay Order (Single Order for the whole cart)
    if (!razorpayService.isConfigured()) {
        return next(AppError.internalError('Payment gateway not configured'));
    }

    // Use a temporary ID for tracking if needed, or just generate new one
    // But we need to save the orders first with empty RAZORPAY ID? 
    // No, we need Razorpay ID *before* saving to link them.

    // We'll create Razorpay Order ID first.
    // Need a unique reference. We can use a timestamp + random string
    const receiptId = `RCPT_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

    const razorpayOrder = await razorpayService.createRazorpayOrder(
        grandTotal,
        'INR',
        receiptId
    );

    // 2. Create Database Orders (Split) with proper Razorpay Order ID
    const canUseTransactions = supportsTransactions();
    const session = canUseTransactions ? await mongoose.startSession() : null;

    if (session) {
        session.startTransaction();
    }

    try {
        for (const [sellerId, groupItems] of Object.entries(sellerGroups)) {
            const pricing = calculateOrderPricing(groupItems);
            const sellerInfo = groupItems[0].sellerInfo;

            const sellerSnapshot = {
                businessName: sellerInfo.businessName,
                email: sellerInfo.email,
                phone: sellerInfo.phone,
                address: sellerInfo.address ? `${sellerInfo.address.street || ''}, ${sellerInfo.address.city || ''}` : '',
                gstNumber: sellerInfo.kyc?.gstin
            };

            const order = new Order({
                buyer: buyerId,
                seller: sellerId,
                sellerDetails: sellerSnapshot,
                items: groupItems.map(i => ({
                    product: i.product,
                    name: i.name,
                    price: i.price,
                    quantity: i.quantity,
                    images: i.images
                })),
                shippingAddress,
                ...pricing,
                paymentMethod: 'online',
                paymentStatus: 'pending_payment',
                orderStatus: 'payment_pending',
                razorpayOrderId: razorpayOrder.id, // LINK ALL SPLIT ORDERS
                statusHistory: [{
                    status: 'payment_pending',
                    note: 'Waiting for payment',
                    updatedBy: buyerId,
                    userModel: 'User'
                }]
            });

            await order.save(session ? { session } : {});
            pendingOrders.push(order);
        }

        if (session) await session.commitTransaction();
    } catch (error) {
        if (session) await session.abortTransaction();
        throw error;
    } finally {
        if (session) session.endSession();
    }

    res.status(201).json({
        status: 'success',
        message: 'Orders created, awaiting payment',
        data: {
            razorpayOrderId: razorpayOrder.id,
            totalAmount: grandTotal,
            currency: 'INR',
            keyId: process.env.RAZORPAY_KEY_ID,
            orderIds: pendingOrders.map(o => o._id), // Return all DB IDs
            count: pendingOrders.length
        },
    });
});

/**
 * Verify payment and update order(s)
 * POST /api/v1/orders/payment/verify
 * Note: No :orderId param needed as Razorpay ID links multiple
 */
exports.verifyPaymentAndUpdateOrder = catchAsync(async (req, res, next) => {
    // Route param might exist if old client, but we rely on body
    const { razorpayOrderId, razorpayPaymentId, razorpaySignature } = req.body;
    const buyerId = req.user._id;

    if (!razorpayOrderId || !razorpayPaymentId || !razorpaySignature) {
        return next(AppError.badRequest('Missing verification details'));
    }

    // Verify signature
    const isValid = razorpayService.verifyPaymentSignature(
        razorpayOrderId,
        razorpayPaymentId,
        razorpaySignature
    );

    // Find all orders linked to this razorpay_order_id
    const orders = await Order.find({ razorpayOrderId: razorpayOrderId, buyer: buyerId });

    if (orders.length === 0) {
        return next(AppError.notFound('No orders found for this payment reference'));
    }

    if (!isValid) {
        // Mark all as failed
        await Promise.all(orders.map(order => {
            order.paymentStatus = 'failed';
            order.orderStatus = 'payment_failed';
            order.paymentFailedAt = new Date();
            order.statusHistory.push({
                status: 'payment_failed',
                note: 'Signature verification failed',
                userModel: 'User'
            });
            return order.save();
        }));
        return next(AppError.badRequest('Payment verification failed'));
    }

    // Fetch details
    const paymentDetails = await razorpayService.getPaymentDetails(razorpayPaymentId);

    if (paymentDetails.status !== 'captured') {
        await Promise.all(orders.map(order => {
            order.paymentStatus = 'failed';
            order.orderStatus = 'payment_failed';
            order.paymentFailedAt = new Date();
            order.statusHistory.push({
                status: 'payment_failed',
                note: `Payment status: ${paymentDetails.status}`,
                userModel: 'User'
            });
            return order.save();
        }));
        return next(AppError.badRequest('Payment not captured'));
    }

    // Success - Update ALL split orders
    const updatedOrders = await Promise.all(orders.map(async (order) => {
        order.paymentStatus = 'paid';
        order.orderStatus = 'confirmed'; // Confirmed immediately upon payment
        order.razorpayPaymentId = razorpayPaymentId;
        order.razorpaySignature = razorpaySignature;
        order.transactionId = paymentDetails.acquirer_data?.bank_transaction_id || paymentDetails.id;
        order.paidAt = new Date();
        order.confirmedAt = new Date();
        order.paymentCompletedAt = new Date(paymentDetails.created_at * 1000);

        // Extract method details (simplified)
        order.paymentDetails = {
            method: paymentDetails.method,
            bank: paymentDetails.bank,
            wallet: paymentDetails.wallet,
            vpa: paymentDetails.vpa
        };

        order.statusHistory.push({
            status: 'confirmed',
            note: 'Payment successful, Order confirmed',
            timestamp: new Date(),

            userModel: 'User'
        });

        // Decrement stock for items in this order
        for (const item of order.items) {
            await Product.findByIdAndUpdate(item.product, {
                $inc: { stock: -item.quantity },
                $set: { lastSoldAt: new Date() } // Update metadata if needed
            });

            // Also update seller metrics - async fire and forget
            Seller.findByIdAndUpdate(order.seller, {
                $inc: { 'metrics.totalOrders': 1, 'metrics.totalRevenue': order.totalAmount }
            }).exec().catch(() => { });
        }

        return order.save();
    }));

    res.json({
        status: 'success',
        message: 'Payment verified. All orders confirmed!',
        data: {
            ordersCount: updatedOrders.length,
            orderNumbers: updatedOrders.map(o => o.orderNumber)
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
    if (status) query.orderStatus = status;

    const skip = (page - 1) * limit;

    const orders = await Order.find(query)
        .sort({ orderedAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .populate('items.product', 'name images price')
        .populate('seller', 'businessName logo'); // Show seller info to buyer

    const total = await Order.countDocuments(query);

    res.json({
        status: 'success',
        results: orders.length,
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

    // Check if user is Buyer OR Seller OR Admin to allow access
    // But middleware usually separates this. Assuming this is buyer/public endpoint
    // We should strictly check ownership
    const userId = req.user._id;

    const order = await Order.findById(orderId)
        .populate('items.product', 'name images price description')
        .populate('seller', 'businessName logo email phone address'); // Provide seller contact to buyer for support

    if (!order) return next(AppError.notFound('Order not found'));

    // Check ownership
    // If it's a buyer app, req.user is the buyer. 
    // If we want detailed access control, check req.user.role if available or infer
    if (order.buyer.toString() !== userId.toString() && req.user.role !== 'admin') {
        return next(AppError.forbidden('You do not have permission to view this order'));
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
    const user = req.user;

    const order = await Order.findOne({ _id: orderId, buyer: user._id });

    if (!order) return next(AppError.notFound('Order not found'));

    if (!order.canBeCancelled()) {
        return next(AppError.badRequest(`Order cannot be cancelled. Status: ${order.orderStatus}`));
    }

    // Refund logic if paid
    if (order.paymentStatus === 'paid' && order.razorpayPaymentId) {
        try {
            // Note: Razorpay refund API might fail if old transaction.
            // Also, we must handle partial refunds if we split orders but they shared one payment ID?
            // Razorpay Refund works on Payment ID. If we refund fully, we refund the amount of THIS order.
            // So we pass 'amount' to refund method.

            // Note: razorpayService.refundPayment usually refunds full amount if no amount passed.
            // We should ensure we refund ONLY this order's totalAmount.
            // await razorpayService.refundPayment(order.razorpayPaymentId, order.totalAmount);

            // Placeholder for refund integration
            order.refund = {
                initiated: true,
                amount: order.totalAmount,
                status: 'pending',
                initiatedAt: new Date(),
                reason: 'User cancelled'
            };
        } catch (error) {
            console.error('Refund init error', error);
        }
    }

    // Cancel
    await order.cancel(reason, user._id, 'User');

    // Restore stock
    for (const item of order.items) {
        await Product.findByIdAndUpdate(item.product, {
            $inc: { stock: item.quantity }
        });
    }

    res.json({
        status: 'success',
        message: 'Order cancelled successfully',
        data: { order },
    });
});

// =================================================================
// SELLER SPECIFIC ENDPOINTS
// =================================================================

/**
 * Get Seller's Orders
 * GET /api/v1/orders/seller/my-orders
 */
exports.getSellerOrders = catchAsync(async (req, res, next) => {
    const sellerId = req.seller.id; // From protectSeller middleware
    const { status, page = 1, limit = 20, startDate, endDate, search } = req.query;

    const query = { seller: sellerId };

    if (status && status !== 'All') {
        query.orderStatus = status;
    }

    if (startDate && endDate) {
        query.orderedAt = {
            $gte: new Date(startDate),
            $lte: new Date(endDate)
        };
    }

    // Search by Order Number
    if (search) {
        query.orderNumber = { $regex: search, $options: 'i' };
    }

    const skip = (page - 1) * limit;

    const orders = await Order.find(query)
        .sort({ orderedAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .populate('buyer', 'name email phone avatar') // Show buyer info to seller
        .populate('items.product', 'name images');

    const total = await Order.countDocuments(query);

    // Calculate stats for tabs
    const stats = await Order.aggregate([
        { $match: { seller: new mongoose.Types.ObjectId(sellerId) } },
        { $group: { _id: '$orderStatus', count: { $sum: 1 } } }
    ]);

    const statsMap = stats.reduce((acc, curr) => {
        acc[curr._id] = curr.count;
        return acc;
    }, {});

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
            stats: statsMap
        },
    });
});

/**
 * Update Order Status (Seller)
 * PATCH /api/v1/orders/:id/status
 */
exports.updateOrderStatus = catchAsync(async (req, res, next) => {
    const { id } = req.params;
    const { status, note } = req.body;
    const sellerId = req.seller.id;

    // Allowed transitions map
    const allowedTransitions = {
        'pending': ['confirmed', 'cancelled'],
        'payment_pending': ['cancelled'], // Can't manually confirm payment pending usually, but maybe?
        'confirmed': ['processing', 'cancelled'],
        'processing': ['shipped', 'cancelled'],
        'shipped': ['out_for_delivery', 'delivered', 'returned'],
        'out_for_delivery': ['delivered', 'returned'],
        'delivered': ['returned'], // Return logic separate usually
        'cancelled': [],
        'returned': []
    };

    const order = await Order.findOne({ _id: id, seller: sellerId });

    if (!order) return next(AppError.notFound('Order not found'));

    // Validate Transition
    if (!allowedTransitions[order.orderStatus]?.includes(status)) {
        // Allow Admin override? Assuming this is seller endpoint only per my route plan
        return next(AppError.badRequest(`Cannot change status from ${order.orderStatus} to ${status}`));
    }

    order.orderStatus = status;

    // Update timestamp fields
    if (status === 'confirmed') order.confirmedAt = new Date();
    if (status === 'shipped') order.shippedAt = new Date();
    if (status === 'delivered') order.deliveredAt = new Date();
    if (status === 'cancelled') {
        order.cancelledAt = new Date();
        order.cancellationReason = note || 'Cancelled by seller';

        // Restore stock logic if cancelled by seller
        for (const item of order.items) {
            await Product.findByIdAndUpdate(item.product, {
                $inc: { stock: item.quantity }
            });
        }
    }

    // Add to history
    order.statusHistory.push({
        status: status,
        note: note || `Status updated to ${status}`,
        updatedBy: sellerId,
        userModel: 'Seller'
    });

    await order.save();

    res.json({
        status: 'success',
        message: `Order marked as ${status}`,
        data: { order }
    });
});

/**
 * Get Single Order Details (Seller)
 * GET /api/v1/orders/seller/:id
 */
exports.getSellerOrderById = catchAsync(async (req, res, next) => {
    const { id } = req.params;
    const sellerId = req.seller.id;

    const order = await Order.findOne({ _id: id, seller: sellerId })
        .populate('buyer', 'name email phone address avatar')
        .populate('items.product', 'name images price sku');

    if (!order) return next(AppError.notFound('Order not found'));

    res.json({
        status: 'success',
        data: { order }
    });
});

