const Product = require('../models/Product');
const mongoose = require('mongoose');

/**
 * Create multiple products with individual error handling
 * Continues processing even if some products fail
 */
exports.createProducts = async (products) => {
    const results = {
        total: products.length,
        successCount: 0,
        failureCount: 0,
        results: [],
    };

    console.log('💾 Processing products...');

    // Process each product independently
    for (let i = 0; i < products.length; i++) {
        try {
            const product = products[i];

            // Create product
            const createdProduct = await Product.create(product);

            results.successCount++;
            results.results.push({
                index: i,
                success: true,
                productId: createdProduct._id,
                name: createdProduct.name,
            });

            console.log(`  ✅ [${i + 1}/${products.length}] Created: ${createdProduct.name}`);

        } catch (error) {
            results.failureCount++;
            results.results.push({
                index: i,
                success: false,
                error: error.message,
                name: products[i].name,
            });

            console.log(`  ❌ [${i + 1}/${products.length}] Failed: ${products[i].name} - ${error.message}`);
        }
    }

    return results;
};

/**
 * Alternative: Use insertMany for better performance
 * Uses ordered:false to continue on errors
 */
exports.createProductsBulk = async (products) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const createdProducts = await Product.insertMany(products, {
            session,
            ordered: false // Continue on error
        });

        await session.commitTransaction();

        return {
            total: products.length,
            successCount: createdProducts.length,
            failureCount: 0,
            results: createdProducts.map((product, index) => ({
                index,
                success: true,
                productId: product._id,
                name: product.name,
            })),
        };

    } catch (error) {
        await session.abortTransaction();

        // Handle partial success
        if (error.writeErrors) {
            const successCount = error.insertedDocs?.length || 0;

            return {
                total: products.length,
                successCount,
                failureCount: error.writeErrors.length,
                results: products.map((product, index) => {
                    const writeError = error.writeErrors.find(e => e.index === index);

                    if (writeError) {
                        return {
                            index,
                            success: false,
                            error: writeError.errmsg,
                            name: product.name,
                        };
                    }

                    const insertedDoc = error.insertedDocs?.find((doc, i) => i === index);
                    return {
                        index,
                        success: true,
                        productId: insertedDoc?._id,
                        name: product.name,
                    };
                }),
            };
        }

        throw error;

    } finally {
        session.endSession();
    }
};
