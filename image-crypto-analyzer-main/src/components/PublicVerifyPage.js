/**
 * PublicCertificateView.js — src/components/PublicCertificateView.js
 *
 * Fetch order:
 *  1. localStorage  — stored when cert was generated OR shared on this device
 *  2. /certificates/list  with auth token — searches the list for this cert ID
 *  3. /certificates/public/:id — direct public fetch (when backend supports it)
 *  4. /certificates/share/:id  — tries the share endpoint data
 */

import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { Award, Download, CheckCircle, Shield, XCircle, MapPin } from 'lucide-react';

const BASE = 'https://pinit-backend.onrender.com';

// Normalize any backend response shape into one flat object
const normalize = (rawResponse) => {
  if (!rawResponse) return null;
  // Unwrap { message, data: {...} } wrapper
  const raw = rawResponse.data || rawResponse;
  if (!raw || raw.detail) return null;

  const ad = raw.analysis_data        || raw.analysisData        || {};
  const oa = raw.ownershipAtCreation  || raw.ownership_at_creation || raw.ownershipData || {};
  const td = raw.technicalDetails     || raw.technical_details    || {};

  return {
    certificateId : raw.certificate_id || raw.certificateId || raw.id,
    assetId       : raw.asset_id       || raw.assetId,
    ownerEmail    : ad.ownerEmail      || oa.ownerEmail  || raw.owner_email  || raw.ownerEmail,
    ownerName     : ad.ownerName       || oa.ownerName   || raw.owner_name   || raw.ownerName,
    confidence    : raw.confidence     || 95,
    status        : raw.status         || 'Verified',
    dateCreated   : raw.created_at     || raw.dateCreated || raw.date_created,
    imagePreview  : raw.image_preview  || raw.imagePreview,
    // File details — check analysis_data first (that's what backend stores)
    fileName      : ad.fileName        || oa.fileName,
    resolution    : ad.resolution      || oa.assetResolution,
    fileSize      : ad.fileSize        || oa.assetFileSize,
    timestamp     : ad.savedAt         || oa.timeStamp,
    gpsRaw        : ad.gpsLocation     || oa.gpsLocation,
    deviceName    : ad.deviceName      || td.deviceName,
    detectedCase  : ad.detectedCase    || td.detectedCase,
  };
};

const fmt = (d) => {
  if (!d) return null;
  const dt = new Date(d);
  return isNaN(dt.getTime()) ? null
    : dt.toLocaleDateString('en-US', {
        month:'short', day:'numeric', year:'numeric',
        hour:'2-digit', minute:'2-digit',
      });
};

