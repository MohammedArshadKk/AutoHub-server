const mongoose = require('mongoose');

const systemConfigSchema = new mongoose.Schema(
    {
        // Feature Flags
        codEnabled: {
            type: Boolean,
            default: true,
            required: true
        },

        // Contact Information
        supportEmail: {
            type: String,
            trim: true,
            required: true,
            default: 'support@autohub.com'
        },
        supportPhone: {
            type: String,
            trim: true,
            required: true,
            default: '+91 0000000000'
        },

        // Shipping Configuration
        shipping: {
            mode: {
                type: String,
                enum: ['DISTANCE', 'FLAT'],
                default: 'DISTANCE'
            },
            baseCharge: {
                type: Number,
                default: 40,
                min: 0
            },
            perKmCharge: {
                type: Number,
                default: 10,
                min: 0
            },
            freeShippingDistance: {
                type: Number,
                default: 5, // km
                description: 'Distance up to which shipping is free if threshold met (or base charge applies)'
            },
            freeShippingThreshold: {
                type: Number,
                default: 1000,
                min: 0,
                description: 'Order amount above which shipping might be free or discounted'
            },
            handlingCharge: {
                type: Number,
                default: 0,
                min: 0,
                description: 'Fixed handling fee per order'
            }
        },

        // Metadata
        updatedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Admin'
        }
    },
    {
        timestamps: true
    }
);

// Ensure only one config document exists usually, but we'll handle singleton logic in controller
module.exports = mongoose.model('SystemConfig', systemConfigSchema);
