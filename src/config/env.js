/**
 * Environment Configuration
 * 
 * - Development: Loads from .env file via dotenv
 * - Production: Uses environment variables from Docker/Kubernetes/Cloud
 */

const path = require('path');

// Load .env file (only affects development - production uses system env vars)
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

// Core required secrets (always needed)
const coreRequiredSecrets = [
  'MONGODB_URI',
  'GOOGLE_CLIENT_ID',
  'GOOGLE_CLIENT_SECRET',
  'JWT_ACCESS_SECRET',
  'JWT_REFRESH_SECRET',
];

// AWS secrets (required in production, optional in development)
const awsSecrets = [
  'AWS_REGION',
  'AWS_ACCESS_KEY_ID',
  'AWS_SECRET_ACCESS_KEY',
  'AWS_S3_BUCKET_NAME',
];

const requiredSecrets = process.env.NODE_ENV === 'production'
  ? [...coreRequiredSecrets, ...awsSecrets]
  : coreRequiredSecrets;

/**
 * Validate that all required secrets are present
 * Call this function at server startup
 */
const validateSecrets = () => {
  const missingSecrets = requiredSecrets.filter((secret) => !process.env[secret]);

  if (missingSecrets.length > 0) {
    console.error('═══════════════════════════════════════════════════════════');
    console.error('❌ MISSING REQUIRED SECRETS:');
    console.error('═══════════════════════════════════════════════════════════');
    missingSecrets.forEach((secret) => {
      console.error(`   • ${secret}`);
    });
    console.error('');
    console.error('Set these environment variables via your deployment platform:');
    console.error('  - Docker: docker run -e SECRET_NAME=value');
    console.error('  - K8s: Use ConfigMaps/Secrets');
    console.error('  - Local: export SECRET_NAME=value');
    console.error('═══════════════════════════════════════════════════════════');
    process.exit(1);
  }

  console.log('✅ All required secrets validated');
};

/**
 * Get a secret value with optional default
 * Throws error if required secret is missing
 */
const getSecret = (key, defaultValue = undefined) => {
  const value = process.env[key];

  if (value === undefined && defaultValue === undefined) {
    throw new Error(`Missing required secret: ${key}`);
  }

  return value || defaultValue;
};

/**
 * Configuration object
 * Lazy-loaded to allow secrets to be injected at runtime
 */
const config = {
  // Server
  get nodeEnv() {
    return process.env.NODE_ENV || 'development';
  },
  get port() {
    return parseInt(process.env.PORT, 10) || 5000;
  },

  // Database
  get mongodbUri() {
    return getSecret('MONGODB_URI');
  },

  // Google OAuth
  google: {
    get clientId() {
      return getSecret('GOOGLE_CLIENT_ID');
    },
    get clientSecret() {
      return getSecret('GOOGLE_CLIENT_SECRET');
    },
    get callbackUrl() {
      return process.env.GOOGLE_CALLBACK_URL || 'http://localhost:5001/api/v1/auth/google/callback';
    },
  },

  // JWT Secrets
  jwt: {
    get accessSecret() {
      return getSecret('JWT_ACCESS_SECRET');
    },
    get refreshSecret() {
      return getSecret('JWT_REFRESH_SECRET');
    },
    get accessExpiresIn() {
      return process.env.JWT_ACCESS_EXPIRES_IN || '15m';
    },
    get refreshExpiresIn() {
      return process.env.JWT_REFRESH_EXPIRES_IN || '7d';
    },
  },

  // Cookie Configuration
  cookie: {
    get domain() {
      return process.env.COOKIE_DOMAIN || 'localhost';
    },
  },

  // Frontend URLs
  get buyerFrontendUrl() {
    return process.env.BUYER_FRONTEND_URL || 'http://localhost:5173';
  },

  get adminFrontendUrl() {
    return process.env.ADMIN_FRONTEND_URL || 'http://localhost:5000';
  },

  get sellerFrontendUrl() {
    return process.env.SELLER_FRONTEND_URL || 'http://localhost:3001';
  },

  get frontendUrl() {
    // Legacy support - defaults to buyer frontend
    return process.env.FRONTEND_URL || this.buyerFrontendUrl;
  },

  // AWS S3 Configuration
  aws: {
    get region() {
      return process.env.AWS_REGION || null;
    },
    get accessKeyId() {
      return process.env.AWS_ACCESS_KEY_ID || null;
    },
    get secretAccessKey() {
      return process.env.AWS_SECRET_ACCESS_KEY || null;
    },
    get isConfigured() {
      return !!(process.env.AWS_REGION && process.env.AWS_ACCESS_KEY_ID &&
        process.env.AWS_SECRET_ACCESS_KEY && process.env.AWS_S3_BUCKET_NAME);
    },
    s3: {
      get bucketName() {
        return process.env.AWS_S3_BUCKET_NAME || null;
      },
      get baseUrl() {
        const bucketName = process.env.AWS_S3_BUCKET_NAME;
        const region = process.env.AWS_REGION;
        if (!bucketName || !region) return null;
        return process.env.AWS_S3_BASE_URL || `https://${bucketName}.s3.${region}.amazonaws.com`;
      },
    },
  },

  // Rate Limiting
  rateLimit: {
    get windowMs() {
      return parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) || 15 * 60 * 1000;
    },
    get maxRequests() {
      return parseInt(process.env.RATE_LIMIT_MAX_REQUESTS, 10) || 100;
    },
  },

  // Helper flags
  get isProduction() {
    return process.env.NODE_ENV === 'production';
  },
  get isDevelopment() {
    return process.env.NODE_ENV !== 'production';
  },
};

module.exports = config;
module.exports.validateSecrets = validateSecrets;
module.exports.getSecret = getSecret;
