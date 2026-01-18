const Address = require('../models/Address');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/AppError');

/**
 * @desc    Get all addresses for logged-in user
 * @route   GET /api/v1/addresses
 * @access  Private (Buyer)
 */
exports.getAddresses = catchAsync(async (req, res, next) => {
    const addresses = await Address.find({ user: req.user._id }).sort({
        isDefault: -1,
        createdAt: -1,
    });

    res.status(200).json({
        status: 'success',
        results: addresses.length,
        data: {
            addresses,
        },
    });
});

/**
 * @desc    Get single address
 * @route   GET /api/v1/addresses/:id
 * @access  Private (Buyer)
 */
exports.getAddressById = catchAsync(async (req, res, next) => {
    const address = await Address.findById(req.params.id);

    if (!address) {
        return next(AppError.notFound('Address not found'));
    }

    // Check ownership
    if (address.user.toString() !== req.user._id.toString()) {
        return next(AppError.forbidden('Not authorized to access this address'));
    }

    res.status(200).json({
        status: 'success',
        data: {
            address,
        },
    });
});

/**
 * @desc    Create new address
 * @route   POST /api/v1/addresses
 * @access  Private (Buyer)
 */
exports.createAddress = catchAsync(async (req, res, next) => {
    // Add user to request body
    req.body.user = req.user._id;

    // If this is the first address, make it default
    const addressCount = await Address.countDocuments({ user: req.user._id });
    if (addressCount === 0) {
        req.body.isDefault = true;
    }

    const address = await Address.create(req.body);

    res.status(201).json({
        status: 'success',
        data: {
            address,
        },
    });
});

/**
 * @desc    Update address
 * @route   PUT /api/v1/addresses/:id
 * @access  Private (Buyer)
 */
exports.updateAddress = catchAsync(async (req, res, next) => {
    let address = await Address.findById(req.params.id);

    if (!address) {
        return next(AppError.notFound('Address not found'));
    }

    // Check ownership
    if (address.user.toString() !== req.user._id.toString()) {
        return next(AppError.forbidden('Not authorized to update this address'));
    }

    // Update
    address = await Address.findByIdAndUpdate(req.params.id, req.body, {
        new: true,
        runValidators: true,
    });

    res.status(200).json({
        status: 'success',
        data: {
            address,
        },
    });
});

/**
 * @desc    Delete address
 * @route   DELETE /api/v1/addresses/:id
 * @access  Private (Buyer)
 */
exports.deleteAddress = catchAsync(async (req, res, next) => {
    const address = await Address.findById(req.params.id);

    if (!address) {
        return next(AppError.notFound('Address not found'));
    }

    // Check ownership
    if (address.user.toString() !== req.user._id.toString()) {
        return next(AppError.forbidden('Not authorized to delete this address'));
    }

    const wasDefault = address.isDefault;

    await address.deleteOne();

    // If deleted address was default, set another as default
    if (wasDefault) {
        const newDefault = await Address.findOne({ user: req.user._id }).sort({
            createdAt: -1,
        });

        if (newDefault) {
            newDefault.isDefault = true;
            await newDefault.save();
        }
    }

    res.status(200).json({
        status: 'success',
        message: 'Address deleted successfully',
        data: null,
    });
});

/**
 * @desc    Set address as default
 * @route   PATCH /api/v1/addresses/:id/default
 * @access  Private (Buyer)
 */
exports.setDefaultAddress = catchAsync(async (req, res, next) => {
    const address = await Address.findById(req.params.id);

    if (!address) {
        return next(AppError.notFound('Address not found'));
    }

    // Check ownership
    if (address.user.toString() !== req.user._id.toString()) {
        return next(AppError.forbidden('Not authorized to update this address'));
    }

    // Set this as default (pre-save hook will handle removing default from others)
    address.isDefault = true;
    await address.save();

    res.status(200).json({
        status: 'success',
        data: {
            address,
        },
    });
});
