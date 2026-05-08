const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
  userId: {
    type: String,
    unique: true,
    sparse: true,
    required: true,
    index: true
  },
  deviceId: String,
  deviceToken: String,
  fingerprintId: String,
  faceId: String,
  
  // Biometric data storage
  webauthn_credential: {
    type: mongoose.Schema.Types.Mixed,
    default: null
  },
  face_embedding: {
    type: [Number],
    default: []
  },
  
  // Registration metadata
  biometricEnabled: {
    type: Boolean,
    default: false
  },
  temp_code: String,
  temp_code_expires_at: Number,
  temp_verified: {
    type: Boolean,
    default: false
  },
  
  // Tokens
  token: String,
  refreshToken: String,
  
  // Timestamps
  timestamp: Number,
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model("User", userSchema);
