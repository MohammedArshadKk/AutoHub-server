const { S3Client, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const { PutObjectCommand } = require('@aws-sdk/client-s3');
const config = require('../config/env');

/**
 * S3 Client - Lazy Initialization
 * Only initializes when first accessed
 */
let s3ClientInstance = null;

const getS3Client = () => {
    if (!s3ClientInstance) {
        s3ClientInstance = new S3Client({
            region: config.aws.region,
            credentials: {
                accessKeyId: config.aws.accessKeyId,
                secretAccessKey: config.aws.secretAccessKey,
            },
        });
    }
    return s3ClientInstance;
};

/**
 * Generate a pre-signed URL for uploading a file to S3
 * 
 * @param {string} key - S3 object key (path within bucket)
 * @param {string} contentType - MIME type of the file (e.g., 'image/jpeg')
 * @param {number} expiresIn - URL expiration time in seconds (default: 900 = 15 minutes)
 * @returns {Promise<string>} Pre-signed URL for PUT request
 */
const generatePresignedUploadUrl = async (key, contentType, expiresIn = 900) => {
    const command = new PutObjectCommand({
        Bucket: config.aws.s3.bucketName,
        Key: key,
        ContentType: contentType,
    });

    const url = await getSignedUrl(getS3Client(), command, { expiresIn });
    return url;
};

/**
 * Generate the public URL for an uploaded S3 object
 * 
 * @param {string} key - S3 object key (path within bucket)
 * @returns {string} Public URL to access the object
 */
const generatePublicUrl = (key) => {
    return `${config.aws.s3.baseUrl}/${key}`;
};

/**
 * Delete an object from S3
 * 
 * @param {string} key - S3 object key to delete
 * @returns {Promise<void>}
 */
const deleteObject = async (key) => {
    const command = new DeleteObjectCommand({
        Bucket: config.aws.s3.bucketName,
        Key: key,
    });

    await getS3Client().send(command);
};

/**
 * Extract S3 key from a full S3 URL
 * 
 * @param {string} url - Full S3 URL
 * @returns {string|null} S3 key or null if invalid URL
 */
const extractKeyFromUrl = (url) => {
    try {
        const baseUrl = config.aws.s3.baseUrl;
        if (!url.startsWith(baseUrl)) {
            return null;
        }
        return url.replace(`${baseUrl}/`, '');
    } catch (error) {
        return null;
    }
};

module.exports = {
    getS3Client,
    generatePresignedUploadUrl,
    generatePublicUrl,
    deleteObject,
    extractKeyFromUrl,
};
