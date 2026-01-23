const Joi = require('joi');

// Vehicle compatibility schema
const vehicleSchema = Joi.object({
    year: Joi.number()
        .integer()
        .min(1900)
        .max(new Date().getFullYear() + 2)
        .required()
        .messages({
            'number.base': 'Year must be a number',
            'number.min': 'Year must be 1900 or later',
            'number.max': `Year cannot be more than ${new Date().getFullYear() + 2}`,
            'any.required': 'Year is required for each vehicle',
        }),
    make: Joi.string()
        .trim()
        .min(1)
        .max(50)
        .required()
        .messages({
            'string.empty': 'Make is required for each vehicle',
            'any.required': 'Make is required for each vehicle',
        }),
    model: Joi.string()
        .trim()
        .min(1)
        .max(100)
        .required()
        .messages({
            'string.empty': 'Model is required for each vehicle',
            'any.required': 'Model is required for each vehicle',
        }),
    variant: Joi.string()
        .trim()
        .max(100)
        .optional()
        .allow(''),
});

// Weight schema
const weightSchema = Joi.object({
    value: Joi.number().min(0).required(),
    unit: Joi.string().valid('kg', 'g', 'lbs').default('kg'),
});

// Dimensions schema
const dimensionsSchema = Joi.object({
    length: Joi.number().min(0).required(),
    width: Joi.number().min(0).required(),
    height: Joi.number().min(0).required(),
    unit: Joi.string().valid('cm', 'in', 'm').default('cm'),
});

// Create Part Validation
const createPartSchema = Joi.object({
    partName: Joi.string()
        .trim()
        .min(3)
        .max(200)
        .required()
        .messages({
            'string.empty': 'Part name is required',
            'string.min': 'Part name must be at least 3 characters',
            'string.max': 'Part name cannot exceed 200 characters',
            'any.required': 'Part name is required',
        }),

    description: Joi.string()
        .trim()
        .min(20)
        .max(5000)
        .required()
        .messages({
            'string.empty': 'Description is required',
            'string.min': 'Description must be at least 20 characters',
            'string.max': 'Description cannot exceed 5000 characters',
            'any.required': 'Description is required',
        }),

    partNumber: Joi.string()
        .trim()
        .uppercase()
        .max(50)
        .optional()
        .allow(''),

    defaultImageUrl: Joi.string()
        .uri()
        .optional()
        .allow('')
        .messages({
            'string.uri': 'Default image URL must be a valid URL',
        }),

    price: Joi.number()
        .min(0)
        .optional()
        .default(0)
        .messages({
            'number.min': 'Price cannot be negative',
        }),

    originalPrice: Joi.number()
        .min(0)
        .optional()
        .when('price', {
            is: Joi.exist(),
            then: Joi.number().min(Joi.ref('price')),
        })
        .messages({
            'number.min': 'Original price must be greater than or equal to selling price',
        }),

    currency: Joi.string()
        .valid('INR', 'USD', 'EUR')
        .optional()
        .default('INR'),

    compatibleVehicles: Joi.array()
        .items(vehicleSchema)
        .min(1)
        .required()
        .messages({
            'array.min': 'At least one compatible vehicle is required',
            'any.required': 'Compatible vehicles are required',
        }),

    category: Joi.string()
        .valid(
            'Engine',
            'Transmission',
            'Suspension',
            'Brakes',
            'Electrical',
            'Body',
            'Interior',
            'Exterior',
            'Exhaust',
            'Cooling',
            'Fuel System',
            'Steering',
            'Wheels & Tires',
            'Lighting',
            'HVAC',
            'Other'
        )
        .required()
        .messages({
            'any.only': 'Invalid category',
            'any.required': 'Category is required',
        }),

    subCategory: Joi.string()
        .trim()
        .max(100)
        .optional()
        .allow(''),

    brand: Joi.array()
        .items(Joi.string().trim().min(1).max(100))
        .min(1)
        .max(10)
        .required()
        .messages({
            'array.base': 'Brand must be an array',
            'array.min': 'At least one brand is required',
            'array.max': 'Maximum 10 brands allowed',
        }),

    partNumbers: Joi.array()
        .items(Joi.string().trim().uppercase().max(50))
        .max(20)
        .optional()
        .default([])
        .messages({
            'array.max': 'Maximum 20 part numbers allowed',
        }),

    stock: Joi.number()
        .integer()
        .min(0)
        .optional()
        .default(0)
        .messages({
            'number.min': 'Stock cannot be negative',
        }),

    specifications: Joi.object()
        .pattern(Joi.string(), Joi.string())
        .optional(),

    weight: weightSchema.optional(),

    dimensions: dimensionsSchema.optional(),

    warranty: Joi.string()
        .max(200)
        .optional()
        .allow(''),

    tags: Joi.array()
        .items(Joi.string().trim().max(50))
        .max(20)
        .optional(),

    isFeatured: Joi.boolean().optional().default(false),
});

