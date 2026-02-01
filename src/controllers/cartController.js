const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/AppError');
const Cart = require('../models/Cart');
const Product = require('../models/Product');

/**
 * @desc    Add item to cart or update quantity if already exists
 * @route   POST /api/v1/cart
 * @access  Private (Buyer)
 * @body    { productId: string, quantity: number }
 */
exports.addToCart = catchAsync(async (req, res, next) => {
    const { productId, quantity = 1 } = req.body;

    // Validate required fields
    if (!productId) {
        return next(AppError.badRequest('Product ID is required'));
    }

    // Validate quantity
    if (quantity < 1) {
        return next(AppError.badRequest('Quantity must be at least 1'));
    }

    const product = await Product.findById(productId);
    if (!product) {
        return next(AppError.notFound('Product not found'));
    }

    if (product.status !== 'ACTIVE' || product.isDeleted) {
        return next(AppError.badRequest('Product is not available'));
    }

    // Check stock availability
    if (product.stock < quantity) {
        return next(AppError.badRequest(`Insufficient stock. Only ${product.stock} items available`));
    }

    // Find or create cart for buyer
    let cart = await Cart.findOrCreateCart(req.user._id);

    // Check if adding this quantity would exceed stock
    const existingItem = cart.items.find(
        (item) => item.product.toString() === productId.toString()
    );
    const totalQuantity = (existingItem?.quantity || 0) + quantity;

    if (totalQuantity > product.stock) {
        return next(AppError.badRequest(`Cannot add ${quantity} more. Only ${product.stock - (existingItem?.quantity || 0)} items available`));
    }

    // Add or update item in cart
    cart.addItem(productId, quantity, product.price);
    await cart.save();

    // Populate product details
    await cart.populate({
        path: 'items.product',
        select: 'name price images stock category condition',
    });

    res.status(200).json({
        status: 'success',
        data: {
            cart,
        },
    });
});

/**
 * @desc    Sync guest cart items to backend
 * @route   POST /api/v1/cart/sync
 * @access  Private (Buyer)
 * @body    { items: Array<{id: string, quantity: number}> }
 */
exports.syncCart = catchAsync(async (req, res, next) => {
    const { items } = req.body;

    if (!items || !Array.isArray(items)) {
        return next(AppError.badRequest('Items array is required for sync'));
    }

    // Find or create cart
    let cart = await Cart.findOrCreateCart(req.user._id);

    // Filter valid products and sync
    for (const item of items) {
        const productId = item.id || item._id;
        const quantity = item.quantity || 1;

        if (!productId) continue;

        const product = await Product.findById(productId);
        if (!product || product.status !== 'ACTIVE' || product.isDeleted) continue;

        // Check stock (simplified for sync - we take what's available up to requested)
        const availableQty = Math.min(quantity, product.stock);
        if (availableQty <= 0) continue;

        // Check if item already exists to avoid over-stocking
        const existingItem = cart.items.find(
            (i) => i.product.toString() === productId.toString()
        );

        const currentInCart = existingItem?.quantity || 0;

        // If it already exists, we might want to SUM or SET. 
        // For guest-to-member sync, SUM is usually expected (merging).
        // However, we must not exceed stock.
        const remainingStock = product.stock - currentInCart;
        const finalQtyToAdd = Math.min(availableQty, remainingStock);

        if (finalQtyToAdd > 0) {
            cart.addItem(productId, finalQtyToAdd, product.price);
        }
    }

    await cart.save();

    // Populate product details
    await cart.populate({
        path: 'items.product',
        select: 'name price images stock category condition',
    });

    res.status(200).json({
        status: 'success',
        data: {
            cart,
        },
    });
});


/**
 * @desc    Get buyer's cart with populated products
 * @route   GET /api/v1/cart
 * @access  Private (Buyer)
 */
