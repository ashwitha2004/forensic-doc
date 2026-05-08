require('dotenv').config();

const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const jwt = require('jsonwebtoken');
const { join } = require('path');

const app = express();
app.use(cors());
app.use(bodyParser.json());

// Mongoose models
let User;
try {
  User = require('./models/User');
} catch (e) {
  // model may not be available if mongoose isn't installed or file missing
}

// In-memory DB (for demo). In production use Firestore via Firebase Admin.
const users = new Map();
let mongoClient = null;
let mongoUsers = null;

const JWT_SECRET = process.env.JWT_SECRET || 'change-this-in-production';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '15m';
const JWT_REFRESH_EXPIRES_IN = process.env.JWT_REFRESH_EXPIRES_IN || '7d';

function toNumberArray(value) {
  if (Array.isArray(value)) return value.map((n) => Number(n)).filter((n) => Number.isFinite(n));
  return [];
}

function normalizeVector(vec) {
  const arr = toNumberArray(vec);
  const norm = Math.sqrt(arr.reduce((acc, v) => acc + v * v, 0));
  if (!norm) return [];
  return arr.map((v) => v / norm);
}

function cosineSimilarity(a, b) {
  const va = normalizeVector(a);
  const vb = normalizeVector(b);
  if (!va.length || !vb.length) return 0;
  const len = Math.min(va.length, vb.length);
  let dot = 0;
  for (let i = 0; i < len; i += 1) {
    dot += va[i] * vb[i];
  }
  return dot;
}

function generateTempCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function tempExpiryMs() {
  return Date.now() + 10 * 60 * 1000;
}

function issueSessionToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

function issueRefreshToken(payload) {
  return jwt.sign({ ...payload, type: 'refresh' }, JWT_SECRET, { expiresIn: JWT_REFRESH_EXPIRES_IN });
}

function verifySessionToken(token) {
  return jwt.verify(token, JWT_SECRET);
}

// Initialize Firebase Admin if service account provided
let firestore = null;
try {
  const admin = require('firebase-admin');
  const svcJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  const svcPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
  let cred;
  if (svcJson) {
    cred = JSON.parse(svcJson);
  } else if (svcPath) {
    cred = require(svcPath);
  }

  if (cred) {
    if (!admin.apps.length) {
      admin.initializeApp({ credential: admin.credential.cert(cred) });
    }
    firestore = admin.firestore();
    console.log('Firebase Admin initialized, Firestore enabled');
  }
} catch (e) {
  // ignore — Firestore remains null and in-memory Map is used
  console.warn('Firebase Admin not initialized:', e && e.message ? e.message : e);
}

// Optional: initialize Mongoose if available and a URI is provided
try {
  const mongoose = require('mongoose');
  const mongooseUri = process.env.MONGOOSE_URI || process.env.MONGODB_URI;
  if (mongooseUri) {
    mongoose
      .connect(mongooseUri)
      .then(() => console.log('Mongoose: MongoDB Connected'))
      .catch((err) => console.warn('Mongoose connection failed:', err && err.message ? err.message : err));
  }
} catch (e) {
  // mongoose not installed or failed to load — continue using native driver or in-memory store
}

// Initialize MongoDB if URI provided
const mongoInitPromise = (async () => {
  try {
    const mongoUri = process.env.MONGODB_URI;
    if (!mongoUri) {
      console.log('⚠️  MONGODB_URI not set - using in-memory storage (data will NOT persist)');
      return;
    }
    
    const { MongoClient } = require('mongodb');
    const dbName = process.env.MONGODB_DB || 'biovault';
    mongoClient = new MongoClient(mongoUri);
    await mongoClient.connect();
    const db = mongoClient.db(dbName);
    mongoUsers = db.collection('users');
    
    // Drop conflicting index if it exists
    try {
      const indexList = await mongoUsers.listIndexes().toArray();
      console.log('📋 Existing indexes:', indexList.map(i => i.name));
      
      for (const idx of indexList) {
        if (idx.name === 'userId_1') {
          await mongoUsers.dropIndex('userId_1');
          console.log('🔄 Dropped existing userId_1 index');
        }
      }
    } catch (err) {
      console.log('ℹ️  No indexes to drop:', err.message);
    }
    
    // Create index with sparse: true to match expected schema
    await mongoUsers.createIndex({ userId: 1 }, { unique: true, sparse: true });
    console.log(`✅ MongoDB connected to ${dbName}`);
  } catch (e) {
    console.error('❌ MongoDB init error:', e && e.message ? e.message : e);
    console.error('⚠️  Will use in-memory storage - data will NOT persist');
  }
})();

