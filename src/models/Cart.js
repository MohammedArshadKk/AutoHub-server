const mongoose = require('mongoose');

const cartItemSchema = new mongoose.Schema(
    {
        product: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Product',
            required: true,
        },
        quantity: {
            type: Number,
            required: true,
            min: [1, 'Quantity must be at least 1'],
            default: 1,
        },
        priceSnapshot: {
            type: Number,
            required: true,
            min: [0, 'Price cannot be negative'],
        },
        addedAt: {
            type: Date,
            default: Date.now,
        },
    },
    { _id: false }
);

const cartSchema = new mongoose.Schema(
    {
        buyer: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
            unique: true, // One cart per buyer
        },
        items: {
            type: [cartItemSchema],
            default: [],
        },
    },
    {
        timestamps: true,
        toJSON: { virtuals: true },
        toObject: { virtuals: true },
    }
);

// Virtual: Calculate subtotal (sum of all item prices × quantities)
cartSchema.virtual('subtotal').get(function () {
    return this.items.reduce((total, item) => {
        return total + (item.priceSnapshot * item.quantity);
    }, 0);
});

// Virtual: Total number of items in cart
cartSchema.virtual('totalItems').get(function () {
    return this.items.reduce((total, item) => {
        return total + item.quantity;
    }, 0);
});

// Method: Add or update item in cart
cartSchema.methods.addItem = function (productId, quantity, price) {
    const existingItemIndex = this.items.findIndex(
        (item) => item.product.toString() === productId.toString()
    );

    if (existingItemIndex > -1) {
        // Update quantity if item already exists
        this.items[existingItemIndex].quantity += quantity;
    } else {
        // Add new item
        this.items.push({
            product: productId,
            quantity,
            priceSnapshot: price,
            addedAt: new Date(),
        });
    }

    return this;
};

// Method: Update item quantity
cartSchema.methods.updateItemQuantity = function (productId, quantity) {
    const itemIndex = this.items.findIndex(
        (item) => item.product.toString() === productId.toString()
    );

    if (itemIndex === -1) {
        throw new Error('Item not found in cart');
    }

    if (quantity <= 0) {
        // Remove item if quantity is 0 or negative
        this.items.splice(itemIndex, 1);
    } else {
        this.items[itemIndex].quantity = quantity;
    }

    return this;
};

// Method: Remove item from cart
cartSchema.methods.removeItem = function (productId) {
    this.items = this.items.filter(
        (item) => item.product.toString() !== productId.toString()
    );
    return this;
};

// Method: Clear all items
cartSchema.methods.clearCart = function () {
    this.items = [];
    return this;
};

// Static: Find or create cart for buyer
cartSchema.statics.findOrCreateCart = async function (buyerId) {
    let cart = await this.findOne({ buyer: buyerId });

    if (!cart) {
        cart = await this.create({ buyer: buyerId, items: [] });
    }

    return cart;
};

const Cart = mongoose.model('Cart', cartSchema);

module.exports = Cart;
