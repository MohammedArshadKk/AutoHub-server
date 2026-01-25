const mongoose = require('mongoose');
const dotenv = require('dotenv');
const Seller = require('../models/Seller');

dotenv.config();

const verifyFirstSeller = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to MongoDB');

        // Find all sellers
        const sellers = await Seller.find().sort({ createdAt: -1 });

        console.log(`Found ${sellers.length} sellers:`);

        for (const seller of sellers) {
            console.log(`- ID: ${seller._id}`);
            console.log(`  Email: ${seller.email}`);
            console.log(`  Business: ${seller.businessName}`);
            console.log(`  Status: ${seller.verificationStatus}`);
            console.log(`  Active: ${seller.isActive}`);
            console.log(`  KV Status: ${seller.kyc?.status}`);

            // Allow manual verification of all
            if (seller.verificationStatus !== 'VERIFIED' || !seller.isActive) {
                console.log(`  -> Verifying and Activating...`);
                seller.verificationStatus = 'VERIFIED';
                seller.isActive = true;
                seller.kyc = { ...seller.kyc, status: 'APPROVED', verifiedAt: new Date() };
                await seller.save();
                console.log(`  -> VERIFIED and ACTIVATED!`);
            } else {
                console.log('  -> Account is fully verified and active.');
            }
            console.log('---');
        }

    } catch (error) {
        console.error('Verification failed:', error);
    } finally {
        await mongoose.disconnect();
    }
};

verifyFirstSeller();