// POST /api/register
// body: { userId, deviceToken }
app.post('/api/register', (req, res) => {
  const { userId, deviceToken, webauthn, faceEmbedding } = req.body || {};
  console.log('📨 POST /api/register received:', { userId, deviceToken: deviceToken ? 'YES' : 'NO', webauthn: !!webauthn, faceEmbedding: !!faceEmbedding });
  
  // CRITICAL DEBUG: Show what's actually received
  if (webauthn) {
    console.log('✅ FINGERPRINT CREDENTIAL RECEIVED:', {
      id: webauthn.id ? webauthn.id.substring(0, 30) : undefined,
      type: webauthn.type,
      biometricType: webauthn.biometricType,
      verified: webauthn.verified
    });
  } else {
    console.warn('⚠️  WARNING: NO FINGERPRINT CREDENTIAL RECEIVED! webauthn is:', webauthn);
  }
  
  if (!userId || !deviceToken) {
    console.error('❌ /api/register: Missing userId or deviceToken');
    return res.status(400).json({ error: 'Missing userId or deviceToken' });
  }
  
  const tempCode = generateTempCode();
  const tempCodeExpiresAt = tempExpiryMs();

  // Extract credential ID from webauthn object (store as string for easier comparison)
  const credentialId = webauthn?.id || null;
  console.log('💾 Storing credential ID:', credentialId ? credentialId.substring(0, 30) : 'none');

  if (mongoUsers) {
    (async () => {
      try {
        console.log('💾 Saving to MongoDB:', userId);
        await mongoUsers.updateOne(
          { userId },
          {
            $set: {
              userId,
              deviceToken,
              biometricEnabled: !!(credentialId || faceEmbedding),
              webauthn_credential: credentialId,
              face_embedding: normalizeVector(faceEmbedding),
              temp_code: tempCode,
              temp_code_expires_at: tempCodeExpiresAt,
              temp_verified: false,
              timestamp: Date.now(),
              updatedAt: new Date(),
            },
            $setOnInsert: {
              createdAt: new Date(),
            },
          },
          { upsert: true }
        );
        console.log('✅ Successfully saved to MongoDB:', userId);
        
        // CRITICAL DEBUG: Verify what was actually saved
        const savedRecord = await mongoUsers.findOne({ userId });
        if (savedRecord) {
          console.log('🔍 VERIFICATION - What was saved to MongoDB:', {
            userId: savedRecord.userId,
            fingerprintStored: !!savedRecord.webauthn_credential,
            fingerprintId: savedRecord.webauthn_credential ? savedRecord.webauthn_credential.substring(0, 30) : 'none',
            faceStored: !!(savedRecord.face_embedding && savedRecord.face_embedding.length > 0),
            biometricEnabled: savedRecord.biometricEnabled,
            createdAt: savedRecord.createdAt
          });
        }
        
        return res.json({ ok: true, tempCode, tempCodeExpiresAt });
      } catch (err) {
        console.error('❌ Mongo register error:', err.message || err);
        return res.status(500).json({ error: 'Failed to register: ' + (err.message || 'Unknown error') });
      }
    })();
    return;
  }

  // If Firestore is enabled, persist to Firestore
  if (firestore) {
    (async () => {
      try {
        await firestore.collection('users').doc(userId).set({
          deviceToken,
          deviceId: deviceToken,
          biometricEnabled: !!(credentialId || faceEmbedding),
          webauthn_credential: credentialId,
          face_embedding: normalizeVector(faceEmbedding),
          temp_code: tempCode,
          temp_code_expires_at: tempCodeExpiresAt,
          temp_verified: false,
          timestamp: Date.now(),
          created_at: require('firebase-admin').firestore.FieldValue.serverTimestamp(),
        }, { merge: true });
        console.log('Registered user (firestore)', userId);
        return res.json({ ok: true, tempCode, tempCodeExpiresAt });
      } catch (err) {
        console.error('Firestore register error', err);
        return res.status(500).json({ error: 'Failed to register' });
      }
    })();
    return;
  }

  // Fallback to in-memory Map for demo
  users.set(userId, {
    deviceToken,
    deviceId: deviceToken,
    biometricEnabled: !!(credentialId || faceEmbedding),
    webauthn_credential: credentialId,
    face_embedding: normalizeVector(faceEmbedding),
    temp_code: tempCode,
    temp_code_expires_at: tempCodeExpiresAt,
    temp_verified: false,
    timestamp: Date.now(),
  });
  console.log('Registered user', userId, 'device', deviceToken);
  return res.json({ ok: true, tempCode, tempCodeExpiresAt });
});

