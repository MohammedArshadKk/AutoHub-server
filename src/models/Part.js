const mongoose = require('mongoose');

const partSchema = new mongoose.Schema(
    {
        partName: {
            type: String,
            required: [true, 'Part name is required'],
            trim: true,
            minlength: [3, 'Part name must be at least 3 characters'],
            maxlength: [200, 'Part name cannot exceed 200 characters'],
        },
        description: {
            type: String,
            required: [true, 'Part description is required'],
            minlength: [20, 'Description must be at least 20 characters'],
            maxlength: [5000, 'Description cannot exceed 5000 characters'],
        },
        partNumber: {
            type: String,
            trim: true,
            uppercase: true,
            sparse: true,
            unique: true,
        },
        defaultImageUrl: {
            type: String,
            default: 'https://via.placeholder.com/300x300?text=Auto+Part',
        },
        compatibleVehicles: {
            type: [
                {
                    year: {
                        type: Number,
                        required: true,
                        min: 1900,
                        max: new Date().getFullYear() + 2,
                    },
                    make: {
                        type: String,
                        required: true,
                        trim: true,
                    },
                    model: {
                        type: String,
                        required: true,
                        trim: true,
                    },
                    variant: {
                        type: String,
                        trim: true,
                    },
                },
            ],
            validate: {
                validator: function (v) {
                    return Array.isArray(v) && v.length > 0;
                },
                message: 'At least one compatible vehicle is required',
            },
        },

        category: {
            type: String,
            required: [true, 'Category is required'],
            enum: {
                values: [
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
                    'Other',
                ],
                message: 'Invalid category',
            },
        },
        subCategory: {
            type: String,
            trim: true,
        },

        brand: {
            type: [String],
            required: [true, 'At least one brand is required'],
            validate: {
                validator: function (v) {
                    return v && v.length > 0 && v.length <= 10;
                },
                message: 'Part must have 1-10 brands'
            }
        },

        partNumbers: {
            type: [String],
            validate: {
                validator: function (v) {
                    return !v || v.length <= 20;
                },
                message: 'Maximum 20 part numbers allowed'
            },
            default: []
        },


        createdBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Admin',
            required: true,
        },

        specifications: {
            type: Map,
            of: String,
        },

        // weight: {
        //     value: Number,
        //     unit: {
        //         type: String,
        //         enum: ['kg', 'g', 'lbs'],
        //         default: 'kg',
        //     },
        // },
        // dimensions: {
        //     length: Number,
        //     width: Number,
        //     height: Number,
        //     unit: {
        //         type: String,
        //         enum: ['cm', 'in', 'm'],
        //         default: 'cm',
        //     },
        // },
        // warranty: {
        //     type: String,
        //     maxlength: 200,
        // },

        tags: [String],
        slug: {
            type: String,
            unique: true,
            sparse: true,
        },

        soldCount: {
            type: Number,
            default: 0,
        },
        isFeatured: {
            type: Boolean,
            default: false,
        },
        isDeleted: {
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

// Indexes for search and filtering
partSchema.index({ partName: 'text', description: 'text', tags: 'text' });
partSchema.index({ isDeleted: 1 });
partSchema.index({ category: 1, brand: 1 });
partSchema.index({ 'compatibleVehicles.make': 1, 'compatibleVehicles.model': 1 });

// Compound indexes for advanced filtering (production-ready)
partSchema.index({ category: 1, 'compatibleVehicles.make': 1, 'compatibleVehicles.model': 1 });
partSchema.index({ category: 1, brand: 1 });
partSchema.index({ 'compatibleVehicles.year': 1, 'compatibleVehicles.make': 1, 'compatibleVehicles.model': 1 });
partSchema.index({ 'compatibleVehicles.year': 1 });
partSchema.index({ price: 1 });
partSchema.index({ createdAt: -1 });
partSchema.index({ partNumber: 1 }, { unique: true, sparse: true });

// Virtual for discount percentage
partSchema.virtual('discountPercent').get(function () {
    if (this.originalPrice && this.originalPrice > this.price) {
        return Math.round(((this.originalPrice - this.price) / this.originalPrice) * 100);
    }
    return 0;
});

// Virtual for in-stock status
partSchema.virtual('inStock').get(function () {
    return this.stock > 0;
});

// Pre-save: Generate slug
partSchema.pre('save', function (next) {
    if (this.isModified('partName') && !this.slug) {
        this.slug = this.partName
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/(^-|-$)/g, '')
            + '-' + Date.now().toString(36);
    }
    next();
});

// Static: Find active parts only
partSchema.statics.findActive = function (filter = {}) {
    return this.find({ ...filter, isDeleted: false });
};

// Static: Find by vehicle compatibility
partSchema.statics.findByVehicle = function (year, make, model) {
    return this.find({
        isDeleted: false,
        compatibleVehicles: {
            $elemMatch: {
                year: year,
                make: { $regex: new RegExp(make, 'i') },
                model: { $regex: new RegExp(model, 'i') },
            },
        },
    });
};

// Method: Archive part
partSchema.methods.archive = async function () {
    this.isDeleted = true;
    return this.save();
};

// Method: Increment view count
partSchema.methods.incrementViews = async function () {
    this.views += 1;
    return this.save();
};

const Part = mongoose.model('Part', partSchema);

module.exports = Part;
