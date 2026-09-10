
const mongoose = require('mongoose');
// const rolesModel = require('../models/roles.model');
const { app_configuration } = require('../../config/app.config');
const { configureDns } = require('../../connections/mongo.connection');
const rolesModel = require('../../models/roles.model');

async function addMissingPermissions() {
    try {
        const uri = app_configuration.MONGO_DETAILS;
        if (!uri) throw new Error('MONGO_URI not set');
        configureDns();
        await mongoose.connect(uri);

        console.log('Connected to MongoDB');

        // Super Admin role ID from seedAdmin.js
        const superAdminRoleId = '69818ef29d3a294e83034f74';

        // Find the Super Admin role
        const superAdminRole = await rolesModel.findById(superAdminRoleId);

        if (!superAdminRole) {
            console.error('Super Admin role not found with ID:', superAdminRoleId);
            process.exit(1);
        }

        console.log('Found Super Admin role:', superAdminRole.roleName);
        console.log('Current permissions count:', superAdminRole.contents.length);

        // Define missing permissions to add
        const missingPermissions = [
            // Add any missing permissions here
            // 'module:action',
            // 'another:create',
        ];

        // Check which permissions are actually missing
        const actualMissingPermissions = missingPermissions.filter(
            perm => !superAdminRole.contents.includes(perm)
        );

        if (actualMissingPermissions.length === 0) {
            console.log('All permissions already exist in Super Admin role');
            process.exit(0);
        }

        console.log('Adding missing permissions:', actualMissingPermissions);

        // Add missing permissions
        superAdminRole.contents = [...superAdminRole.contents, ...actualMissingPermissions];

        await superAdminRole.save();

        console.log('✓ Successfully added permissions to Super Admin role');
        console.log('New permissions count:', superAdminRole.contents.length);

        process.exit(0);
    } catch (error) {
        console.error('Error adding permissions:', error);
        process.exit(1);
    }
}

addMissingPermissions();