#!/usr/bin/env node

/**
 * Create Admin User Script
 * 
 * Usage: node scripts/createAdmin.js
 */

const mongoose = require('mongoose');
const readline = require('readline');
const path = require('path');

// Load environment variables
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const Admin = require('../src/models/Admin');

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

const question = (query) => new Promise(resolve => rl.question(query, resolve));

async function createAdmin() {
    try {
        console.log('\n🔧 Auto Hub - Create Admin User\n');
        console.log('━'.repeat(50));

        // Connect to MongoDB
        console.log('\n📡 Connecting to MongoDB...');
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('✅ Connected to MongoDB\n');
        
        // Collect admin details
        console.log('Enter admin details:\n');

        const email = await question('Email: ');
        const password = await question('Password (min 8 chars): ');
        const name = await question('Name: ');

        console.log('\nSelect role:');
        console.log('  1. admin (regular admin)');
        console.log('  2. super_admin (can create other admins)');
        const roleChoice = await question('Choice (1 or 2): ');
        const role = roleChoice === '2' ? 'super_admin' : 'admin';

        console.log('\nSelect permissions (press Enter for default):');
        console.log('Available: products, orders, sellers, users, payouts, settings');
        console.log('Default: products, orders, sellers');
        const permInput = await question('Permissions (comma-separated): ');

        const permissions = permInput.trim()
            ? permInput.split(',').map(p => p.trim())
            : ['products', 'orders', 'sellers'];

        // Validate
        if (!email || !password || !name) {
            throw new Error('Email, password, and name are required');
        }

        if (password.length < 8) {
            throw new Error('Password must be at least 8 characters');
        }

        // Check if admin already exists
        const existing = await Admin.findOne({ email: email.toLowerCase() });
        if (existing) {
            throw new Error(`Admin with email ${email} already exists`);
        }

        // Create admin
        console.log('\n⏳ Creating admin...');
        const admin = await Admin.create({
            email,
            password,
            name,
            role,
            permissions,
            isActive: true,
        });

        console.log('\n✅ Admin created successfully!\n');
        console.log('━'.repeat(50));
        console.log('\nAdmin Details:');
        console.log(`  ID:          ${admin._id}`);
        console.log(`  Email:       ${admin.email}`);
        console.log(`  Name:        ${admin.name}`);
        console.log(`  Role:        ${admin.role}`);
        console.log(`  Permissions: ${admin.permissions.join(', ')}`);
        console.log('\n━'.repeat(50));
        console.log('\n🎉 You can now login at: POST /api/v1/admin/auth/login\n');

    } catch (error) {
        console.error('\n❌ Error:', error.message);
    } finally {
        rl.close();
        await mongoose.connection.close();
        process.exit(0);
    }
}

createAdmin();
