const mongoose = require('mongoose');
const env = require('./env');

/**
 * Check if the connected MongoDB instance supports transactions
 * Transactions require a Replica Set or Sharded Cluster.
 * @returns {boolean}
 */
const supportsTransactions = () => {
    // 1. Check for manual override in env
    if (process.env.MONGODB_USE_TRANSACTIONS === 'false') {
        return false;
    }

    // 2. Check connection topology
    // Topology description type can be 'ReplicaSetNoPrimary', 'ReplicaSetWithPrimary', 'Sharded', etc.
    const topologyType = mongoose.connection?.getClient()?.topology?.description?.type;

    if (!topologyType) return false;

    const isReplicaSet = topologyType.includes('ReplicaSet');
    const isSharded = topologyType === 'Sharded';

    return isReplicaSet || isSharded;
};

const connectDB = async () => {
    try {
        const options = {
            maxPoolSize: 10,
            serverSelectionTimeoutMS: 5000,
            socketTimeoutMS: 45000,
        };

        const conn = await mongoose.connect(env.mongodbUri, options);

        console.log(`✅ MongoDB Connected: ${conn.connection.host}`);

        // Log transaction support status
        if (supportsTransactions()) {
            console.log('💎 MongoDB Transactions supported');
        } else {
            console.log('⚠️ MongoDB Transactions NOT supported (Standalone instance detected)');
        }

        // Handle connection events
        mongoose.connection.on('error', (err) => {
            console.error(`❌ MongoDB connection error: ${err}`);
        });

        mongoose.connection.on('disconnected', () => {
            console.warn('⚠️ MongoDB disconnected. Attempting to reconnect...');
        });

        mongoose.connection.on('reconnected', () => {
            console.log('✅ MongoDB reconnected');
        });

        // Graceful shutdown
        process.on('SIGINT', async () => {
            await mongoose.connection.close();
            console.log('MongoDB connection closed due to app termination');
            process.exit(0);
        });

        return conn;
    } catch (error) {
        console.error(`❌ Error connecting to MongoDB: ${error.message}`);
        process.exit(1);
    }
};

module.exports = { connectDB, supportsTransactions };

