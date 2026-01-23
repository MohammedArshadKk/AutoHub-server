const Product = require('../models/Product');
const Part = require('../models/Part');
const Seller = require('../models/Seller');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/AppError');
const config = require('../config/env');

// Allowed fields for product creation/update
const ALLOWED_PRODUCT_FIELDS = [
    'name', 'description', 'partNumber', 'images', 'price', 'originalPrice',
    'currency', 'compatibleVehicles', 'category', 'subCategory', 'condition',
    'stock', 'specifications', 'brand', 'weight', 'dimensions', 'warranty', 'tags',
];

// Sanitize and validate product input
const sanitizeProductInput = (body, allowedFields = ALLOWED_PRODUCT_FIELDS) => {
    const sanitized = {};

    allowedFields.forEach((field) => {
        if (body[field] !== undefined) {
            sanitized[field] = body[field];
        }
    });

    return sanitized;
};

// Validate required fields for product creation
const validateProductFields = (data) => {
    const errors = [];

    if (!data.name || data.name.trim().length < 3) {
        errors.push('Product name must be at least 3 characters');
    }

    if (!data.description || data.description.trim().length < 20) {
        errors.push('Description must be at least 20 characters');
    }

    if (!data.price || data.price <= 0) {
        errors.push('Price must be greater than 0');
    }

    if (!data.category) {
        errors.push('Category is required');
    }

    if (!data.condition) {
        errors.push('Condition is required');
    }

    if (!data.images || !Array.isArray(data.images) || data.images.length < 1) {
        errors.push('At least 1 product image is required');
    } else if (config.aws.isConfigured) {
        // Only validate S3 URLs if AWS is configured
        const s3BaseUrl = config.aws.s3.baseUrl;
        data.images.forEach((url, index) => {
            if (!url.startsWith(s3BaseUrl)) {
                errors.push(`Image ${index + 1} must be uploaded to authorized S3 bucket`);
            }
        });
    }

    if (!data.compatibleVehicles || !Array.isArray(data.compatibleVehicles) || data.compatibleVehicles.length < 1) {
        errors.push('At least 1 compatible vehicle is required');
    } else {
        // Validate each vehicle entry
        data.compatibleVehicles.forEach((vehicle, index) => {
            if (!vehicle.year || !vehicle.make || !vehicle.model) {
                errors.push(`Compatible vehicle ${index + 1}: year, make, and model are required`);
            }
        });
    }

    return errors;
};

// ==================== PUBLIC ENDPOINTS ==================== //

/**
 * @desc    Get all products (with filters)
 * @route   GET /api/v1/products
 * @access  Public
 */
exports.getProducts = catchAsync(async (req, res, next) => {
    const {
        page = 1,
        limit = 20,
        category,
        condition,
        minPrice,
        maxPrice,
        make,
        model,
        year,
        search,
        sort = '-createdAt',
        brand,
        inStock,
    } = req.query;

    // Validate pagination
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(50, Math.max(1, parseInt(limit, 10) || 20));

    // Build query - only active products
    const query = { status: 'ACTIVE', isDeleted: false };

    // Category filter
    if (category) {
        query.category = category;
    }

    // Condition filter
    if (condition) {
        query.condition = condition;
    }

    // Brand filter
    if (brand) {
        query.brand = { $regex: new RegExp(brand, 'i') };
    }

    // Price range filter
    if (minPrice || maxPrice) {
        query.price = {};
        if (minPrice) query.price.$gte = Number(minPrice);
        if (maxPrice) query.price.$lte = Number(maxPrice);
    }

    // In stock filter
    if (inStock === 'true') {
        query.stock = { $gt: 0 };
    }

    // Vehicle compatibility filter
    if (make || model || year) {
        query.compatibleVehicles = { $elemMatch: {} };
        if (year) query.compatibleVehicles.$elemMatch.year = Number(year);
        if (make) query.compatibleVehicles.$elemMatch.make = { $regex: new RegExp(make, 'i') };
        if (model) query.compatibleVehicles.$elemMatch.model = { $regex: new RegExp(model, 'i') };
    }

    // Text search
    if (search && search.trim()) {
        query.$text = { $search: search.trim() };
    }

    const skip = (pageNum - 1) * limitNum;

    // Execute query with pagination
    const [products, total] = await Promise.all([
        Product.find(query)
            .sort(sort)
            .skip(skip)
            .limit(limitNum)
            .select('-__v -rejectionReason')
            .populate('seller', 'businessName logo')
            .lean(),
        Product.countDocuments(query),
    ]);

    res.status(200).json({
        status: 'success',
        results: products.length,
        pagination: {
            page: pageNum,
            limit: limitNum,
            total,
            pages: Math.ceil(total / limitNum),
            hasNext: pageNum < Math.ceil(total / limitNum),
            hasPrev: pageNum > 1,
        },
        data: {
            products,
        },
    });
});

