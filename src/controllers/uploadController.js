const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/AppError');
const config = require('../config/env');
const { generatePresignedUploadUrl, generatePublicUrl } = require('../utils/s3');
const { validateImageFile, generateImageKey } = require('../services/imageUploadService');

/**
 * @desc    Generate pre-signed URL for image upload to S3
 * @route   POST /api/v1/upload/presigned-url
 * @access  Private (Admin, Seller)
 * @body    { filename: string, contentType: string, fileSize?: number }
 */
exports.generatePresignedUrl = catchAsync(async (req, res, next) => {
    // Check if AWS S3 is configured
    if (!config.aws.isConfigured) {
        return next(AppError.serviceUnavailable(
            'Image upload service is not configured. Please contact administrator.'
        ));
    }

    const { filename, contentType, fileSize } = req.body;

    // Validate required fields
    if (!filename || !contentType) {
        return next(AppError.badRequest('Filename and content type are required'));
    }

    // Validate file size if provided (optional validation)
    if (fileSize) {
        const MAX_SIZE = 5 * 1024 * 1024; // 5MB
        if (fileSize > MAX_SIZE) {
            return next(AppError.badRequest(`File size exceeds maximum allowed size of ${MAX_SIZE / (1024 * 1024)}MB`));
        }
    }

    // Validate image file type
    try {
        validateImageFile(filename, contentType);
    } catch (error) {
        return next(error);
    }

    // Determine user role and ID
    let userId;
    let userRole;

    if (req.admin) {
        userId = req.admin.id;
        userRole = 'admin';
    } else if (req.seller) {
        userId = req.seller.id;
        userRole = 'seller';
    } else {
        return next(AppError.unauthorized('User not authenticated'));
    }

    // Generate unique S3 key
    const key = generateImageKey(userId, userRole, filename);

    // Generate pre-signed URL for upload (15 minutes expiration)
    const uploadUrl = await generatePresignedUploadUrl(key, contentType, 900);

    // Generate the public URL that will be used after upload
    const imageUrl = generatePublicUrl(key);

    res.status(200).json({
        status: 'success',
        data: {
            uploadUrl,
            imageUrl,
            key,
            expiresIn: 900, // 15 minutes in seconds
        },
    });
});
