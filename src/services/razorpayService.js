const Razorpay = require('razorpay');
const crypto = require('crypto');

// Lazy initialization - only create instance when needed
let razorpayInstance = null;

/**
 * Get or create Razorpay instance
 * @returns {Razorpay} Razorpay instance
 */
const getRazorpayInstance = () => {
    if (!razorpayInstance) {
        // Check if keys are configured (not placeholders)
        const keyId = process.env.RAZORPAY_KEY_ID;
        const keySecret = process.env.RAZORPAY_KEY_SECRET;

        if (!keyId || !keySecret || keyId.includes('xxxxx') || keySecret.includes('xxxxx')) {
            throw new Error('Razorpay keys not configured. Please update RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in .env file');
        }

        razorpayInstance = new Razorpay({
            key_id: keyId,
            key_secret: keySecret,
        });
    }
    return razorpayInstance;
};

/**
 * Create a Razorpay order for payment
 * @param {number} amount - Amount in rupees (will be converted to paise)
 * @param {string} currency - Currency code (default: INR)
 * @param {string} receipt - Receipt ID (order number)
 * @returns {Promise<object>} Razorpay order object
 */
exports.createRazorpayOrder = async (amount, currency = 'INR', receipt = null) => {
    try {
        const options = {
            amount: Math.round(amount * 100), // Convert rupees to paise
            currency: currency,
            receipt: receipt || `receipt_${Date.now()}`,
            payment_capture: 1, // Auto capture payment after authorization
        };

        const razorpay = getRazorpayInstance();
        const order = await razorpay.orders.create(options);
        return order;
    } catch (error) {
        console.error('Razorpay order creation failed:', error);
        throw new Error('Failed to create payment order');
    }
};

/**
 * Verify Razorpay payment signature
 * @param {string} orderId - Razorpay order ID
 * @param {string} paymentId - Razorpay payment ID
 * @param {string} signature - Razorpay signature from frontend
 * @returns {boolean} True if signature is valid
 */
exports.verifyPaymentSignature = (orderId, paymentId, signature) => {
    try {
        // Create the expected signature using HMAC SHA256
        const text = `${orderId}|${paymentId}`;
        const expectedSignature = crypto
            .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
            .update(text)
            .digest('hex');

        // Compare signatures
        return expectedSignature === signature;
    } catch (error) {
        console.error('Signature verification failed:', error);
        return false;
    }
};

/**
 * Get payment details from Razorpay
 * @param {string} paymentId - Razorpay payment ID
 * @returns {Promise<object>} Payment details
 */
exports.getPaymentDetails = async (paymentId) => {
    try {
        const razorpay = getRazorpayInstance();
        const payment = await razorpay.payments.fetch(paymentId);
        return payment;
    } catch (error) {
        console.error('Failed to fetch payment details:', error);
        throw new Error('Failed to fetch payment details');
    }
};

/**
 * Refund a payment
 * @param {string} paymentId - Razorpay payment ID
 * @param {number} amount - Amount to refund in rupees (optional, full refund if not provided)
 * @returns {Promise<object>} Refund details
 */
exports.refundPayment = async (paymentId, amount = null) => {
    try {
        const razorpay = getRazorpayInstance();
        const options = {};
        if (amount) {
            options.amount = Math.round(amount * 100); // Convert to paise
        }

        const refund = await razorpay.payments.refund(paymentId, options);
        return refund;
    } catch (error) {
        console.error('Refund failed:', error);
        throw new Error('Failed to process refund');
    }
};

/**
 * Check if Razorpay is properly configured
 * @returns {boolean} True if configured
 */
exports.isConfigured = () => {
    return !!(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET);
};
