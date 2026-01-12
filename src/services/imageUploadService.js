const { v4: uuidv4 } = require('uuid');
const path = require('path');
const AppError = require('../utils/AppError');

/**
 * Maximum file size for image uploads (5MB)
 */
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB in bytes

/**
 * Allowed MIME types for image uploads
 */
const ALLOWED_MIME_TYPES = [
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/webp',
];

/**
 * Allowed file extensions for image uploads
 */
const ALLOWED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp'];

/**
 * Validate image file based on filename and content type
 * 
 * @param {string} filename - Original filename
 * @param {string} contentType - MIME type
 * @throws {AppError} If validation fails
 */
const validateImageFile = (filename, contentType) => {
    // Validate content type
    if (!ALLOWED_MIME_TYPES.includes(contentType.toLowerCase())) {
        throw AppError.badRequest(
            `Invalid file type. Allowed types: ${ALLOWED_MIME_TYPES.join(', ')}`
        );
    }

    // Validate file extension
    const ext = path.extname(filename).toLowerCase();
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
        throw AppError.badRequest(
            `Invalid file extension. Allowed extensions: ${ALLOWED_EXTENSIONS.join(', ')}`
        );
    }
};

/**
 * Generate a unique S3 key for an image upload
 * 
 * Format: products/{role}/{userId}/{timestamp}-{uuid}.{extension}
 * 
 * @param {string} userId - ID of the user uploading (admin or seller)
 * @param {string} userRole - Role of the user ('admin' or 'seller')
 * @param {string} originalFilename - Original filename with extension
 * @returns {string} Generated S3 key
 */
const generateImageKey = (userId, userRole, originalFilename) => {
    const ext = path.extname(originalFilename).toLowerCase();
    const timestamp = Date.now();
    const uniqueId = uuidv4();

    // Format: products/admin/USER_ID/TIMESTAMP-UUID.jpg
    return `products/${userRole}/${userId}/${timestamp}-${uniqueId}${ext}`;
};

/**
 * Validate file size
 * 
 * @param {number} fileSize - Size in bytes
 * @throws {AppError} If file is too large
 */
const validateFileSize = (fileSize) => {
    if (fileSize > MAX_FILE_SIZE) {
        throw AppError.badRequest(
            `File size exceeds maximum allowed size of ${MAX_FILE_SIZE / (1024 * 1024)}MB`
        );
    }
};

module.exports = {
    MAX_FILE_SIZE,
    ALLOWED_MIME_TYPES,
    ALLOWED_EXTENSIONS,
    validateImageFile,
    generateImageKey,
    validateFileSize,
};
