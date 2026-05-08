import React, { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Upload, CheckCircle, XCircle, Image as ImageIcon, Search, Eye } from 'lucide-react';
import './VerifyPage.css';

const computePHashFromCanvas = (canvas) => {
  try {
    const SIZE = 32;
    const small = document.createElement('canvas');
    small.width = SIZE; small.height = SIZE;
    small.getContext('2d').drawImage(canvas, 0, 0, SIZE, SIZE);
    const data = small.getContext('2d').getImageData(0, 0, SIZE, SIZE).data;
    const gray = [];
    for (let i = 0; i < SIZE * SIZE; i++)
      gray.push(0.299 * data[i*4] + 0.587 * data[i*4+1] + 0.114 * data[i*4+2]);
    const DCT = 16;
    const dct = [];
    for (let u = 0; u < DCT; u++)
      for (let v = 0; v < DCT; v++) {
        let sum = 0;
        for (let x = 0; x < SIZE; x++)
          for (let y = 0; y < SIZE; y++)
            sum += gray[x*SIZE+y]
              * Math.cos(((2*x+1)*u*Math.PI)/(2*SIZE))
              * Math.cos(((2*y+1)*v*Math.PI)/(2*SIZE));
        dct.push(sum);
      }
    const acDct  = dct.slice(1);
    const median = [...acDct].sort((a,b)=>a-b)[Math.floor(acDct.length/2)];
    const bits   = ['1', ...acDct.map(v => v >= median ? '1' : '0')];
    let hex = '';
    for (let i = 0; i < 256; i += 4)
      hex += parseInt(bits.slice(i, i+4).join(''), 2).toString(16);
    return hex.toUpperCase(); // 64 chars
  } catch { return null; }
};

