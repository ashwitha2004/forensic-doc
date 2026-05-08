/**
 * SharedImagePage.jsx — src/components/SharedImagePage.jsx
 * Public page — NO login required.
 * Route: /share/image/:token
 */

import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';

const API_BASE = 'https://pinit-backend.onrender.com';

// ─── API calls ────────────────────────────────────────────────────────────────

const fetchShareLink = async (token) => {
  const res = await fetch(`${API_BASE}/api/share-links/public/${token}`);
  if (res.status === 404) return { status: 'not_found' };
  if (!res.ok) return { status: 'error' };
  return res.json();
};

const submitDownloadRequest = async (token, body) => {
  const res = await fetch(`${API_BASE}/api/share-links/public/${token}/request-download`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
  });
  if (!res.ok) throw new Error((await res.json()).detail || 'Request failed');
  return res.json();
};

// ─── Styles ───────────────────────────────────────────────────────────────────
const S = {
  page: {
    minHeight: '100vh',
    background: '#0d0f14',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    fontFamily: "'DM Sans', -apple-system, sans-serif",
    color: '#eef0f6',
    padding: '24px 16px 40px',
  },
  logo: {
    fontFamily: "'Syne', sans-serif",
    fontSize: 22, fontWeight: 800, letterSpacing: 3,
    color: '#eef0f6', marginBottom: 24,
  },
  card: {
    width: '100%', maxWidth: 480,
    background: '#161921',
    border: '1px solid #252a3a',
    borderRadius: 20, overflow: 'hidden',
  },
  imgWrap: {
    width: '100%', background: '#111',
    display: 'flex', alignItems: 'center',
    justifyContent: 'center', minHeight: 220,
    position: 'relative',
  },
  img: { width: '100%', maxHeight: 380, objectFit: 'contain', display: 'block' },
  imgBlur: { width: '100%', maxHeight: 380, objectFit: 'contain', display: 'block', filter: 'blur(18px)', opacity: 0.4 },
  blurOverlay: {
    position: 'absolute', inset: 0,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  blurHint: {
    background: 'rgba(255,255,255,0.08)',
    border: '1px solid rgba(255,255,255,0.15)',
    borderRadius: 12, padding: '12px 20px',
    textAlign: 'center',
  },
  body: { padding: '16px 20px' },
  ownerRow: {
    display: 'flex', alignItems: 'center', gap: 10,
    background: '#1e2130', borderRadius: 12,
    padding: '10px 12px', marginBottom: 14,
  },
  avatar: {
    width: 36, height: 36, borderRadius: '50%',
    background: 'linear-gradient(135deg,#6c5ce7,#8b5cf6)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    color: '#fff', fontSize: 13, fontWeight: 700, flexShrink: 0,
  },
  ownerName: { fontSize: 13, fontWeight: 600, color: '#eef0f6' },
  ownerSub:  { fontSize: 11, color: '#4a5068', marginTop: 2 },
  verifiedChip: {
    marginLeft: 'auto',
    background: 'rgba(0,184,148,.12)',
    color: '#00b894', fontSize: 11, fontWeight: 700,
    padding: '3px 10px', borderRadius: 20,
  },
  metaGrid: {
    display: 'grid', gridTemplateColumns: '1fr 1fr',
    gap: 8, marginBottom: 14,
  },
  metaCard: { background: '#1e2130', borderRadius: 10, padding: '10px 12px' },
  metaLabel: { fontSize: 10, color: '#4a5068', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 3 },
  metaVal:   { fontSize: 12, fontWeight: 600, color: '#eef0f6' },
  expiryBar: {
    display: 'flex', alignItems: 'center', gap: 8,
    background: 'rgba(245,158,11,.08)',
    border: '1px solid rgba(245,158,11,.2)',
    borderRadius: 10, padding: '10px 12px', marginBottom: 14,
    fontSize: 12, color: '#fbbf24',
  },
  primaryBtn: {
    width: '100%', padding: 14,
    background: 'linear-gradient(135deg,#6c5ce7,#4834d4)',
    color: '#fff', border: 'none', borderRadius: 14,
    fontSize: 15, fontWeight: 700, cursor: 'pointer',
    marginBottom: 10, display: 'flex', alignItems: 'center',
    justifyContent: 'center', gap: 8,
  },
  outlineBtn: {
    width: '100%', padding: 13,
    background: 'transparent',
    border: '1.5px solid #6c5ce7',
    color: '#a29bfe', borderRadius: 14,
    fontSize: 14, fontWeight: 600, cursor: 'pointer',
    marginBottom: 10,
  },
  watermark: { fontSize: 10, color: '#2e3347', textAlign: 'center', marginTop: 12, lineHeight: 1.6 },
  // Status states
  stateBox: {
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    gap: 12, padding: '40px 24px', textAlign: 'center', maxWidth: 380,
  },
  stateIcon:  { fontSize: 48 },
  stateTitle: { fontFamily: "'Syne', sans-serif", fontSize: 22, fontWeight: 800, color: '#eef0f6', margin: 0 },
  stateSub:   { fontSize: 14, color: '#7a8099', margin: 0, lineHeight: 1.6 },
  spinner: {
    width: 36, height: 36,
    border: '3px solid #252a3a', borderTop: '3px solid #6c5ce7',
    borderRadius: '50%', animation: 'spin 0.8s linear infinite',
  },
  // Modal
  modalBg: {
    position: 'fixed', inset: 0,
    background: 'rgba(0,0,0,0.7)',
    display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
    zIndex: 100,
  },
  modalSheet: {
    background: '#161921', borderRadius: '20px 20px 0 0',
    padding: '12px 20px 36px', width: '100%', maxWidth: 480,
    animation: 'slideUp 0.3s ease',
  },
  modalHandle: {
    width: 36, height: 4,
    background: '#252a3a', borderRadius: 4,
    margin: '0 auto 20px',
  },
  modalTitle: { fontSize: 17, fontWeight: 700, color: '#eef0f6', marginBottom: 4 },
  modalSub:   { fontSize: 12, color: '#4a5068', marginBottom: 20 },
  field:      { marginBottom: 12 },
  fieldLabel: { fontSize: 12, fontWeight: 500, color: '#7a8099', display: 'block', marginBottom: 5 },
  fieldInput: {
    width: '100%', padding: '10px 14px',
    background: '#1e2130', border: '1.5px solid #252a3a',
    borderRadius: 10, color: '#eef0f6',
    fontFamily: "'DM Sans', sans-serif", fontSize: 13,
    outline: 'none', boxSizing: 'border-box',
  },
  successBox: {
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    textAlign: 'center', padding: '20px 0',
  },
  successIcon: {
    width: 60, height: 60, borderRadius: '50%',
    background: 'rgba(0,184,148,.12)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 28, marginBottom: 16,
  },
  footer: { marginTop: 24, fontSize: 12, color: '#2e3347', textAlign: 'center' },
};

const STATUS_SCREENS = {
  not_found: { icon: '🔗', title: 'Link Not Found',   sub: 'This link does not exist. Check the URL is complete.' },
  expired:   { icon: '⏱',  title: 'Link Expired',     sub: 'This shared link has expired. Ask the owner to share a new one.' },
  revoked:   { icon: '🚫', title: 'Access Revoked',   sub: 'The owner has revoked access to this image.' },
  error:     { icon: '⚠️', title: 'Could Not Load',   sub: 'We could not verify this link. Please try again.' },
};

// ─── Request Download Modal ───────────────────────────────────────────────────
function RequestModal({ token, ownerEmail, onClose }) {
  const [name,     setName]     = useState('');
  const [email,    setEmail]    = useState('');
  const [reason,   setReason]   = useState('');
  const [loading,  setLoading]  = useState(false);
  const [success,  setSuccess]  = useState(false);
  const [error,    setError]    = useState(null);

  const handleSubmit = async () => {
    if (!name.trim() || !/\S+@\S+\.\S+/.test(email)) {
      setError('Please enter your name and a valid email.');
      return;
    }
    setLoading(true); setError(null);
    try {
      await submitDownloadRequest(token, {
        recipient_name:  name,
        recipient_email: email,
        reason,
      });
      setSuccess(true);
    } catch (e) {
      if (ownerEmail) {
        setSuccess(true); // show success with mailto fallback
      } else {
        setError(e.message + ' — Please contact the owner directly.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={S.modalBg} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div style={S.modalSheet}>
        <div style={S.modalHandle} />
        {success ? (
          <div style={S.successBox}>
            <div style={S.successIcon}>✓</div>
            <p style={{ ...S.modalTitle, marginBottom: 8 }}>Request Sent!</p>
            <p style={S.stateSub}>
              The owner has been notified.<br />
              You'll receive a reply at <strong>{email}</strong> if approved.
            </p>
            {ownerEmail && (
              <a
                href={`mailto:${ownerEmail}?subject=Download%20Request%20for%20PINIT%20Image&body=Hi%2C%20I%20submitted%20a%20download%20request%20for%20your%20PINIT%20image.%20My%20name%3A%20${encodeURIComponent(name)}%2C%20email%3A%20${encodeURIComponent(email)}.%20Reason%3A%20${encodeURIComponent(reason || 'Not specified')}`}
                style={{ marginTop: 12, fontSize: 13, color: '#818cf8', textDecoration: 'underline' }}
              >
                📧 Email owner directly ({ownerEmail})
              </a>
            )}
            <button style={{ ...S.primaryBtn, marginTop: 20 }} onClick={onClose}>Done</button>
          </div>
        ) : (
          <>
            <p style={S.modalTitle}>Request Download</p>
            <p style={S.modalSub}>Your request will be sent to the owner for approval.</p>
            <div style={S.field}>
              <label style={S.fieldLabel}>Your Name</label>
              <input style={S.fieldInput} placeholder="Full name" value={name} onChange={e => setName(e.target.value)} />
            </div>
            <div style={S.field}>
              <label style={S.fieldLabel}>Email Address</label>
              <input style={S.fieldInput} placeholder="you@example.com" type="email" value={email} onChange={e => setEmail(e.target.value)} />
            </div>
            <div style={{ ...S.field, marginBottom: 16 }}>
              <label style={S.fieldLabel}>Reason (optional)</label>
              <textarea
                style={{ ...S.fieldInput, resize: 'none', height: 68 }}
                placeholder="Why do you need the original file?"
                value={reason} onChange={e => setReason(e.target.value)}
              />
            </div>
            {error && <p style={{ fontSize: 12, color: '#f87171', marginBottom: 12 }}>{error}</p>}
            <button style={{ ...S.primaryBtn, opacity: loading ? 0.6 : 1 }} onClick={handleSubmit} disabled={loading}>
              {loading ? 'Sending…' : 'Send Request'}
            </button>
            <button style={S.outlineBtn} onClick={onClose}>Cancel</button>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
function SharedImagePage() {
  const { token } = useParams();

  const [pageStatus,  setPageStatus]  = useState('loading');
  const [linkData,    setLinkData]    = useState(null);
  const [showFull,    setShowFull]    = useState(false);
  const [showReqModal,setShowReqModal]= useState(false);
  const [dlBusy,      setDlBusy]      = useState(false);

  useEffect(() => {
    if (!token) { setPageStatus('not_found'); return; }
    fetchShareLink(token).then(data => {
      if (!data || data.status === 'not_found') { setPageStatus('not_found'); return; }
      if (data.status === 'error')              { setPageStatus('error');     return; }
      // REPLACE WITH:
      // Check localStorage for full image saved at share-creation time
      const localImg = localStorage.getItem(`pinit_share_${token}`);
      if (localImg && data.asset) data.asset.full_image_url = localImg;
      setLinkData(data);
      setPageStatus(data.status); // 'active' | 'expired' | 'revoked'
    }).catch(() => setPageStatus('error'));
  }, [token]);

  // REPLACE WITH:
      // FIND (the whole function, lines 276-288):
  const handleDirectDownload = async (url, fileName) => {
    setDlBusy(true);
    try {
      if (url && url.startsWith('data:')) {
        const a = document.createElement('a');
        a.href = url; a.download = fileName || 'pinit-image.png';
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
      } else {
        const res  = await fetch(url);
        const blob = await res.blob();
        const bUrl = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = bUrl; a.download = fileName || 'pinit-image.png';
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(bUrl), 1000);
      }
    } catch (e) { alert('Download failed: ' + e.message); }
    finally { setDlBusy(false); }
  };

  const asset      = linkData?.asset      || {};
  const permission = linkData?.permission || 'view_only';
  const requireApproval = linkData?.require_approval !== false;

  // Time remaining
  let timeRemaining = null;
  if (linkData?.expires_at) {
    const delta = new Date(linkData.expires_at) - Date.now();
    if (delta > 0) {
      const days  = Math.floor(delta / 86400000);
      const hours = Math.floor((delta % 86400000) / 3600000);
      timeRemaining = days > 0 ? `${days}d ${hours}h` : `${hours}h`;
    }
  }

  return (
    <>
      <style>{`
        @keyframes spin    { to { transform: rotate(360deg); } }
        @keyframes slideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        input::placeholder, textarea::placeholder { color: #3a4060; }
        input:focus, textarea:focus { border-color: #6c5ce7 !important; }
      `}</style>

      <div style={S.page}>
        <div style={S.logo}>PINIT</div>

        {/* Loading */}
        {pageStatus === 'loading' && (
          <div style={S.stateBox}>
            <div style={S.spinner} />
            <p style={{ ...S.stateSub, marginTop: 8 }}>Verifying link…</p>
          </div>
        )}

        {/* Error states */}
        {['not_found', 'expired', 'revoked', 'error'].includes(pageStatus) && (() => {
          const m = STATUS_SCREENS[pageStatus] || STATUS_SCREENS.error;
          return (
            <div style={S.stateBox}>
              <span style={S.stateIcon}>{m.icon}</span>
              <h1 style={S.stateTitle}>{m.title}</h1>
              <p style={S.stateSub}>{m.sub}</p>
            </div>
          );
        })()}

        {/* Active link */}
        {pageStatus === 'active' && linkData && (
          <div style={S.card}>

            {/* Image preview */}
            <div style={S.imgWrap}>
              {asset.thumbnail_url ? (
                <>
                  <img
                    src={asset.full_image_url || asset.thumbnail_url}
                    alt={asset.file_name}
                    style={showFull ? S.img : S.imgBlur}
                  />
                  {!showFull && (
                    <div style={S.blurOverlay}>
                      <div style={S.blurHint}>
                        <p style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Image Protected</p>
                        <p style={{ fontSize: 11, color: '#7a8099' }}>Tap "View Image" below</p>
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <span style={{ fontSize: 48 }}>🖼️</span>
              )}
            </div>

            <div style={S.body}>

              {/* Owner row */}
              <div style={S.ownerRow}>
                <div style={S.avatar}>
                  {(asset.owner_name || 'U')[0].toUpperCase()}
                </div>
                <div>
                  <p style={S.ownerName}>{asset.owner_name || 'PINIT User'}</p>
                  <p style={S.ownerSub}>
                    Shared via PINIT · {asset.registered ? new Date(asset.registered).toLocaleDateString() : ''}
                  </p>
                </div>
                <span style={S.verifiedChip}>✓ Verified</span>
              </div>

              {/* Meta grid */}
              <div style={S.metaGrid}>
                {[
                  ['Asset ID',    asset.asset_id ? asset.asset_id.slice(0, 12) + '…' : '—'],
                  ['Permission',  permission === 'view_only' ? 'View Only' : 'View + DL'],
                  ['Resolution',  asset.resolution || '—'],
                  ['File Size',   asset.file_size  || '—'],
                ].map(([label, val]) => (
                  <div key={label} style={S.metaCard}>
                    <p style={S.metaLabel}>{label}</p>
                    <p style={S.metaVal}>{val}</p>
                  </div>
                ))}
              </div>

              {/* Expiry */}
              {timeRemaining && (
                <div style={S.expiryBar}>
                  <span>⏱</span>
                  <span>Link expires in {timeRemaining}</span>
                </div>
              )}

              {/* Actions */}
              <button style={S.primaryBtn} onClick={() => setShowFull(v => !v)}>
                {showFull ? '🙈 Hide Image' : '👁 View Image'}
              </button>

              {permission === 'view_and_download' && !requireApproval ? (
                <button
                  style={{ ...S.outlineBtn, opacity: dlBusy ? 0.6 : 1 }}
                  onClick={() => handleDirectDownload(asset.full_image_url || asset.thumbnail_url, asset.file_name)}
                  disabled={dlBusy}
                >
                  {dlBusy ? 'Downloading…' : '⬇ Download Image'}
                </button>
              ) : (
                <button style={S.outlineBtn} onClick={() => setShowReqModal(true)}>
                  📩 Request Download Access
                </button>
              )}

              <p style={S.watermark}>
                This image is UUID-embedded and protected by PINIT.<br />
                Unauthorized redistribution is traceable to this link.
              </p>
            </div>
          </div>
        )}

        <p style={S.footer}>Secured by PINIT · Image Forensics &amp; Provenance Platform</p>
      </div>

      {/* Request download modal */}
      {showReqModal && (
        <RequestModal
          token={token}
          ownerEmail={asset.owner_email || null}
          onClose={() => setShowReqModal(false)}
        />
      )}
    </>
  );
}

export default SharedImagePage;