const Joi = require('joi');
const AppError = require('../utils/AppError');

/**
 * Validation schema for creating an order
 */
const createOrderSchema = Joi.object({
    items: Joi.array()
        .min(1)
        .required()
        .items(
            Joi.object({
                _id: Joi.string().required(),
                name: Joi.string().required(),
                price: Joi.number().min(0).required(),
                quantity: Joi.number().integer().min(1).required(),
                images: Joi.array().items(Joi.string()).default([]),
            })
        )
        .messages({
            'array.min': 'Order must contain at least one item',
            'any.required': 'Items are required',
        }),

    shippingAddress: Joi.object({
        fullName: Joi.string().trim().required().messages({
            'any.required': 'Full name is required',
        }),
        phone: Joi.string()
            .trim()
            .pattern(/^(\+91\s?)?[6-9]\d{9}$/)
            .required()
            .messages({
                'string.pattern.base': 'Phone number must be 10 digits starting with 6-9, optionally prefixed with +91',
                'any.required': 'Phone number is required',
            }),
        addressLine1: Joi.string().trim().required().messages({
            'any.required': 'Address line 1 is required',
        }),
        addressLine2: Joi.string().trim().allow('').optional(),
        city: Joi.string().trim().required().messages({
            'any.required': 'City is required',
        }),
        state: Joi.string().trim().required().messages({
            'any.required': 'State is required',
        }),
        zipCode: Joi.string()
            .trim()
            .pattern(/^\d{6}$/)
            .required()
            .messages({
                'string.pattern.base': 'ZIP code must be 6 digits',
                'any.required': 'ZIP code is required',
            }),
        country: Joi.string().trim().default('India'),
    }).required(),

    paymentMethod: Joi.string()
        .valid('cod', 'online')
        .optional()
        .messages({
            'any.only': 'Payment method must be either "cod" or "online"',
        }),

    pricing: Joi.object({
        subtotal: Joi.number().min(0).required(),
        shippingCharge: Joi.number().min(0).default(0),
        handlingCharge: Joi.number().min(0).default(0),
        tax: Joi.number().min(0).default(0),
        totalAmount: Joi.number().min(0).required(),
    }).optional(),
});

/**
 * Validation schema for payment verification
 */
const paymentVerificationSchema = Joi.object({
    razorpayOrderId: Joi.string().required().messages({
        'any.required': 'Razorpay order ID is required',
    }),
    razorpayPaymentId: Joi.string().required().messages({
        'any.required': 'Razorpay payment ID is required',
    }),
    razorpaySignature: Joi.string().required().messages({
        'any.required': 'Razorpay signature is required',
    }),
});

/**
 * Middleware to validate order creation
 */
exports.validateCreateOrder = (req, res, next) => {
    const { error } = createOrderSchema.validate(req.body, { abortEarly: false });

    if (error) {
        const errors = error.details.map((err) => err.message);
        return next(AppError.badRequest(`Validation failed: ${errors.join(', ')}`));
    }

    next();
};

/**
 * Middleware to validate payment verification
 */
exports.validatePaymentVerification = (req, res, next) => {
    const { error } = paymentVerificationSchema.validate(req.body, { abortEarly: false });

    if (error) {
        const errors = error.details.map((err) => err.message);
        return next(AppError.badRequest(`Validation failed: ${errors.join(', ')}`));
    }

    next();
};