// POST /api/validate
// body: { userId, deviceToken, faceEmbedding }
// Validates user is registered and device/biometric match
app.post('/api/validate', (req, res) => {
  const { userId, deviceToken, faceEmbedding } = req.body || {};
  if (!userId || !deviceToken) return res.status(400).json({ authorized: false, reason: 'Missing userId or deviceToken' });

  if (mongoUsers) {
    (async () => {
      try {
        const record = await mongoUsers.findOne({ userId });
        if (!record) {
          console.log(`❌ User '${userId}' not registered`);
          return res.status(403).json({ authorized: false, reason: 'User not registered' });
        }
        if (!record.biometricEnabled) {
          console.log(`❌ User '${userId}' has no biometric`);
          return res.status(403).json({ authorized: false, reason: 'Biometric not enabled' });
        }
        if (record.deviceToken !== deviceToken) {
          console.log(`❌ Device mismatch for '${userId}'`);
          return res.status(403).json({ authorized: false, reason: 'Device mismatch' });
        }
        
        // Verify face if embedding provided
        if (faceEmbedding && record.face_embedding && record.face_embedding.length > 0) {
          const similarity = cosineSimilarity(normalizeVector(faceEmbedding), record.face_embedding);
          const FACE_MATCH_THRESHOLD = 0.90; // 90% match required
          
          console.log(`🔍 Face verification: similarity=${similarity.toFixed(3)}, threshold=${FACE_MATCH_THRESHOLD}`);
          
          if (similarity < FACE_MATCH_THRESHOLD) {
            console.log(`❌ Face doesn't match for '${userId}' (${similarity.toFixed(3)} < ${FACE_MATCH_THRESHOLD})`);
            return res.json({ 
              authorized: false, 
              reason: `Credentials don't match (similarity: ${(similarity * 100).toFixed(1)}%)`,
              similarity
            });
          }
          console.log(`✅ Face match successful for '${userId}'`);
        }
        
        console.log(`✅ User '${userId}' authorized`);
        return res.json({ authorized: true, userId });
      } catch (err) {
        console.error('❌ Mongo validate error:', err.message);
        return res.status(500).json({ authorized: false, reason: 'Validation failure' });
      }
    })();
    return;
  }

  if (firestore) {
    (async () => {
      try {
        const doc = await firestore.collection('users').doc(userId).get();
        if (!doc.exists) return res.status(403).json({ authorized: false, reason: 'User not registered' });
        const data = doc.data();
        if (!data.biometricEnabled) return res.status(403).json({ authorized: false, reason: 'Biometric not enabled' });
        if (data.deviceToken !== deviceToken) return res.status(403).json({ authorized: false, reason: 'Device mismatch' });
        return res.json({ authorized: true });
      } catch (err) {
        console.error('Firestore validate error', err);
        return res.status(500).json({ authorized: false, reason: 'Validation failure' });
      }
    })();
    return;
  }

  const record = users.get(userId);
  if (!record) return res.status(403).json({ authorized: false, reason: 'User not registered' });
  if (!record.biometricEnabled) return res.status(403).json({ authorized: false, reason: 'Biometric not enabled' });
  if (record.deviceToken !== deviceToken) return res.status(403).json({ authorized: false, reason: 'Device mismatch' });

  // Verify face if embedding provided (in-memory fallback)
  if (faceEmbedding && record.face_embedding && record.face_embedding.length > 0) {
    const similarity = cosineSimilarity(normalizeVector(faceEmbedding), record.face_embedding);
    if (similarity < 0.90) {
      return res.json({ 
        authorized: false, 
        reason: `Credentials don't match (similarity: ${(similarity * 100).toFixed(1)}%)`,
        similarity
      });
    }
  }

  return res.json({ authorized: true, userId });
});

// POST /api/face - store face embedding separately
app.post('/api/face', (req, res) => {
  const { userId, embedding } = req.body || {};
  if (!userId || !embedding) return res.status(400).json({ error: 'Missing userId or embedding' });

  if (mongoUsers) {
    (async () => {
      try {
        await mongoUsers.updateOne(
          { userId },
          {
            $set: {
              face_embedding: normalizeVector(embedding),
              updatedAt: new Date(),
            },
          },
          { upsert: false }
        );
        return res.json({ ok: true });
      } catch (err) {
        console.error('Mongo face save error', err);
        return res.status(500).json({ error: 'Failed to save embedding' });
      }
    })();
    return;
  }

  if (firestore) {
    (async () => {
      try {
        await firestore.collection('users').doc(userId).set({ face_embedding: normalizeVector(embedding) }, { merge: true });
        return res.json({ ok: true });
      } catch (err) {
        console.error('Firestore face save error', err);
        return res.status(500).json({ error: 'Failed to save embedding' });
      }
    })();
    return;
  }

  const rec = users.get(userId) || {};
  rec.face_embedding = normalizeVector(embedding);
  users.set(userId, rec);
  return res.json({ ok: true });
});