/**
 * @desc    Get single product
 * @route   GET /api/v1/products/:id
 * @access  Public
 */
exports.getProduct = catchAsync(async (req, res, next) => {
    const { id } = req.params;

    // Validate ObjectId format
    if (!id.match(/^[0-9a-fA-F]{24}$/)) {
        return next(AppError.badRequest('Invalid product ID format'));
    }

    const product = await Product.findOne({
        _id: id,
        isDeleted: false,
    })
        .populate('seller', 'businessName logo metrics.rating metrics.reviewCount')
        .lean();

    if (!product) {
        return next(AppError.notFound('Product not found'));
    }

    // Only show active products to public, or show all to owner
    if (product.status !== 'ACTIVE') {
        return next(AppError.notFound('Product not found'));
    }

    // Increment view count asynchronously (fire and forget)
    Product.findByIdAndUpdate(id, { $inc: { views: 1 } }).exec().catch(() => { });

    res.status(200).json({
        status: 'success',
        data: {
            product,
        },
    });
});

// ==================== SELLER ENDPOINTS ==================== //

/**
 * @desc    Get seller's products
 * @route   GET /api/v1/products/seller/my-products
 * @access  Private (Seller)
 */
exports.getMyProducts = catchAsync(async (req, res, next) => {
    const { page = 1, limit = 20, status, search } = req.query;

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(50, Math.max(1, parseInt(limit, 10) || 20));

    const query = { seller: req.seller.id, isDeleted: false };

    if (status && ['DRAFT', 'PENDING_APPROVAL', 'ACTIVE', 'REJECTED'].includes(status)) {
        query.status = status;
    }

    if (search && search.trim()) {
        query.$or = [
            { name: { $regex: new RegExp(search.trim(), 'i') } },
            { partNumber: { $regex: new RegExp(search.trim(), 'i') } },
        ];
    }

    const skip = (pageNum - 1) * limitNum;

    const [products, total, statusCounts] = await Promise.all([
        Product.find(query)
            .sort('-createdAt')
            .skip(skip)
            .limit(limitNum)
            .select('name images price stock status createdAt views soldCount')
            .lean(),
        Product.countDocuments(query),
        Product.aggregate([
            { $match: { seller: req.seller.id, isDeleted: false } },
            { $group: { _id: '$status', count: { $sum: 1 } } },
        ]),
    ]);

    // Format status counts
    const counts = statusCounts.reduce((acc, item) => {
        acc[item._id] = item.count;
        return acc;
    }, {});

    res.status(200).json({
        status: 'success',
        results: products.length,
        pagination: {
            page: pageNum,
            limit: limitNum,
            total,
            pages: Math.ceil(total / limitNum),
        },
        statusCounts: counts,
        data: {
            products,
        },
    });
});

/**
 * @desc    Create product (Seller)
 * @route   POST /api/v1/products/seller
 * @access  Private (Verified Seller)
 */
