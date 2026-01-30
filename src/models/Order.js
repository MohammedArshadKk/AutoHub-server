const mongoose = require('mongoose');

/**
 * Order Item Schema - Individual products in an order
 */
const orderItemSchema = new mongoose.Schema({
    product: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Product',
        required: true,
    },
    // Seller reference is now at the Order level, but keeping strict check
    name: {
        type: String,
        required: true,
    },
    price: {
        type: Number,
        required: true,
        min: 0,
    },
    quantity: {
        type: Number,
        required: true,
        min: 1,
    },
    images: [String],
});

/**
 * Main Order Schema
 */
const orderSchema = new mongoose.Schema(
    {
        // Buyer reference
        buyer: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
            index: true,
        },

        // Seller reference (New: One order per seller)
        seller: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Seller',
            required: true,
            index: true,
        },

        // Seller Details Snapshot (For historical accuracy)
        sellerDetails: {
            businessName: String,
            email: String,
            phone: String,
            address: String,
            gstNumber: String,
        },

        // Auto-generated order number (e.g., ORD000001)
        orderNumber: {
            type: String,
            unique: true,
            index: true,
        },

        // Order items
        items: {
            type: [orderItemSchema],
            validate: {
                validator: function (v) {
                    return v && v.length > 0;
                },
                message: 'Order must contain at least one item',
            },
        },

        // Shipping address
        shippingAddress: {
            fullName: { type: String, required: true },
            phone: { type: String, required: true },
            addressLine1: { type: String, required: true },
            addressLine2: String,
            city: { type: String, required: true },
            state: { type: String, required: true },
            zipCode: { type: String, required: true },
            country: { type: String, default: 'India' },
        },

        // Pricing breakdown
        subtotal: {
            type: Number,
            required: true,
            min: 0,
        },
        shippingCharge: {
            type: Number,
            default: 0,
            min: 0,
        },
        handlingCharge: {
            type: Number,
            default: 0,
            min: 0,
        },
        tax: {
            type: Number,
            default: 0,
            min: 0,
        },
        totalAmount: {
            type: Number,
            required: true,
            min: 0,
        },

        // Payment details
        paymentMethod: {
            type: String,
            enum: ['cod', 'online'],
            required: true,
        },
        paymentStatus: {
            type: String,
            enum: ['pending_payment', 'pending', 'paid', 'failed', 'refunded', 'partially_refunded'],
            default: 'pending',
        },

        // ==================== PAYMENT GATEWAY DETAILS ====================

        // Razorpay IDs
        razorpayOrderId: {
            type: String,
            index: true,
        },
        razorpayPaymentId: {
            type: String,
            index: true,
        },
        razorpaySignature: String, // Store signature for audit trail

        // Transaction Details
        transactionId: {
            type: String,
            index: true,
        }, // Bank/UPI transaction ID

        // Payment Method Details (from Razorpay payment object)
        paymentDetails: {
            method: String, // 'card', 'upi', 'netbanking', 'wallet'

            // Card details (if payment via card)
            card: {
                type: String, // 'credit', 'debit'
                network: String, // 'Visa', 'MasterCard', 'RuPay'
                last4: String, // Last 4 digits
                name: String, // Cardholder name
                issuer: String, // Bank name
                emi: Boolean, // EMI used or not
            },

            // UPI details (if payment via UPI)
            upi: {
                vpa: String, // Virtual Payment Address (e.g., user@paytm)
            },

            // Netbanking details
            bank: String, // Bank name for netbanking/card

            // Wallet details
            wallet: String, // 'paytm', 'phonepe', 'amazonpay', etc.
        },

        // Payment Response (Full Razorpay payment object for audit)
        paymentGatewayResponse: {
            type: mongoose.Schema.Types.Mixed,
            select: false, // Don't return by default (contains sensitive data)
        },

        // Payment Timestamps
        paymentInitiatedAt: Date,
        paymentCompletedAt: Date,
        paymentFailedAt: Date,

        // Refund Details
        refund: {
            initiated: { type: Boolean, default: false },
            refundId: String, // Razorpay refund ID
            amount: Number, // Refund amount (can be partial)
            status: {
                type: String,
                enum: ['pending', 'processing', 'processed', 'failed'],
            },
            reason: String,
            initiatedAt: Date,
            processedAt: Date,
            transactionId: String, // Refund transaction ID
        },

        // Payment Attempts (for tracking failed payments)
        paymentAttempts: [{
            attemptedAt: { type: Date, default: Date.now },
            paymentId: String,
            status: String, // 'failed', 'cancelled', 'timeout'
            errorCode: String,
            errorDescription: String,
        }],

        // Order status workflow
        orderStatus: {
            type: String,
            enum: [
                'payment_pending', // Waiting for online payment
                'pending', // COD - awaiting confirmation OR Online - Paid & Pending Confirmation
                'confirmed', // Order confirmed by Seller
                'processing', // Being prepared
                'shipped', // On the way
                'out_for_delivery', // Out for delivery
                'delivered', // Delivered successfully
                'cancelled', // Cancelled by user/admin/seller
                'returned', // Returned by user
                'payment_failed', // Payment verification failed
            ],
            default: 'pending',
            index: true,
        },

        // Status History Tracking
        statusHistory: [{
            status: {
                type: String,
                required: true
            },
            timestamp: {
                type: Date,
                default: Date.now
            },
            note: String,
            updatedBy: {
                type: mongoose.Schema.Types.ObjectId,
                refPath: 'statusHistory.userModel' // Dynamic reference to User or Seller or Admin
            },
            userModel: {
                type: String,
                required: true,
                enum: ['User', 'Seller', 'Admin']
            }
        }],

        // Timestamps
        orderedAt: {
            type: Date,
            default: Date.now,
            index: true,
        },
        paidAt: Date,
        confirmedAt: Date,
        shippedAt: Date,
        deliveredAt: Date,
        cancelledAt: Date,

        // Additional info
        orderNotes: String,
        trackingNumber: String,
        courierPartner: String,
        cancellationReason: String,
    },
    {
        timestamps: true, // Adds createdAt and updatedAt
    }
);