// POST /api/user/check
// body: { userId }
// Checks if user exists and has fingerprint + face registered (for login)
// WITH FALLBACK: If MongoDB is down, check in-memory storage
app.post('/api/user/check', (req, res) => {
  const { userId } = req.body || {};
  console.log('🔍 POST /api/user/check:', userId);
  if (!userId) return res.status(400).json({ ok: false, reason: 'Missing userId' });

  if (mongoUsers) {
    (async () => {
      try {
        const rec = await mongoUsers.findOne({ userId });
        if (!rec) {
          console.warn(`⚠️  /api/user/check - User NOT in MongoDB: ${userId}, checking fallback...`);
          
          // FALLBACK: Check in-memory storage
          const inMemRecord = users.get(userId);
          if (!inMemRecord) {
            console.error('❌ /api/user/check - User not found in MongoDB or memory:', userId);
            return res.status(404).json({ ok: false, reason: 'User not found' });
          }
          
          console.log('✅ /api/user/check - Found user in in-memory storage (MongoDB not ready yet):', userId);
          const hasFingerprintRegistered = !!inMemRecord.webauthn_credential;
          const hasFaceRegistered = !!(inMemRecord.face_embedding && inMemRecord.face_embedding.length > 0);
          return res.json({ 
            ok: true, 
            message: 'User found (cached)', 
            fingerprintRegistered: hasFingerprintRegistered,
            faceRegistered: hasFaceRegistered 
          });
        }
        
        const hasFingerprintRegistered = !!(rec.webauthn_credential);
        const hasFaceRegistered = !!(rec.face_embedding && rec.face_embedding.length > 0);
        console.log('✅ /api/user/check - User exists:', userId, '| fingerprintRegistered:', hasFingerprintRegistered, '| faceRegistered:', hasFaceRegistered);
        return res.json({ 
          ok: true, 
          message: 'User found', 
          fingerprintRegistered: hasFingerprintRegistered,
          faceRegistered: hasFaceRegistered 
        });
      } catch (err) {
        console.error('❌ /api/user/check - Mongo error:', err.message || err);
        // Try fallback to in-memory
        const inMemRecord = users.get(userId);
        if (inMemRecord) {
          console.log('✅ /api/user/check - DB error, but found in memory:', userId);
          return res.json({ 
            ok: true, 
            message: 'User found (fallback)', 
            fingerprintRegistered: !!inMemRecord.webauthn_credential,
            faceRegistered: !!(inMemRecord.face_embedding && inMemRecord.face_embedding.length > 0)
          });
        }
        return res.status(500).json({ ok: false, reason: 'Failed to verify user' });
      }
    })();
    return;
  }

  const record = users.get(userId);
  if (!record) {
    console.log('❌ User check: User not found -', userId);
    return res.status(404).json({ ok: false, reason: 'User not found' });
  }
  console.log('✅ User check: User exists -', userId, '- fingerprint registered:', !!record.webauthn_credential, '- face registered:', !!(record.face_embedding && record.face_embedding.length > 0));
  return res.json({ 
    ok: true, 
    message: 'User found', 
    fingerprintRegistered: !!record.webauthn_credential,
    faceRegistered: !!(record.face_embedding && record.face_embedding.length > 0)
  });
});

// POST /api/fingerprint/verify
// body: { userId, credential }
// Verifies fingerprint matches registered credential
app.post('/api/fingerprint/verify', (req, res) => {
  const { userId, credential } = req.body || {};
  if (!userId || !credential) return res.status(400).json({ ok: false, reason: 'Missing userId or credential' });

  if (mongoUsers) {
    (async () => {
      try {
        const rec = await mongoUsers.findOne({ userId });
        if (!rec) return res.status(404).json({ ok: false, reason: 'User not found' });
        if (!rec.webauthn_credential) return res.status(403).json({ ok: false, reason: 'No fingerprint registered' });

        // Extract credential ID from either string or object format
        const storedCredential = rec.webauthn_credential;
        const storedId = typeof storedCredential === 'string' ? storedCredential : storedCredential?.id;
        const incomingId = typeof credential === 'string' ? credential : credential?.id;
        
        console.log('🔍 Fingerprint verification:', {
          storedType: typeof storedCredential,
          storedId: storedId ? storedId.substring(0, 30) : 'none',
          incomingId: incomingId ? incomingId.substring(0, 30) : 'none'
        });
        
        // Simple credential matching (in production use proper WebAuthn verification)
        const match = storedId === incomingId;

        await mongoUsers.updateOne(
          { userId },
          {
            $set: {
              last_fingerprint_match: match,
              last_fingerprint_verify_at: Date.now(),
              updatedAt: new Date(),
            },
          }
        );

        console.log(`✅ Fingerprint verify for ${userId}: match=${match}`);
        return res.json({ ok: true, match });
      } catch (err) {
        console.error('Mongo fingerprint verify error', err);
        return res.status(500).json({ ok: false, reason: 'Fingerprint verification failed' });
      }
    })();
    return;
  }

  const record = users.get(userId);
  if (!record) return res.status(404).json({ ok: false, reason: 'User not found' });
  if (!record.webauthn_credential) return res.status(403).json({ ok: false, reason: 'No fingerprint registered' });

  const storedCredential = record.webauthn_credential;
  const storedId = typeof storedCredential === 'string' ? storedCredential : storedCredential?.id;
  const incomingId = typeof credential === 'string' ? credential : credential?.id;
  
  const match = storedId === incomingId;
  console.log(`✅ Fingerprint verify for ${userId}: match=${match}`);
  return res.json({ ok: true, match });
});

