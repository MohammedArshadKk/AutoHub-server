const express = require('express');
const bulkUploadController = require('../controllers/bulkUploadController');
const { protectAdmin } = require('../middlewares/authMiddleware');

const router = express.Router();

// All routes require admin authentication
router.use(protectAdmin);

/**
 * @route   POST /api/v1/products/bulk
 * @desc    Bulk create products from JSON array (frontend parses Excel)
 * @access  Private (Admin)
 */
router.post('/', bulkUploadController.bulkCreateProducts);

module.exports = router;
