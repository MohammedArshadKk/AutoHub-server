const express = require('express');
const partController = require('../controllers/partController');
const { protectAdmin, hasPermission } = require('../middlewares/authMiddleware');
const { validateCreatePart, validateUpdatePart, validateQueryParams } = require('../validators/partValidator');

const router = express.Router();

// ==================== PUBLIC ROUTES ==================== //

/**
 * @route   GET /api/v1/parts
 * @desc    Get all active parts with filters and pagination
 * @access  Public
 */
router.get('/', validateQueryParams, partController.getParts);

/**
 * @route   GET /api/v1/parts/:id
 * @desc    Get single part by ID
 * @access  Public
 */
router.get('/:id', partController.getPartById);

// ==================== ADMIN ROUTES ==================== //

/**
 * @route   GET /api/v1/parts/admin
 * @desc    Get all parts (including drafts and archived) for admin
 * @access  Private (Admin)
 */
router.get('/admin/all', protectAdmin, hasPermission('parts'), validateQueryParams, partController.getAllPartsAdmin);

/**
 * @route   POST /api/v1/parts/admin
 * @desc    Create a new part
 * @access  Private (Admin)
 */
router.post('/admin', protectAdmin, hasPermission('parts'), validateCreatePart, partController.createPart);

/**
 * @route   PATCH /api/v1/parts/admin/:id
 * @desc    Update a part
 * @access  Private (Admin)
 */
router.patch('/admin/:id', protectAdmin, hasPermission('parts'), validateUpdatePart, partController.updatePart);

/**
 * @route   DELETE /api/v1/parts/admin/:id
 * @desc    Delete a part (soft delete)
 * @access  Private (Admin)
 */
router.delete('/admin/:id', protectAdmin, hasPermission('parts'), partController.deletePart);

// Bulk upload parts
router.post('/bulk', protectAdmin, hasPermission('parts'), require('../controllers/bulkPartUploadController').bulkCreateParts);

module.exports = router;
