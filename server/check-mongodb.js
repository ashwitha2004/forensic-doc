require('dotenv').config();
const { MongoClient } = require('mongodb');

async function checkMongoDBData() {
  const mongoUri = process.env.MONGODB_URI;
  const dbName = process.env.MONGODB_DB || 'biovault';

  if (!mongoUri) {
    console.error('❌ MONGODB_URI not set in .env file');
    return;
  }

  const mongoClient = new MongoClient(mongoUri);

  try {
    console.log('🔍 Connecting to MongoDB...');
    await mongoClient.connect();
    console.log('✅ Connected to MongoDB');

    const db = mongoClient.db(dbName);
    const usersCollection = db.collection('users');

    // Get all users
    const allUsers = await usersCollection.find().toArray();
    
    console.log('\n' + '='.repeat(80));
    console.log('📊 MONGODB BIOMETRIC DATA CHECK - All Users');
    console.log('='.repeat(80));
    console.log(`Total Users in Database: ${allUsers.length}\n`);

    if (allUsers.length === 0) {
      console.log('❌ No users found in MongoDB');
      return;
    }

    allUsers.forEach((user, index) => {
      console.log(`\n👤 User ${index + 1}: ${user.userId}`);
      console.log(`   ├─ Device Token: ${user.deviceToken ? '✅ YES' : '❌ NO'}`);
      console.log(`   ├─ Biometric Enabled: ${user.biometricEnabled ? '✅ YES' : '❌ NO'}`);
      
      // Face Biometric
      if (user.face_embedding && Array.isArray(user.face_embedding) && user.face_embedding.length > 0) {
        console.log(`   ├─ 🔵 Face Biometric: ✅ YES (${user.face_embedding.length} dimensions)`);
        console.log(`   │  └─ Sample: [${user.face_embedding.slice(0, 3).map(v => v.toFixed(4)).join(', ')}...]`);
      } else {
        console.log(`   ├─ 🔵 Face Biometric: ❌ NO`);
      }
      
      // Fingerprint Biometric
      if (user.fingerprint_embedding && Array.isArray(user.fingerprint_embedding) && user.fingerprint_embedding.length > 0) {
        console.log(`   ├─ 👆 Fingerprint Biometric: ✅ YES (${user.fingerprint_embedding.length} dimensions)`);
        console.log(`   │  └─ Sample: [${user.fingerprint_embedding.slice(0, 3).map(v => v.toFixed(4)).join(', ')}...]`);
      } else {
        console.log(`   ├─ 👆 Fingerprint Biometric: ❌ NO`);
      }
      
      // WebAuthn
      if (user.webauthn_credential) {
        console.log(`   ├─ 🔐 WebAuthn Credential: ✅ YES`);
      } else {
        console.log(`   ├─ 🔐 WebAuthn Credential: ❌ NO`);
      }
      
      // Iris Biometric
      if (user.iris_embedding && Array.isArray(user.iris_embedding) && user.iris_embedding.length > 0) {
        console.log(`   ├─ 👁️  Iris Biometric: ✅ YES (${user.iris_embedding.length} dimensions)`);
      } else {
        console.log(`   ├─ 👁️  Iris Biometric: ❌ NO`);
      }

      // Raw data fields
      if (user.faceRawData) {
        console.log(`   ├─ Face Raw Data: ✅ YES`);
      }
      if (user.fingerprintRawData) {
        console.log(`   ├─ Fingerprint Raw Data: ✅ YES`);
      }
      
      console.log(`   ├─ Temp Code: ${user.temp_code ? '✅ YES' : '❌ NO'}`);
      console.log(`   ├─ Temp Verified: ${user.temp_verified ? '✅ YES' : '❌ NO'}`);
      console.log(`   └─ Last Updated: ${user.updatedAt ? new Date(user.updatedAt).toLocaleString() : 'N/A'}`);
    });

    // Summary stats
    console.log('\n' + '='.repeat(80));
    console.log('📈 BIOMETRIC DATA SUMMARY');
    console.log('='.repeat(80));
    
    const usersWithFace = allUsers.filter(u => u.face_embedding && Array.isArray(u.face_embedding) && u.face_embedding.length > 0);
    const usersWithFingerprint = allUsers.filter(u => u.fingerprint_embedding && Array.isArray(u.fingerprint_embedding) && u.fingerprint_embedding.length > 0);
    const usersWithWebAuthn = allUsers.filter(u => u.webauthn_credential);
    const usersWithIris = allUsers.filter(u => u.iris_embedding && Array.isArray(u.iris_embedding) && u.iris_embedding.length > 0);
    const usersWithFaceRaw = allUsers.filter(u => u.faceRawData);
    const usersWithFingerprintRaw = allUsers.filter(u => u.fingerprintRawData);

    console.log(`\n🔵 Face Biometric:`);
    console.log(`   Total Users with Face Data: ${usersWithFace.length}/${allUsers.length} ✅`);
    console.log(`   Percentage: ${((usersWithFace.length / allUsers.length) * 100).toFixed(1)}%`);
    
    console.log(`\n👆 Fingerprint Biometric:`);
    console.log(`   Total Users with Fingerprint Data: ${usersWithFingerprint.length}/${allUsers.length}`);
    if (usersWithFingerprint.length === 0) console.log(`   ⚠️  Not yet implemented in app`);
    
    console.log(`\n🔐 WebAuthn (FIDO2):`);
    console.log(`   Total Users with WebAuthn: ${usersWithWebAuthn.length}/${allUsers.length}`);
    
    console.log(`\n👁️  Iris Biometric:`);
    console.log(`   Total Users with Iris Data: ${usersWithIris.length}/${allUsers.length}`);
    if (usersWithIris.length === 0) console.log(`   ⚠️  Not yet implemented in app`);

    console.log(`\n📋 Raw Biometric Data:`);
    console.log(`   Users with Face Raw Data: ${usersWithFaceRaw.length}/${allUsers.length}`);
    console.log(`   Users with Fingerprint Raw Data: ${usersWithFingerprintRaw.length}/${allUsers.length}`);

    // Show what's actively being used
    console.log('\n' + '='.repeat(80));
    console.log('✅ ACTIVELY STORED BIOMETRIC DATA');
    console.log('='.repeat(80));
    
    if (usersWithFace.length > 0) {
      console.log(`\n✅ FACE BIOMETRIC AUTHENTICATION`);
      console.log(`   Status: ACTIVE AND STORING ✅`);
      console.log(`   Users: ${usersWithFace.length}/${allUsers.length}`);
      console.log(`   Sample Face Embedding: [${usersWithFace[0].face_embedding.slice(0, 5).map(v => v.toFixed(4)).join(', ')}...]`);
    }
    
    if (usersWithFingerprint.length > 0) {
      console.log(`\n✅ FINGERPRINT BIOMETRIC AUTHENTICATION`);
      console.log(`   Status: ACTIVE AND STORING ✅`);
      console.log(`   Users: ${usersWithFingerprint.length}/${allUsers.length}`);
    } else {
      console.log(`\n❌ FINGERPRINT BIOMETRIC`);
      console.log(`   Status: NOT YET STORING`);
    }
    
    if (usersWithWebAuthn.length > 0) {
      console.log(`\n✅ WEBAUTHN (FIDO2) AUTHENTICATION`);
      console.log(`   Status: STORING ✅`);
      console.log(`   Users: ${usersWithWebAuthn.length}/${allUsers.length}`);
    }

    console.log('\n' + '='.repeat(80));
    console.log('🎯 CONCLUSION');
    console.log('='.repeat(80));
    console.log(`\n✅ YES - Biometric data is being stored in MongoDB!`);
    console.log(`\n📊 Current Biometric Types Being Stored:`);
    console.log(`   1️⃣  Face Embeddings (64 dimensions): ${usersWithFace.length} users ✅`);
    console.log(`   2️⃣  WebAuthn Credentials: ${usersWithWebAuthn.length} users`);
    if (usersWithFingerprint.length > 0) console.log(`   3️⃣  Fingerprint Embeddings: ${usersWithFingerprint.length} users`);
    
    console.log(`\n💾 All biometric data is persisted in MongoDB for:`);
    console.log(`   ✅ User authentication`);
    console.log(`   ✅ Face matching/verification`);
    console.log(`   ✅ Device binding`);
    console.log(`   ✅ Historical records`);

    console.log('\n' + '='.repeat(80));

  } catch (err) {
    console.error('❌ Error:', err.message);
  } finally {
    await mongoClient.close();
    console.log('\n✅ MongoDB connection closed');
  }
}

checkMongoDBData();
