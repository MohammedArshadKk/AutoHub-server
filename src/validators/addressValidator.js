const Joi = require('joi');

const addressSchema = Joi.object({
    title: Joi.string().trim().max(50).required().messages({
        'string.empty': 'Address title is required',
        'string.max': 'Title cannot exceed 50 characters',
    }),

    fullName: Joi.string().trim().max(100).required().messages({
        'string.empty': 'Full name is required',
        'string.max': 'Name cannot exceed 100 characters',
    }),

    phone: Joi.string()
        .trim()
        .pattern(/^(\+91\s?)?[6-9]\d{9}$/)
        .required()
        .messages({
            'string.empty': 'Phone number is required',
            'string.pattern.base': 'Please provide a valid phone number (formats: 9876543210, +919876543210, +91 9876543210)',
        }),

    addressLine1: Joi.string().trim().max(200).required().messages({
        'string.empty': 'Address line 1 is required',
        'string.max': 'Address line 1 cannot exceed 200 characters',
    }),

    addressLine2: Joi.string().trim().max(200).allow('').optional(),

    city: Joi.string().trim().required().messages({
        'string.empty': 'City is required',
    }),

    state: Joi.string().trim().required().messages({
        'string.empty': 'State is required',
    }),

    zipCode: Joi.string()
        .trim()
        .pattern(/^\d{6}$/)
        .required()
        .messages({
            'string.empty': 'ZIP code is required',
            'string.pattern.base': 'Please provide a valid 6-digit PIN code',
        }),

    country: Joi.string().trim().default('India'),

    latitude: Joi.number().min(-90).max(90).optional().messages({
        'number.min': 'Latitude must be between -90 and 90',
        'number.max': 'Latitude must be between -90 and 90',
    }),

    longitude: Joi.number().min(-180).max(180).optional().messages({
        'number.min': 'Longitude must be between -180 and 180',
        'number.max': 'Longitude must be between -180 and 180',
    }),

    googleMapsLink: Joi.string().trim().uri().optional(),

    isDefault: Joi.boolean().optional(),
});

exports.validateAddress = (data) => {
    return addressSchema.validate(data, {
        abortEarly: false,
        stripUnknown: true,
    });
};