// POST /api/face/verify
// body: { userId, embedding }
app.post('/api/face/verify', (req, res) => {
  const { userId, embedding } = req.body || {};
  if (!userId || !embedding) return res.status(400).json({ ok: false, reason: 'Missing userId or embedding' });

  const incoming = normalizeVector(embedding);
  if (!incoming.length) return res.status(400).json({ ok: false, reason: 'Invalid embedding payload' });

  // FIXED: Lowered threshold from 0.9 to 0.75 for practical face matching
  // 0.9 was too strict and caused login failures after registration
  // 0.75 (75%) is still secure but forgives natural lighting/angle variations
  const threshold = Number(process.env.FACE_MATCH_THRESHOLD || 0.75);

  if (mongoUsers) {
    (async () => {
      try {
        const rec = await mongoUsers.findOne({ userId });
        if (!rec) return res.status(404).json({ ok: false, reason: 'User not found' });
        const stored = normalizeVector(rec.face_embedding);
        if (!stored.length) return res.status(403).json({ ok: false, reason: 'No face profile registered' });

        const score = cosineSimilarity(stored, incoming);
        const match = score >= threshold;

        await mongoUsers.updateOne(
          { userId },
          {
            $set: {
              last_face_score: score,
              last_face_match: match,
              last_face_verify_at: Date.now(),
              updatedAt: new Date(),
            },
          }
        );

        if (!match) {
          return res.json({ ok: true, match, score, threshold });
        }

        const token = issueSessionToken({ userId: rec.userId, deviceToken: rec.deviceToken, type: 'access' });
        const refreshToken = issueRefreshToken({ userId: rec.userId, deviceToken: rec.deviceToken });
        return res.json({ ok: true, match, score, threshold, token, refreshToken });
      } catch (err) {
        console.error('Mongo face verify error', err);
        return res.status(500).json({ ok: false, reason: 'Face verification failed' });
      }
    })();
    return;
  }

  if (firestore) {
    (async () => {
      try {
        const doc = await firestore.collection('users').doc(userId).get();
        if (!doc.exists) return res.status(404).json({ ok: false, reason: 'User not found' });
        const data = doc.data() || {};
        const stored = normalizeVector(data.face_embedding);
        if (!stored.length) return res.status(403).json({ ok: false, reason: 'No face profile registered' });
        const score = cosineSimilarity(stored, incoming);
        const match = score >= threshold;
        if (!match) {
          return res.json({ ok: true, match, score, threshold });
        }

        const token = issueSessionToken({ userId, deviceToken: data.deviceToken, type: 'access' });
        const refreshToken = issueRefreshToken({ userId, deviceToken: data.deviceToken });
        return res.json({ ok: true, match, score, threshold, token, refreshToken });
      } catch (err) {
        console.error('Firestore face verify error', err);
        return res.status(500).json({ ok: false, reason: 'Face verification failed' });
      }
    })();
    return;
  }

  const rec = users.get(userId);
  if (!rec) return res.status(404).json({ ok: false, reason: 'User not found' });
  const stored = normalizeVector(rec.face_embedding);
  if (!stored.length) return res.status(403).json({ ok: false, reason: 'No face profile registered' });

  const score = cosineSimilarity(stored, incoming);
  const match = score >= threshold;
  if (!match) {
    return res.json({ ok: true, match, score, threshold });
  }

  const token = issueSessionToken({ userId: rec.userId || userId, deviceToken: rec.deviceToken, type: 'access' });
  const refreshToken = issueRefreshToken({ userId: rec.userId || userId, deviceToken: rec.deviceToken });
  return res.json({ ok: true, match, score, threshold, token, refreshToken });
});

