const mongoose = require('mongoose');
const dotenv = require('dotenv');
const Order = require('../models/Order');
const Product = require('../models/Product');
const User = require('../models/User');

dotenv.config();

const verifyOrderSeller = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to MongoDB');

        // 1. Find a Product
        const product = await Product.findOne();
        if (!product) {
            console.log('No product found. Cannot test.');
            return;
        }
        console.log(`Found Product: ${product.name}, Seller: ${product.seller}`);

        // 2. Find a Buyer (User)
        const buyer = await User.findOne({ role: 'buyer' });
        if (!buyer) {
            console.log('No buyer found. Cannot test.');
            return;
        }
        console.log(`Found Buyer: ${buyer.name} (${buyer._id})`);

        // 3. Create a Dummy Order Item
        // We simulate what the controller does manually to verify the Schema validation passes
        // and that we can save the 'seller' field.
        const orderItem = {
            product: product._id,
            seller: product.seller, // This is what we want to verify
            name: product.name,
            price: product.price,
            quantity: 1,
            images: product.images,
        };

        // 4. Create Order
        const order = new Order({
            buyer: buyer._id,
            items: [orderItem],
            shippingAddress: {
                fullName: 'Test Buyer',
                phone: '1234567890',
                addressLine1: '123 Test St',
                city: 'Test City',
                state: 'Test State',
                zipCode: '123456',
            },
            subtotal: product.price,
            totalAmount: product.price, // Simplifying charges
            paymentMethod: 'cod',
        });

        const savedOrder = await order.save();
        console.log(`Order saved! ID: ${savedOrder._id}`);
        console.log(`Order Number: ${savedOrder.orderNumber}`);

        // 5. Verify the saved data
        console.log('Verifying saved item structure...');
        const savedItem = savedOrder.items[0];
        console.log(`Item Seller ID: ${savedItem.seller}`);

        if (savedItem.seller && savedItem.seller.toString() === product.seller.toString()) {
            console.log('✅ SUCCESS: Seller ID correctly stored in Order Item.');
        } else {
            console.error('❌ FAILURE: Seller ID missing or incorrect.');
        }

        // Cleanup (optional, but good practice for dummy data)
        await Order.findByIdAndDelete(savedOrder._id);
        console.log('Cleaned up test order.');

    } catch (error) {
        console.error('Verification failed:', error);
    } finally {
        await mongoose.disconnect();
    }
};

verifyOrderSeller();
