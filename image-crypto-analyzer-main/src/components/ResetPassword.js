import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import './Login.css';

function ResetPassword() {
  const [searchParams]  = useSearchParams();
  const navigate        = useNavigate();
  const [newPwd,        setNewPwd]        = useState('');
  const [confirmPwd,    setConfirmPwd]    = useState('');
  const [showNew,       setShowNew]       = useState(false);
  const [showConfirm,   setShowConfirm]   = useState(false);
  const [loading,       setLoading]       = useState(false);
  const [error,         setError]         = useState('');
  const [success,       setSuccess]       = useState('');

  const token = searchParams.get('token');
  const email = searchParams.get('email');

  useEffect(() => {
    if (!token || !email) {
      setError('Invalid reset link. Please request a new one.');
    }
  }, [token, email]);

  const EyeIcon = ({ show, onToggle }) => (
    <button type="button" onClick={onToggle} tabIndex={-1} style={{
      position: 'absolute', right: '12px', top: '50%',
      transform: 'translateY(-50%)', background: 'none',
      border: 'none', cursor: 'pointer', padding: '4px',
      color: '#9ca3af', display: 'flex', alignItems: 'center'
    }}>
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

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (newPwd.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    if (newPwd !== confirmPwd) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);
    try {
      const res  = await fetch('https://pinit-backend.onrender.com/auth/forgot-password/reset', {
        method : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body   : JSON.stringify({
          email       : email,
          token       : token,
          new_password: newPwd
        })
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.detail || 'Reset failed. Please try again.');
        return;
      }
      setSuccess('✅ Password reset successfully! Redirecting to login...');
      setTimeout(() => navigate('/login'), 3000);
    } catch {
      setError('Cannot connect to server. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-container">
      <div className="login-card">
        <div className="login-header">
          <h1>Reset Password</h1>
          <p>Enter your new password below</p>
        </div>

        <div className="login-form">
          {success ? (
            <div style={{ textAlign: 'center', padding: '20px 0' }}>
              <div style={{ fontSize: '48px', marginBottom: '16px' }}>✅</div>
              <p style={{ color: '#333', fontSize: '15px', lineHeight: '1.6' }}>{success}</p>
              <Link to="/login" className="btn-primary" style={{
                display: 'inline-block', marginTop: '16px',
                textDecoration: 'none', textAlign: 'center'
              }}>
                Go to Login
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit}>
              {error && <div className="error-message">{error}</div>}

              {!error.includes('Invalid reset link') && (
                <>
                  <div className="form-group">
                    <label>New Password</label>
                    <div style={{ position: 'relative' }}>
                      <input
                        type={showNew ? 'text' : 'password'}
                        value={newPwd}
                        onChange={e => { setNewPwd(e.target.value); setError(''); }}
                        placeholder="Enter new password"
                        required
                        style={{ paddingRight: '44px' }}
                      />
                      <EyeIcon show={showNew} onToggle={() => setShowNew(v => !v)} />
                    </div>
                  </div>

                  <div className="form-group">
                    <label>Confirm New Password</label>
                    <div style={{ position: 'relative' }}>
                      <input
                        type={showConfirm ? 'text' : 'password'}
                        value={confirmPwd}
                        onChange={e => { setConfirmPwd(e.target.value); setError(''); }}
                        placeholder="Confirm new password"
                        required
                        style={{ paddingRight: '44px' }}
                      />
                      <EyeIcon show={showConfirm} onToggle={() => setShowConfirm(v => !v)} />
                    </div>
                  </div>

                  <button type="submit" className="btn-primary" disabled={loading}>
                    {loading ? 'Resetting...' : 'Reset Password'}
                  </button>
                </>
              )}

              <div className="register-link" style={{ marginTop: '16px' }}>
                <Link to="/login">← Back to Login</Link>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

export default ResetPassword;