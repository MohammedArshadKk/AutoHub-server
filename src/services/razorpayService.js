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
        if (!amount || isNaN(amount) || amount <= 0) {
            throw new Error(`Invalid amount for Razorpay order: ${amount}`);
        }

        const options = {
            amount: Math.round(amount * 100), // Convert rupees to paise
            currency: currency,
            receipt: receipt || `receipt_${Date.now()}`,
        };

        console.log('Creating Razorpay order with options:', options);

        const razorpay = getRazorpayInstance();
        const order = await razorpay.orders.create(options);
        return order;
    } catch (error) {
        console.error('Razorpay order creation failed details:', {
            message: error.message,
            stack: error.stack,
            error: error
        });
        throw new Error(`Failed to create payment order: ${error.message}`);
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
 * Check payment status (user requested logic)
 * @param {string} paymentId - Razorpay payment ID
 * @returns {Promise<object>} { success, payment }
 */
exports.checkPayment = async (paymentId) => {
    try {
        const razorpay = getRazorpayInstance();
        const payment = await razorpay.payments.fetch(paymentId);

        if (payment.status === "captured" || payment.status === "authorized") {
            return { success: true, payment };
        } else {
            return { success: false, payment };
        }
    } catch (error) {
        console.error(`checkPayment failed for ${paymentId}:`, error);
        return { success: false, error: error.message };
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
 * Verify Razorpay webhook signature
 * @param {string} body - Raw request body
 * @param {string} signature - Razorpay signature from headers
 * @returns {boolean} True if signature is valid
 */
exports.verifyWebhookSignature = (body, signature) => {
    try {
        const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
        if (!secret) {
            console.error('RAZORPAY_WEBHOOK_SECRET is not configured');
            return false;
        }

        const expectedSignature = crypto
            .createHmac('sha256', secret)
            .update(body)
            .digest('hex');

        return expectedSignature === signature;
    } catch (error) {
        console.error('Webhook signature verification failed:', error);
        return false;
    }
};

/**
 * Capture a payment manually if it wasn't captured automatically
 * @param {string} paymentId - Razorpay payment ID
 * @param {number} amount - Amount in rupees
 * @returns {Promise<object>} Captured payment details
 */
exports.capturePayment = async (paymentId, amount) => {
    try {
        const razorpay = getRazorpayInstance();
        const amountInPaise = Math.round(amount * 100);
        const payment = await razorpay.payments.capture(paymentId, amountInPaise, 'INR');
        return payment;
    } catch (error) {
        console.error(`Failed to capture payment ${paymentId}:`, error);
        throw new Error(`Payment capture failed: ${error.message}`);
    }
};

/**
 * Get all payments for a specific Razorpay Order ID
 * @param {string} orderId - Razorpay Order ID
 * @returns {Promise<Array>} List of payments
 */
exports.getPaymentsForOrder = async (orderId) => {
    try {
        const razorpay = getRazorpayInstance();
        const payments = await razorpay.orders.fetchPayments(orderId);
        return payments.items || [];
    } catch (error) {
        console.error(`Failed to fetch payments for order ${orderId}:`, error);
        throw new Error(`Failed to fetch payments: ${error.message}`);
    }
};

/**
 * Check if Razorpay is properly configured
 * @returns {boolean} True if configured
 */
exports.isConfigured = () => {
    return !!(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET);
};