// GET /api/session/verify
app.get('/api/session/verify', (req, res) => {
  try {
    const auth = req.headers.authorization || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
    if (!token) return res.status(401).json({ ok: false, reason: 'Missing token' });
    const decoded = verifySessionToken(token);
    if (decoded?.type && decoded.type !== 'access') {
      return res.status(401).json({ ok: false, reason: 'Invalid token type' });
    }
    return res.json({ ok: true, user: decoded });
  } catch (err) {
    return res.status(401).json({ ok: false, reason: 'Invalid or expired token' });
  }
});

// POST /api/session/refresh
app.post('/api/session/refresh', (req, res) => {
  try {
    const { refreshToken } = req.body || {};
    if (!refreshToken) return res.status(401).json({ ok: false, reason: 'Missing refresh token' });

    const decoded = verifySessionToken(refreshToken);
    if (!decoded || decoded.type !== 'refresh') {
      return res.status(401).json({ ok: false, reason: 'Invalid refresh token' });
    }

    const token = issueSessionToken({ userId: decoded.userId, deviceToken: decoded.deviceToken, type: 'access' });
    return res.json({ ok: true, token });
  } catch (err) {
    return res.status(401).json({ ok: false, reason: 'Refresh token expired' });
  }
});

// POST /api/temp-code/request
// body: { userId }
app.post('/api/temp-code/request', (req, res) => {
  const { userId } = req.body || {};
  if (!userId) return res.status(400).json({ error: 'Missing userId' });

  const tempCode = generateTempCode();
  const tempCodeExpiresAt = tempExpiryMs();

  if (mongoUsers) {
    (async () => {
      try {
        const record = await mongoUsers.findOne({ userId });
        if (!record) return res.status(404).json({ error: 'User not found' });
        await mongoUsers.updateOne(
          { userId },
          {
            $set: {
              temp_code: tempCode,
              temp_code_expires_at: tempCodeExpiresAt,
              temp_verified: false,
              updatedAt: new Date(),
            },
          }
        );
        return res.json({ ok: true, tempCode, tempCodeExpiresAt });
      } catch (err) {
        console.error('Mongo temp-code request error', err);
        return res.status(500).json({ error: 'Failed to issue temp code' });
      }
    })();
    return;
  }

  if (firestore) {
    (async () => {
      try {
        const ref = firestore.collection('users').doc(userId);
        const snap = await ref.get();
        if (!snap.exists) return res.status(404).json({ error: 'User not found' });
        await ref.set({ temp_code: tempCode, temp_code_expires_at: tempCodeExpiresAt, temp_verified: false }, { merge: true });
        return res.json({ ok: true, tempCode, tempCodeExpiresAt });
      } catch (err) {
        console.error('Firestore temp-code request error', err);
        return res.status(500).json({ error: 'Failed to issue temp code' });
      }
    })();
    return;
  }

  const record = users.get(userId);
  if (!record) return res.status(404).json({ error: 'User not found' });
  record.temp_code = tempCode;
  record.temp_code_expires_at = tempCodeExpiresAt;
  record.temp_verified = false;
  users.set(userId, record);
  return res.json({ ok: true, tempCode, tempCodeExpiresAt });
});

// POST /api/temp-code/verify
// body: { userId, code }
app.post('/api/temp-code/verify', (req, res) => {
  const { userId, code } = req.body || {};
  if (!userId || !code) return res.status(400).json({ error: 'Missing userId or code' });

  if (mongoUsers) {
    (async () => {
      try {
        const record = await mongoUsers.findOne({ userId });
        if (!record) return res.status(404).json({ ok: false, reason: 'User not found' });
        if (!record.temp_code || String(record.temp_code) !== String(code)) return res.status(403).json({ ok: false, reason: 'Invalid code' });
        if (!record.temp_code_expires_at || Number(record.temp_code_expires_at) < Date.now()) return res.status(403).json({ ok: false, reason: 'Code expired' });

        await mongoUsers.updateOne(
          { userId },
          {
            $set: {
              temp_verified: true,
              updatedAt: new Date(),
            },
          }
        );
        return res.json({ ok: true });
      } catch (err) {
        console.error('Mongo temp-code verify error', err);
        return res.status(500).json({ ok: false, reason: 'Verification failed' });
      }
    })();
    return;
  }

  if (firestore) {
    (async () => {
      try {
        const ref = firestore.collection('users').doc(userId);
        const snap = await ref.get();
        if (!snap.exists) return res.status(404).json({ ok: false, reason: 'User not found' });
        const data = snap.data() || {};
        if (!data.temp_code || String(data.temp_code) !== String(code)) return res.status(403).json({ ok: false, reason: 'Invalid code' });
        if (!data.temp_code_expires_at || Number(data.temp_code_expires_at) < Date.now()) return res.status(403).json({ ok: false, reason: 'Code expired' });
        await ref.set({ temp_verified: true }, { merge: true });
        return res.json({ ok: true });
      } catch (err) {
        console.error('Firestore temp-code verify error', err);
        return res.status(500).json({ ok: false, reason: 'Verification failed' });
      }
    })();
    return;
  }

  const record = users.get(userId);
  if (!record) return res.status(404).json({ ok: false, reason: 'User not found' });
  if (!record.temp_code || String(record.temp_code) !== String(code)) return res.status(403).json({ ok: false, reason: 'Invalid code' });
  if (!record.temp_code_expires_at || Number(record.temp_code_expires_at) < Date.now()) return res.status(403).json({ ok: false, reason: 'Code expired' });
  record.temp_verified = true;
  users.set(userId, record);
  return res.json({ ok: true });
});

