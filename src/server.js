const app = require('./app');
const { connectDB } = require('./config/database');
const env = require('./config/env');
const { validateSecrets } = require('./config/env');

// ==================== UNCAUGHT EXCEPTION HANDLER ==================== //
process.on('uncaughtException', (err) => {
    console.error('═══════════════════════════════════════════════════════════');
    console.error('UNCAUGHT EXCEPTION! 💥 Shutting down...');
    console.error('═══════════════════════════════════════════════════════════');
    console.error('Name:', err.name);
    console.error('Message:', err.message);
    if (!env.isProduction) {
        console.error('Stack:', err.stack);
    }
    process.exit(1);
});

// ==================== SERVER STARTUP ==================== //
const startServer = async () => {
    try {
        // Validate all required secrets
        validateSecrets();

        // Connect to MongoDB
        await connectDB();

        // Start HTTP server
        const server = app.listen(env.port, () => {
            console.log('');
            console.log('═══════════════════════════════════════════════════════════');
            console.log(`🚀 Auto Hub Server v1.0.0`);
            console.log('═══════════════════════════════════════════════════════════');
            console.log(`   Environment : ${env.nodeEnv}`);
            console.log(`   Port        : ${env.port}`);
            console.log(`   Health      : http://localhost:${env.port}/api/v1/health`);
            if (!env.isProduction) {
                console.log(`   Auth        : http://localhost:${env.port}/api/v1/auth/google`);
            }
            console.log('═══════════════════════════════════════════════════════════');
            console.log('');
        });

        // ==================== UNHANDLED REJECTION HANDLER ==================== //
        process.on('unhandledRejection', (err) => {
            console.error('═══════════════════════════════════════════════════════════');
            console.error('UNHANDLED REJECTION! 💥 Shutting down gracefully...');
            console.error('═══════════════════════════════════════════════════════════');
            console.error('Name:', err.name);
            console.error('Message:', err.message);
            if (!env.isProduction) {
                console.error('Stack:', err.stack);
            }
            server.close(() => {
                process.exit(1);
            });
        });

        // ==================== GRACEFUL SHUTDOWN ==================== //
        const gracefulShutdown = (signal) => {
            console.log('');
            console.log(`👋 ${signal} received. Shutting down gracefully...`);
            server.close(() => {
                console.log('✅ HTTP server closed');
                process.exit(0);
            });

            // Force close after 30 seconds
            setTimeout(() => {
                console.error('⚠️ Forcing shutdown after timeout');
                process.exit(1);
            }, 30000);
        };

        process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
        process.on('SIGINT', () => gracefulShutdown('SIGINT'));

    } catch (error) {
        console.error('═══════════════════════════════════════════════════════════');
        console.error('❌ Failed to start server');
        console.error('═══════════════════════════════════════════════════════════');
        console.error('Error:', error.message);
        if (!env.isProduction) {
            console.error('Stack:', error.stack);
        }
        process.exit(1);
    }
};

startServer();
