import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import './Register.css';

// ─── WebAuthn helpers ────────────────────────────────────────────────────────

const isBiometricSupported = () =>
  !!(window.PublicKeyCredential &&
     typeof window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable === 'function');

const checkBiometricAvailable = async () => {
  if (!isBiometricSupported()) return false;
  try {
    return await window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
};

// Convert ArrayBuffer → base64 (for storage)
const bufToBase64 = (buf) =>
  btoa(String.fromCharCode(...new Uint8Array(buf)));

// ─── Fetch with auto-retry (handles Render cold start) ──────────────────────
const fetchWithRetry = async (url, options, retries = 3, delayMs = 4000) => {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, options);
      return res;
    } catch (err) {
      if (attempt === retries) throw err;
      await new Promise(r => setTimeout(r, delayMs));
    }
  }
};

// ─── Eye icon toggle helper ──────────────────────────────────────────────────
const EyeIcon = ({ show, onToggle }) => (
  <button
    type="button"
    onClick={onToggle}
    style={{
      position: 'absolute', right: '12px', top: '50%',
      transform: 'translateY(-50%)', background: 'none',
      border: 'none', cursor: 'pointer', padding: '4px',
      color: '#9ca3af', display: 'flex', alignItems: 'center'
    }}
    tabIndex={-1}
  >
    {show ? (
      <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
        <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94"/>
        <path d="M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19"/>
        <line x1="1" y1="1" x2="23" y2="23"/>
      </svg>
    ) : (
      <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
        <circle cx="12" cy="12" r="3"/>
      </svg>
    )}
  </button>
);

// ─── Component ───────────────────────────────────────────────────────────────

