const express = require('express');
const uploadController = require('../controllers/uploadController');
const { protectAdminOrSeller } = require('../middlewares/authMiddleware');

const router = express.Router();

/**
 * @route   POST /api/v1/upload/presigned-url
 * @desc    Generate pre-signed URL for image upload
 * @access  Private (Admin or Seller)
 */
router.post('/presigned-url', protectAdminOrSeller, uploadController.generatePresignedUrl);

module.exports = router;
