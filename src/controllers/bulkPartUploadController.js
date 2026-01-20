const Part = require('../models/Part');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/AppError');
const Joi = require('joi');

// Vehicle schema for bulk upload
const bulkVehicleSchema = Joi.object({
    year: Joi.number().integer().min(1900).max(new Date().getFullYear() + 2).required(),
    make: Joi.string().trim().required(),
    model: Joi.string().trim().required(),
    variant: Joi.string().trim().optional().allow(''),
});

// Part schema for bulk upload
const bulkPartSchema = Joi.object({
    partName: Joi.string().trim().min(3).max(200).required(),
    description: Joi.string().trim().min(20).max(5000).required(),
    category: Joi.string().valid(
        'Engine', 'Transmission', 'Suspension', 'Brakes', 'Electrical',
        'Body', 'Interior', 'Exterior', 'Exhaust', 'Cooling',
        'Fuel System', 'Steering', 'Wheels & Tires', 'Lighting', 'HVAC', 'Other'
    ).required(),

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

    compatibleVehicles: Joi.array().items(bulkVehicleSchema).min(1).required(),
    partNumber: Joi.string().trim().uppercase().max(50).optional().allow(''),
    defaultImageUrl: Joi.string().uri().optional().allow(''),
    price: Joi.number().min(0).optional(),
    originalPrice: Joi.number().min(0).optional(),
    stock: Joi.number().integer().min(0).optional(),
    subCategory: Joi.string().trim().max(100).optional().allow(''),
    specifications: Joi.object().pattern(Joi.string(), Joi.string()).optional(),
    warranty: Joi.string().max(200).optional().allow(''),
    tags: Joi.array().items(Joi.string().trim().max(50)).max(20).optional(),
});

/**
 * @desc    Bulk create parts from JSON array
 * @route   POST /api/v1/parts/bulk
 * @access  Private (Admin)
 */
exports.bulkCreateParts = catchAsync(async (req, res, next) => {
    const { parts } = req.body;

    // Validate request structure
    if (!Array.isArray(parts) || parts.length === 0) {
        return next(AppError.badRequest('Parts array is required and must not be empty'));
    }

    if (parts.length > 100) {
        return next(AppError.badRequest('Maximum 100 parts allowed per bulk upload'));
    }

    console.log(`📦 Bulk upload: Processing ${parts.length} parts...`);

    const results = [];
    let successCount = 0;
    let failureCount = 0;

    // Process each part
    for (let i = 0; i < parts.length; i++) {
        const partData = parts[i];

        try {
            // Validate part data
            const { error, value } = bulkPartSchema.validate(partData, {
                abortEarly: false,
                stripUnknown: true,
            });

            if (error) {
                const errors = error.details.map(d => d.message);
                results.push({
                    index: i,
                    success: false,
                    error: errors.join(', '),
                    partName: partData.partName || 'Unknown',
                });
                failureCount++;
                continue;
            }

            // Add admin reference
            value.createdBy = req.admin.id;

            // Sanitize text fields
            if (value.partName) value.partName = value.partName.trim();
            if (value.description) value.description = value.description.trim();
            if (value.partNumber) value.partNumber = value.partNumber.trim().toUpperCase();

            // Sanitize brand array (trim each brand name)
            if (value.brand && Array.isArray(value.brand)) {
                value.brand = value.brand
                    .map(b => b.trim())
                    .filter(b => b.length > 0);
            }

            // Sanitize partNumbers array (trim and uppercase each part number)
            if (value.partNumbers && Array.isArray(value.partNumbers)) {
                value.partNumbers = value.partNumbers
                    .map(pn => pn.trim().toUpperCase())
                    .filter(pn => pn.length > 0);
            }

            // Create part
            const part = await Part.create(value);

            results.push({
                index: i,
                success: true,
                partId: part._id,
                partName: part.partName,
            });
            successCount++;

        } catch (error) {
            // Handle database errors (e.g., duplicate partNumber)
            let errorMessage = error.message;

            if (error.code === 11000) {
                const field = Object.keys(error.keyPattern)[0];
                errorMessage = `Duplicate ${field}: ${error.keyValue[field]}`;
            }

            results.push({
                index: i,
                success: false,
                error: errorMessage,
                partName: partData.partName || 'Unknown',
            });
            failureCount++;
        }
    }

    console.log(`✅ Bulk upload complete: ${successCount} success, ${failureCount} failed`);

    // Return results
    res.status(200).json({
        success: true,
        message: failureCount === 0
            ? 'Bulk upload completed successfully'
            : 'Bulk upload completed with some failures',
        data: {
            total: parts.length,
            successCount,
            failureCount,
            results,
        },
    });
});