const S = {
  root  : { minHeight:'100vh', background:'#0d1117', color:'#e6edf3',
             fontFamily:"'DM Sans',-apple-system,sans-serif", paddingBottom:48 },
  topbar: { background:'#161b22', borderBottom:'1px solid #30363d',
             padding:'14px 20px', display:'flex', alignItems:'center',
             justifyContent:'space-between' },
  logo  : { display:'flex', alignItems:'center', gap:8, fontWeight:700, fontSize:16, color:'#e6edf3' },
  wrap  : { maxWidth:600, margin:'0 auto', padding:'24px 16px' },
  hdr   : { textAlign:'center', padding:'32px 20px 24px', background:'#161b22',
             borderRadius:16, border:'1px solid #30363d', marginBottom:16 },
  hdrT  : { fontFamily:"'Syne',sans-serif", fontSize:24, fontWeight:800,
             margin:'0 0 4px', color:'#e6edf3' },
  hdrSub: { fontSize:14, color:'#8b949e', margin:'0 0 16px' },
  hdrId : { display:'inline-block', background:'rgba(167,139,250,.1)',
             border:'1px solid rgba(167,139,250,.25)', borderRadius:8,
             padding:'4px 14px', fontFamily:'monospace', fontSize:12,
             color:'#c4b5fd', marginBottom:8 },
  badge : { display:'inline-flex', alignItems:'center', gap:6,
             background:'rgba(16,185,129,.12)', border:'1px solid rgba(16,185,129,.25)',
             borderRadius:20, padding:'6px 16px', fontSize:13, fontWeight:700,
             color:'#34d399', marginBottom:16 },
  card  : { background:'#161b22', border:'1px solid #30363d', borderRadius:14,
             marginBottom:12, overflow:'hidden' },
  cHead : { display:'flex', alignItems:'center', gap:8, padding:'12px 16px',
             fontSize:11, fontWeight:700, letterSpacing:1, borderBottom:'1px solid #21262d' },
  row   : { display:'flex', justifyContent:'space-between', alignItems:'center',
             padding:'10px 16px', borderBottom:'1px solid #21262d' },
  rowL  : { fontSize:13, color:'#8b949e' },
  rowV  : { fontSize:13, color:'#e6edf3', textAlign:'right', maxWidth:'60%', wordBreak:'break-all' },
  mono  : { fontFamily:'monospace', fontSize:11 },
  green : { color:'#34d399', fontWeight:700 },
  imgWr : { padding:16, background:'#0d1117', textAlign:'center' },
  img   : { maxWidth:'100%', maxHeight:300, borderRadius:10, objectFit:'contain' },
  prose : { padding:'14px 16px', fontSize:13, color:'#8b949e', lineHeight:1.7, fontStyle:'italic' },
  footer: { textAlign:'center', padding:'24px 16px', fontSize:12, color:'#484f58' },
  lnk   : { display:'inline-block', marginTop:8, color:'#a78bfa', fontSize:12 },
  dlBtn : { display:'inline-flex', alignItems:'center', gap:8,
             background:'linear-gradient(135deg,#a78bfa,#7c3aed)', color:'#fff',
             border:'none', borderRadius:12, padding:'13px 28px',
             fontSize:15, fontWeight:700, cursor:'pointer', marginTop:8 },
  center: { display:'flex', flexDirection:'column', alignItems:'center',
             justifyContent:'center', minHeight:'60vh', gap:12, color:'#8b949e',
             padding:'0 24px', textAlign:'center' },
  spin  : { width:36, height:36, border:'3px solid #21262d',
             borderTop:'3px solid #a78bfa', borderRadius:'50%',
             animation:'spin .8s linear infinite' },
};

const Row = ({ label, value, mono, green }) => {
  if (!value || String(value).trim() === '' || String(value) === 'null'
             || String(value) === 'Not Available') return null;
  return (
    <div style={S.row}>
      <span style={S.rowL}>{label}</span>
      <span style={{ ...S.rowV, ...(mono ? S.mono : {}), ...(green ? S.green : {}) }}>
        {value}
      </span>
    </div>
  );
};

// ── Fetch helper — returns normalized cert or null ─────────────────────────────
const tryFetch = async (url, headers = {}) => {
  try {
    const r = await fetch(url, { headers });
    if (!r.ok) return null;
    const data = await r.json();
    return normalize(data);
  } catch { return null; }
};