exports.getCart = catchAsync(async (req, res, next) => {
    console.log('\n🛒 === GET CART ===');
    console.log('Buyer ID:', req.user._id);

    // Find or create cart
    let cart = await Cart.findOrCreateCart(req.user._id);
    console.log('Cart ID:', cart._id);
    console.log('Items in cart before populate:', cart.items.length);

    // Populate product details
    await cart.populate({
        path: 'items.product',
        select: 'name price originalPrice images stock category condition brand inStock status isDeleted',
    });

    console.log('Items after populate:', cart.items.length);

    // Debug each item
    cart.items.forEach((item, index) => {
        console.log(`\n📦 Item ${index + 1}:`);
        console.log('  Product exists:', !!item.product);
        if (item.product) {
            console.log('  Product ID:', item.product._id);
            console.log('  Product name:', item.product.name);
            console.log('  Product status:', item.product.status);
            console.log('  Product isDeleted:', item.product.isDeleted);
            console.log('  Will be filtered?', !(item.product.status === 'ACTIVE' && !item.product.isDeleted));
        } else {
            console.log('  ❌ Product is NULL - will be filtered out!');
        }
    });

    // Filter out items with deleted/inactive products
    const validItems = cart.items.filter(
        (item) => item.product && item.product.status === 'ACTIVE' && !item.product.isDeleted
    );

    console.log('\n📊 Filter Results:');
    console.log('Original items:', cart.items.length);
    console.log('Valid items:', validItems.length);
    console.log('Filtered out:', cart.items.length - validItems.length);

    // If any items were filtered out, update cart
    if (validItems.length !== cart.items.length) {
        console.log('⚠️  Items were filtered - updating cart in DB');
        cart.items = validItems;
        await cart.save();
    }

    console.log('=== END GET CART ===\n');

    res.status(200).json({
        status: 'success',
        data: {
            cart,
        },
    });
});

/**
 * @desc    Update item quantity in cart
 * @route   PUT /api/v1/cart/:productId
 * @access  Private (Buyer)
 * @body    { quantity: number }
 */
exports.updateCartItem = catchAsync(async (req, res, next) => {
    const { productId } = req.params;
    const { quantity } = req.body;

    // Validate quantity
    if (quantity === undefined || quantity < 0) {
        return next(AppError.badRequest('Valid quantity is required'));
    }

    // Find cart
    const cart = await Cart.findOne({ buyer: req.user._id });
    if (!cart) {
        return next(AppError.notFound('Cart not found'));
    }

    // If quantity is 0, remove item
    if (quantity === 0) {
        cart.removeItem(productId);
    } else {
        // Check stock availability
        const product = await Product.findById(productId);
        if (!product) {
            return next(AppError.notFound('Product not found'));
        }

        if (quantity > product.stock) {
            return next(AppError.badRequest(`Insufficient stock. Only ${product.stock} items available`));
        }

        // Update quantity
        cart.updateItemQuantity(productId, quantity);
    }

    await cart.save();

    // Populate product details
    await cart.populate({
        path: 'items.product',
        select: 'name price images stock category condition',
    });

    res.status(200).json({
        status: 'success',
        data: {
            cart,
        },
    });
});

/**
 * @desc    Remove item from cart
 * @route   DELETE /api/v1/cart/:productId
 * @access  Private (Buyer)
 */
exports.removeFromCart = catchAsync(async (req, res, next) => {
    const { productId } = req.params;

    // Find cart
    const cart = await Cart.findOne({ buyer: req.user._id });
    if (!cart) {
        return next(AppError.notFound('Cart not found'));
    }

    // Remove item
    cart.removeItem(productId);
    await cart.save();

    // Populate product details
    await cart.populate({
        path: 'items.product',
        select: 'name price images stock category condition',
    });

    res.status(200).json({
        status: 'success',
        message: 'Item removed from cart',
        data: {
            cart,
        },
    });
});

/**
 * @desc    Clear entire cart
 * @route   DELETE /api/v1/cart
 * @access  Private (Buyer)
 */
exports.clearCart = catchAsync(async (req, res, next) => {
    // Find cart
    const cart = await Cart.findOne({ buyer: req.user._id });
    if (!cart) {
        return next(AppError.notFound('Cart not found'));
    }

    // Clear all items
    cart.clearCart();
    await cart.save();

    res.status(200).json({
        status: 'success',
        message: 'Cart cleared',
        data: {
            cart,
        },
    });
});
