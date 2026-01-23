const Part = require('../models/Part');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/AppError');

// Utility function to escape regex special characters
const escapeRegex = (str) => {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
};

// ==================== PUBLIC ENDPOINTS ==================== //

/**
 * @desc    Get all parts (with filters)
 * @route   GET /api/v1/parts
 * @access  Public
 */
exports.getParts = catchAsync(async (req, res, next) => {
    const {
        page = 1,
        limit = 20,
        category,
        brand,
        minPrice,
        maxPrice,
        make,
        model,
        year,
        search,
        sort = '-createdAt',
        inStock,
    } = req.query;

    // Validate pagination
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(50, Math.max(1, parseInt(limit, 10) || 20));

    // Build query - only active parts
    const query = { isDeleted: false };

    // Category filter
    if (category) {
        query.category = category;
    }

    // Brand filter
    if (brand) {
        query.brand = { $regex: new RegExp(escapeRegex(brand), 'i') };
    }

    // Price range filter
    if (minPrice || maxPrice) {
        query.price = {};
        if (minPrice) query.price.$gte = Number(minPrice);
        if (maxPrice) query.price.$lte = Number(maxPrice);
    }

    // In stock filter
    if (inStock === true || inStock === 'true') {
        query.stock = { $gt: 0 };
    }

    // Vehicle compatibility filter
    if (make || model || year) {
        query.compatibleVehicles = { $elemMatch: {} };
        if (year) query.compatibleVehicles.$elemMatch.year = Number(year);
        if (make) query.compatibleVehicles.$elemMatch.make = { $regex: new RegExp(escapeRegex(make), 'i') };
        if (model) query.compatibleVehicles.$elemMatch.model = { $regex: new RegExp(escapeRegex(model), 'i') };
    }

    // Text search
    if (search && search.trim()) {
        query.$text = { $search: search.trim() };
    }

    const skip = (pageNum - 1) * limitNum;

    // Execute query with pagination
    const [parts, total] = await Promise.all([
        Part.find(query)
            .sort(sort)
            .skip(skip)
            .limit(limitNum)
            .select('-__v')
            .populate('createdBy', 'name email')
            .lean(),
        Part.countDocuments(query),
    ]);

    res.status(200).json({
        status: 'success',
        results: parts.length,
        pagination: {
            page: pageNum,
            limit: limitNum,
            total,
            pages: Math.ceil(total / limitNum),
            hasNext: pageNum < Math.ceil(total / limitNum),
            hasPrev: pageNum > 1,
        },
        data: {
            parts,
        },
    });
});

/**
 * @desc    Get single part by ID
 * @route   GET /api/v1/parts/:id
 * @access  Public
 */
exports.getPartById = catchAsync(async (req, res, next) => {
    const { id } = req.params;

    // Validate ObjectId format
    if (!id.match(/^[0-9a-fA-F]{24}$/)) {
        return next(AppError.badRequest('Invalid part ID format'));
    }

    const part = await Part.findOne({
        _id: id,
        isDeleted: false,
    })
        .populate('createdBy', 'name email')
        .lean();

    // Increment view count asynchronously (fire and forget)
    Part.findByIdAndUpdate(id, { $inc: { views: 1 } }).exec().catch(() => { });

    res.status(200).json({
        status: 'success',
        data: {
            part,
        },
    });
});

// ==================== ADMIN ENDPOINTS ==================== //

/**
 * @desc    Create part (Admin)
 * @route   POST /api/v1/parts/admin
 * @access  Private (Admin)
 */
exports.createPart = catchAsync(async (req, res, next) => {
    // Extract validated data from request body
    const partData = { ...req.body };

    // Set admin reference
    partData.createdBy = req.admin.id;

    // Trim and sanitize text fields
    if (partData.partName) {
        partData.partName = partData.partName.trim();
    }
    if (partData.description) {
        partData.description = partData.description.trim();
    }
    if (partData.partNumber) {
        partData.partNumber = partData.partNumber.trim().toUpperCase();
    }

    // Sanitize brand array (trim each brand name)
    if (partData.brand && Array.isArray(partData.brand)) {
        partData.brand = partData.brand
            .map(b => b.trim())
            .filter(b => b.length > 0); // Remove empty strings
    }

    // Sanitize partNumbers array (trim and uppercase each part number)
    if (partData.partNumbers && Array.isArray(partData.partNumbers)) {
        partData.partNumbers = partData.partNumbers
            .map(pn => pn.trim().toUpperCase())
            .filter(pn => pn.length > 0); // Remove empty strings
    }



    // Create part
    const part = await Part.create(partData);

    res.status(201).json({
        status: 'success',
        message: 'Part created successfully',
        data: {
            part,
        },
    });
});

/**
 * @desc    Update part (Admin)
 * @route   PATCH /api/v1/parts/admin/:id
 * @access  Private (Admin)
 */