exports.createProductSeller = catchAsync(async (req, res, next) => {
    // Check if seller is verified
    if (!req.seller.canListProducts) {
        return next(AppError.forbidden('Your account must be verified to list products'));
    }

    const {
        partId,
        title, // Maps to name
        price,
        originalPrice,
        stock,
        condition,
        brand,
        isCustomBrand,
        partNumber,
        isCustomPartNumber,
        compatibleVehicles,
        warrantyEnabled,
        warranty,
        keyPoints, // Maps to features
        remarks,
        images,
    } = req.body;

    // Validate Part ID
    if (!partId) {
        return next(AppError.badRequest('Part selection is required'));
    }

    // Validate Part exists and is active
    const part = await Part.findById(partId);
    if (!part) {
        return next(AppError.notFound('Selected part not found'));
    }

    if (part.isDeleted) {
        return next(AppError.badRequest('Selected part is no longer available'));
    }



    // Validate required product fields
    if (!price || price <= 0) {
        return next(AppError.badRequest('Price must be greater than 0'));
    }

    if (stock === undefined || stock < 0) {
        return next(AppError.badRequest('Stock quantity is required and cannot be negative'));
    }

    if (!images || !Array.isArray(images) || images.length === 0) {
        return next(AppError.badRequest('At least one product image is required'));
    }

    if (images.length > 10) {
        return next(AppError.badRequest('Maximum 10 images allowed'));
    }

    if (!condition) {
        return next(AppError.badRequest('Product condition is required'));
    }

    // Validate price logic
    if (originalPrice && parseFloat(originalPrice) < parseFloat(price)) {
        return next(AppError.badRequest('Original price cannot be less than selling price'));
    }

    // Create product linked to Part
    const product = await Product.create({
        part: partId,
        seller: req.seller.id,

        // Product-specific fields
        name: title || part.partName,
        price,
        originalPrice,
        stock,
        images,
        condition: condition || 'New',
        warranty: warrantyEnabled ? warranty : undefined,
        remarks,
        features: Array.isArray(keyPoints) ? keyPoints.filter(p => p.trim() !== '') : [],

        // Specific attributes for THIS product (singular)
        brand: brand || (part.brand?.[0]),
        partNumber: partNumber || (part.partNumber || part.partNumbers?.[0]),
        isCustomBrand: !!isCustomBrand,
        isCustomPartNumber: !!isCustomPartNumber,

        // Inherit or override compatible vehicles
        compatibleVehicles: (compatibleVehicles && compatibleVehicles.length > 0)
            ? compatibleVehicles
            : part.compatibleVehicles,

        // Inherit from Part (denormalized for performance)
        description: part.description,
        category: part.category,
        subCategory: part.subCategory,
        tags: part.tags,
        specifications: part.specifications,

        // Status and approval
        status: 'PENDING_APPROVAL', // Admin must approve
    });

    // =========== UPDATE GLOBAL PART CATALOG ===========
    let partUpdated = false;

    // If seller added a NEW brand that's not in the Part's brand list
    if (isCustomBrand && brand && !part.brand.includes(brand)) {
        part.brand.push(brand);
        partUpdated = true;
    }

    // If seller added a NEW part number that's not in the Part's list
    if (isCustomPartNumber && partNumber && !part.partNumbers.includes(partNumber)) {
        part.partNumbers.push(partNumber);
        partUpdated = true;
    }

    if (partUpdated) {
        await part.save();
    }
    // ===============================================

    // Update seller metrics
    await Seller.findByIdAndUpdate(
        req.seller.id,
        { $inc: { 'metrics.totalProducts': 1 } },
        { new: true }
    );

    res.status(201).json({
        status: 'success',
        message: 'Product created successfully and is pending approval',
        data: {
            product: {
                id: product.id,
                partId: product.part,
                name: product.name,
                price: product.price,
                status: product.status,
                createdAt: product.createdAt,
            },
        },
    });
});

/**
 * @desc    Update product (Seller)
 * @route   PATCH /api/v1/products/seller/:id
 * @access  Private (Seller - own products only)
 */
exports.updateProductSeller = catchAsync(async (req, res, next) => {
    const { id } = req.params;

    // Validate ObjectId format
    if (!id.match(/^[0-9a-fA-F]{24}$/)) {
        return next(AppError.badRequest('Invalid product ID format'));
    }

    const product = await Product.findById(id);

    if (!product || product.isDeleted) {
        return next(AppError.notFound('Product not found'));
    }

    // Check ownership
    if (product.seller.toString() !== req.seller.id) {
        return next(AppError.forbidden('You can only update your own products'));
    }

    // Cannot update archived/deleted products
    if (product.status === 'ARCHIVED') {
        return next(AppError.badRequest('Cannot update archived products'));
    }

    // Sanitize input
    const updateData = sanitizeProductInput(req.body);

    // Validate if there's anything to update
    if (Object.keys(updateData).length === 0) {
        return next(AppError.badRequest('No valid fields to update'));
    }

    // Trim text fields
    if (updateData.name) updateData.name = updateData.name.trim();
    if (updateData.description) updateData.description = updateData.description.trim();
    if (updateData.partNumber) updateData.partNumber = updateData.partNumber.trim().toUpperCase();

    // Validate price logic
    const finalPrice = updateData.price || product.price;
    const finalOriginalPrice = updateData.originalPrice || product.originalPrice;
    if (finalOriginalPrice && finalOriginalPrice < finalPrice) {
        return next(AppError.badRequest('Original price cannot be less than selling price'));
    }

    // If product was active and is being edited, send back to pending
    if (product.status === 'ACTIVE') {
        updateData.status = 'PENDING_APPROVAL';
    }

    const updatedProduct = await Product.findByIdAndUpdate(id, updateData, {
        new: true,
        runValidators: true,
    });

    res.status(200).json({
        status: 'success',
        message: product.status === 'ACTIVE'
            ? 'Product updated and sent for re-approval'
            : 'Product updated successfully',
        data: {
            product: updatedProduct,
        },
    });
});

