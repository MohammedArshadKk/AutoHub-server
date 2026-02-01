const express = require('express');
const router = express.Router();
const cartController = require('../controllers/cartController');
const { protectBuyer } = require('../middlewares/authMiddleware');

/**
 * @route   POST /api/v1/cart
 * @desc    Add item to cart or update quantity
 * @access  Private (Buyer)
 */
router.post('/', protectBuyer, cartController.addToCart);
router.post('/sync', protectBuyer, cartController.syncCart);

/**
 * @route   GET /api/v1/cart
 * @desc    Get buyer's cart
 * @access  Private (Buyer)
 */
router.get('/', protectBuyer, cartController.getCart);

/**
 * @route   PUT /api/v1/cart/:productId
 * @desc    Update item quantity
 * @access  Private (Buyer)
 */
router.put('/:productId', protectBuyer, cartController.updateCartItem);

/**
 * @route   DELETE /api/v1/cart/:productId
 * @desc    Remove item from cart
 * @access  Private (Buyer)
 */
router.delete('/:productId', protectBuyer, cartController.removeFromCart);

/**
 * @route   DELETE /api/v1/cart
 * @desc    Clear entire cart
 * @access  Private (Buyer)
 */
router.delete('/', protectBuyer, cartController.clearCart);

module.exports = router;