// ==================== INDEXES ====================

// Performance indexes for buyer queries
orderSchema.index({ buyer: 1, orderStatus: 1 });
orderSchema.index({ buyer: 1, orderedAt: -1 });

// Performance indexes for seller queries
orderSchema.index({ seller: 1, orderStatus: 1 });
orderSchema.index({ seller: 1, orderedAt: -1 });

orderSchema.index({ orderNumber: 1 });
orderSchema.index({ razorpayOrderId: 1 });

// ==================== PRE-SAVE HOOKS ====================

/**
 * Generate unique order number before saving
 * Format: ORD000001, ORD000002, etc.
 */
orderSchema.pre('save', async function (next) {
    if (!this.orderNumber) {
        try {
            const count = await this.constructor.countDocuments();
            // Add random 4 digits to avoid collision in high concurrency if needed, 
            // but for now simple increment + checking valid unique index
            this.orderNumber = `ORD${String(count + 1).padStart(8, '0')}`;
        } catch (error) {
            return next(error);
        }
    }
    next();
});

// ==================== INSTANCE METHODS ====================

/**
 * Check if order can be cancelled
 */
orderSchema.methods.canBeCancelled = function () {
    return ['pending', 'payment_pending', 'confirmed', 'processing'].includes(this.orderStatus);
};

/**
 * Cancel the order
 */
orderSchema.methods.cancel = async function (reason, cancelledBy, userModel) {
    if (!this.canBeCancelled()) {
        throw new Error('This order cannot be cancelled');
    }

    this.orderStatus = 'cancelled';
    this.cancelledAt = new Date();
    if (reason) {
        this.cancellationReason = reason;
    }

    // Add to history
    this.statusHistory.push({
        status: 'cancelled',
        note: reason,
        updatedBy: cancelledBy,
        userModel: userModel
    });

    return this.save();
};

// ==================== STATICS ====================

/**
 * Find orders by buyer ID
 */
orderSchema.statics.findByBuyer = function (buyerId, options = {}) {
    const { status, page = 1, limit = 10 } = options;
    const query = { buyer: buyerId };

    if (status) {
        query.orderStatus = status;
    }

    return this.find(query)
        .sort({ orderedAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .populate('items.product', 'name images price')
        .populate('seller', 'businessName');
};

const Order = mongoose.model('Order', orderSchema);

module.exports = Order;
