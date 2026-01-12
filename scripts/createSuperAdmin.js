#!/usr/bin/env node

/**
 * Quick Create Super Admin
 * 
 * Usage: node scripts/createSuperAdmin.js
 * 
 * Creates a default super admin account
 */

const mongoose = require('mongoose');
const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '../.env') });

const Admin = require('../src/models/Admin');

async function createSuperAdmin() {
    try {
        console.log('\n🔧 Creating Super Admin...\n');

        // Connect to MongoDB
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('✅ Connected to MongoDB');

        // Default super admin credentials
        const adminData = {
            email: 'admin@autohub.com',
            password: 'SuperAdmin123!', // Change this!
            name: 'Super Administrator',
            role: 'super_admin',
            permissions: ['products', 'orders', 'sellers', 'users', 'payouts', 'settings'],
            isActive: true,
        };

        // Check if exists
        const existing = await Admin.findOne({ email: adminData.email });
        if (existing) {
            console.log('\n⚠️  Admin already exists with email:', adminData.email);
            console.log('\nExisting Admin:');
            console.log(`  ID:          ${existing._id}`);
            console.log(`  Email:       ${existing.email}`);
            console.log(`  Name:        ${existing.name}`);
            console.log(`  Role:        ${existing.role}`);
            console.log(`  Permissions: ${existing.permissions.join(', ')}`);
            return;
        }

        // Create admin
        const admin = await Admin.create(adminData);

        console.log('\n✅ Super Admin created successfully!\n');
        console.log('━'.repeat(50));
        console.log('\n📋 Login Credentials:');
        console.log(`  Email:    ${adminData.email}`);
        console.log(`  Password: ${adminData.password}`);
        console.log('\n━'.repeat(50));
        console.log('\n⚠️  IMPORTANT: Change the password after first login!');
        console.log('\n🎉 You can now login at: POST /api/v1/admin/auth/login\n');

    } catch (error) {
        console.error('\n❌ Error:', error.message);
    } finally {
        await mongoose.connection.close();
        process.exit(0);
    }
}

createSuperAdmin();