function VerifyPage() {
  const navigate = useNavigate();
  const [selectedFile, setSelectedFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [verifying, setVerifying] = useState(false);
  const [verificationResult, setVerificationResult] = useState(null);
  const [currentStep, setCurrentStep] = useState(0);
  const fileInputRef = useRef(null);

  const generateImageHash = (imageData) => {
    const data = imageData.data;
    const width = imageData.width;
    const height = imageData.height;
    let hash = 0;
    const sampleInterval = Math.floor(data.length / 1000);
    for (let i = 0; i < data.length; i += sampleInterval) {
      hash = ((hash << 5) - hash) + data[i];
      hash |= 0;
    }
    hash = ((hash << 5) - hash) + width;
    hash = ((hash << 5) - hash) + height;
    hash |= 0;
    return Math.abs(hash).toString(36).toUpperCase().padStart(12, '0');
  };

  const STEGO_TILE     = 12;
  const UUID_FIELD_LEN = 32; // embedded without hyphens = 32 chars
  const PAYLOAD_BYTES  = 1 + UUID_FIELD_LEN + 2;
  const PAYLOAD_BITS   = PAYLOAD_BYTES * 8;

  // Try 36-char field for newer embeds
  const UUID_FIELD_LEN_36 = 36;
  const PAYLOAD_BYTES_36  = 1 + UUID_FIELD_LEN_36 + 2;
  const PAYLOAD_BITS_36   = PAYLOAD_BYTES_36 * 8;

  // Normalize UUID — strip hyphens, lowercase
  const normalizeUUID = (id) => (id || '').replace(/-/g, '').toLowerCase();

  // Match UUIDs even if one is truncated (embedder stores 32 chars, full UUID is 32 hex chars)
  const uuidMatches = (a, b) => {
    if (!a || !b) return false;
    const na = normalizeUUID(a);
    const nb = normalizeUUID(b);
    if (!na || !nb) return false;
    // Exact match OR one starts with the other (handles truncation)
    return na === nb || na.startsWith(nb) || nb.startsWith(na);
  };

  const crc16js = (bytes) => {
    let crc = 0xFFFF;
    for (let i = 0; i < bytes.length; i++) {
      crc ^= bytes[i] << 8;
      for (let j = 0; j < 8; j++)
        crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) & 0xFFFF : (crc << 1) & 0xFFFF;
    }
    return crc & 0xFFFF;
  };

  const parsePayloadBitsLen = (bits, fieldLen) => {
    const payBytes = 1 + fieldLen + 2;
    const payBits  = payBytes * 8;
    if (bits.length < payBits) return null;
    const bytes = new Uint8Array(payBytes);
    for (let i = 0; i < payBytes; i++) {
      let v = 0;
      for (let b = 0; b < 8; b++) v = (v << 1) | (bits[i * 8 + b] || 0);
      bytes[i] = v;
    }
    const lenByte    = bytes[0];
    if (lenByte <= 0 || lenByte > fieldLen) return null;
    const uuidPadded = bytes.slice(1, 1 + fieldLen);
    const crcRead    = (bytes[payBytes - 2] << 8) | bytes[payBytes - 1];
    const forCrc     = new Uint8Array(1 + fieldLen);
    forCrc[0] = lenByte; forCrc.set(uuidPadded, 1);
    if (crc16js(forCrc) !== crcRead) return null;
    let uid = '';
    for (let i = 0; i < lenByte; i++) uid += String.fromCharCode(uuidPadded[i]);
    return uid;
  };

  // Lenient parser — ignores CRC, fallback for cropped images
  // Returns partial UUID if at least 8 printable chars are recovered
  const parsePayloadBitsLenLenient = (bits, fieldLen) => {
    const payBytes = 1 + fieldLen + 2;
    if (bits.length < 16) return null;
    const bytes = new Uint8Array(payBytes);
    for (let i = 0; i < payBytes; i++) {
      let v = 0;
      for (let b = 0; b < 8; b++) v = (v << 1) | (bits[i * 8 + b] || 0);
      bytes[i] = v;
    }
    const lenByte = bytes[0];
    if (lenByte <= 0 || lenByte > fieldLen) return null;
    let uid = '';
    for (let i = 0; i < lenByte; i++) {
      const code = bytes[1 + i];
      if (code < 32 || code > 126) break;
      uid += String.fromCharCode(code);
    }
    return uid.length >= 8 ? uid : null;
  };

  const parsePayloadBits = (bits) =>
    parsePayloadBitsLen(bits, UUID_FIELD_LEN) ||
    parsePayloadBitsLen(bits, UUID_FIELD_LEN_36) ||
    parsePayloadBitsLenLenient(bits, UUID_FIELD_LEN) ||
    parsePayloadBitsLenLenient(bits, UUID_FIELD_LEN_36);

  const parseIMGCRYPT3Msg = (text) => {
    const isV3 = text.includes('IMGCRYPT3|');
    const isV2 = !isV3 && text.includes('IMGCRYPT2|');
    const hdr  = isV3 ? 'IMGCRYPT3|' : isV2 ? 'IMGCRYPT2|' : text.includes('IMGCRYPT|') ? 'IMGCRYPT|' : null;
    if (!hdr) return null;
    const si = text.indexOf(hdr) + hdr.length;
    const ei = text.indexOf('|END', si);
    if (ei <= si) return null;
    const pts = text.substring(si, ei).split('|');
    if (pts.length < 2 || !pts[0] || pts[0].length < 2) return null;
    return { userId: pts[0], gps: pts[1]||'NOGPS', timestamp: pts[2]||null, deviceId: pts[3]||null };
  };

  const extractIMGCRYPT3 = (bits) => {
    const total = bits.length;
    const maxScan = Math.min(total - 800, 3200);
    const maxRead = Math.min(500, Math.floor(total / 8));
    for (let off = 0; off <= maxScan; off += 8) {
      let text = '';
      for (let c = 0; c < maxRead; c++) {
        const s = off + c * 8;
        if (s + 8 > total) break;
        let v = 0;
        for (let b = 0; b < 8; b++) v = (v << 1) | bits[s + b];
        text += (v >= 32 && v <= 126) ? String.fromCharCode(v) : String.fromCharCode(0);
      }
      if (!text.includes('IMGCRYPT')) continue;
      const p = parseIMGCRYPT3Msg(text);
      if (p) return { found: true, userId: p.userId, deviceId: p.deviceId, timestamp: p.timestamp };
    }
    return null;
  };

  const rotateCanvasUtil = (src, degrees) => {
    const c = document.createElement('canvas');
    const swap = degrees === 90 || degrees === 270;
    c.width  = swap ? src.height : src.width;
    c.height = swap ? src.width  : src.height;
    const ctx = c.getContext('2d');
    ctx.imageSmoothingEnabled = false;  // nearest-neighbour — preserves exact LSBs
    ctx.translate(c.width / 2, c.height / 2);
    ctx.rotate((degrees * Math.PI) / 180);
    ctx.drawImage(src, -src.width / 2, -src.height / 2);
    return c;
  };

  const extractUUIDWithRotation = (sourceCanvas) => {
    for (const deg of [0, 90, 180, 270]) {
      const canvas    = deg === 0 ? sourceCanvas : rotateCanvasUtil(sourceCanvas, deg);
      const ctx       = canvas.getContext('2d');
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data      = imageData.data;
      const imgW      = canvas.width;
      const TILE      = STEGO_TILE;

      const decodeWithOffset = (ox, oy) => {
        const votes  = new Array(PAYLOAD_BITS).fill(0);
        const counts = new Array(PAYLOAD_BITS).fill(0);
        for (let idx = 0; idx < data.length; idx += 4) {
          const pi = idx / 4;
          const tx = ((pi % imgW) + ox) % TILE;
          const ty = (Math.floor(pi / imgW) + oy) % TILE;
          const p  = ty * TILE + tx;
          const i0 = (2 * p)     % PAYLOAD_BITS;
          const i1 = (2 * p + 1) % PAYLOAD_BITS;
          votes[i0]  += (data[idx]     & 1); counts[i0]++;
          votes[i1]  += (data[idx + 1] & 1); counts[i1]++;
        }
        const bits = votes.map((v, i) => (counts[i] > 0 && v > counts[i] / 2) ? 1 : 0);
        return parsePayloadBits(bits);
      };

      // Fast path
      let uid = decodeWithOffset(0, 0);
      if (uid) return { found: true, userId: uid };

      // Try all 144 tile offsets (handles any crop position)
      for (let oy = 0; oy < TILE; oy++)
        for (let ox = 0; ox < TILE; ox++) {
          if (ox === 0 && oy === 0) continue;
          uid = decodeWithOffset(ox, oy);
          if (uid) return { found: true, userId: uid };
        }

      // B channel sequential (full IMGCRYPT3 metadata)
      const bBits = [];
      for (let idx = 0; idx < data.length; idx += 4) bBits.push(data[idx + 2] & 1);
      const r2 = extractIMGCRYPT3(bBits);
      if (r2) return r2;

      // Legacy RGB sequential
      const rgbBits = [];
      for (let idx = 0; idx < data.length; idx += 4)
        rgbBits.push(data[idx] & 1, data[idx+1] & 1, data[idx+2] & 1);
      const r3 = extractIMGCRYPT3(rgbBits);
      if (r3) return r3;
    }

    return { found: false };
  };

  const handleFileSelect = (e) => {
    const file = e.target.files[0];
    if (file && file.type.startsWith('image/')) {
      setSelectedFile(file);
      setVerificationResult(null);
      setCurrentStep(0);
      const reader = new FileReader();
      reader.onload = (e) => setPreview(e.target.result);
      reader.readAsDataURL(file);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) {
      setSelectedFile(file);
      setVerificationResult(null);
      setCurrentStep(0);
      const reader = new FileReader();
      reader.onload = (e) => setPreview(e.target.result);
      reader.readAsDataURL(file);
    }
  };

  const sleep = (ms) => new Promise(res => setTimeout(res, ms));

  const verifyImage = async () => {
    if (!selectedFile) return;
    setVerifying(true);
    setVerificationResult(null);
    setCurrentStep(1);

    const img = new Image();
    img.onload = async () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);

      await sleep(700);
      setCurrentStep(2);

      const uuidResult = extractUUIDWithRotation(canvas);

      await sleep(700);
      setCurrentStep(3);
      await sleep(600);
      setCurrentStep(4);

      let matchFound   = false;
      let matchedAsset = null;

      // ── STEP 1: Backend lookup — vault + users table ──
      try {
        const { adminAPI } = await import('../api/client');

        // Load vault assets and users in parallel
        const [vaultRes, usersRes] = await Promise.all([
          adminAPI.getAllVault(),
          adminAPI.getUsers().catch(() => ({ users: [] }))
        ]);

        const allAssets = vaultRes?.assets || vaultRes?.data || (Array.isArray(vaultRes) ? vaultRes : []);
        const allUsers  = usersRes?.users  || usersRes?.data || (Array.isArray(usersRes)  ? usersRes  : []);

        console.log('[Verify] Assets:', allAssets.length, '| Users:', allUsers.length, '| UUID:', uuidResult.userId);

        if (uuidResult.found && allAssets.length > 0) {
          const backendMatch = allAssets.find(a => {
            const candidates = [a.owner_name, a.asset_id, a.user_id, a.uuid, a.watermark_id, a.unique_user_id, a.id];
            return candidates.some(f => f && uuidMatches(String(f), uuidResult.userId));
          });

          if (backendMatch) {
            matchFound = true;

            // Cross-reference with users table to get real username
            const ownerEmail = backendMatch.owner_email || null;
            const ownerName  = backendMatch.owner_name  || null;
            const realUser   = allUsers.find(u =>
              (ownerEmail && u.email === ownerEmail) ||
              (ownerName  && u.username === ownerName) ||
              u.id === backendMatch.user_id
            );

            console.log('[Verify] realUser:', realUser, '| ownerEmail:', ownerEmail, '| ownerName:', ownerName);

            matchedAsset = {
              userName     : realUser?.username || ownerEmail || ownerName || '—',
              userEmail    : realUser?.email    || ownerEmail || null,
              uniqueUserId : uuidResult.userId,
              dateEncrypted: backendMatch.capture_timestamp || backendMatch.created_at,
            };
            console.log('[Verify] Match found:', matchedAsset);
          }
        }
      } catch (e) {
        console.warn('[Verify] Backend lookup failed:', e);
      }

      // ── STEP 2: localStorage fallback ──
      if (!matchFound) {
        const vaultAssets  = JSON.parse(localStorage.getItem('vaultImages')     || '[]');
        const reportAssets = JSON.parse(localStorage.getItem('analysisReports') || '[]');
        const storedAssets = [...vaultAssets, ...reportAssets];
        console.log('[Verify] localStorage assets:', storedAssets.length);

        if (uuidResult.found && storedAssets.length > 0) {
          const extractedNorm = normalizeUUID(uuidResult.userId);
          const found = storedAssets.find(a => {
            const candidates = [
              a.uniqueUserId, a.userId, a.uuid,
              a.owner_name, a.asset_id, a.id
            ];
            return candidates.some(f => f && uuidMatches(String(f), uuidResult.userId));
          });
          if (found) {
            matchFound   = true;
            matchedAsset = found;
            console.log('[Verify] localStorage match found:', found);
          }
        }
      }

      await sleep(400);
      setCurrentStep(5);

      // ── STEP 3: Visual similarity search (only when both UUID and hash checks fail) ──
  
      let visualMatches    = [];
      let visualSearchDone = false;

      if (!matchFound) {
        try {
          const pHash = computePHashFromCanvas(canvas);
          if (pHash) {
            const { vaultAPI } = await import('../api/client');
            const searchRes    = await vaultAPI.visualSearch(pHash, 72, canvas.width, canvas.height);
            visualMatches      = searchRes.matches || [];
          }
          visualSearchDone = true;
        } catch (e) {
          console.warn('[Verify] Visual search failed:', e.message);
          visualSearchDone = true;
        }
      }

      setVerificationResult({
        matchFound,
        asset    : matchedAsset,
        uuid     : uuidResult.userId || null,
        uuidFound: uuidResult.found,
        visualMatches,
        visualSearchDone,
      });

      setVerifying(false);
    };

    img.src = preview;
  };

  const steps = [
    'Scanning image metadata',
    'Extracting hidden watermark',
    'Recovering UUID',
    'Looking up owner in backend',
  ];

  return (
    <div className="verify-page">
      <div className="verify-header">
        <h1>Verify Image Authenticity</h1>
        <p className="subtitle">Upload any image to check if it matches our encrypted asset database</p>
      </div>

      <div className="verify-container">

        {/* Upload Section */}
        <div className="upload-section">
          <div
            className="upload-area"
            onDrop={handleDrop}
            onDragOver={(e) => e.preventDefault()}
            onClick={() => fileInputRef.current?.click()}
          >
            {preview ? (
              <div className="preview-container">
                <img src={preview} alt="Preview" className="preview-image" />
                <div className="preview-overlay"><p>Click to change image</p></div>
              </div>
            ) : (
              <div className="upload-placeholder">
                <Upload size={48} className="upload-icon" />
                <h3>Drop image here or click to upload</h3>
                <p>Supports: JPG, PNG, JPEG</p>
              </div>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileSelect}
              style={{ display: 'none' }}
            />
          </div>

          {selectedFile && (
            <div className="file-info">
              <ImageIcon size={20} />
              <div>
                <div className="file-name">{selectedFile.name}</div>
                <div className="file-size">{(selectedFile.size / 1024).toFixed(2)} KB</div>
              </div>
            </div>
          )}

          <button
            onClick={verifyImage}
            disabled={!selectedFile || verifying}
            className="btn-verify"
          >
            {verifying ? '🔍 Verifying...' : 'Verify Image'}
          </button>
        </div>

        {/* Live Scanning Steps */}
        {(verifying || (verificationResult && currentStep === 5)) && (
          <div style={{
            marginTop: '24px',
            padding: '20px 24px',
            background: '#f8fafc',
            border: '1px solid #e2e8f0',
            borderRadius: '12px',
          }}>
            <p style={{ fontWeight: '600', marginBottom: '14px', color: '#1e293b', fontSize: '14px' }}>
              🔍 Verification Process
            </p>
            {steps.map((step, i) => {
              const stepNum = i + 1;
              const done    = currentStep > stepNum;
              const active  = currentStep === stepNum;
              return (
                <div key={i} style={{
                  display: 'flex', alignItems: 'center', gap: '10px',
                  padding: '9px 0',
                  borderBottom: i < steps.length - 1 ? '1px solid #f1f5f9' : 'none',
                  color: done ? '#16a34a' : active ? '#2563eb' : '#94a3b8',
                  fontSize: '13px',
                  transition: 'color 0.3s',
                }}>
                  <span style={{ fontSize: '15px', minWidth: '20px' }}>
                    {done ? '✅' : active ? '⏳' : '○'}
                  </span>
                  <span style={{ fontWeight: (active || done) ? '600' : '400' }}>{step}</span>
                </div>
              );
            })}
          </div>
        )}

        {/* Result Card */}
        {verificationResult && (
          <div style={{ marginTop: '24px' }}>
            {verificationResult.matchFound && verificationResult.asset ? (
              <div style={{
                background: '#f0fdf4',
                border: '2px solid #86efac',
                borderRadius: '14px',
                padding: '24px',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px' }}>
                  <CheckCircle size={26} color="#16a34a" />
                  <span style={{ fontSize: '17px', fontWeight: '700', color: '#166534' }}>
                    Image Owner Identified
                  </span>
                </div>

                {[
                  {
                    label: 'Name',
                    value: verificationResult.asset.userName || '—',
                    highlight: true,
                  },
                  {
                    label: 'Email',
                    value: verificationResult.asset.userEmail || '—',
                  },
                  {
                    label: 'UUID',
                    value: verificationResult.asset.uniqueUserId || verificationResult.uuid || '—',
                    mono: true,
                  },
                  {
                    label: 'Captured on',
                    value: new Date(
                      verificationResult.asset.dateEncrypted ||
                      verificationResult.asset.timestamp    ||
                      verificationResult.asset.createdAt    ||
                      Date.now()
                    ).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }),
                  },
                ].map(({ label, value, highlight, mono }) => (
                  <div key={label} style={{
                    display: 'flex', gap: '12px', alignItems: 'center',
                    padding: '10px 0',
                    borderBottom: '1px solid #d1fae5',
                  }}>
                    <span style={{ minWidth: '120px', fontWeight: '600', color: '#374151', fontSize: '13px' }}>
                      {label}
                    </span>
                    <span style={{
                      fontSize: mono ? '12px' : '14px',
                      fontWeight: highlight ? '700' : '500',
                      color: highlight ? '#166534' : '#1e293b',
                      fontFamily: mono ? 'monospace' : 'inherit',
                      background: highlight ? '#dcfce7' : mono ? '#f1f5f9' : 'transparent',
                      padding: (highlight || mono) ? '3px 10px' : '0',
                      borderRadius: '6px',
                      letterSpacing: mono ? '0.04em' : 'normal',
                    }}>
                      {value}
                    </span>
                  </div>
                ))}

                <p style={{
                  marginTop: '16px', fontSize: '12px', color: '#166534',
                  paddingTop: '12px', borderTop: '1px solid #bbf7d0'
                }}>
                  ✅ This proves who captured the image.
                </p>
              </div>
            ) : (
              <div style={{
                background: '#fef2f2',
                border: '2px solid #fca5a5',
                borderRadius: '14px',
                padding: '24px',
              }}>
                <div style={{ display: 'flex', gap: '14px', alignItems: 'flex-start' }}>
                  <XCircle size={26} color="#dc2626" style={{ flexShrink: 0, marginTop: '2px' }} />
                  <div>
                    <p style={{ fontWeight: '700', color: '#991b1b', fontSize: '16px', marginBottom: '6px' }}>
                      No Match Found
                    </p>
                    <p style={{ color: '#7f1d1d', fontSize: '13px', lineHeight: '1.7' }}>
                      {verificationResult.uuidFound
                        ? 'Watermark was detected but the UUID did not match any record in the database.'
                        : 'No watermark detected. This image may not have been encrypted with this system.'}
                    </p>
                  </div>
                </div>

                {/* Debug info — shows extracted UUID so you can cross-check */}
                {verificationResult.uuidFound && verificationResult.uuid && (
                  <div style={{
                    marginTop: '16px',
                    padding: '12px 14px',
                    background: '#fff7f7',
                    border: '1px solid #fecaca',
                    borderRadius: '8px',
                    fontSize: '12px',
                    color: '#7f1d1d',
                  }}>
                    <span style={{ fontWeight: '600' }}>Extracted UUID: </span>
                    <span style={{ fontFamily: 'monospace', letterSpacing: '0.04em' }}>
                      {verificationResult.uuid}
                    </span>
                    <div style={{ marginTop: '6px', color: '#991b1b', fontSize: '11px' }}>
                      ⚠️ This UUID was found in the image but has no matching record. Check that this asset was saved to the vault/backend under the same UUID.
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── Visual similarity results ───────────────────────────────────────
            Only shown when no exact match (UUID/hash) was found.
            Searches at 72% threshold — statistically significant matches only
            so admin always sees the full picture, not a cut-off list.          */}
        {verificationResult && !verificationResult.matchFound && verificationResult.visualSearchDone && (
          <div style={{ marginTop: 20 }}>
            {verificationResult.visualMatches?.length > 0 ? (() => {
              const all     = verificationResult.visualMatches;
              const strong  = all.filter(m => m.similarity > 75);
              const possible= all.filter(m => m.similarity >= 50 && m.similarity <= 75);
              const weak    = all.filter(m => m.similarity < 50);

              const MatchCard = ({ m }) => (
                <div style={{ display:'flex', alignItems:'center', gap:14, padding:'14px 0', borderTop:'1px solid #fde68a' }}>
                  {m.thumbnail_url
                    ? <img src={m.thumbnail_url} alt="" style={{ width:60, height:60, borderRadius:8, objectFit:'cover', border:'1px solid #fcd34d', flexShrink:0 }}/>
                    : <div style={{ width:60, height:60, borderRadius:8, background:'#fef3c7', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                        <Eye size={22} color="#d97706"/>
                      </div>}
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontWeight:700, color:'#92400e', fontSize:14 }}>
                      {m.similarity}% visual similarity
                    </div>
                    <div style={{ fontSize:12, color:'#78350f', marginTop:3 }}>
                      {m.owner_name || 'Unknown owner'}
                      {m.resolution ? ` · ${m.resolution}` : ''}
                      {m.created_at ? ` · ${new Date(m.created_at).toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' })}` : ''}
                    </div>
                    <div style={{ fontSize:11, color:'#a16207', fontFamily:'monospace', marginTop:3, wordBreak:'break-all' }}>
                      {m.asset_id}
                    </div>
                  </div>
                  <button
                    onClick={() => navigate(`/admin/assets?search=${encodeURIComponent(m.asset_id)}`)}
                    style={{ padding:'9px 18px', background:'#d97706', color:'white', border:'none', borderRadius:8, cursor:'pointer', fontSize:12, fontWeight:700, whiteSpace:'nowrap', flexShrink:0 }}>
                    Compare →
                  </button>
                </div>
              );

              const Band = ({ title, color, bg, border, items, note }) => items.length === 0 ? null : (
                <div style={{ background: bg, border: `1.5px solid ${border}`, borderRadius:12, padding:'16px 20px', marginBottom:12 }}>
                  <div style={{ fontWeight:700, color, fontSize:13, marginBottom:4 }}>{title}</div>
                  <div style={{ fontSize:12, color, opacity:0.85, marginBottom:8 }}>{note}</div>
                  {items.map((m, i) => (
                    <div key={m.asset_id} style={{ borderTop: i===0?'none':`1px solid ${border}` }}>
                      <MatchCard m={m}/>
                    </div>
                  ))}
                </div>
              );

              return (
                <div style={{ background:'#fffbeb', border:'2px solid #fcd34d', borderRadius:14, padding:24 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:8 }}>
                    <Search size={22} color="#92400e"/>
                    <span style={{ fontSize:16, fontWeight:700, color:'#92400e' }}>
                      Visually Similar Assets Found
                    </span>
                  </div>
                  <p style={{ fontSize:13, color:'#78350f', marginBottom:18, lineHeight:1.6 }}>
                    No exact match found. The results below are ranked by visual similarity.
                    Click <strong>Compare →</strong> on any candidate to run a full forensic comparison in Track Assets.
                  </p>

                  <Band
                    title="🟢 Strong Match (above 75%)"
                    color="#166534" bg="#f0fdf4" border="#86efac"
                    items={strong}
                    note="Likely a modified or compressed version of this registered asset."
                  />
                  <Band
                    title="🟡 Possible Match (50 – 75%)"
                    color="#92400e" bg="#fffbeb" border="#fcd34d"
                    items={possible}
                    note="Visual similarity detected. May be cropped, filtered, or partially edited."
                  />
                  <Band
                    title="🔴 Weak Similarity (below 50%)"
                    color="#991b1b" bg="#fff5f5" border="#fca5a5"
                    items={weak}
                    note="Low confidence — could be coincidental. Review manually before drawing conclusions."
                  />

                  <div style={{ marginTop:12, paddingTop:12, borderTop:'1px solid #fde68a', fontSize:12, color:'#78350f' }}>
                    ℹ Results searched across all vault assets. Only matches above 72% visual similarity shown — statistically significant matches only.
                  </div>
                </div>
              );
            })() : (
              <div style={{ background:'#f8fafc', border:'1px solid #e2e8f0', borderRadius:12, padding:20, textAlign:'center' }}>
                <div style={{ color:'#64748b', fontSize:13 }}>
                  No meaningful visual similarity found — searched all vault assets above 72% threshold.
                </div>
                <div style={{ color:'#94a3b8', fontSize:12, marginTop:6 }}>
                  This image has no visual resemblance to any registered asset. It is likely unrelated to your vault, or has been modified beyond visual recognition.
                </div>
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
}

export default VerifyPage;
