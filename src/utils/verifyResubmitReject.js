const mongoose = require('mongoose');
const dotenv = require('dotenv');
const Product = require('../models/Product');
const Seller = require('../models/Seller');
const Part = require('../models/Part');
const config = require('../config/env');

dotenv.config();

const verifyResubmitReject = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to MongoDB');

        // 1. Create a dummy seller if needed
        let seller = await Seller.findOne();
        if (!seller) {
            console.log('No seller found, creating temporary seller...');
            seller = await Seller.create({
                businessName: 'Test Seller',
                email: 'test@seller.com',
                password: 'password123',
                phone: '1234567890'
            });
        }

        // 2. Create a dummy part
        console.log('Creating test part...');
        let part = await Part.findOne();
        if (!part) {
            part = await Part.create({
                partName: 'Test Part',
                partNumber: 'TP-12345',
                category: 'Engine',
                price: 50,
                compatibleVehicles: []
            });
        }

        // 3. Create a dummy product
        console.log('Creating test product...');
        const product = await Product.create({
            name: 'Test Product for Status',
            description: 'Testing resubmit and reject',
            price: 100,
            stock: 10,
            seller: seller._id,
            part: part._id,
            status: 'PENDING_APPROVAL'
        });
        console.log(`Product created: ${product._id}`);

        // 4. Test RESUBMIT with note
        console.log('Testing RESUBMIT with note...');
        const resubmitNote = 'Please update images';
        await Product.findByIdAndUpdate(product._id, {
            status: 'RESUBMIT',
            resubmitNote: resubmitNote
        });

        const resubmittedProduct = await Product.findById(product._id);
        if (resubmittedProduct.status === 'RESUBMIT' && resubmittedProduct.resubmitNote === resubmitNote) {
            console.log('✅ RESUBMIT flow verified');
        } else {
            console.error('❌ RESUBMIT flow failed', {
                status: resubmittedProduct.status,
                note: resubmittedProduct.resubmitNote
            });
        }

        // 5. Test REJECT with reason
        console.log('Testing REJECT with reason...');
        const rejectionReason = 'Violates terms';
        await Product.findByIdAndUpdate(product._id, {
            status: 'REJECTED',
            rejectionReason: rejectionReason
        });

        const rejectedProduct = await Product.findById(product._id);
        if (rejectedProduct.status === 'REJECTED' && rejectedProduct.rejectionReason === rejectionReason) {
            console.log('✅ REJECT flow verified');
        } else {
            console.error('❌ REJECT flow failed', {
                status: rejectedProduct.status,
                reason: rejectedProduct.rejectionReason
            });
        }

        // Cleanup
        await Product.findByIdAndDelete(product._id);
        if (part.partNumber === 'TP-12345') await Part.findByIdAndDelete(part._id);
        console.log('Cleanup done');

    } catch (error) {
        console.error('Verification failed:', error);
    } finally {
        await mongoose.disconnect();
    }
};

verifyResubmitReject();
