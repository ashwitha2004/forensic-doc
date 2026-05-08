#!/usr/bin/env node
/**
 * Verify MongoDB stores fingerprint and face data
 * Run: node verify-mongodb-data.js
 */

const mongoose = require('mongoose');
require('dotenv').config();

const mongoUri = process.env.MONGO_URI || 'mongodb+srv://your_user:your_pass@cluster.mongodb.net/biovault?retryWrites=true&w=majority';

async function verifyMongoDBData() {
  try {
    console.log('🔍 Connecting to MongoDB...');
    await mongoose.connect(mongoUri, { 
      serverSelectionTimeoutMS: 5000,
      connectTimeoutMS: 10000,
    });
    console.log('✅ Connected to MongoDB');

    const db = mongoose.connection.db;
    const usersCollection = db.collection('users');

    // Count total users
    const totalUsers = await usersCollection.countDocuments();
    console.log(`\n📊 Total users in MongoDB: ${totalUsers}`);

    if (totalUsers === 0) {
      console.log('⚠️  No users found in MongoDB yet');
    } else {
      // Get all users and check fingerprint/face data
      const users = await usersCollection.find({}).limit(10).toArray();
      
      console.log('\n📋 Last 10 users:');
      console.log('─'.repeat(100));
      
      users.forEach((user, idx) => {
        console.log(`\n${idx + 1}. User ID: ${user.userId || 'N/A'}`);
        console.log(`   Device Token: ${user.deviceToken ? '✅ YES' : '❌ NO'}`);
        console.log(`   Fingerprint (webauthn_credential): ${user.webauthn_credential ? '✅ YES' : '❌ NO'}`);
        if (user.webauthn_credential) {
          console.log(`      └─ Type: ${user.webauthn_credential.type || 'N/A'}`);
          console.log(`      └─ ID: ${user.webauthn_credential.id ? user.webauthn_credential.id.substring(0, 30) + '...' : 'N/A'}`);
        }
        console.log(`   Face Data (face_embedding): ${user.face_embedding && user.face_embedding.length > 0 ? '✅ YES' : '❌ NO'}`);
        if (user.face_embedding && user.face_embedding.length > 0) {
          console.log(`      └─ Size: ${user.face_embedding.length} dimensions`);
        }
        console.log(`   Biometric Enabled: ${user.biometricEnabled ? '✅ YES' : '❌ NO'}`);
        console.log(`   Created: ${user.createdAt ? new Date(user.createdAt).toLocaleString() : 'N/A'}`);
      });
    }

    console.log('\n✅ MongoDB verification complete\n');
    
  } catch (err) {
    console.error('❌ Error:', err.message);
    console.log('\n⚠️  Make sure MONGO_URI is set in .env file');
  } finally {
    await mongoose.disconnect();
  }
}

verifyMongoDBData();
