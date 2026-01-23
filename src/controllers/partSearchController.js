const Part = require('../models/Part');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/AppError');

// Utility function to escape regex special characters
const escapeRegex = (str) => {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
};

// Common car makes for smart parsing
const CAR_MAKES = [
    'toyota', 'honda', 'ford', 'chevrolet', 'nissan', 'bmw', 'mercedes', 'audi',
    'volkswagen', 'hyundai', 'kia', 'mazda', 'subaru', 'lexus', 'acura', 'infiniti',
    'jeep', 'ram', 'dodge', 'chrysler', 'buick', 'cadillac', 'gmc', 'volvo', 'porsche',
    'tesla', 'land rover', 'jaguar', 'mini', 'fiat', 'alfa romeo', 'maserati', 'bentley',
    'ferrari', 'lamborghini', 'rolls-royce', 'aston martin', 'mclaren', 'bugatti'
];

// Smart query parser to extract year, make, and keywords
const parseSearchQuery = (query) => {
    if (!query) return { year: null, make: null, keywords: [] };

    const words = query.toLowerCase().trim().split(/\s+/);
    let year = null;
    let make = null;
    const keywords = [];

    words.forEach(word => {
        // Check if it's a year (4 digits between 1900-2030)
        if (/^\d{4}$/.test(word)) {
            const yearNum = parseInt(word);
            if (yearNum >= 1900 && yearNum <= 2030) {
                year = yearNum;
                return;
            }
        }

        // Check if it's a car make
        if (CAR_MAKES.includes(word)) {
            make = word;
            return;
        }

        // Otherwise, it's a keyword
        keywords.push(word);
    });

    console.log('🧠 [SMART PARSE]', { original: query, year, make, keywords });

    return { year, make, keywords };
};

// In-memory cache for search results (production: use Redis)
const searchCache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// Clear old cache entries periodically
setInterval(() => {
    const now = Date.now();
    for (const [key, value] of searchCache.entries()) {
        if (now - value.timestamp > CACHE_TTL) {
            searchCache.delete(key);
        }
    }
}, 60 * 1000); // Clean every minute

/**
 * @desc    Advanced search Parts with fuzzy matching and caching
 * @route   GET /api/v1/parts/search
 * @access  Public (or Seller)
 */
exports.searchParts = catchAsync(async (req, res, next) => {
    const {
        q: searchQuery,
        category,
        brand,
        year,
        make,
        model,
        variant,
        page = 1,
        limit = 20,
    } = req.query;

    console.log('🔎 [SEARCH] Request received:', {
        searchQuery,
        category,
        brand,
        year,
        make,
        model,
        variant,
        page,
        limit
    });

    // Create cache key
    const cacheKey = JSON.stringify({
        searchQuery,
        category,
        brand,
        year,
        make,
        model,
        variant,
        page,
        limit,
    });

    // Check cache first
    const cached = searchCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
        console.log('💾 [SEARCH] Returning cached results');
        return res.status(200).json({
            ...cached.data,
            cached: true,
        });
    }

    console.log('🆕 [SEARCH] Cache miss, executing fresh query');

    // Smart parse the search query if provided
    let parsedQuery = { year: null, make: null, keywords: [] };
    if (searchQuery) {
        parsedQuery = parseSearchQuery(searchQuery);
    }

    // Use parsed values if explicit filters not provided
    const effectiveYear = year || parsedQuery.year;
    const effectiveMake = make || parsedQuery.make;

    console.log('🧩 [SEARCH] Effective filters:', {
        year: effectiveYear,
        make: effectiveMake,
        model,
        variant,
        category,
        brand,
        keywords: parsedQuery.keywords
    });

    // Build query
    const filter = {
        isDeleted: false,
    };

    // Text search with fuzzy matching support
    // If we have keywords from smart parsing, use them; otherwise use original query
    if (searchQuery) {
        const searchText = parsedQuery.keywords.length > 0
            ? parsedQuery.keywords.join(' ')
            : searchQuery;
        filter.$text = { $search: searchText };
    }

    // Category filter
    if (category) {
        filter.category = category;
    }

    // Brand filter (matches any brand in array)
    if (brand) {
        filter.brand = brand;
    }

    // Vehicle compatibility filters (use effective values from smart parsing)
    if (effectiveYear || effectiveMake || model || variant) {
        const vehicleFilter = {};

        if (effectiveYear) vehicleFilter['compatibleVehicles.year'] = parseInt(effectiveYear);
        if (effectiveMake) vehicleFilter['compatibleVehicles.make'] = new RegExp(escapeRegex(effectiveMake), 'i');
        if (model) vehicleFilter['compatibleVehicles.model'] = new RegExp(escapeRegex(model), 'i');
        if (variant) vehicleFilter['compatibleVehicles.variant'] = new RegExp(escapeRegex(variant), 'i');

        // Use $elemMatch for compound vehicle filtering
        if (Object.keys(vehicleFilter).length > 0) {
            filter.compatibleVehicles = { $elemMatch: vehicleFilter };
        }
    }

    // Pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Build query with projection and sorting
    let query = Part.find(filter)
        .select('partName description category subCategory brand partNumbers compatibleVehicles tags defaultImageUrl')
        .limit(parseInt(limit))
        .skip(skip);

    // Sort: text score first (if search), then by name
    if (searchQuery) {
        query = query.sort({ score: { $meta: 'textScore' }, partName: 1 });
    } else {
        query = query.sort({ partName: 1 });
    }

    // Execute query
    const [parts, total] = await Promise.all([
        query.lean().exec(),
        Part.countDocuments(filter),
    ]);

    // Prepare response
    const response = {
        status: 'success',
        results: parts.length,
        pagination: {
            page: parseInt(page),
            limit: parseInt(limit),
            total,
            pages: Math.ceil(total / parseInt(limit)),
        },
        data: {
            parts,
        },
    };

    // Cache results
    searchCache.set(cacheKey, {
        timestamp: Date.now(),
        data: response,
    });

    console.log('📤 [SEARCH] Sending response:', {
        results: parts.length,
        total,
        page: parseInt(page),
        pages: Math.ceil(total / parseInt(limit))
    });

    res.status(200).json(response);
});

