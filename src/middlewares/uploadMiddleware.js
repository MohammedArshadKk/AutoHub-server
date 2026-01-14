const multer = require('multer');
const AppError = require('../utils/AppError');

// Configure multer for Excel file uploads
const storage = multer.memoryStorage(); // Store in memory, not on disk

// File filter to accept only Excel files
const fileFilter = (req, file, cb) => {
    const allowedMimeTypes = [
        'application/vnd.ms-excel', // .xls
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
    ];

    if (allowedMimeTypes.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(
            AppError.badRequest(
                'Invalid file type. Please upload an Excel file (.xlsx or .xls)'
            ),
            false
        );
    }
};

// Multer configuration
const upload = multer({
    storage: storage,
    fileFilter: fileFilter,
    limits: {
        fileSize: 5 * 1024 * 1024, // 5MB max file size
    },
});

// Middleware for single Excel file upload
const uploadExcel = upload.single('file');

// Error handler for multer errors
const handleMulterError = (err, req, res, next) => {
    if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
            return next(AppError.badRequest('File size too large. Maximum size is 5MB'));
        }
        if (err.code === 'LIMIT_UNEXPECTED_FILE') {
            return next(AppError.badRequest('Unexpected field in form data'));
        }
        return next(AppError.badRequest(`Upload error: ${err.message}`));
    }
    next(err);
};

module.exports = {
    uploadExcel,
    handleMulterError,
};
