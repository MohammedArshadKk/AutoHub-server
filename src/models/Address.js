const mongoose = require('mongoose');

const addressSchema = new mongoose.Schema(
    {
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: [true, 'User reference is required'],
            index: true,
        },

        // Address Type
        title: {
            type: String,
            required: [true, 'Address title is required'],
            trim: true,
            maxlength: [50, 'Title cannot exceed 50 characters'],
            // e.g., "Home", "Office", "Gym"
        },

        // Full address details
        fullName: {
            type: String,
            required: [true, 'Full name is required'],
            trim: true,
            maxlength: [100, 'Name cannot exceed 100 characters'],
        },

        phone: {
            type: String,
            required: [true, 'Phone number is required'],
            validate: {
                validator: function (v) {
                    // Accept formats: 9876543210, +919876543210, +91 9876543210
                    return /^(\+91\s?)?[6-9]\d{9}$/.test(v);
                },
                message: 'Please provide a valid 10-digit phone number (formats: 9876543210, +919876543210, +91 9876543210)',
            },
        },

        addressLine1: {
            type: String,
            required: [true, 'Address line 1 is required'],
            trim: true,
            maxlength: [200, 'Address line 1 cannot exceed 200 characters'],
        },

        addressLine2: {
            type: String,
            trim: true,
            maxlength: [200, 'Address line 2 cannot exceed 200 characters'],
        },

        city: {
            type: String,
            required: [true, 'City is required'],
            trim: true,
            index: true,
        },

        state: {
            type: String,
            required: [true, 'State is required'],
            trim: true,
            index: true,
        },

        zipCode: {
            type: String,
            required: [true, 'ZIP code is required'],
            validate: {
                validator: function (v) {
                    return /^\d{6}$/.test(v); // Indian PIN code format
                },
                message: 'Please provide a valid 6-digit PIN code',
            },
        },

        country: {
            type: String,
            required: true,
            default: 'India',
        },

        // Geolocation (optional - only set if lat/lng provided)
        location: {
            type: {
                type: String,
                enum: ['Point'],
            },
            coordinates: {
                type: [Number], // [longitude, latitude]
            },
        },

        latitude: Number,
        longitude: Number,

        // Google Maps
        googleMapsLink: {
            type: String,
            trim: true,
        },

        // Default address
        isDefault: {
            type: Boolean,
            default: false,
        },
    },
    {
        timestamps: true,
        toJSON: { virtuals: true },
        toObject: { virtuals: true },
    }
);

// Pre-save middleware to ensure only one default address per user
addressSchema.pre('save', async function (next) {
    if (this.isDefault) {
        // Remove default from all other addresses for this user
        await this.constructor.updateMany(
            { user: this.user, _id: { $ne: this._id } },
            { isDefault: false }
        );
    }

    // Normalize phone number - remove +91 prefix and spaces
    if (this.phone) {
        // Remove all spaces and +91 prefix
        this.phone = this.phone.replace(/\s/g, '').replace(/^\+91/, '');
    }

    // Update location.coordinates from latitude/longitude
    // Only set location if BOTH lat and lng are provided
    if (this.latitude && this.longitude) {
        this.location = {
            type: 'Point',
            coordinates: [this.longitude, this.latitude],
        };
    } else {
        // If no coordinates, remove location field to prevent index errors
        this.location = undefined;
    }

    next();
});

// Create geospatial index for location-based queries
addressSchema.index({ location: '2dsphere' });

// Compound index for user queries (default first, then newest)
addressSchema.index({ user: 1, isDefault: -1, createdAt: -1 });

module.exports = mongoose.model('Address', addressSchema);