exports.updatePart = catchAsync(async (req, res, next) => {
    const { id } = req.params;

    if (!id.match(/^[0-9a-fA-F]{24}$/)) {
        return next(AppError.badRequest('Invalid part ID format'));
    }

    const part = await Part.findById(id);

    if (!part || part.isDeleted) {
        return next(AppError.notFound('Part not found'));
    }

    // Extract update data
    const updateData = { ...req.body };

    // Standard Sanitization
    if (updateData.partName) updateData.partName = updateData.partName.trim();
    if (updateData.description) updateData.description = updateData.description.trim();
    if (updateData.partNumber) updateData.partNumber = updateData.partNumber.trim().toUpperCase();

    if (updateData.brand && Array.isArray(updateData.brand)) {
        updateData.brand = updateData.brand.map(b => b.trim()).filter(b => b.length > 0);
    }

    if (updateData.partNumbers && Array.isArray(updateData.partNumbers)) {
        updateData.partNumbers = updateData.partNumbers.map(pn => pn.trim().toUpperCase()).filter(pn => pn.length > 0);
    }

    // Perform Update
    const updatedPart = await Part.findByIdAndUpdate(id, updateData, {
        new: true,
        runValidators: true,
    }).populate('createdBy', 'name email');

    res.status(200).json({
        status: 'success',
        message: 'Global part record updated successfully',
        data: {
            part: updatedPart,
        },
    });
});

/**
 * @desc    Delete part (Admin - Soft Delete)
 * @route   DELETE /api/v1/parts/admin/:id
 * @access  Private (Admin)
 */
exports.deletePart = catchAsync(async (req, res, next) => {
    const { id } = req.params;

    if (!id.match(/^[0-9a-fA-F]{24}$/)) {
        return next(AppError.badRequest('Invalid part ID format'));
    }

    const part = await Part.findById(id);

    if (!part || part.isDeleted) {
        return next(AppError.notFound('Part not found or already deleted'));
    }

    // Perform Soft Delete on Part
    part.isDeleted = true;
    await part.save();

    // =========== CASCADE: ARCHIVE ASSOCIATED PRODUCTS ===========
    // When a global part is deleted, all seller listings for it should be archived
    const Product = mongoose.model('Product'); // Late import if needed, but it's usually globally available or required at top

    // Set all matching products to isDeleted: true and status: ARCHIVED
    await Product.updateMany(
        { part: id, isDeleted: false },
        {
            isDeleted: true,
            status: 'ARCHIVED'
        }
    );

    res.status(200).json({
        status: 'success',
        message: 'Part deleted and all associated seller product listings have been archived',
    });
});

/**
 * @desc    Get all parts (Admin - includes drafts and archived)
 * @route   GET /api/v1/parts/admin
 * @access  Private (Admin)
 */
exports.getAllPartsAdmin = catchAsync(async (req, res, next) => {
    const {
        page = 1,
        limit = 20,
        category,
        brand,
        make,
        model,
        year,
        minPrice,
        maxPrice,
        inStock,
        search,
        sort = '-createdAt',
    } = req.query;

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));

    // Build query - admin can see all parts including archived
    const query = {};

    // Basic filters
    if (category) query.category = category;

    if (brand) {
        query.brand = { $regex: new RegExp(escapeRegex(brand), 'i') };
    }

    // Vehicle compatibility filters
    if (make || model || year) {
        const vehicleQuery = {};
        if (make) vehicleQuery.make = { $regex: new RegExp(escapeRegex(make), 'i') };
        if (model) vehicleQuery.model = { $regex: new RegExp(escapeRegex(model), 'i') };
        if (year) vehicleQuery.year = parseInt(year, 10);

        query.compatibleVehicles = { $elemMatch: vehicleQuery };
    }

    // Price range filters
    if (minPrice !== undefined || maxPrice !== undefined) {
        query.price = {};
        if (minPrice !== undefined) query.price.$gte = Number(minPrice);
        if (maxPrice !== undefined) query.price.$lte = Number(maxPrice);
    }

    // Stock availability filter
    if (inStock !== undefined) {
        if (inStock === 'true' || inStock === true) {
            query.stock = { $gt: 0 };
        } else {
            query.stock = 0;
        }
    }

    // Text search
    if (search && search.trim()) {
        const escapedSearch = escapeRegex(search.trim());
        query.$or = [
            { partName: { $regex: new RegExp(escapedSearch, 'i') } },
            { partNumber: { $regex: new RegExp(escapedSearch, 'i') } },
            { brand: { $regex: new RegExp(escapedSearch, 'i') } },
            { partNumbers: { $regex: new RegExp(escapedSearch, 'i') } },
        ];
    }

    const skip = (pageNum - 1) * limitNum;

    const [parts, total] = await Promise.all([
        Part.find(query)
            .sort(sort)
            .skip(skip)
            .limit(limitNum)
            .select('partName partNumber partNumbers images price stock brand category isDeleted createdAt')
            .populate('createdBy', 'name email')
            .lean(),
        Part.countDocuments(query),
    ]);

    res.status(200).json({
        status: 'success',
        results: parts.length,
        pagination: {
            page: pageNum,
            limit: limitNum,
            total,
            pages: Math.ceil(total / limitNum),
        },
        data: {
            parts,
        },
    });
});

