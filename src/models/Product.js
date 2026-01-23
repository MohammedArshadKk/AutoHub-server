const mongoose = require('mongoose');

const productSchema = new mongoose.Schema(
    {
        part: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Part',
            required: [true, 'Part reference is required'],
            index: true,
        },
        name: {
            type: String,
            trim: true,
            maxlength: [200, 'Product name cannot exceed 200 characters'],
        },
        description: {
            type: String,
            maxlength: [5000, 'Description cannot exceed 5000 characters'],
        },
        partNumber: {
            type: String,
            trim: true,
            uppercase: true,
        },

        // Feature Points / Bullet Points
        features: {
            type: [String],
            validate: {
                validator: function (v) {
                    return v.length <= 20;
                },
                message: 'Maximum 20 feature points allowed',
            },
            default: [],
        },

        // Seller/Admin Remarks
        remarks: {
            type: String,
            maxlength: [1000, 'Remarks cannot exceed 1000 characters'],
        },

        // Images (optional - can be added later)
        images: {
            type: [String],
            validate: {
                validator: function (v) {
                    // Allow empty array or 1-10 images
                    return v.length === 0 || (v.length >= 1 && v.length <= 10);
                },
                message: 'Product must have 0-10 images',
            },
            default: [],
        },

        // Pricing (REQUIRED for products)
        price: {
            type: Number,
            required: [true, 'Price is required for product listing'],
            min: [0, 'Price cannot be negative'],
        },
        originalPrice: {
            type: Number,
            min: [0, 'Original price cannot be negative'],
        },
        currency: {
            type: String,
            default: 'INR',
            enum: ['INR', 'USD', 'EUR'],
        },

        // Vehicle Compatibility (Hierarchical: Year → Make → Model)
        compatibleVehicles: [
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

        // Category (optional - inherited from Part)
        category: {
            type: String,
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

        // Condition (REQUIRED for products)
        condition: {
            type: String,
            required: [true, 'Condition is required for product listing'],
            enum: {
                values: ['New', 'NEW', 'Refurbished', 'Used - Like New', 'Used - Good', 'Used - Fair'],
                message: 'Invalid condition',
            },
            default: 'New',
        },

        // Stock (REQUIRED for products)
        stock: {
            type: Number,
            required: [true, 'Stock is required for product listing'],
            min: [0, 'Stock cannot be negative'],
            default: 0,
        },

        // Approval Status (Admin workflow)
        status: {
            type: String,
            enum: {
                values: ['DRAFT', 'PENDING_APPROVAL', 'ACTIVE', 'REJECTED', 'ARCHIVED'],
                message: 'Invalid status',
            },
            default: 'PENDING_APPROVAL',
        },
        rejectionReason: {
            type: String,
            maxlength: 500,
        },
        approvedAt: {
            type: Date,
        },
        approvedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
        },

        seller: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Seller',
            default: null,
        },
        admin: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Admin',
            default: null,
        },
        specifications: {
            type: Map,
            of: String,
        },

        brand: {
            type: String,
            trim: true,
        },
        isCustomBrand: {
            type: Boolean,
            default: false,
        },
        isCustomPartNumber: {
            type: Boolean,
            default: false,
        },
        weight: {
            value: Number,
            unit: {
                type: String,
                enum: ['kg', 'g', 'lbs'],
                default: 'kg',
            },
        },
        dimensions: {
            length: Number,
            width: Number,
            height: Number,
            unit: {
                type: String,
                enum: ['cm', 'in', 'm'],
                default: 'cm',
            },
        },
        warranty: {
            type: String,
            maxlength: 200,
        },

        // SEO & Search
        tags: [String],
        slug: {
            type: String,
            unique: true,
            sparse: true,
        },

        // Metrics
        views: {
            type: Number,
            default: 0,
        },
        soldCount: {
            type: Number,
            default: 0,
        },

        // Flags
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
productSchema.index({ name: 'text', description: 'text', tags: 'text' });
productSchema.index({ part: 1, status: 1 }); // NEW: Search products by part
productSchema.index({ status: 1, isDeleted: 1 });
productSchema.index({ seller: 1, status: 1 }); // Seller's products
productSchema.index({ admin: 1, status: 1 }); // NEW: Admin's products
productSchema.index({ category: 1, status: 1 });
productSchema.index({ 'compatibleVehicles.make': 1, 'compatibleVehicles.model': 1 });
productSchema.index({ price: 1 });
productSchema.index({ createdAt: -1 });

// Virtual for discount percentage
productSchema.virtual('discountPercent').get(function () {
    if (this.originalPrice && this.originalPrice > this.price) {
        return Math.round(((this.originalPrice - this.price) / this.originalPrice) * 100);
    }
    return 0;
});

// Virtual for in-stock status
productSchema.virtual('inStock').get(function () {
    return this.stock > 0;
});

// Pre-save: Validate ownership (must have seller OR admin)
productSchema.pre('save', function (next) {
    if (!this.seller && !this.admin) {
        return next(new Error('Product must have either a seller or admin reference'));
    }
    next();
});

// Pre-save: Generate slug
productSchema.pre('save', function (next) {
    if (this.isModified('name') && !this.slug) {
        this.slug = this.name
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/(^-|-$)/g, '')
            + '-' + Date.now().toString(36);
    }
    next();
});

// Static: Find active products only
productSchema.statics.findActive = function (filter = {}) {
    return this.find({ ...filter, status: 'ACTIVE', isDeleted: false });
};

// Static: Find by vehicle compatibility
productSchema.statics.findByVehicle = function (year, make, model) {
    return this.find({
        status: 'ACTIVE',
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

// Method: Approve product
productSchema.methods.approve = async function (adminId) {
    this.status = 'ACTIVE';
    this.approvedAt = new Date();
    this.approvedBy = adminId;
    this.rejectionReason = undefined;
    return this.save();
};

// Method: Reject product
productSchema.methods.reject = async function (reason) {
    this.status = 'REJECTED';
    this.rejectionReason = reason;
    return this.save();
};

// Method: Increment view count
productSchema.methods.incrementViews = async function () {
    this.views += 1;
    return this.save();
};

const Product = mongoose.model('Product', productSchema);

module.exports = Product;