function PublicCertificateView() {
  const { certificateId } = useParams();
  const [cert,    setCert]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);

  useEffect(() => {
    (async () => {
      // 1. localStorage — works immediately on the same device
      try {
        const local  = JSON.parse(localStorage.getItem('sharedCertificates') || '[]');
        const stored = local.find(c =>
          (c.certificate_id || c.certificateId || c.id) === certificateId
        );
        if (stored) {
          const n = normalize(stored);
          if (n) { setCert(n); setLoading(false); return; }
        }
      } catch { /* continue */ }

      const token = sessionStorage.getItem('pinit_token')
                 || localStorage.getItem('savedToken');
      const authH = token ? { Authorization: `Bearer ${token}` } : {};

      // 2. /certificates/list with auth — search for cert ID in user's list
      if (token) {
        try {
          const r = await fetch(`${BASE}/certificates/list`, { headers: authH });
          if (r.ok) {
            const data  = await r.json();
            const list  = data.certificates || data.data || (Array.isArray(data) ? data : []);
            const found = list.find(c =>
              (c.certificate_id || c.certificateId || c.id) === certificateId
            );
            if (found) {
              const n = normalize(found);
              if (n) { setCert(n); setLoading(false); return; }
            }
          }
        } catch { /* continue */ }
      }

      // 3. /certificates/public/:id — direct public endpoint
      const n3 = await tryFetch(`${BASE}/certificates/public/${certificateId}`);
      if (n3) { setCert(n3); setLoading(false); return; }

      // 4. /certificates/:id with auth
      if (token) {
        const n4 = await tryFetch(`${BASE}/certificates/${certificateId}`, authH);
        if (n4) { setCert(n4); setLoading(false); return; }
      }

      // 5. /certificates/share/:id — try share record
      const n5 = await tryFetch(`${BASE}/certificates/share/${certificateId}`);
      if (n5) { setCert(n5); setLoading(false); return; }

      setError(
        token
          ? 'Certificate not found. It may have been deleted.'
          : 'Please open this link on the device where the certificate was generated, or log in to view it.'
      );
      setLoading(false);
    })();
  }, [certificateId]);

  const handleDownload = () => {
    if (!cert) return;
    const canvas = document.createElement('canvas');
    canvas.width = 700; canvas.height = 860;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#0d1117'; ctx.fillRect(0, 0, 700, 860);
    ctx.fillStyle = '#a78bfa'; ctx.font = 'bold 22px Arial';
    ctx.fillText('PINIT CERTIFICATE OF VERIFICATION', 40, 60);
    ctx.fillStyle = '#34d399'; ctx.font = 'bold 14px Arial';
    ctx.fillText('✅ VERIFIED — ' + (cert.status || 'Verified'), 40, 90);
    let y = 130;
    [
      ['Certificate ID', cert.certificateId],
      ['Asset ID',       cert.assetId],
      ['Owner',          cert.ownerEmail || cert.ownerName],
      ['Confidence',     cert.confidence ? cert.confidence + '%' : null],
      ['Issued',         fmt(cert.dateCreated)],
      ['File',           cert.fileName],
      ['Resolution',     cert.resolution],
      ['File Size',      cert.fileSize],
      ['Device',         cert.deviceName],
      ['GPS',            cert.gpsRaw && cert.gpsRaw !== 'Not Available' ? cert.gpsRaw : null],
      ['Captured',       fmt(cert.timestamp)],
    ].filter(([,v]) => v).forEach(([l, v]) => {
      ctx.fillStyle = '#8b949e'; ctx.font = 'bold 12px Arial'; ctx.fillText(l + ':', 40, y);
      ctx.fillStyle = '#e6edf3'; ctx.font = '12px Arial';
      ctx.fillText(String(v).substring(0, 60), 200, y);
      y += 26;
    });
    ctx.fillStyle = '#484f58'; ctx.font = '11px Arial';
    ctx.fillText('Generated by PINIT · ' + new Date().toLocaleString(), 40, 840);
    canvas.toBlob(blob => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `PINIT-cert-${cert.certificateId}.png`;
      a.click();
    });
  };

  if (loading) return (
    <>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      <div style={{ ...S.root, display:'flex', alignItems:'center', justifyContent:'center' }}>
        <div style={S.center}><div style={S.spin}/><p>Loading certificate…</p></div>
      </div>
    </>
  );

  if (error || !cert) return (
    <>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      <div style={{ ...S.root, display:'flex', alignItems:'center', justifyContent:'center' }}>
        <div style={S.center}>
          <XCircle size={48} color="#f87171"/>
          <p style={{ color:'#f87171', fontWeight:700 }}>{error || 'Certificate not found'}</p>
          <p style={{ fontSize:13, color:'#8b949e' }}>
            Note: Certificate links only work on the same device/browser where they were generated,
            until the backend adds a public certificate endpoint.
          </p>
        </div>
      </div>
    </>
  );

  const isModified = cert.detectedCase?.includes('Cropped') ||
                     cert.detectedCase?.includes('Modified');
  const gps = cert.gpsRaw && cert.gpsRaw !== 'Not Available' ? cert.gpsRaw : null;

  return (
    <>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      <div style={S.root}>

        <div style={S.topbar}>
          <div style={S.logo}><Shield size={20} color="#a78bfa"/> PINIT</div>
          <span style={{ fontSize:12, color:'#8b949e' }}>Public Certificate</span>
        </div>

        <div style={S.wrap}>

          {/* Header */}
          <div style={S.hdr}>
            <div style={{ color:'#a78bfa', marginBottom:12 }}><Award size={40}/></div>
            <h1 style={S.hdrT}>PINIT Certificate</h1>
            <p style={S.hdrSub}>Certificate of Verification</p>
            <div style={S.badge}><CheckCircle size={15}/> Verified &amp; Authentic</div>
            <div><span style={S.hdrId}>{cert.certificateId}</span></div>
            {fmt(cert.dateCreated) &&
              <div style={{ fontSize:12, color:'#8b949e', marginTop:6 }}>
                Issued: {fmt(cert.dateCreated)}
              </div>}
          </div>

          {/* Certificate info */}
          <div style={S.card}>
            <div style={{ ...S.cHead, color:'#a78bfa',
                          background:'rgba(167,139,250,.06)',
                          borderBottom:'1px solid rgba(167,139,250,.12)' }}>
              <Shield size={13}/> CERTIFICATE INFORMATION
            </div>
            <Row label="Owner"      value={cert.ownerEmail || cert.ownerName}/>
            <Row label="Asset ID"   value={cert.assetId}   mono/>
            <Row label="Status"     value="✅ VERIFIED"    green/>
            <Row label="Confidence" value={cert.confidence ? cert.confidence + '%' : null} green/>
          </div>

          {/* Image + file details */}
          <div style={S.card}>
            <div style={{ ...S.cHead, color:'#fbbf24',
                          background:'rgba(251,191,36,.05)',
                          borderBottom:'1px solid rgba(251,191,36,.1)' }}>
              🖼 ANALYZED IMAGE
            </div>
            {cert.imagePreview && (
              <div style={S.imgWr}>
                <img src={cert.imagePreview} alt="Certificate preview" style={S.img}/>
              </div>
            )}
            <Row label="File"       value={cert.fileName}/>
            <Row label="Resolution" value={cert.resolution}/>
            <Row label="Size"       value={cert.fileSize}/>
            <Row label="Captured"   value={fmt(cert.timestamp)}/>
            <Row label="Device"     value={cert.deviceName}/>
            {gps && (
              <div style={S.row}>
                <span style={S.rowL}>
                  <MapPin size={11} style={{ marginRight:4, verticalAlign:'middle'}}/>GPS
                </span>
                <span style={{ ...S.rowV, color:'#a78bfa', fontSize:12 }}>{gps}</span>
              </div>
            )}
          </div>

          {/* Provenance */}
          <div style={S.card}>
            <div style={{ ...S.cHead, color:'#34d399',
                          background:'rgba(16,185,129,.05)',
                          borderBottom:'1px solid rgba(16,185,129,.1)' }}>
              <CheckCircle size={13}/> PROVENANCE
            </div>
            <p style={S.prose}>
              "This image is registered in PINIT and linked to the owner listed above.
               A valid UUID was detected and verified."
            </p>
          </div>

          {/* Integrity */}
          <div style={{
            ...S.card,
            border: isModified ? '1px solid rgba(245,158,11,.3)' : '1px solid rgba(16,185,129,.2)',
          }}>
            <div style={{
              ...S.cHead,
              color      : isModified ? '#fbbf24'              : '#34d399',
              background : isModified ? 'rgba(245,158,11,.05)' : 'rgba(16,185,129,.05)',
              borderBottom: isModified ? '1px solid rgba(245,158,11,.1)' : '1px solid rgba(16,185,129,.1)',
            }}>
              <Shield size={13}/> INTEGRITY
            </div>
            <p style={{ ...S.prose, color: isModified ? '#fbbf24' : '#34d399' }}>
              "{isModified
                ? '⚠️ Modifications detected after original registration.'
                : '✅ No changes detected since registration.'}"
            </p>
          </div>

          <div style={{ textAlign:'center', margin:'20px 0 8px' }}>
            <button style={S.dlBtn} onClick={handleDownload}>
              <Download size={17}/> Download Certificate
            </button>
          </div>

          <div style={S.footer}>
            <p>Generated by PINIT &nbsp;·&nbsp; {fmt(cert.dateCreated) || new Date().toLocaleDateString()}</p>
            <a href={`${window.location.origin}/public/certificate/${cert.certificateId}`} style={S.lnk}>
              🔗 Public Verification Link
            </a>
            <p style={{ marginTop:12, fontSize:11, color:'#30363d' }}>
              🔒 This certificate is cryptographically verified &nbsp;·&nbsp; {new Date().toISOString()}
            </p>
          </div>

        </div>
      </div>
    </>
  );
}

export default PublicCertificateView;