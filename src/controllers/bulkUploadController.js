const catchAsync = require('../utils/catchAsync');
const bulkUploadService = require('../services/bulkUploadService');
const { validateBulkProducts } = require('../validators/bulkUploadValidator');

/**
 * @desc    Bulk create products from JSON array
 * @route   POST /api/v1/products/bulk
 * @access  Private (Admin)
 */
exports.bulkCreateProducts = catchAsync(async (req, res) => {
    console.log('\n📊 === BULK UPLOAD STARTED ===');
    console.log('Products count:', req.body.products?.length || 0);

    // Validate request body
    const { error, value } = validateBulkProducts(req.body);

    if (error) {
        console.log('❌ Validation failed');
        console.log('Errors:', error.details.length);

        return res.status(400).json({
            success: false,
            message: 'Validation failed',
            errors: error.details.map(detail => ({
                index: parseInt(detail.path[1]) || 0,
                field: detail.path[2],
                message: detail.message,
            })),
        });
    }

    console.log('✅ Validation passed');

    // Process bulk upload
    const result = await bulkUploadService.createProducts(value.products);

    console.log('📊 Results:');
    console.log('  Total:', result.total);
    console.log('  Success:', result.successCount);
    console.log('  Failed:', result.failureCount);
    console.log('=== BULK UPLOAD COMPLETED ===\n');

    res.status(200).json({
        success: true,
        message: result.failureCount > 0
            ? 'Bulk upload completed with some failures'
            : 'Bulk upload completed',
        data: result,
    });
});
