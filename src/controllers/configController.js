const SystemConfig = require('../models/SystemConfig');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/AppError');

// Helper: Get or Create Config
const getOrInitConfig = async () => {
    let config = await SystemConfig.findOne();
    if (!config) {
        config = await SystemConfig.create({}); // Defaults apply
    }
    return config;
};

exports.getOrInitConfig = getOrInitConfig;

/**
 * Get System Configuration (Public/Protected)
 * GET /api/v1/config
 */
exports.getSystemConfig = catchAsync(async (req, res, next) => {
    const config = await getOrInitConfig();

    res.json({
        status: 'success',
        data: { config }
    });
});

/**
 * Update System Configuration (Admin Only)
 * PATCH /api/v1/config
 */
exports.updateSystemConfig = catchAsync(async (req, res, next) => {
    // Allowed updates
    const allowedFields = [
        'codEnabled',
        'supportEmail',
        'supportPhone',
        'shipping'
    ];

    const config = await getOrInitConfig();

    // Update fields
    Object.keys(req.body).forEach(key => {
        if (allowedFields.includes(key)) {
            config[key] = req.body[key];
        }
    });

    if (req.admin) {
        config.updatedBy = req.admin.id;
    }

    await config.save();

    res.json({
        status: 'success',
        message: 'System configuration updated',
        data: { config }
    });
});

/**
 * Calculate Shipping Charge (Utility for OrderController)
 * Uses Haversine formula if coordinates exist, else falls back to flat/base
 */
exports.calculateShippingCharge = (config, distanceKm) => {
    if (config.shipping.mode === 'FLAT') {
        return config.shipping.baseCharge;
    }

    // DISTANCE MODE
    // If distance is within free range/base range
    // Let's say baseCharge covers the first X km? 
    // Or baseCharge is a fixed handling fee + perKm?
    // Implementation: Base + (Dist * PerKm)

    // Check if free shipping applies logic (usually handled by order total threshold outside this function, 
    // but here we calculate raw shipping cost)

    // Simplification:
    // Shipping = BaseCharge + (Math.max(0, distanceKm - FreeDistance) * PerKm)

    const taxableDistance = Math.max(0, distanceKm - config.shipping.freeShippingDistance);
    const charge = config.shipping.baseCharge + (taxableDistance * config.shipping.perKmCharge);

    return Math.round(charge);
};

/**
 * Calculate Distance between two points (Haversine Formula) (in Km)
 */
exports.calculateDistance = (lat1, lon1, lat2, lon2) => {
    if (!lat1 || !lon1 || !lat2 || !lon2) return 0; // Fallback

    const R = 6371; // Earth's radius in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const d = R * c;
    return d; // Distance in km
};
