const express = require('express');
const router = express.Router();
const {
    getAddresses,
    getAddressById,
    createAddress,
    updateAddress,
    deleteAddress,
    setDefaultAddress,
} = require('../controllers/addressController');
const { protectBuyer } = require('../middlewares/authMiddleware');

// All routes require buyer authentication
router.use(protectBuyer);

/**
 * @route   GET /api/v1/addresses
 * @desc    Get all addresses for logged-in user
 * @access  Private (Buyer)
 */
router.get('/', getAddresses);

/**
 * @route   GET /api/v1/addresses/:id
 * @desc    Get single address by ID
 * @access  Private (Buyer)
 */
router.get('/:id', getAddressById);

/**
 * @route   POST /api/v1/addresses
 * @desc    Create new address
 * @access  Private (Buyer)
 */
router.post('/', createAddress);

/**
 * @route   PUT /api/v1/addresses/:id
 * @desc    Update address
 * @access  Private (Buyer)
 */
router.put('/:id', updateAddress);

/**
 * @route   DELETE /api/v1/addresses/:id
 * @desc    Delete address
 * @access  Private (Buyer)
 */
router.delete('/:id', deleteAddress);

/**
 * @route   PATCH /api/v1/addresses/:id/default
 * @desc    Set address as default
 * @access  Private (Buyer)
 */
router.patch('/:id/default', setDefaultAddress);

module.exports = router;
