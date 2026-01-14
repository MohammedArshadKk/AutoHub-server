const XLSX = require('xlsx');
const AppError = require('./AppError');

/**
 * Parse Excel file buffer to JSON array
 * @param {Buffer} buffer - Excel file buffer
 * @returns {Array} Array of row objects
 */
const parseExcelFile = (buffer) => {
    try {
        const workbook = XLSX.read(buffer, { type: 'buffer' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];

        // Convert to JSON (first row as headers)
        const jsonData = XLSX.utils.sheet_to_json(worksheet);

        if (!jsonData || jsonData.length === 0) {
            throw AppError.badRequest('Excel file is empty');
        }

        return jsonData;
    } catch (error) {
        throw AppError.badRequest(`Failed to parse Excel file: ${error.message}`);
    }
};

/**
 * Transform Excel row to Product schema format
 * @param {Object} row - Excel row object
 * @param {Number} rowIndex - Row index for error reporting
 * @returns {Object} Product object
 */
const transformRowToProduct = (row, rowIndex) => {
    const product = {
        // Required fields
        name: row.name?.toString().trim(),
        description: row.description?.toString().trim(),
        category: row.category?.toString().trim(),

        // Optional basic fields
        price: row.price ? parseFloat(row.price) : 0,
        stock: row.stock ? parseInt(row.stock) : 0,
        condition: row.condition || 'New',
        status: row.status || 'PENDING_APPROVAL',

        // Optional metadata
        originalPrice: row.originalPrice ? parseFloat(row.originalPrice) : undefined,
        currency: row.currency || 'INR',
        partNumber: row.partNumber?.toString().trim(),
        brand: row.brand?.toString().trim(),
        subCategory: row.subCategory?.toString().trim(),
        warranty: row.warranty?.toString().trim(),
    };

    // Weight
    if (row.weight_value) {
        product.weight = {
            value: parseFloat(row.weight_value),
            unit: row.weight_unit || 'kg',
        };
    }

    // Dimensions
    if (row.dimensions_length || row.dimensions_width || row.dimensions_height) {
        product.dimensions = {
            length: row.dimensions_length ? parseFloat(row.dimensions_length) : undefined,
            width: row.dimensions_width ? parseFloat(row.dimensions_width) : undefined,
            height: row.dimensions_height ? parseFloat(row.dimensions_height) : undefined,
            unit: row.dimensions_unit || 'cm',
        };
    }

    // Tags (comma-separated string to array)
    if (row.tags) {
        product.tags = row.tags
            .toString()
            .split(',')
            .map(tag => tag.trim())
            .filter(tag => tag.length > 0);
    }

    // Images (comma-separated URLs)
    if (row.images) {
        product.images = row.images
            .toString()
            .split(',')
            .map(url => url.trim())
            .filter(url => url.length > 0);
    }

    // Vehicle compatibility (up to 5 vehicles)
    product.compatibleVehicles = [];
    for (let i = 1; i <= 5; i++) {
        const yearKey = `vehicle${i}_year`;
        const makeKey = `vehicle${i}_make`;
        const modelKey = `vehicle${i}_model`;
        const variantKey = `vehicle${i}_variant`;

        if (row[yearKey] && row[makeKey] && row[modelKey]) {
            product.compatibleVehicles.push({
                year: parseInt(row[yearKey]),
                make: row[makeKey].toString().trim(),
                model: row[modelKey].toString().trim(),
                variant: row[variantKey] ? row[variantKey].toString().trim() : undefined,
            });
        }
    }

    // Specifications (dynamic columns starting with 'spec_')
    product.specifications = {};
    Object.keys(row).forEach(key => {
        if (key.startsWith('spec_')) {
            const specKey = key.replace('spec_', '');
            product.specifications[specKey] = row[key].toString().trim();
        }
    });

    return product;
};

/**
 * Validate required fields in Excel row
 * @param {Object} row - Excel row object
 * @param {Number} rowIndex - Row index (1-based)
 * @returns {Object|null} Error object or null if valid
 */
const validateRow = (row, rowIndex) => {
    const errors = [];

    // Required fields
    if (!row.name || !row.name.toString().trim()) {
        errors.push({
            row: rowIndex,
            field: 'name',
            error: 'Product name is required',
        });
    }

    if (!row.description || !row.description.toString().trim()) {
        errors.push({
            row: rowIndex,
            field: 'description',
            error: 'Product description is required',
        });
    }

    if (!row.category || !row.category.toString().trim()) {
        errors.push({
            row: rowIndex,
            field: 'category',
            error: 'Product category is required',
        });
    } else {
        // Validate category enum
        const validCategories = [
            'Engine', 'Transmission', 'Suspension', 'Brakes', 'Electrical',
            'Body', 'Interior', 'Exterior', 'Exhaust', 'Cooling',
            'Fuel System', 'Steering', 'Wheels & Tires', 'Lighting', 'HVAC', 'Other'
        ];
        if (!validCategories.includes(row.category.toString().trim())) {
            errors.push({
                row: rowIndex,
                field: 'category',
                value: row.category,
                error: `Invalid category. Must be one of: ${validCategories.join(', ')}`,
            });
        }
    }

    // Validate condition if provided
    if (row.condition) {
        const validConditions = ['New', 'Refurbished', 'Used - Like New', 'Used - Good', 'Used - Fair'];
        if (!validConditions.includes(row.condition)) {
            errors.push({
                row: rowIndex,
                field: 'condition',
                value: row.condition,
                error: `Invalid condition. Must be one of: ${validConditions.join(', ')}`,
            });
        }
    }

    // Validate status if provided
    if (row.status) {
        const validStatuses = ['DRAFT', 'PENDING_APPROVAL', 'ACTIVE', 'REJECTED', 'ARCHIVED'];
        if (!validStatuses.includes(row.status)) {
            errors.push({
                row: rowIndex,
                field: 'status',
                value: row.status,
                error: `Invalid status. Must be one of: ${validStatuses.join(', ')}`,
            });
        }
    }

    // Validate numeric fields
    if (row.price && isNaN(parseFloat(row.price))) {
        errors.push({
            row: rowIndex,
            field: 'price',
            value: row.price,
            error: 'Price must be a number',
        });
    }

    if (row.stock && isNaN(parseInt(row.stock))) {
        errors.push({
            row: rowIndex,
            field: 'stock',
            value: row.stock,
            error: 'Stock must be a number',
        });
    }

    return errors.length > 0 ? errors : null;
};

/**
 * Validate all products
 * @param {Array} rows - Array of Excel rows
 * @returns {Object} Validation result with errors
 */
const validateProducts = (rows) => {
    const allErrors = [];

    rows.forEach((row, index) => {
        const rowErrors = validateRow(row, index + 2); // +2 because Excel is 1-indexed and row 1 is header
        if (rowErrors) {
            allErrors.push(...rowErrors);
        }
    });

    return {
        isValid: allErrors.length === 0,
        errors: allErrors,
    };
};

module.exports = {
    parseExcelFile,
    transformRowToProduct,
    validateRow,
    validateProducts,
};