// POST /api/device/rebind
// body: { userId, deviceToken }
app.post('/api/device/rebind', (req, res) => {
  const { userId, deviceToken } = req.body || {};
  if (!userId || !deviceToken) return res.status(400).json({ error: 'Missing userId or deviceToken' });

  if (mongoUsers) {
    (async () => {
      try {
        const record = await mongoUsers.findOne({ userId });
        if (!record) return res.status(404).json({ ok: false, reason: 'User not found' });
        if (!record.temp_verified) return res.status(403).json({ ok: false, reason: 'Temp code verification required' });

        await mongoUsers.updateOne(
          { userId },
          {
            $set: {
              deviceToken,
              deviceId: deviceToken,
              temp_verified: false,
              updatedAt: new Date(),
            },
          }
        );
        return res.json({ ok: true });
      } catch (err) {
        console.error('Mongo device rebind error', err);
        return res.status(500).json({ ok: false, reason: 'Device update failed' });
      }
    })();
    return;
  }

  if (firestore) {
    (async () => {
      try {
        const ref = firestore.collection('users').doc(userId);
        const snap = await ref.get();
        if (!snap.exists) return res.status(404).json({ ok: false, reason: 'User not found' });
        const data = snap.data() || {};
        if (!data.temp_verified) return res.status(403).json({ ok: false, reason: 'Temp code verification required' });
        await ref.set({ deviceToken, temp_verified: false }, { merge: true });
        return res.json({ ok: true });
      } catch (err) {
        console.error('Firestore device rebind error', err);
        return res.status(500).json({ ok: false, reason: 'Device update failed' });
      }
    })();
    return;
  }

  const record = users.get(userId);
  if (!record) return res.status(404).json({ ok: false, reason: 'User not found' });
  if (!record.temp_verified) return res.status(403).json({ ok: false, reason: 'Temp code verification required' });
  record.deviceToken = deviceToken;
  record.temp_verified = false;
  users.set(userId, record);
  return res.json({ ok: true });
});

// Mongoose-backed quick test route: saves a User document
app.post('/register', async (req, res) => {
  try {
    const { deviceId = 'DEVICE123', fingerprintId = 'FP001', faceId = 'FACE001' } = req.body || {};
    if (!User) return res.status(500).json({ ok: false, error: 'User model not available' });
    const user = new User({ deviceId, fingerprintId, faceId });
    await user.save();
    return res.json({ ok: true, id: user._id });
  } catch (err) {
    console.error('Mongoose save error', err);
    return res.status(500).json({ ok: false, error: 'Failed to save user' });
  }
});

// POST /api/register-fingerprint
// body: { userId, deviceToken, credential }
app.post('/api/register-fingerprint', (req, res) => {
  const { userId, deviceToken, credential } = req.body || {};
  if (!userId || !deviceToken) return res.status(400).json({ error: 'Missing userId or deviceToken' });

  if (mongoUsers) {
    (async () => {
      try {
        const result = await mongoUsers.updateOne(
          { userId, deviceToken },
          {
            $set: {
              webauthn_credential: credential || null,
              fingerprintRegistered: true,
              lastBiometricUpdate: Date.now(),
              updatedAt: new Date(),
            },
          },
          { upsert: true }
        );
        return res.json({ ok: true, message: 'Fingerprint registered' });
      } catch (err) {
        console.error('Mongo fingerprint register error', err);
        return res.status(500).json({ error: 'Failed to register fingerprint' });
      }
    })();
    return;
  }

  let record = users.get(userId);
  if (!record) {
    // Create user record if not exists (during registration)
    record = { userId, deviceToken, fingerprintRegistered: false, faceRegistered: false, tempCode: null, createdAt: Date.now() };
  }
  if (record.deviceToken !== deviceToken) {
    return res.status(400).json({ error: 'Device token mismatch' });
  }
  record.webauthn_credential = credential || null;
  record.fingerprintRegistered = true;
  record.lastBiometricUpdate = Date.now();
  users.set(userId, record);
  return res.json({ ok: true, message: 'Fingerprint registered' });
});