function Register() {
  const [step,     setStep]     = useState(1);   // 1=form  2=OTP  3=biometric  4=done
  const [formData, setFormData] = useState({ name: '', email: '', password: '', confirmPassword: '' });
  const [showRegPwd,     setShowRegPwd]     = useState(false);
  const [showRegConfirm, setShowRegConfirm] = useState(false);
  const [otp,      setOtp]      = useState('');
  const [error,    setError]    = useState('');
  const [loading,  setLoading]  = useState(false);
  const [biometricSupported, setBiometricSupported] = useState(true);
  const navigate = useNavigate();

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
    setError('');
  };

  const validateForm = () => {
    if (!formData.name.trim())        { setError('Name is required'); return false; }
    if (!formData.email.trim())       { setError('Email is required'); return false; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) { setError('Invalid email'); return false; }
    if (formData.password.length < 6) { setError('Password must be at least 6 characters'); return false; }
    if (formData.password !== formData.confirmPassword) { setError('Passwords do not match'); return false; }
    return true;
  };

  // ── Step 1 — Register ──────────────────────────────────────────────────────
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validateForm()) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetchWithRetry('https://pinit-backend.onrender.com/auth/register', {
        method : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body   : JSON.stringify({
          username: formData.name,
          email   : formData.email,
          password: formData.password
        })
      });
      const data = await res.json();
      if (!res.ok) { setError(data.detail || 'Registration failed'); return; }

      // Check if biometric is supported before going to OTP
      const available = await checkBiometricAvailable();
      setBiometricSupported(available);
      setStep(2);
    } catch {
      setError('Cannot connect to server. Please wait 30 seconds and try again (server may be waking up).');
    } finally {
      setLoading(false);
    }
  };

  // ── Step 2 — Verify OTP ────────────────────────────────────────────────────
  const handleOTPSubmit = async (e) => {
    e.preventDefault();
    if (otp.length !== 6) { setError('Please enter the 6-digit OTP'); return; }
    setLoading(true);
    setError('');
    try {
      const res = await fetchWithRetry('https://pinit-backend.onrender.com/auth/verify-otp', {
        method : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body   : JSON.stringify({ email: formData.email, code: otp })
      });
      const data = await res.json();
      if (!res.ok) { setError(data.detail || 'Invalid OTP'); return; }

      // OTP passed — go to biometric enrollment if supported
      if (biometricSupported) {
        setStep(3);
      } else {
        setStep(4); // skip biometric — go straight to done
      }
    } catch {
      setError('Cannot connect to server.');
    } finally {
      setLoading(false);
    }
  };

  const handleResendOTP = async () => {
    setError('');
    try {
      const res = await fetchWithRetry('https://pinit-backend.onrender.com/auth/resend-otp', {
        method : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body   : JSON.stringify({ email: formData.email })
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.detail || 'Could not resend OTP. Please try again.');
      } else {
        alert('✅ New OTP sent to ' + formData.email);
      }
    } catch {
      setError('Cannot connect to server. Please try again.');
    }
  };

  // ── Step 3 — Biometric Enrollment ─────────────────────────────────────────
  const handleBiometricEnroll = async () => {
    setLoading(true);
    setError('');
    try {
      // Create a new credential on this device using WebAuthn
      const credential = await navigator.credentials.create({
        publicKey: {
          // Challenge — random bytes (server should provide this in production)
          challenge: crypto.getRandomValues(new Uint8Array(32)),

          // Relying party — your app
          rp: {
            name: 'Image Forensics App',
            id  : window.location.hostname
          },

          // User info — tied to their email
          user: {
            id         : new TextEncoder().encode(formData.email), // unique per user
            name       : formData.email,
            displayName: formData.name
          },

          // Algorithms to support (ES256 is standard)
          pubKeyCredParams: [
            { alg: -7,   type: 'public-key' }, // ES256
            { alg: -257, type: 'public-key' }  // RS256 fallback
          ],

          // Must use built-in platform authenticator (fingerprint / Face ID)
          authenticatorSelection: {
            authenticatorAttachment: 'platform',  // device built-in only
            userVerification       : 'required',  // must verify biometric
            requireResidentKey     : false
          },

          timeout: 60000
        }
      });

      if (credential) {
        // Save credential ID to localStorage so login can use it
        const credId = bufToBase64(credential.rawId);
        localStorage.setItem('biometricCredentialId', credId);
        localStorage.setItem('biometricEmail',        formData.email);
        localStorage.setItem('biometricEnrolled',     'true');

        console.log('✅ Biometric enrolled for:', formData.email);
        setStep(4); // done
      }
    } catch (e) {
      if (e.name === 'NotAllowedError') {
        setError('Biometric was cancelled. You can still login with password.');
      } else if (e.name === 'NotSupportedError') {
        setError('Biometric not supported on this device.');
      } else {
        setError('Biometric setup failed: ' + e.message);
      }
    } finally {
      setLoading(false);
    }
  };

  const skipBiometric = () => {
    setStep(4);
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="register-container">
      <div className="register-card">

        {/* ── Step 1: Registration Form ───────────────────────────────── */}
        {step === 1 && (
          <>
            <div className="register-header">
              <h1>Create Account</h1>
              <p>Join Image Forensics App</p>
            </div>
            <form onSubmit={handleSubmit} className="register-form">
              {error && <div className="error-message">{error}</div>}
              <div className="form-group">
                <label>Full Name</label>
                <input type="text" name="name" value={formData.name}
                  onChange={handleChange} placeholder="Enter your full name" required />
              </div>
              <div className="form-group">
                <label>Email Address</label>
                <input type="email" name="email" value={formData.email}
                  onChange={handleChange} placeholder="Enter your email" required />
              </div>
              <div className="form-group">
                <label>Password</label>
                <div style={{ position: 'relative' }}>
                  <input
                    type={showRegPwd ? 'text' : 'password'}
                    name="password" value={formData.password}
                    onChange={handleChange} placeholder="Min 6 characters"
                    required style={{ paddingRight: '44px' }}
                  />
                  <EyeIcon show={showRegPwd} onToggle={() => setShowRegPwd(v => !v)} />
                </div>
              </div>
              <div className="form-group">
                <label>Confirm Password</label>
                <div style={{ position: 'relative' }}>
                  <input
                    type={showRegConfirm ? 'text' : 'password'}
                    name="confirmPassword" value={formData.confirmPassword}
                    onChange={handleChange} placeholder="Re-enter your password"
                    required style={{ paddingRight: '44px' }}
                  />
                  <EyeIcon show={showRegConfirm} onToggle={() => setShowRegConfirm(v => !v)} />
                </div>
              </div>
              <button type="submit" className="btn-primary" disabled={loading}>
                {loading ? 'Creating Account...' : 'Register'}
              </button>
              <div className="login-link">
                Already have an account? <Link to="/login">Login here</Link>
              </div>
            </form>
          </>
        )}

        {/* ── Step 2: OTP Verification ────────────────────────────────── */}
        {step === 2 && (
          <>
            <div className="register-header">
              <h1>Verify Email</h1>
              <p>Enter the 6-digit code sent to <strong>{formData.email}</strong></p>
            </div>
            <form onSubmit={handleOTPSubmit} className="register-form">
              {error && <div className="error-message">{error}</div>}
              <div className="form-group">
                <label>OTP Code</label>
                <input
                  type="text"
                  value={otp}
                  onChange={(e) => { setOtp(e.target.value.replace(/\D/g,'').slice(0,6)); setError(''); }}
                  placeholder="Enter 6-digit code"
                  maxLength={6}
                  style={{ fontSize: '24px', letterSpacing: '8px', textAlign: 'center' }}
                  required
                />
              </div>
              <button type="submit" className="btn-primary" disabled={loading}>
                {loading ? 'Verifying...' : 'Verify Email'}
              </button>
              <div className="login-link">
                Didn't receive it?{' '}
                <span onClick={handleResendOTP} style={{ color: '#667eea', cursor: 'pointer', fontWeight: 600 }}>
                  Resend OTP
                </span>
              </div>
              <div className="login-link" style={{ marginTop: 8 }}>
                <span onClick={() => setStep(1)} style={{ color: '#999', cursor: 'pointer' }}>← Back</span>
              </div>
            </form>
          </>
        )}

        {/* ── Step 3: Biometric Enrollment ────────────────────────────── */}
        {step === 3 && (
          <>
            <div className="register-header">
              <h1>Setup Fingerprint</h1>
              <p>Register your fingerprint for faster and secure login</p>
            </div>
            <div className="register-form">
              {error && <div className="error-message">{error}</div>}

              {/* Big fingerprint icon */}
              <div style={{
                textAlign    : 'center',
                padding      : '32px 0',
                fontSize     : '72px',
                lineHeight   : 1
              }}>
                👆
              </div>

              <p style={{
                textAlign   : 'center',
                color       : '#555',
                marginBottom: '8px',
                fontSize    : '14px'
              }}>
                Your device will ask you to scan your fingerprint or use Face ID.
                This links your identity to every image you encrypt.
              </p>

              <p style={{
                textAlign   : 'center',
                color       : '#888',
                marginBottom: '24px',
                fontSize    : '12px'
              }}>
                Your biometric data never leaves your device.
              </p>

              {/* What this does */}
              <div style={{
                background   : '#f0f4ff',
                border       : '1px solid #c7d2fe',
                borderRadius : '8px',
                padding      : '12px 16px',
                marginBottom : '20px',
                fontSize     : '13px',
                color        : '#3730a3'
              }}>
                <strong>🔐 What this does:</strong>
                <ul style={{ margin: '8px 0 0 0', paddingLeft: '18px', lineHeight: '1.8' }}>
                  <li>Links your fingerprint to your account UUID</li>
                  <li>Next time — tap fingerprint to login instantly</li>
                  <li>Your UUID auto-embeds into every image you encrypt</li>
                </ul>
              </div>

              <button
                onClick={handleBiometricEnroll}
                disabled={loading}
                style={{
                  width         : '100%',
                  padding       : '14px',
                  background    : loading
                    ? '#a5b4fc'
                    : 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                  color         : 'white',
                  border        : 'none',
                  borderRadius  : '8px',
                  fontSize      : '16px',
                  fontWeight    : '600',
                  cursor        : loading ? 'not-allowed' : 'pointer',
                  marginBottom  : '12px',
                  display       : 'flex',
                  alignItems    : 'center',
                  justifyContent: 'center',
                  gap           : '8px'
                }}
              >
                {loading ? 'Setting up...' : '👆 Setup Fingerprint / Face ID'}
              </button>

              <button
                onClick={skipBiometric}
                style={{
                  width        : '100%',
                  padding      : '12px',
                  background   : 'transparent',
                  color        : '#888',
                  border       : '1px solid #ddd',
                  borderRadius : '8px',
                  fontSize     : '14px',
                  cursor       : 'pointer'
                }}
              >
                Skip for now — use password only
              </button>
            </div>
          </>
        )}

        {/* ── Step 4: All Done ────────────────────────────────────────── */}
        {step === 4 && (
          <>
            <div className="register-header">
              <h1>All Done! ✅</h1>
              <p>Your account has been verified successfully.</p>
            </div>
            <div className="register-form" style={{ textAlign: 'center' }}>

              {localStorage.getItem('biometricEnrolled') === 'true' ? (
                <div style={{
                  background  : '#f0fdf4',
                  border      : '1px solid #86efac',
                  borderRadius: '8px',
                  padding     : '16px',
                  marginBottom: '24px',
                  color       : '#166534',
                  fontSize    : '14px'
                }}>
                  <div style={{ fontSize: '32px', marginBottom: '8px' }}>👆✅</div>
                  <strong>Fingerprint registered!</strong>
                  <p style={{ margin: '4px 0 0 0', fontSize: '13px' }}>
                    You can now login with just your fingerprint.
                    Your UUID will auto-embed into every image you encrypt.
                  </p>
                </div>
              ) : (
                <p style={{ marginBottom: '24px', color: '#555' }}>
                  You can now log in with your email and password.
                </p>
              )}

              <button className="btn-primary" onClick={() => navigate('/login')}>
                Go to Login
              </button>
            </div>
          </>
        )}

      </div>
    </div>
  );
}

export default Register;