// Update Part Validation (all fields optional)
const updatePartSchema = Joi.object({
    partName: Joi.string()
        .trim()
        .min(3)
        .max(200)
        .optional()
        .messages({
            'string.min': 'Part name must be at least 3 characters',
            'string.max': 'Part name cannot exceed 200 characters',
        }),

    description: Joi.string()
        .trim()
        .min(20)
        .max(5000)
        .optional()
        .messages({
            'string.min': 'Description must be at least 20 characters',
            'string.max': 'Description cannot exceed 5000 characters',
        }),

    partNumber: Joi.string()
        .trim()
        .uppercase()
        .max(50)
        .optional()
        .allow(''),

    defaultImageUrl: Joi.string()
        .uri()
        .optional()
        .allow('')
        .messages({
            'string.uri': 'Default image URL must be a valid URL',
        }),

    price: Joi.number()
        .min(0)
        .optional()
        .messages({
            'number.min': 'Price cannot be negative',
        }),

    originalPrice: Joi.number()
        .min(0)
        .optional(),

    currency: Joi.string()
        .valid('INR', 'USD', 'EUR')
        .optional(),

    compatibleVehicles: Joi.array()
        .items(vehicleSchema)
        .min(1)
        .optional()
        .messages({
            'array.min': 'At least one compatible vehicle is required',
        }),

    category: Joi.string()
        .valid(
            'Engine',
            'Transmission',
            'Suspension',
            'Brakes',
            'Electrical',
            'Body',
            'Interior',
            'Exterior',
            'Exhaust',
            'Cooling',
            'Fuel System',
            'Steering',
            'Wheels & Tires',
            'Lighting',
            'HVAC',
            'Other'
        )
        .optional()
        .messages({
            'any.only': 'Invalid category',
        }),

    subCategory: Joi.string()
        .trim()
        .max(100)
        .optional()
        .allow(''),

    brand: Joi.array()
        .items(Joi.string().trim().min(1).max(100))
        .min(1)
        .max(10)
        .optional(),

    stock: Joi.number()
        .integer()
        .min(0)
        .optional()
        .messages({
            'number.min': 'Stock cannot be negative',
        }),

    specifications: Joi.object()
        .pattern(Joi.string(), Joi.string())
        .optional(),

    weight: weightSchema.optional(),

    dimensions: dimensionsSchema.optional(),

    warranty: Joi.string()
        .max(200)
        .optional()
        .allow(''),

    tags: Joi.array()
        .items(Joi.string().trim().max(50))
        .max(20)
        .optional(),

    status: Joi.string()
        .valid('DRAFT', 'ACTIVE', 'ARCHIVED')
        .optional(),

    isFeatured: Joi.boolean().optional(),
}).min(1).messages({
    'object.min': 'At least one field is required for update',
});

// Query Parameters Validation
const queryParamsSchema = Joi.object({
    page: Joi.number().integer().min(1).optional().default(1),
    limit: Joi.number().integer().min(1).max(50).optional().default(20),
    category: Joi.string().optional(),
    brand: Joi.string().optional(),
    make: Joi.string().optional(),
    model: Joi.string().optional(),
    year: Joi.number().integer().min(1900).max(new Date().getFullYear() + 2).optional(),
    minPrice: Joi.number().min(0).optional(),
    maxPrice: Joi.number().min(0).optional(),
    search: Joi.string().trim().max(100).optional(),
    sort: Joi.string().valid('createdAt', '-createdAt', 'price', '-price', 'partName', '-partName').optional().default('-createdAt'),
    inStock: Joi.boolean().optional(),
});

// Validation middleware
const validateCreatePart = (req, res, next) => {
    // Log incoming data for debugging
    console.log('📦 Create Part Request Body:', JSON.stringify(req.body, null, 2));

    const { error, value } = createPartSchema.validate(req.body, {
        abortEarly: false,
        stripUnknown: true,
    });

    if (error) {
        const errors = error.details.map((detail) => detail.message);
        console.error('❌ Validation Errors:', errors);
        console.error('🔍 Failed Fields:', error.details.map(d => d.path.join('.')));

        return res.status(400).json({
            status: 'error',
            message: 'Validation failed',
            errors,
            fields: error.details.map(d => ({
                field: d.path.join('.'),
                message: d.message
            })),
        });
    }

    req.body = value;
    next();
};

const validateUpdatePart = (req, res, next) => {
    const { error, value } = updatePartSchema.validate(req.body, {
        abortEarly: false,
        stripUnknown: true,
    });

    if (error) {
        const errors = error.details.map((detail) => detail.message);
        return res.status(400).json({
            status: 'error',
            message: 'Validation failed',
            errors,
        });
    }

    req.body = value;
    next();
};

const validateQueryParams = (req, res, next) => {
    const { error, value } = queryParamsSchema.validate(req.query, {
        abortEarly: false,
        stripUnknown: true,
    });

    if (error) {
        const errors = error.details.map((detail) => detail.message);
        return res.status(400).json({
            status: 'error',
            message: 'Invalid query parameters',
            errors,
        });
    }

    req.query = value;
    next();
};

module.exports = {
    validateCreatePart,
    validateUpdatePart,
    validateQueryParams,
};