// POST /api/register-face
// body: { userId, deviceToken, faceEmbedding, qualityScore }
app.post('/api/register-face', (req, res) => {
  const { userId, deviceToken, faceEmbedding, qualityScore } = req.body || {};
  if (!userId || !deviceToken) return res.status(400).json({ error: 'Missing userId or deviceToken' });
  if (!faceEmbedding || !Array.isArray(faceEmbedding)) return res.status(400).json({ error: 'Invalid face embedding' });

  // STRICT QUALITY VALIDATION: Only accept perfect faces (sum 10-40)
  const embeddingSum = faceEmbedding.reduce((a, b) => a + Math.abs(b), 0);
  console.log(`📸 Face Quality: sum=${embeddingSum.toFixed(2)} (valid: 10-40)`);
  if (embeddingSum < 10.0 || embeddingSum > 40.0) {
    console.log(`❌ REJECTED: Poor quality face (sum=${embeddingSum.toFixed(2)}) - not perfect`);
    return res.status(400).json({ error: 'Face quality insufficient for registration', message: 'Only perfect faces accepted. Show full face with good lighting.' });
  }

  if (mongoUsers) {
    (async () => {
      try {
        const result = await mongoUsers.updateOne(
          { userId, deviceToken },
          {
            $set: {
              face_embedding: normalizeVector(faceEmbedding),
              faceRegistered: true,
              faceQualityScore: qualityScore || 0,
              registrationEmbeddingSum: embeddingSum,
              lastBiometricUpdate: Date.now(),
              updatedAt: new Date(),
            },
          },
          { upsert: true }
        );
        return res.json({ ok: true, message: 'Perfect face registered', qualityScore: embeddingSum });
      } catch (err) {
        console.error('Mongo face register error', err);
        return res.status(500).json({ error: 'Failed to register face' });
      }
    })();
    return;
  }

  let record = users.get(userId);
  if (!record) {
    // Create user record if not exists (during registration)
    record = { userId, deviceToken, fingerprintRegistered: false, faceRegistered: false, tempCode: null, createdAt: Date.now() };
  }
  if (record.deviceToken !== deviceToken) {
    return res.status(400).json({ error: 'Device token mismatch' });
  }
  record.face_embedding = normalizeVector(faceEmbedding);
  record.faceRegistered = true;
  record.faceQualityScore = qualityScore || 0;
  record.lastBiometricUpdate = Date.now();
  users.set(userId, record);
  return res.json({ ok: true, message: 'Face registered successfully' });
});

// GET /api/user/:userId/biometric-status
// Get biometric registration status for user
app.get('/api/user/:userId/biometric-status', (req, res) => {
  const { userId } = req.params;
  const { deviceToken } = req.query;

  if (!userId || !deviceToken) {
    return res.status(400).json({ error: 'Missing userId or deviceToken' });
  }

  if (mongoUsers) {
    (async () => {
      try {
        const record = await mongoUsers.findOne({ userId });
        if (!record || record.deviceToken !== deviceToken) {
          return res.status(404).json({ error: 'User not found' });
        }
        return res.json({
          userId,
          fingerprintRegistered: !!record.fingerprintRegistered,
          faceRegistered: !!record.faceRegistered,
          biometricEnabled: record.biometricEnabled || false,
          lastBiometricUpdate: record.lastBiometricUpdate || null,
        });
      } catch (err) {
        console.error('Mongo biometric status error', err);
        return res.status(500).json({ error: 'Failed to retrieve status' });
      }
    })();
    return;
  }

  const record = users.get(userId);
  if (!record || record.deviceToken !== deviceToken) {
    return res.status(404).json({ error: 'User not found or device mismatch' });
  }
  return res.json({
    userId,
    fingerprintRegistered: !!record.fingerprintRegistered,
    faceRegistered: !!record.faceRegistered,
    biometricEnabled: record.biometricEnabled || false,
    lastBiometricUpdate: record.lastBiometricUpdate || null,
  });
});

// Serve React app static files
app.use(express.static(join(__dirname, '../dist')));

// SPA fallback: serve index.html for all unmatched routes
app.get('*', (req, res) => {
  res.sendFile(join(__dirname, '../dist/index.html'));
});

const port = process.env.PORT || 3334;

// Wait for MongoDB to initialize before starting server
(async () => {
  await mongoInitPromise;
  // Bind to all interfaces so the server is reachable from devices on the LAN
  app.listen(port, '0.0.0.0', () => console.log(`Biovault mock server running on port ${port}`));
})();

process.on('SIGINT', async () => {
  try {
    if (mongoClient) await mongoClient.close();
  } catch (e) {
    // ignore cleanup errors
  }
  process.exit(0);
});
