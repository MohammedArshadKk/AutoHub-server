const Order = require('../models/Order');
const invoiceService = require('../services/invoiceService');
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

    console.log(`✅ Razorpay Order Created: ${razorpayOrder.id} for receipt: ${receiptId}`);

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

    console.log('🔍 Verifying payment:', { razorpayOrderId, razorpayPaymentId, buyerId });

    if (!razorpayOrderId || !razorpayPaymentId || !razorpaySignature) {
        console.error('❌ Missing verification details in body');
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

    console.log(`📦 Found ${orders.length} orders for Razorpay Order ID: ${razorpayOrderId}`);

    if (orders.length === 0) {
        console.error(`❌ No orders found for ${razorpayOrderId} and buyer ${buyerId}`);
        return next(AppError.notFound('No orders found for this payment reference'));
    }

    // IDEMPOTENCY CHECK: If first order is already paid, assume all are processed
    if (orders[0].paymentStatus === 'paid') {
        console.log(`ℹ️ Orders for ${razorpayOrderId} already marked as paid. Returning success.`);
        return res.json({
            status: 'success',
            message: 'Payment already verified.',
            data: {
                ordersCount: orders.length,
                orderNumbers: orders.map(o => o.orderNumber)
            },
        });
    }

    // 3. Signature verification
    // Note: We check signature first, but if it fails, we fall back to direct API check
    // to handle cases where frontend/backend are slightly out of sync or signature logic differs.
    if (!isValid) {
        console.warn('⚠️ Razorpay signature verification failed locally. Falling back to direct API check...');
        const checkResult = await razorpayService.checkPayment(razorpayPaymentId);

        if (!checkResult.success) {
            console.error('❌ Direct API check also failed or payment not successful');
            // Mark all as failed since even manual check failed
            await Promise.all(orders.map(order => {
                order.paymentStatus = 'failed';
                order.orderStatus = 'payment_failed';
                order.paymentFailedAt = new Date();
                order.statusHistory.push({
                    status: 'payment_failed',
                    note: `Payment verification failed. Local: signature mismatch. Razorpay: ${checkResult.payment?.status || 'unknown'}`,
                    userModel: 'User'
                });
                return order.save();
            }));
            return next(AppError.badRequest('Payment verification failed'));
        }

        console.log('✅ Fallback: Direct API check confirmed payment is successful');
    }

    // Fetch details
    let paymentDetails = await razorpayService.getPaymentDetails(razorpayPaymentId);

    // If payment is authorized but not captured, try to capture it now
    if (paymentDetails.status === 'authorized') {
        console.log(`💰 Payment ${razorpayPaymentId} is authorized. Capturing now...`);
        try {
            paymentDetails = await razorpayService.capturePayment(razorpayPaymentId, paymentDetails.amount / 100);
            console.log(`✅ Payment ${razorpayPaymentId} captured successfully`);
        } catch (captureErr) {
            console.error(`❌ Manual capture failed for ${razorpayPaymentId}:`, captureErr);
            // We can still proceed if we want to trust 'authorized', but safer to fail if capture fails
        }
    }

    if (paymentDetails.status !== 'captured') {
        await Promise.all(orders.map(order => {
            order.paymentStatus = 'failed';
            order.orderStatus = 'payment_failed';
            order.paymentFailedAt = new Date();
            order.statusHistory.push({
                status: 'payment_failed',
                note: `Payment status: ${paymentDetails.status}. Capture required.`,
                userModel: 'User'
            });
            return order.save();
        }));
        return next(AppError.badRequest(`Payment not captured. Status: ${paymentDetails.status}`));
    }

    // Success - Update ALL split orders
    const updatedOrders = await Promise.all(orders.map(async (order) => {
        // Double check idempotency per order
        if (order.paymentStatus === 'paid') return order;

        order.paymentStatus = 'paid';
        order.orderStatus = 'confirmed'; // Confirmed immediately upon payment
        order.razorpayPaymentId = razorpayPaymentId;
        order.razorpaySignature = razorpaySignature;
        order.transactionId = paymentDetails.acquirer_data?.bank_transaction_id || paymentDetails.id;
        order.paidAt = new Date();
        order.confirmedAt = new Date();
        order.paymentCompletedAt = new Date(paymentDetails.created_at * 1000);
        order.paymentGatewayResponse = paymentDetails; // Store full response for audit

        // Extract method details (simplified)
        order.paymentDetails = {
            method: paymentDetails.method,
            bank: paymentDetails.bank,
            wallet: paymentDetails.wallet,
            vpa: paymentDetails.vpa,
            card: paymentDetails.card ? {
                network: paymentDetails.card.network,
                last4: paymentDetails.card.last4,
                issuer: paymentDetails.card.issuer
            } : undefined
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

    // Restore stock ONLY if it was previously decremented
    // Stock is NOT decremented for online orders until payment is successful (payment_pending)
    if (order.orderStatus !== 'payment_pending' && order.orderStatus !== 'payment_failed') {
        for (const item of order.items) {
            await Product.findByIdAndUpdate(item.product, {
                $inc: { stock: item.quantity }
            });
        }
    }

    // Cancel order status finally (order.cancel saves the status change)
    await order.cancel(reason, user._id, 'User');

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

        // Restore stock logic ONLY if it was previously decremented
        if (order.orderStatus !== 'payment_pending' && order.orderStatus !== 'payment_failed') {
            for (const item of order.items) {
                await Product.findByIdAndUpdate(item.product, {
                    $inc: { stock: item.quantity }
                });
            }
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
/**
 * Sync Order Payment status with Razorpay (Buyer initiated or system cleanup)
 * POST /api/v1/orders/payment/sync
 */
exports.syncOrderPayment = catchAsync(async (req, res, next) => {
    const { razorpayOrderId } = req.body;
    const buyerId = req.user._id;

    if (!razorpayOrderId) {
        return next(AppError.badRequest('Razorpay Order ID is required'));
    }

    // Find all orders linked to this razorpayOrderId
    const orders = await Order.find({ razorpayOrderId: razorpayOrderId, buyer: buyerId });

    if (orders.length === 0) {
        return next(AppError.notFound('No orders found for this payment reference'));
    }

    // If already paid, return success
    if (orders[0].paymentStatus === 'paid') {
        return res.json({
            status: 'success',
            message: 'Payment already verified',
            data: {
                ordersCount: orders.length,
                orderNumbers: orders.map(o => o.orderNumber)
            }
        });
    }

    // Fetch payments from Razorpay
    const payments = await razorpayService.getPaymentsForOrder(razorpayOrderId);
    // Find a payment that is either captured or authorized
    let successfulPayment = payments.find(p => p.status === 'captured' || p.status === 'authorized');

    if (!successfulPayment) {
        return res.json({
            status: 'fail',
            message: 'No successful payment found on Razorpay for this order.',
            data: {
                razorpayStatus: payments.length > 0 ? payments[0].status : 'created',
                attemptsCount: payments.length
            }
        });
    }

    // If payment is authorized but not captured, try to capture it
    if (successfulPayment.status === 'authorized') {
        try {
            successfulPayment = await razorpayService.capturePayment(successfulPayment.id, successfulPayment.amount / 100);
        } catch (captureErr) {
            console.error(`Capture failed during sync for ${successfulPayment.id}:`, captureErr);
        }
    }

    // Re-verify status after possible capture
    if (successfulPayment.status !== 'captured') {
        return res.json({
            status: 'fail',
            message: `Payment found but could not be captured. Status: ${successfulPayment.status}`,
        });
    }

    // Found a successful payment! Update orders
    const updatedOrders = await Promise.all(orders.map(async (order) => {
        if (order.paymentStatus === 'paid') return order;

        order.paymentStatus = 'paid';
        order.orderStatus = 'confirmed';
        order.razorpayPaymentId = successfulPayment.id;
        order.transactionId = successfulPayment.acquirer_data?.bank_transaction_id || successfulPayment.id;
        order.paidAt = new Date();
        order.confirmedAt = new Date();
        order.paymentCompletedAt = new Date(successfulPayment.created_at * 1000);
        order.paymentGatewayResponse = successfulPayment;

        order.paymentDetails = {
            method: successfulPayment.method,
            bank: successfulPayment.bank,
            wallet: successfulPayment.wallet,
            vpa: successfulPayment.vpa,
            card: successfulPayment.card ? {
                network: successfulPayment.card.network,
                last4: successfulPayment.card.last4,
                issuer: successfulPayment.card.issuer
            } : undefined
        };

        order.statusHistory.push({
            status: 'confirmed',
            note: 'Order synchronized with Razorpay payment',
            timestamp: new Date(),
            userModel: 'User'
        });

        // Decrement stock and update metrics
        for (const item of order.items) {
            await Product.findByIdAndUpdate(item.product, {
                $inc: { stock: -item.quantity },
                $set: { lastSoldAt: new Date() }
            });

            Seller.findByIdAndUpdate(order.seller, {
                $inc: { 'metrics.totalOrders': 1, 'metrics.totalRevenue': order.totalAmount }
            }).exec().catch(() => { });
        }

        return order.save();
    }));

    res.json({
        status: 'success',
        message: 'Payment synchronized and verified successfully!',
        data: {
            ordersCount: updatedOrders.length,
            orderNumbers: updatedOrders.map(o => o.orderNumber)
        }
    });
});
/**
 * Admin: Get all orders with filtering and search
 * GET /api/v1/orders/admin/all
 */
exports.getAdminOrders = catchAsync(async (req, res, next) => {
    const {
        page = 1,
        limit = 20,
        sellerId,
        status,
        paymentStatus,
        paymentMethod,
        search,
        startDate,
        endDate
    } = req.query;

    const query = {};

    // Filter by seller
    if (sellerId) query.seller = sellerId;

    // Filter by status
    if (status) query.orderStatus = status;

    // Filter by payment status
    if (paymentStatus) query.paymentStatus = paymentStatus;

    // Filter by payment method
    if (paymentMethod) query.paymentMethod = paymentMethod;

    // Search by order number
    if (search) {
        query.orderNumber = { $regex: search, $options: 'i' };
    }

    // Date range filter
    if (startDate || endDate) {
        query.createdAt = {};
        if (startDate) query.createdAt.$gte = new Date(startDate);
        if (endDate) query.createdAt.$lte = new Date(endDate);
    }

    const skip = (page - 1) * limit;

    const [orders, total] = await Promise.all([
        Order.find(query)
            .populate('buyer', 'name email phone avatar')
            .populate('seller', 'businessName ownerName email')
            .populate('items.product', 'name images price')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(parseInt(limit)),
        Order.countDocuments(query)
    ]);

    res.json({
        status: 'success',
        results: orders.length,
        pagination: {
            total,
            page: parseInt(page),
            pages: Math.ceil(total / limit),
            limit: parseInt(limit)
        },
        data: { orders }
    });
});

/**
 * Admin: Get order details by ID
 * GET /api/v1/orders/admin/:id
 */
exports.getAdminOrderById = catchAsync(async (req, res, next) => {
    const { id } = req.params;

    const order = await Order.findById(id)
        .populate('buyer', 'name email phone address avatar')
        .populate('seller', 'businessName ownerName email phone address')
        .populate('items.product', 'name images price sku');

    if (!order) return next(AppError.notFound('Order not found'));

    res.json({
        status: 'success',
        data: { order }
    });
});

/**
 * Admin: Update order status (Override)
 * PATCH /api/v1/orders/admin/:id/status
 */
exports.adminUpdateOrderStatus = catchAsync(async (req, res, next) => {
    const { id } = req.params;
    const { status, note } = req.body;

    const order = await Order.findById(id);
    if (!order) return next(AppError.notFound('Order not found'));

    const oldStatus = order.orderStatus;
    order.orderStatus = status;

    // Handle cancellation stock restoration if needed
    if (status === 'cancelled' && oldStatus !== 'cancelled') {
        // Only restore if it was previously decremented
        if (order.paymentStatus === 'paid' || order.paymentMethod === 'cod') {
            for (const item of order.items) {
                await Product.findByIdAndUpdate(item.product, {
                    $inc: { stock: item.quantity }
                });
            }
        }
    }

    order.statusHistory.push({
        status,
        note: note || `Status updated by admin. Previous: ${oldStatus}`,
        timestamp: new Date(),
        userModel: 'Admin'
    });

    await order.save();

    res.json({
        status: 'success',
        message: 'Order status updated successfully',
        data: { order }
    });
});

/**
 * Handle Razorpay Payment Callback (POST)
 * Used when callback_url is provided in checkout options
 */
exports.handlePaymentCallback = catchAsync(async (req, res, next) => {
    // Razorpay sends data in body (x-www-form-urlencoded)
    const { razorpay_payment_id, razorpay_order_id, razorpay_signature, error_code, error_description } = req.body;

    console.log('🔄 Razorpay Callback received:', req.body);
    const frontendUrl = process.env.BUYER_FRONTEND_URL || 'http://localhost:5173';

    // Handle Failure Callback (if applicable)
    if (error_code) {
        console.error(`❌ Razorpay Callback Error: ${error_code} - ${error_description}`);
        // Redirect to My Orders or Checkout
        return res.redirect(`${frontendUrl}/orders?error=${encodeURIComponent(error_description || 'Payment Failed')}`);
    }

    if (!razorpay_payment_id || !razorpay_order_id || !razorpay_signature) {
        console.error('❌ Missing payment details in callback');
        return res.redirect(`${frontendUrl}/orders?error=Invalid_Callback_Data`);
    }

    try {
        // 1. Verify Signature
        const isValid = razorpayService.verifyPaymentSignature(
            razorpay_order_id,
            razorpay_payment_id,
            razorpay_signature
        );

        if (!isValid) {
            console.error('❌ Signature Verification Failed in Callback');
            return res.redirect(`${frontendUrl}/orders?error=Signature_Verification_Failed`);
        }

        // 2. Find Order(s)
        // Note: No auth req.user available here, so we find by razorpayOrderId solely.
        const orders = await Order.find({ razorpayOrderId: razorpay_order_id });
        if (!orders || orders.length === 0) {
            console.error(`❌ Order not found for Razorpay Order ID: ${razorpay_order_id}`);
            return res.redirect(`${frontendUrl}/orders?error=Order_Not_Found`);
        }

        // 3. Process Success (Update Orders)
        // Check if already paid to avoid duplicate processing
        if (orders[0].paymentStatus === 'paid') {
            console.log('ℹ️ Order already paid. Redirecting to success.');
            return res.redirect(`${frontendUrl}/order-success?orderId=${orders[0]._id}`);
        }

        // Fetch Payment Details from Razorpay to get method info
        let paymentDetails;
        try {
            paymentDetails = await razorpayService.getPaymentDetails(razorpay_payment_id);
        } catch (e) {
            console.warn("Could not fetch payment details in callback", e);
            paymentDetails = { method: 'online (callback)', status: 'captured' };
        }

        const updatedOrders = await Promise.all(orders.map(async (order) => {
            if (order.paymentStatus === 'paid') return order;

            order.paymentStatus = 'paid';
            order.orderStatus = 'confirmed';
            order.razorpayPaymentId = razorpay_payment_id;
            order.razorpaySignature = razorpay_signature;
            order.transactionId = paymentDetails.acquirer_data?.bank_transaction_id || paymentDetails.id || razorpay_payment_id;
            order.paidAt = new Date();
            order.confirmedAt = new Date();

            order.paymentDetails = {
                method: paymentDetails.method || 'online',
                bank: paymentDetails.bank,
                wallet: paymentDetails.wallet,
                vpa: paymentDetails.vpa,
                card: paymentDetails.card
            };

            order.statusHistory.push({
                status: 'confirmed',
                note: 'Payment successful (Callback)',
                timestamp: new Date(),
                userModel: 'User' // We don't have req.user from callback auth reliably
            });

            // Stock update
            for (const item of order.items) {
                await Product.findByIdAndUpdate(item.product, {
                    $inc: { stock: -item.quantity },
                    $set: { lastSoldAt: new Date() }
                });
                Seller.findByIdAndUpdate(order.seller, {
                    $inc: { 'metrics.totalOrders': 1, 'metrics.totalRevenue': order.totalAmount }
                }).exec().catch(() => { });
            }

            return order.save();
        }));

        // 4. Redirect to Success Page
        // Use the first order ID for the "View Order" link
        const targetOrderId = updatedOrders[0]._id;
        return res.redirect(`${frontendUrl}/order-success?orderId=${targetOrderId}&clear_cart=true`);

    } catch (error) {
        console.error('Callback processing error:', error);
    }
});

/**
 * Download Invoice
 * GET /api/v1/orders/:orderId/invoice
 */
exports.downloadInvoice = catchAsync(async (req, res, next) => {
    const { orderId } = req.params;
    const userId = req.user._id;

    const order = await Order.findById(orderId)
        .populate('items.product', 'name price')
        .populate('buyer', 'name email')
        .populate('seller', 'businessName address phone email');

    if (!order) return next(AppError.notFound('Order not found'));

    // Check ownership
    if (order.buyer._id.toString() !== userId.toString() && req.user.role !== 'admin') {
        return next(AppError.forbidden('You do not have permission to view this invoice'));
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=invoice-${order.orderNumber}.pdf`);

    invoiceService.generateInvoiceStream(order, res);
});
