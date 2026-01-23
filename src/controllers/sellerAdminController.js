const Seller = require('../models/Seller');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/AppError');

/**
 * @desc    Create seller (Admin only)
 * @route   POST /api/v1/sellers/admin/create
 * @access  Private (Admin)
 */
exports.createSeller = catchAsync(async (req, res, next) => {
    const {
        email,
        password,
        businessName,
        businessType,
        ownerName,
        description,
        logo,
        phone,
        alternatePhone,
        address,
        location,
        kyc,
        verificationStatus,
        isActive,
        commissionRate,
    } = req.body;

    // Check if seller already exists
    const existingSeller = await Seller.findOne({ email });
    if (existingSeller) {
        return next(AppError.badRequest('Seller with this email already exists'));
    }

    // Create seller data object
    const sellerData = {
        email,
        password,
        businessName,
        ownerName,
        phone,
    };

    // Add optional fields if provided
    if (businessType) sellerData.businessType = businessType;
    if (description) sellerData.description = description;
    if (logo) sellerData.logo = logo;
    if (alternatePhone) sellerData.alternatePhone = alternatePhone;
    if (address) sellerData.address = address;
    if (location) sellerData.location = location;
    if (kyc) sellerData.kyc = kyc;
    if (commissionRate !== undefined) sellerData.commissionRate = commissionRate;

    // Set verification status (default: PENDING)
    sellerData.verificationStatus = verificationStatus || 'PENDING';

    // Set active status based on verification
    if (verificationStatus === 'VERIFIED') {
        sellerData.isActive = isActive !== undefined ? isActive : true;
        sellerData.verifiedAt = new Date();
        sellerData.verifiedBy = req.admin.id;
    } else {
        sellerData.isActive = false;
    }

    // Create seller
    const seller = await Seller.create(sellerData);

    // Remove password from response
    seller.password = undefined;

    res.status(201).json({
        status: 'success',
        message: 'Seller created successfully',
        data: {
            seller,
        },
    });
});

/**
 * @desc    Get all sellers
 * @route   GET /api/v1/sellers/admin
 * @access  Private (Admin)
 */
exports.getAllSellers = catchAsync(async (req, res, next) => {
    const {
        page = 1,
        limit = 20,
        verificationStatus,
        isActive,
        search,
    } = req.query;

    // Build filter
    const filter = {};
    if (verificationStatus) filter.verificationStatus = verificationStatus;
    if (isActive !== undefined) filter.isActive = isActive === 'true';
    if (search) {
        filter.$or = [
            { businessName: { $regex: search, $options: 'i' } },
            { email: { $regex: search, $options: 'i' } },
            { ownerName: { $regex: search, $options: 'i' } },
        ];
    }

    // Execute query with pagination
    const skip = (page - 1) * limit;
    const sellers = await Seller.find(filter)
        .select('-password -refreshTokens')
        .limit(parseInt(limit))
        .skip(skip)
        .sort({ createdAt: -1 });

    const total = await Seller.countDocuments(filter);

    res.status(200).json({
        status: 'success',
        results: sellers.length,
        pagination: {
            page: parseInt(page),
            limit: parseInt(limit),
            total,
            pages: Math.ceil(total / limit),
        },
        data: {
            sellers,
        },
    });
});

/**
 * @desc    Get seller by ID
 * @route   GET /api/v1/sellers/admin/:id
 * @access  Private (Admin)
 */
exports.getSellerById = catchAsync(async (req, res, next) => {
    const seller = await Seller.findById(req.params.id).select('-password -refreshTokens');

    if (!seller) {
        return next(AppError.notFound('Seller not found'));
    }

    res.status(200).json({
        status: 'success',
        data: {
            seller,
        },
    });
});

/**
 * @desc    Update seller
 * @route   PATCH /api/v1/sellers/admin/:id
 * @access  Private (Admin)
 */
exports.updateSeller = catchAsync(async (req, res, next) => {
    const seller = await Seller.findById(req.params.id);

    if (!seller) {
        return next(AppError.notFound('Seller not found'));
    }

    // Fields that can be updated
    const allowedFields = [
        'businessName',
        'businessType',
        'ownerName',
        'description',
        'logo',
        'phone',
        'alternatePhone',
        'address',
        'location',
        'kyc',
        'commissionRate',
        'isActive',
    ];

    allowedFields.forEach((field) => {
        if (req.body[field] !== undefined) {
            seller[field] = req.body[field];
        }
    });

    await seller.save();

    res.status(200).json({
        status: 'success',
        message: 'Seller updated successfully',
        data: {
            seller,
        },
    });
});

/**
 * @desc    Verify seller
 * @route   PATCH /api/v1/sellers/admin/:id/verify
 * @access  Private (Admin)
 */
exports.verifySeller = catchAsync(async (req, res, next) => {
    const seller = await Seller.findById(req.params.id);

    if (!seller) {
        return next(AppError.notFound('Seller not found'));
    }

    await seller.verify(req.admin.id);

    res.status(200).json({
        status: 'success',
        message: 'Seller verified successfully',
        data: {
            seller,
        },
    });
});

/**
 * @desc    Reject seller verification
 * @route   PATCH /api/v1/sellers/admin/:id/reject
 * @access  Private (Admin)
 */
exports.rejectSeller = catchAsync(async (req, res, next) => {
    const { reason } = req.body;

    if (!reason) {
        return next(AppError.badRequest('Rejection reason is required'));
    }

    const seller = await Seller.findById(req.params.id);

    if (!seller) {
        return next(AppError.notFound('Seller not found'));
    }

    await seller.rejectVerification(reason);

    res.status(200).json({
        status: 'success',
        message: 'Seller verification rejected',
        data: {
            seller,
        },
    });
});

/**
 * @desc    Block seller
 * @route   PATCH /api/v1/sellers/admin/:id/block
 * @access  Private (Admin)
 */
exports.blockSeller = catchAsync(async (req, res, next) => {
    const { reason } = req.body;

    if (!reason) {
        return next(AppError.badRequest('Block reason is required'));
    }

    const seller = await Seller.findById(req.params.id);

    if (!seller) {
        return next(AppError.notFound('Seller not found'));
    }

    await seller.block(reason);

    res.status(200).json({
        status: 'success',
        message: 'Seller blocked successfully',
        data: {
            seller,
        },
    });
});

/**
 * @desc    Unblock seller
 * @route   PATCH /api/v1/sellers/admin/:id/unblock
 * @access  Private (Admin)
 */
exports.unblockSeller = catchAsync(async (req, res, next) => {
    const seller = await Seller.findById(req.params.id);

    if (!seller) {
        return next(AppError.notFound('Seller not found'));
    }

    await seller.unblock();

    res.status(200).json({
        status: 'success',
        message: 'Seller unblocked successfully',
        data: {
            seller,
        },
    });
});