/**
 * @desc    Delete product (Seller)
 * @route   DELETE /api/v1/products/seller/:id
 * @access  Private (Seller - own products only)
 */
exports.deleteProductSeller = catchAsync(async (req, res, next) => {
    const { id } = req.params;

    if (!id.match(/^[0-9a-fA-F]{24}$/)) {
        return next(AppError.badRequest('Invalid product ID format'));
    }

    const product = await Product.findById(id);

    if (!product || product.isDeleted) {
        return next(AppError.notFound('Product not found'));
    }

    if (product.seller.toString() !== req.seller.id) {
        return next(AppError.forbidden('You can only delete your own products'));
    }

    // Soft delete
    const wasActive = product.status === 'ACTIVE';
    product.isDeleted = true;
    product.status = 'ARCHIVED';
    await product.save();

    // Update seller metrics if product was active
    if (wasActive) {
        await Seller.findByIdAndUpdate(req.seller.id, {
            $inc: { 'metrics.activeProducts': -1 },
        });
    }

    res.status(200).json({
        status: 'success',
        message: 'Product deleted successfully',
    });
});

// ==================== ADMIN ENDPOINTS ==================== //

/**
 * @desc    Get pending products
 * @route   GET /api/v1/products/admin/pending
 * @access  Private (Admin)
 */
exports.getPendingProducts = catchAsync(async (req, res, next) => {
    const { page = 1, limit = 20, sortBy = 'createdAt', order = 'desc' } = req.query;

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
    const skip = (pageNum - 1) * limitNum;

    const sortOrder = order === 'asc' ? 1 : -1;
    const sortObj = { [sortBy]: sortOrder };

    const query = { status: 'PENDING_APPROVAL', isDeleted: false };

    const [products, total] = await Promise.all([
        Product.find(query)
            .sort(sortObj)
            .skip(skip)
            .limit(limitNum)
            .populate('seller', 'businessName email phone verificationStatus')
            .lean(),
        Product.countDocuments(query),
    ]);

    res.status(200).json({
        status: 'success',
        results: products.length,
        pagination: {
            page: pageNum,
            limit: limitNum,
            total,
            pages: Math.ceil(total / limitNum),
        },
        data: {
            products,
        },
    });
});

/**
 * @desc    Create product (Admin - direct publish)
 * @route   POST /api/v1/products/admin
 * @access  Private (Admin)
 */
exports.createProductAdmin = catchAsync(async (req, res, next) => {
    // Sanitize input
    const productData = sanitizeProductInput(req.body);

    // Validate required fields
    const validationErrors = validateProductFields(productData);
    if (validationErrors.length > 0) {
        return next(AppError.badRequest(validationErrors.join('. ')));
    }
    console.log("images : ", productData.images);

    // Admin can optionally specify a seller
    if (req.body.seller) {
        const seller = await Seller.findById(req.body.seller);
        if (!seller) {
            return next(AppError.notFound('Specified seller not found'));
        }
        productData.seller = seller.id;

    } else {
        productData.seller = null; // Admin's own product
    }

    // Admin products go live immediately
    productData.status = 'ACTIVE';
    productData.approvedBy = req.admin?.id || null;
    productData.approvedAt = new Date();

    const product = await Product.create(productData);

    res.status(201).json({
        status: 'success',
        message: 'Product created and published',
        data: {
            product,
        },
    });
});

/**
 * @desc    Update any product (Admin)
 * @route   PATCH /api/v1/products/admin/:id
 * @access  Private (Admin)
 */