/**
 * @desc    Get search suggestions (autocomplete)
 * @route   GET /api/v1/parts/suggestions
 * @access  Public
 */
exports.getSearchSuggestions = catchAsync(async (req, res, next) => {
    const { q } = req.query;

    console.log('🔍 [SUGGESTIONS] Query received:', q);

    if (!q || q.trim().length < 2) {
        console.log('⚠️  [SUGGESTIONS] Query too short, returning empty results');
        return res.status(200).json({
            status: 'success',
            data: { suggestions: [] },
        });
    }

    // Use smart query parsing to extract year, make, and keywords
    const parsed = parseSearchQuery(q.trim());

    // Build filter dynamically based on parsed query
    const filter = {
        isDeleted: false,
    };

    // If keywords exist, search in part name
    if (parsed.keywords.length > 0) {
        const keywordRegex = escapeRegex(parsed.keywords.join(' '));
        filter.partName = { $regex: keywordRegex, $options: 'i' };
    }

    // If year is detected, add vehicle compatibility filter
    if (parsed.year || parsed.make) {
        filter.compatibleVehicles = { $elemMatch: {} };
        if (parsed.year) {
            filter.compatibleVehicles.$elemMatch.year = parsed.year;
        }
        if (parsed.make) {
            filter.compatibleVehicles.$elemMatch.make = {
                $regex: new RegExp(escapeRegex(parsed.make), 'i')
            };
        }
    }

    console.log('🔍 [SUGGESTIONS] Database filter:', JSON.stringify(filter, null, 2));

    const parts = await Part.find(filter)
        .select('partName category compatibleVehicles')
        .limit(10)
        .lean();

    console.log('💾 [SUGGESTIONS] Database returned:', parts.length, 'parts');
    if (parts.length > 0) {
        console.log('📋 [SUGGESTIONS] Sample part:', parts[0]);
    }

    const suggestions = parts.map(p => ({
        text: p.partName,
        category: p.category,
        id: p._id,
    }));

    console.log('📤 [SUGGESTIONS] Sending response:', {
        count: suggestions.length,
        suggestions: suggestions.map(s => s.text)
    });

    res.status(200).json({
        status: 'success',
        data: { suggestions },
    });
});

/**
 * @desc    Get unique makes for vehicle filter
 * @route   GET /api/v1/parts/vehicles/makes
 * @access  Public
 */
exports.getVehicleMakes = catchAsync(async (req, res, next) => {
    const makes = await Part.distinct('compatibleVehicles.make', {
        isDeleted: false,
    });

    res.status(200).json({
        status: 'success',
        data: {
            makes: makes.sort(),
        },
    });
});

/**
 * @desc    Get models for a specific make
 * @route   GET /api/v1/parts/vehicles/models
 * @access  Public
 */
exports.getVehicleModels = catchAsync(async (req, res, next) => {
    const { make } = req.query;

    if (!make) {
        return next(AppError.badRequest('Make is required'));
    }

    const models = await Part.distinct('compatibleVehicles.model', {
        'compatibleVehicles.make': make,
        isDeleted: false,
    });

    res.status(200).json({
        status: 'success',
        data: {
            models: models.sort(),
        },
    });
});

/**
 * @desc    Get part categories
 * @route   GET /api/v1/parts/categories
 * @access  Public
 */
exports.getCategories = catchAsync(async (req, res, next) => {
    const categories = await Part.distinct('category', {
        isDeleted: false,
    });

    res.status(200).json({
        status: 'success',
        data: {
            categories: categories.sort(),
        },
    });
});

/**
 * @desc    Get popular brands
 * @route   GET /api/v1/parts/brands
 * @access  Public
 */
exports.getBrands = catchAsync(async (req, res, next) => {
    // Get all brands (flattened from arrays)
    const parts = await Part.find({
        isDeleted: false,
    })
        .select('brand')
        .lean();

    // Flatten and count brand occurrences
    const brandCounts = {};
    parts.forEach(part => {
        part.brand.forEach(b => {
            brandCounts[b] = (brandCounts[b] || 0) + 1;
        });
    });

    // Sort by popularity
    const brands = Object.entries(brandCounts)
        .sort((a, b) => b[1] - a[1])
        .map(([brand]) => brand);

    res.status(200).json({
        status: 'success',
        data: {
            brands: brands.slice(0, 50), // Top 50
        },
    });
});

module.exports = exports;
