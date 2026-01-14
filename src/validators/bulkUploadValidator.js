const Joi = require('joi');

const vehicleSchema = Joi.object({
    year: Joi.number().integer().min(1900).max(new Date().getFullYear() + 2).required(),
    make: Joi.string().trim().required(),
    model: Joi.string().trim().required(),
    variant: Joi.string().trim().allow(''),
});

const productSchema = Joi.object({
    name: Joi.string().trim().max(200).required(),
    description: Joi.string().trim().max(5000).required(),
    category: Joi.string().valid(
        'Engine', 'Transmission', 'Suspension', 'Brakes', 'Electrical',
        'Body', 'Interior', 'Exterior', 'Exhaust', 'Cooling',
        'Fuel System', 'Steering', 'Wheels & Tires', 'Lighting', 'HVAC', 'Other'
    ).required(),

    price: Joi.number().min(0).default(0),
    originalPrice: Joi.number().min(0),
    stock: Joi.number().integer().min(0).default(0),

    condition: Joi.string().valid(
        'New', 'Refurbished', 'Used - Like New', 'Used - Good', 'Used - Fair'
    ).default('New'),

    status: Joi.string().valid(
        'DRAFT', 'PENDING_APPROVAL', 'ACTIVE', 'REJECTED', 'ARCHIVED'
    ).default('PENDING_APPROVAL'),

    partNumber: Joi.string().trim(),
    brand: Joi.string().trim(),
    subCategory: Joi.string().trim(),
    warranty: Joi.string().trim(),
    currency: Joi.string().valid('INR', 'USD', 'EUR').default('INR'),

    compatibleVehicles: Joi.array().items(vehicleSchema).max(5),
    specifications: Joi.object().pattern(Joi.string(), Joi.string()),

    tags: Joi.array().items(Joi.string()),
    images: Joi.array().items(Joi.string().uri()),

    weight: Joi.object({
        value: Joi.number().min(0).required(),
        unit: Joi.string().valid('kg', 'g', 'lbs').default('kg'),
    }),

    dimensions: Joi.object({
        length: Joi.number().min(0),
        width: Joi.number().min(0),
        height: Joi.number().min(0),
        unit: Joi.string().valid('cm', 'in', 'm').default('cm'),
    }),
});

const bulkProductsSchema = Joi.object({
    products: Joi.array().items(productSchema).min(1).max(100).required(),
});

exports.validateBulkProducts = (data) => {
    return bulkProductsSchema.validate(data, {
        abortEarly: false, // Return all errors, not just the first
        stripUnknown: true, // Remove unknown fields
    });
};