exports.updateProductAdmin = catchAsync(async (req, res, next) => {
    const { id } = req.params;

    if (!id.match(/^[0-9a-fA-F]{24}$/)) {
        return next(AppError.badRequest('Invalid product ID format'));
    }

    const product = await Product.findById(id);

    if (!product || product.isDeleted) {
        return next(AppError.notFound('Product not found'));
    }

    // Admin can update any field including status
    const adminAllowedFields = [
        ...ALLOWED_PRODUCT_FIELDS,
        'status', 'isFeatured', 'seller',
    ];

    const updateData = sanitizeProductInput(req.body, adminAllowedFields);

    if (Object.keys(updateData).length === 0) {
        return next(AppError.badRequest('No valid fields to update'));
    }

    const updatedProduct = await Product.findByIdAndUpdate(id, updateData, {
        new: true,
        runValidators: true,
    });

    res.status(200).json({
        status: 'success',
        data: {
            product: updatedProduct,
        },
    });
});

/**
 * @desc    Delete any product (Admin)
 * @route   DELETE /api/v1/products/admin/:id
 * @access  Private (Admin)
 */
exports.deleteProductAdmin = catchAsync(async (req, res, next) => {
    const { id } = req.params;

    if (!id.match(/^[0-9a-fA-F]{24}$/)) {
        return next(AppError.badRequest('Invalid product ID format'));
    }

    const product = await Product.findById(id);

    if (!product || product.isDeleted) {
        return next(AppError.notFound('Product not found'));
    }

    // Soft delete
    product.isDeleted = true;
    product.status = 'ARCHIVED';
    await product.save();

    // Update seller metrics if it was a seller's product
    if (product.seller && product.status === 'ACTIVE') {
        await Seller.findByIdAndUpdate(product.seller, {
            $inc: { 'metrics.activeProducts': -1 },
        });
    }

    res.status(200).json({
        status: 'success',
        message: 'Product deleted successfully',
    });
});

/**
 * @desc    Approve product
 * @route   PATCH /api/v1/products/admin/:id/approve
 * @access  Private (Admin)
 */
exports.approveProduct = catchAsync(async (req, res, next) => {
    const { id } = req.params;

    if (!id.match(/^[0-9a-fA-F]{24}$/)) {
        return next(AppError.badRequest('Invalid product ID format'));
    }

    const product = await Product.findById(id).populate('seller', 'businessName email');

    if (!product || product.isDeleted) {
        return next(AppError.notFound('Product not found'));
    }

    if (product.status !== 'PENDING_APPROVAL') {
        return next(AppError.badRequest(`Product is already ${product.status.toLowerCase()}`));
    }

    // Approve product
    product.status = 'ACTIVE';
    product.approvedAt = new Date();
    product.approvedBy = req.admin.id;
    product.rejectionReason = undefined;
    await product.save();

    // Update seller metrics
    if (product.seller) {
        await Seller.findByIdAndUpdate(product.seller._id || product.seller, {
            $inc: { 'metrics.activeProducts': 1 },
        });
    }

    res.status(200).json({
        status: 'success',
        message: 'Product approved and published',
        data: {
            product: {
                id: product.id,
                name: product.name,
                status: product.status,
                seller: product.seller,
            },
        },
    });
});

/**
 * @desc    Reject product
 * @route   PATCH /api/v1/products/admin/:id/reject
 * @access  Private (Admin)
 */
exports.rejectProduct = catchAsync(async (req, res, next) => {
    const { id } = req.params;
    const { reason } = req.body;

    if (!id.match(/^[0-9a-fA-F]{24}$/)) {
        return next(AppError.badRequest('Invalid product ID format'));
    }

    if (!reason || reason.trim().length < 10) {
        return next(AppError.badRequest('Rejection reason must be at least 10 characters'));
    }

    const product = await Product.findById(id).populate('seller', 'businessName email');

    if (!product || product.isDeleted) {
        return next(AppError.notFound('Product not found'));
    }

    if (product.status !== 'PENDING_APPROVAL') {
        return next(AppError.badRequest(`Product is already ${product.status.toLowerCase()}`));
    }

    // Reject product
    product.status = 'REJECTED';
    product.rejectionReason = reason.trim();
    await product.save();

    res.status(200).json({
        status: 'success',
        message: 'Product rejected',
        data: {
            product: {
                id: product.id,
                name: product.name,
                status: product.status,
                rejectionReason: product.rejectionReason,
                seller: product.seller,
            },
        },
    });
});
