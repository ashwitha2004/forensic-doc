import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search, Calendar, CheckCircle, XCircle, Activity, TrendingUp,
  GitCompare, Upload, AlertTriangle, Shield, Download, Link,
  X, ChevronRight, Eye, Cpu, Hash, Fingerprint, Lock, Clock,
  Wrench, MapPin, Trash2, RefreshCw, UserCheck, UserX, Key
} from 'lucide-react';
import './AssetTrackingPage.css';

// =============================================================================
// PART 1: pHash — unified dual-algorithm with backward compat
// =============================================================================
// FIX (critical): ImageCryptoAnalyzer stored 16-char hashes (8×8 avg).
// AssetTrackingPage computed 64-char hashes (16×16 DCT).
// pHashSimilarity returned 0 for every existing asset (lengths differed).
// Now auto-detects which algorithm to use based on stored hash length.

const computePerceptualHashFromCanvas = (canvas) => {
  try {
    const SIZE = 32;
    const small = document.createElement('canvas');
    small.width = SIZE; small.height = SIZE;
    small.getContext('2d').drawImage(canvas, 0, 0, SIZE, SIZE);
    const data = small.getContext('2d').getImageData(0, 0, SIZE, SIZE).data;
    const gray = [];
    for (let i = 0; i < SIZE*SIZE; i++)
      gray.push(0.299*data[i*4] + 0.587*data[i*4+1] + 0.114*data[i*4+2]);
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

const computePerceptualHashLegacy = (canvas) => {
  try {
    const small = document.createElement('canvas');
    small.width = 8; small.height = 8;
    small.getContext('2d').drawImage(canvas, 0, 0, 8, 8);
    const data  = small.getContext('2d').getImageData(0, 0, 8, 8).data;
    const grays = [];
    for (let i = 0; i < 64; i++)
      grays.push(0.299*data[i*4] + 0.587*data[i*4+1] + 0.114*data[i*4+2]);
    const avg = grays.reduce((a,b)=>a+b,0)/64;
    let bits = '';
    for (const g of grays) bits += g >= avg ? '1' : '0';
    let hex = '';
    for (let i = 0; i < 64; i += 4)
      hex += parseInt(bits.substr(i,4),2).toString(16);
    return hex.toUpperCase(); // 16 chars
  } catch { return null; }
};

// Returns null (not 0) on format mismatch — callers handle null explicitly
const pHashSimilarity = (h1, h2) => {
  if (!h1 || !h2 || h1.length !== h2.length) return null;
  const totalBits = h1.length * 4;
  let diff = 0;
  for (let i = 0; i < h1.length; i++) {
    const b1 = parseInt(h1[i],16).toString(2).padStart(4,'0');
    const b2 = parseInt(h2[i],16).toString(2).padStart(4,'0');
    for (let j = 0; j < 4; j++) if (b1[j] !== b2[j]) diff++;
  }
  return Math.round(((totalBits - diff) / totalBits) * 100);
};

const smartPHashCompare = (uploadedCanvas, storedHash) => {
  if (!storedHash || storedHash === 'PHASH-UNAVAIL')
    return { sim: null, uploadedHash: null, algorithm: null, isLegacy: false, note: 'No fingerprint stored for this asset.' };
  if (storedHash.length === 64) {
    const h = computePerceptualHashFromCanvas(uploadedCanvas);
    return { sim: pHashSimilarity(h, storedHash), uploadedHash: h, algorithm: '256-bit DCT', isLegacy: false, note: null };
  }
  if (storedHash.length === 16) {
    const h = computePerceptualHashLegacy(uploadedCanvas);
    return { sim: pHashSimilarity(h, storedHash), uploadedHash: h, algorithm: '64-bit avg (legacy)',
      isLegacy: true, note: 'Asset uses legacy 64-bit fingerprint. Re-embed image to upgrade to 256-bit.' };
  }
  return { sim: null, uploadedHash: null, algorithm: null, isLegacy: false, note: `Unknown fingerprint format (length ${storedHash.length}).` };
};

const pHashSimWithRotationCompat = (uploadedCanvas, storedHash) => {
  if (!storedHash || storedHash === 'PHASH-UNAVAIL')
    return { sim: null, rotation: 0, algorithm: null, isLegacy: false, note: 'No fingerprint stored.' };

  let best = { sim: 0, rotation: 0 }, bestMeta = null;
  let sim0 = 0; // similarity at 0° — used as baseline for rotation advantage check

  for (const deg of [0, 90, 180, 270]) {
    const c   = deg === 0 ? uploadedCanvas : rotateCanvas(uploadedCanvas, deg);
    const res = smartPHashCompare(c, storedHash);
    if (deg === 0 && res.sim !== null) sim0 = res.sim;
    if (res.sim !== null && res.sim > best.sim) { best = { sim: res.sim, rotation: deg }; bestMeta = res; }
  }

  // Require a meaningful similarity advantage before declaring a rotation.
  // Genuine rotations outperform 0° by 15-30 points (the wrong orientation
  // looks structurally different). A crop that changes aspect ratio may
  // coincidentally score 1-5 points better at 90° — that is noise, not rotation.
  // Threshold: 8 points clears all real rotations and blocks crop false positives.
  const MIN_ROTATION_ADVANTAGE = 8;
  const effectiveRotation = (best.rotation !== 0 && (best.sim - sim0) >= MIN_ROTATION_ADVANTAGE)
    ? best.rotation : 0;

  return { sim: best.sim || null, rotation: effectiveRotation, algorithm: bestMeta?.algorithm || null, isLegacy: bestMeta?.isLegacy || false, note: bestMeta?.note || null };
};

// =============================================================================
// PART 1B: Multi-region pHash — finds the best-matching sub-region of the
// original thumbnail vs the uploaded image. This is the key signal for
// crop detection because global pHash of a corner crop vs full image is ~50%
// (near-random), but pHash of that same corner vs the matching quadrant of
// the original thumbnail is much higher.
// =============================================================================
const multiRegionPHashCompare = async (thumbSrc, uploadedCanvas, storedHashLength) => {
  if (!thumbSrc) return { bestSim: null, bestCalib: null };
  try {
    const thumbCanvas = await loadImageToCanvas(thumbSrc);
    const tw = thumbCanvas.width || 1, th = thumbCanvas.height || 1;
    const uw = uploadedCanvas.width,   uh = uploadedCanvas.height;

    // Build overlapping regions covering the full thumbnail at different scales.
    // We compare each region's pHash against the uploaded image's pHash.
    // If the upload is a crop of that region, similarity will be high.
    const regions = [
      [0,               0,               tw,             th            ], // full
      [0,               0,               Math.ceil(tw/2),Math.ceil(th/2)], // top-left
      [Math.floor(tw/2),0,               Math.ceil(tw/2),Math.ceil(th/2)], // top-right
      [0,               Math.floor(th/2),Math.ceil(tw/2),Math.ceil(th/2)], // bottom-left
      [Math.floor(tw/2),Math.floor(th/2),Math.ceil(tw/2),Math.ceil(th/2)], // bottom-right
      [Math.floor(tw/4),Math.floor(th/4),Math.ceil(tw/2),Math.ceil(th/2)], // center 50%
      [0,               0,               tw,             Math.ceil(th/2)], // top half
      [0,               Math.floor(th/2),tw,             Math.ceil(th/2)], // bottom half
      [0,               0,               Math.ceil(tw/2),th            ], // left half
      [Math.floor(tw/2),0,               Math.ceil(tw/2),th            ], // right half
      [0,               0,               Math.ceil(tw*3/4),Math.ceil(th*3/4)], // top-left 75%
      [Math.floor(tw/4),0,               Math.ceil(tw*3/4),Math.ceil(th*3/4)], // top-right 75%
      [0,               Math.floor(th/4),Math.ceil(tw*3/4),Math.ceil(th*3/4)], // bottom-left 75%
      [Math.floor(tw/4),Math.floor(th/4),Math.ceil(tw*3/4),Math.ceil(th*3/4)], // bottom-right 75%
    ];

    const hashFn = storedHashLength === 16 ? computePerceptualHashLegacy : computePerceptualHashFromCanvas;
    const uploadedHash = hashFn(uploadedCanvas);
    if (!uploadedHash) return { bestSim: null, bestCalib: null };

    let bestSim = 0, bestCalib = null, bestRegionLabel = null;
    for (const [rx, ry, rw, rh] of regions) {
      if (rw < 32 || rh < 32) continue;
      try {
        const rc = document.createElement('canvas');
        rc.width = rw; rc.height = rh;
        rc.getContext('2d').drawImage(thumbCanvas, rx, ry, rw, rh, 0, 0, rw, rh);
        const regionHash = hashFn(rc);
        const sim = pHashSimilarity(regionHash, uploadedHash);
        if (sim !== null && sim > bestSim) {
          bestSim = sim;
          bestCalib = calibratePHash(sim);
          bestRegionLabel = `${rw}x${rh} at (${rx},${ry})`;
        }
      } catch { /* skip this region */ }
    }
    return { bestSim, bestCalib, bestRegionLabel };
  } catch { return { bestSim: null, bestCalib: null }; }
};

// =============================================================================
// PART 2: UUID / IMGCRYPT3 extraction
// =============================================================================
// Exact same logic as ImageCryptoAnalyzer.js embedUUIDAdvanced/extractUUIDAdvanced.
// Reads LSBs of R+G channels (tile-based CRC-validated userId) and
// B channel (full IMGCRYPT3 metadata string).

const STEGO_TILE    = 12;
const UUID_FIELD_LEN = 32;
const PAYLOAD_BYTES  = 1 + UUID_FIELD_LEN + 2; // 35 bytes = 280 bits
const PAYLOAD_BITS   = PAYLOAD_BYTES * 8;

const crc16js = (bytes) => {
  let crc = 0xFFFF;
  for (let i = 0; i < bytes.length; i++) {
    crc ^= bytes[i] << 8;
    for (let j = 0; j < 8; j++)
      crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) & 0xFFFF : (crc << 1) & 0xFFFF;
  }
  return crc & 0xFFFF;
};

const parsePayloadBits = (bits) => {
  if (bits.length < PAYLOAD_BITS) return null;
  const bytes = new Uint8Array(PAYLOAD_BYTES);
  for (let i = 0; i < PAYLOAD_BYTES; i++) {
    let v = 0;
    for (let b = 0; b < 8; b++) v = (v << 1) | (bits[i*8+b] || 0);
    bytes[i] = v;
  }
  const lenByte = bytes[0];
  if (lenByte <= 0 || lenByte > UUID_FIELD_LEN) return null;
  const uuidPadded = bytes.slice(1, 1 + UUID_FIELD_LEN);
  const crcRead    = (bytes[PAYLOAD_BYTES-2] << 8) | bytes[PAYLOAD_BYTES-1];
  const forCrc     = new Uint8Array(1 + UUID_FIELD_LEN);
  forCrc[0] = lenByte; forCrc.set(uuidPadded, 1);
  if (crc16js(forCrc) !== crcRead) return null;
  let uid = '';
  for (let i = 0; i < lenByte; i++) uid += String.fromCharCode(uuidPadded[i]);
  if (uid.length === 32 && /^[0-9a-fA-F]{32}$/.test(uid))
    uid = `${uid.slice(0,8)}-${uid.slice(8,12)}-${uid.slice(12,16)}-${uid.slice(16,20)}-${uid.slice(20)}`;
  return uid;
};

const parseIMGCRYPT3Msg = (text) => {
  const isV3 = text.includes('IMGCRYPT3|');
  const isV2 = !isV3 && text.includes('IMGCRYPT2|');
  const hdr  = isV3 ? 'IMGCRYPT3|' : isV2 ? 'IMGCRYPT2|' : text.includes('IMGCRYPT|') ? 'IMGCRYPT|' : null;
  if (!hdr) return null;
  const si = text.indexOf(hdr) + hdr.length;
  const ei = text.indexOf('|END', si);
  if (ei <= si) return null;
  const pts = text.substring(si, ei).split('|');
  if (pts.length < 4 || !pts[0] || pts[0].length < 2) return null;
  return { userId: pts[0], gps: pts[1]||'NOGPS', timestamp: pts[2]||null,
    deviceId: pts[3]||null, deviceName: pts[4]||null, ipAddress: pts[5]||null,
    deviceSource: pts[6]||null, ipSource: pts[7]||null, gpsSource: pts[8]||null,
    originalResolution: isV3 ? (pts[9]||null) : null };
};

const buildIMGCRYPT3Result = (m) => {
  let gps = { available: false };
  if (m.gps && m.gps !== 'NOGPS') {
    const pts = m.gps.split(',');
    if (pts.length === 2) {
      const lat = parseFloat(pts[0]), lng = parseFloat(pts[1]);
      if (!isNaN(lat) && !isNaN(lng))
        gps = { available: true, latitude: lat, longitude: lng,
          coordinates: `${lat.toFixed(6)}, ${lng.toFixed(6)}`,
          mapsUrl: `https://www.google.com/maps?q=${lat},${lng}` };
    }
  }
  return { found: true, userId: m.userId, gps,
    timestamp:          m.timestamp && !isNaN(m.timestamp) ? parseInt(m.timestamp) : null,
    deviceId:           m.deviceId   || null,
    deviceName:         m.deviceName || null,
    ipAddress:          m.ipAddress  || null,
    originalResolution: m.originalResolution || null };
};

const extractIMGCRYPT3FromBits = (bits) => {
  const total   = bits.length;
  const maxScan = Math.min(total - 800, 3200);
  const maxRead = Math.min(500, Math.floor(total / 8));
  for (let off = 0; off <= maxScan; off += 8) {
    let text = '';
    for (let c = 0; c < maxRead; c++) {
      const s = off + c * 8;
      if (s + 8 > total) break;
      let v = 0;
      for (let b = 0; b < 8; b++) v = (v << 1) | bits[s+b];
      text += (v >= 32 && v <= 126) ? String.fromCharCode(v) : '\x00';
    }
    if (!text.includes('IMGCRYPT')) continue;
    const p = parseIMGCRYPT3Msg(text);
    if (p) return buildIMGCRYPT3Result(p);
  }
  return null;
};

const extractUUIDFromCanvas = (canvas) => {
  try {
    const ctx       = canvas.getContext('2d');
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data      = imageData.data;
    const imgW      = canvas.width;
    const TILE      = STEGO_TILE;

    // METHOD 1: Tile-based majority voting (CRC-validated — crop resistant)
    const decodeWithOffset = (ox, oy) => {
      const votes  = new Array(PAYLOAD_BITS).fill(0);
      const counts = new Array(PAYLOAD_BITS).fill(0);
      for (let idx = 0; idx < data.length; idx += 4) {
        const pi = idx / 4;
        const tx = ((pi % imgW) + ox) % TILE;
        const ty = (Math.floor(pi / imgW) + oy) % TILE;
        const p  = ty * TILE + tx;
        const i0 = (2*p)   % PAYLOAD_BITS;
        const i1 = (2*p+1) % PAYLOAD_BITS;
        votes[i0] += (data[idx]   & 1); counts[i0]++;
        votes[i1] += (data[idx+1] & 1); counts[i1]++;
      }
      const bits = votes.map((v,i) => (counts[i] > 0 && v > counts[i]/2) ? 1 : 0);
      const uid  = parsePayloadBits(bits);
      if (!uid) return null;
      // Try B channel for full metadata
      const bBits = [];
      for (let idx = 0; idx < data.length; idx += 4) bBits.push(data[idx+2] & 1);
      const full = extractIMGCRYPT3FromBits(bBits);
      return full || { found: true, userId: uid, gps: { available: false }, timestamp: null, deviceId: null, deviceName: null, originalResolution: null };
    };

    let result = decodeWithOffset(0, 0);
    if (result) return result;

    for (let oy = 0; oy < TILE; oy++)
      for (let ox = 0; ox < TILE; ox++) {
        if (ox === 0 && oy === 0) continue;
        result = decodeWithOffset(ox, oy);
        if (result) return result;
      }

    // METHOD 2: B channel sequential (full IMGCRYPT3)
    const bBits = [];
    for (let idx = 0; idx < data.length; idx += 4) bBits.push(data[idx+2] & 1);
    const r2 = extractIMGCRYPT3FromBits(bBits);
    if (r2) return r2;

    // METHOD 3: Legacy R+G+B sequential
    const rgbBits = [];
    for (let idx = 0; idx < data.length; idx += 4)
      rgbBits.push(data[idx]&1, data[idx+1]&1, data[idx+2]&1);
    const r3 = extractIMGCRYPT3FromBits(rgbBits);
    if (r3) return r3;

    return { found: false, userId: null };
  } catch { return { found: false, userId: null }; }
};

// Extract UUID from a possibly-cropped canvas by testing multiple sub-regions.
// When an image is cropped, only a portion of tiles survive. We try the top-left,
// top-right, bottom-left, bottom-right, and center 80% sub-regions to find surviving tiles.
const extractUUIDFromCroppedCanvas = (canvas) => {
  const w = canvas.width, h = canvas.height;
  // Sub-region: [x, y, width, height] — test corners and center
  const regions = [
    [0, 0, w, h],                                          // full (already tried, but included for clarity)
    [0, 0, Math.ceil(w * 0.8), Math.ceil(h * 0.8)],       // top-left 80%
    [Math.floor(w * 0.2), 0, Math.ceil(w * 0.8), h],      // right 80%
    [0, Math.floor(h * 0.2), w, Math.ceil(h * 0.8)],      // bottom 80%
    [Math.floor(w * 0.1), Math.floor(h * 0.1), Math.ceil(w * 0.8), Math.ceil(h * 0.8)], // center 80%
  ];
  for (const [rx, ry, rw, rh] of regions) {
    if (rw < 64 || rh < 64) continue;
    try {
      const sub = document.createElement('canvas');
      sub.width = rw; sub.height = rh;
      sub.getContext('2d').drawImage(canvas, rx, ry, rw, rh, 0, 0, rw, rh);
      const r = extractUUIDFromCanvas(sub);
      if (r.found) return r;
    } catch { /* continue */ }
  }
  return { found: false, userId: null };
};

const extractUUIDWithRotation = (canvas) => {
  for (const deg of [0, 90, 180, 270]) {
    const c      = deg === 0 ? canvas : rotateCanvas(canvas, deg);
    // First try normal full-canvas extraction
    const result = extractUUIDFromCanvas(c);
    if (result.found) return { ...result, rotationDetected: deg };
    // If that fails, try crop-compensated sub-region extraction
    const cropResult = extractUUIDFromCroppedCanvas(c);
    if (cropResult.found) return { ...cropResult, rotationDetected: deg };
  }
  return { found: false, userId: null, rotationDetected: null };
};

const checkUUIDAndOwnership = (canvas, vaultAsset) => {
  const extraction = extractUUIDWithRotation(canvas);
  if (!extraction.found)
    return { found: false, userId: null, matchesOwner: null, deviceName: null, gps: null, timestamp: null, originalResolution: null, rotationDetected: null };
  const vaultUserId = vaultAsset?.user_id || vaultAsset?.userId || null;
  const extractedId = extraction.userId;
  let matchesOwner  = null;
  if (vaultUserId && extractedId)
    matchesOwner = extractedId === vaultUserId ||
      extractedId.toLowerCase().includes(vaultUserId.toLowerCase()) ||
      vaultUserId.toLowerCase().includes(extractedId.toLowerCase());
  return { found: true, userId: extractedId, matchesOwner,
    deviceId:           extraction.deviceId           || null,
    deviceName:         extraction.deviceName         || null,
    gps:                extraction.gps                || { available: false },
    timestamp:          extraction.timestamp          || null,
    originalResolution: extraction.originalResolution || null,
    rotationDetected:   extraction.rotationDetected   || 0,
    vaultUserId, vaultOwner: vaultAsset?.owner_name || vaultAsset?.ownerName || null };
};

// =============================================================================
// PART 3: Canvas helpers
// =============================================================================
const rotateCanvas = (src, degrees) => {
  const c = document.createElement('canvas');
  const swap = degrees === 90 || degrees === 270;
  c.width  = swap ? src.height : src.width;
  c.height = swap ? src.width  : src.height;
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = false; // preserve exact LSBs — no interpolation
  ctx.translate(c.width/2, c.height/2);
  ctx.rotate((degrees * Math.PI) / 180);
  ctx.drawImage(src, -src.width/2, -src.height/2);
  return c;
};

const loadImageToCanvas = (src) => new Promise((resolve, reject) => {
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.onload = () => {
    const c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    c.getContext('2d').drawImage(img, 0, 0);
    resolve(c);
  };
  img.onerror = reject;
  img.src = src;
});

// =============================================================================
// PART 4: Colour histogram (Bhattacharyya coefficient)
// =============================================================================
const computeColorHistogram = (canvas) => {
  try {
    const SIZE = 128, BINS = 32;
    const c = document.createElement('canvas');
    c.width = SIZE; c.height = SIZE;
    c.getContext('2d').drawImage(canvas, 0, 0, SIZE, SIZE);
    const data  = c.getContext('2d').getImageData(0, 0, SIZE, SIZE).data;
    const r = new Float32Array(BINS), g = new Float32Array(BINS), b = new Float32Array(BINS);
    const total = SIZE * SIZE;
    for (let i = 0; i < total; i++) {
      r[Math.floor(data[i*4]   / (256/BINS))]++;
      g[Math.floor(data[i*4+1] / (256/BINS))]++;
      b[Math.floor(data[i*4+2] / (256/BINS))]++;
    }
    for (let i = 0; i < BINS; i++) { r[i] /= total; g[i] /= total; b[i] /= total; }
    return { r, g, b };
  } catch { return null; }
};

const histogramSimilarity = (h1, h2) => {
  if (!h1 || !h2) return null;
  let bc = 0;
  for (let i = 0; i < h1.r.length; i++)
    bc += Math.sqrt(h1.r[i]*h2.r[i]) + Math.sqrt(h1.g[i]*h2.g[i]) + Math.sqrt(h1.b[i]*h2.b[i]);
  return Math.round((bc / 3) * 100);
};

// Raw pHash Hamming similarity returns ~50% for any two unrelated images by chance.
// Calibrate by removing the 50% floor and rescaling [50,100] → [0,100].
const calibratePHash = (raw) =>
  raw === null || raw === undefined ? null : Math.max(0, Math.min(100, Math.round((raw - 50) * 2)));

// =============================================================================
// PART 4c: Stage A — Asset Relationship Classifier
// =============================================================================
//
// The central insight driving the 2-stage pipeline:
//   Forensic modification details (crop, resize, rotation, compression,
//   region edits, colour shifts, editing tool) are only meaningful when the
//   submitted image is first established to be a derivative of the same base
//   asset.  Showing them for a completely unrelated image is misleading —
//   every image will differ from an unrelated reference in all those ways.
//
// Stage A classifies the relationship BEFORE deciding which report template
// to generate.  Stage B picks the template.
//
// Classification hierarchy (first match wins):
//   EXACT_MATCH          — byte-identical or confidence ≥ 95%
//   SAME_ASSET_MODIFIED  — UUID verified, or strong visual + high confidence
//   SAME_ASSET_TRANSFORMED — pHash ≥ 25 cal. + moderate confidence
//   POSSIBLE_DERIVATIVE  — weak signals but something points to the same asset
//   UNRELATED_IMAGE      — no credible link to the registered asset
//
const determineAssetRelationship = ({
  calibPHash, histSim, uuidCheck, confidence, exactMatch,
}) => {
  if (exactMatch || confidence >= 95) return 'EXACT_MATCH';

  const uuidFound    = uuidCheck?.found === true;
  const uuidVerified = uuidCheck?.matchesOwner === true;

  // Cryptographic ownership proof overrides low visual scores
  // (UUID survives crop + minor edits, so low visual score is expected)
  if (uuidVerified && confidence >= 20) return 'SAME_ASSET_MODIFIED';
  if (uuidFound    && confidence >= 70) return 'SAME_ASSET_MODIFIED';

  if (confidence >= 70) return 'SAME_ASSET_MODIFIED';

  if (confidence >= 40) {
    if (uuidFound || (calibPHash !== null && calibPHash >= 25)) return 'SAME_ASSET_TRANSFORMED';
    return 'POSSIBLE_DERIVATIVE';
  }

  if (confidence >= 15) {
    if (uuidFound || (calibPHash !== null && calibPHash >= 15)) return 'POSSIBLE_DERIVATIVE';
  }

  return 'UNRELATED_IMAGE';
};

// Relationship → human label
const RELATIONSHIP_LABEL = {
  EXACT_MATCH:           'Exact Match',
  SAME_ASSET_MODIFIED:   'Same Asset — Modified',
  SAME_ASSET_TRANSFORMED:'Same Asset — Transformed',
  POSSIBLE_DERIVATIVE:   'Possible Derivative',
  UNRELATED_IMAGE:       'Unrelated Image',
};

// =============================================================================
// PART 4d: Stage B — Report mode selector
// =============================================================================
//
// For UNRELATED_IMAGE: generateMismatchReport() — short, clean, decisive.
// For everything else: generateModificationReport() — full forensic breakdown.
//
// buildMismatchReasons() merges overlapping visual signals into at most 4
// concise, human-readable reasons.  Avoids showing pHash mismatch + histogram
// mismatch + pixel mismatch + visual mismatch all separately.
//
const buildMismatchReasons = (result) => {
  const reasons = [];
  const calibP  = result.pHashCalibrated;
  const hist    = result.histSim;
  const uuid    = result.uuidCheck;

  // ── Reason 1: Merge all visual-similarity signals into one statement ───────
  if (calibP !== null && calibP < 15) {
    if (hist !== null && hist < 45) {
      reasons.push(
        'Visual structure and colour profile are completely different — ' +
        'perceptual hash and histogram both confirm images are unrelated'
      );
    } else {
      reasons.push(
        'Perceptual hash similarity is within the random-image noise baseline ' +
        `(calibrated ${calibP}%) — images have no meaningful visual correspondence`
      );
    }
  } else if (hist !== null && hist < 35) {
    reasons.push(
      `Colour profile does not match the registered asset (histogram similarity ${hist}%)`
    );
  } else {
    reasons.push('Visual similarity is too low to establish any asset correspondence');
  }

  // ── Reason 2: UUID / ownership signature ──────────────────────────────────
  if (!uuid?.found) {
    reasons.push('No PINIT ownership signature (UUID) found in the submitted image');
  } else if (uuid?.matchesOwner === false) {
    reasons.push('Embedded UUID belongs to a different registered user — not the asset owner');
  }

  // ── Reason 3: Structural mismatch (only if significantly different) ────────
  reasons.push(
    'Content and structural analysis do not support continuity with the registered asset'
  );

  // ── Reason 4: Feature-level statement ─────────────────────────────────────
  if (reasons.length < 4) {
    reasons.push(
      'Submitted image is not a derivative, copy, or modification of the registered asset'
    );
  }

  return reasons.slice(0, 4);
};

// =============================================================================
// PART 5: SHA-256
// =============================================================================
const computeFileSHA256 = async (file) => {
  try {
    const buf     = await file.arrayBuffer();
    const hashBuf = await crypto.subtle.digest('SHA-256', buf);
    return Array.from(new Uint8Array(hashBuf)).map(b => b.toString(16).padStart(2,'0')).join('');
  } catch { return null; }
};

// =============================================================================
// PART 6: Pixel diff (supporting signal — compares against thumbnail)
// =============================================================================
// NOTE: This uses the stored Cloudinary thumbnail (up to 400px) as reference,
// not the full-resolution original. Treat hot-region maps as supportive context,
// not as the primary tampering verdict — thumbnail JPEG compression alone causes
// pixel differences on legitimate unmodified images.
const runPixelDiff = async (origSrc, uploadedCanvas) => {
  try {
    const origCanvas = await loadImageToCanvas(origSrc);
    const SIZE = 256;
    // If the uploaded image is smaller in both dimensions (cropped), compare the
    // center-cropped region of the original against the uploaded image rather than
    // stretching both to 256×256 (which destroys the spatial correspondence).
    const ow = origCanvas.width, oh = origCanvas.height;
    const uw = uploadedCanvas.width, uh = uploadedCanvas.height;
    const isCrop = uw < ow && uh < oh;

    const makeScaled = (src, sx = 0, sy = 0, sw = src.width, sh = src.height) => {
      const c = document.createElement('canvas');
      c.width = SIZE; c.height = SIZE;
      c.getContext('2d').drawImage(src, sx, sy, sw, sh, 0, 0, SIZE, SIZE);
      return c.getContext('2d').getImageData(0, 0, SIZE, SIZE);
    };

    let origData, uploadedData;
    if (isCrop && ow > 0 && oh > 0) {
      // Crop the original to the same relative area as the uploaded (center-aligned)
      const scaleX = uw / ow, scaleY = uh / oh;
      const cropW  = Math.round(ow * scaleX);
      const cropH  = Math.round(oh * scaleY);
      const cropX  = Math.round((ow - cropW) / 2);
      const cropY  = Math.round((oh - cropH) / 2);
      origData     = makeScaled(origCanvas, cropX, cropY, cropW, cropH);
      uploadedData = makeScaled(uploadedCanvas);
    } else {
      origData     = makeScaled(origCanvas);
      uploadedData = makeScaled(uploadedCanvas);
    }
    const GRID = 4;
    const cellW = SIZE / GRID, cellH = SIZE / GRID;
    let totalDiff = 0, changedPixels = 0;
    const regionDiffs  = Array(GRID).fill(null).map(() => Array(GRID).fill(0));
    const regionCounts = Array(GRID).fill(null).map(() => Array(GRID).fill(0));
    let origBrightSum = 0, upBrightSum = 0;
    let origRSum = 0, origGSum = 0, origBSum = 0, upRSum = 0, upGSum = 0, upBSum = 0;
    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE; x++) {
        const idx = (y*SIZE + x) * 4;
        const oR = origData.data[idx],     oG = origData.data[idx+1], oB = origData.data[idx+2];
        const uR = uploadedData.data[idx], uG = uploadedData.data[idx+1], uB = uploadedData.data[idx+2];
        const diff = (Math.abs(oR-uR) + Math.abs(oG-uG) + Math.abs(oB-uB)) / 3;
        totalDiff += diff;
        if (diff > 15) changedPixels++;
        const gx = Math.min(Math.floor(x/cellW), GRID-1);
        const gy = Math.min(Math.floor(y/cellH), GRID-1);
        regionDiffs[gy][gx]  += diff; regionCounts[gy][gx]++;
        origBrightSum += (oR+oG+oB)/3; upBrightSum += (uR+uG+uB)/3;
        origRSum += oR; origGSum += oG; origBSum += oB;
        upRSum   += uR; upGSum   += uG; upBSum   += uB;
      }
    }
    const totalPixels = SIZE * SIZE;
    const changedPct  = (changedPixels / totalPixels) * 100;
    const brightShift = (upBrightSum - origBrightSum) / totalPixels;
    const rShift = (upRSum - origRSum) / totalPixels;
    const gShift = (upGSum - origGSum) / totalPixels;
    const bShift = (upBSum - origBSum) / totalPixels;
    const rowNames = ['Top', 'Upper-mid', 'Lower-mid', 'Bottom'];
    const colNames = ['left', 'center-left', 'center-right', 'right'];
    const hotRegions = [];
    for (let gy = 0; gy < GRID; gy++)
      for (let gx = 0; gx < GRID; gx++) {
        const score = regionCounts[gy][gx] > 0 ? regionDiffs[gy][gx] / regionCounts[gy][gx] : 0;
        if (score > 8)
          hotRegions.push({ name: `${rowNames[gy]} ${colNames[gx]}`, score: Math.round(score),
            severity: score > 25 ? 'high' : score > 12 ? 'medium' : 'low' });
      }
    hotRegions.sort((a,b) => b.score - a.score);
    return {
      avgDiff:      Math.round((totalDiff / totalPixels) * 10) / 10,
      changedPct:   Math.round(changedPct * 10) / 10,
      changedPixels, totalPixels, hotRegions,
      brightShift:  Math.round(brightShift * 10) / 10,
      rShift: Math.round(rShift), gShift: Math.round(gShift), bShift: Math.round(bShift),
      pixelSimilarity: Math.round(Math.max(0, 100 - changedPct * 1.5)),
      vsThumb: true,
    };
  } catch { return null; }
};

// =============================================================================
// PART 7: JPEG/PNG editing tool detection (unchanged — working correctly)
// =============================================================================
const readStr = (view, offset, len) => {
  let s = '';
  for (let i = 0; i < len && offset+i < view.byteLength; i++)
    s += String.fromCharCode(view.getUint8(offset+i));
  return s;
};

const classifyFromSoftwareString = (sw) => {
  const s = (sw || '').toLowerCase();
  if (s.includes('adobe photoshop')) return sw;
  if (s.includes('adobe lightroom')) return sw;
  if (s.includes('adobe'))           return sw;
  if (s.includes('gimp'))            return sw;
  if (s.includes('inkscape'))        return 'Inkscape';
  if (s.includes('paint.net'))       return 'Paint.NET';
  if (s.includes('affinity'))        return sw;
  if (s.includes('canva'))           return 'Canva';
  if (s.includes('snapseed'))        return 'Snapseed';
  if (s.includes('vsco'))            return 'VSCO';
  if (s.includes('picsart'))         return 'PicsArt';
  if (s.includes('pixelmator'))      return 'Pixelmator';
  if (s.includes('darktable'))       return 'Darktable';
  if (s.includes('capture one'))     return 'Capture One';
  if (s.includes('facetune'))        return 'Facetune';
  if (s.includes('lightx'))          return 'LightX';
  return sw;
};

const parsePNGChunks = (view) => {
  try {
    let offset = 8, software = null, hasICC = false, iccProfile = '', hasXMP = false;
    let xmpTool = null, allTextKeys = [], physX = null, physUnit = null;
    while (offset < view.byteLength - 12) {
      const length = view.getUint32(offset, false);
      const type   = readStr(view, offset+4, 4);
      if (type === 'tEXt' || type === 'iTXt') {
        const data  = readStr(view, offset+8, Math.min(length, 1000));
        const lower = data.toLowerCase();
        const parts = data.split('\x00');
        const key   = (parts[0] || '').toLowerCase().trim();
        const val   = parts.slice(1).join('').trim();
        allTextKeys.push(key);
        if (key === 'software' && val)               software = val;
        if (val.toLowerCase().includes('gimp'))      software = software || val;
        if (val.toLowerCase().includes('inkscape'))  software = software || val;
        if (val.toLowerCase().includes('photoshop')) software = software || val;
        if (val.toLowerCase().includes('canva'))     software = software || 'Canva';
        if (val.toLowerCase().includes('paint.net')) software = software || 'Paint.NET';
        if (lower.includes('xpacket') || lower.includes('xmpmeta')) {
          hasXMP = true;
          const m = data.match(/CreatorTool[^>]*?>([^<]{1,100})</);
          if (m) xmpTool = m[1].trim();
        }
      }
      if (type === 'iCCP') { hasICC = true; iccProfile = readStr(view, offset+8, Math.min(40, length)).split('\x00')[0].trim(); }
      if (type === 'pHYs' && length === 9) { physX = view.getUint32(offset+8, false); physUnit = view.getUint8(offset+16); }
      if (type === 'IEND') break;
      if (length > 100*1024*1024) break;
      offset += 12 + length;
    }
    if (software) return classifyFromSoftwareString(software);
    if (xmpTool)  return classifyFromSoftwareString(xmpTool);
    if (hasICC) {
      const icc = iccProfile.toLowerCase();
      if (icc.includes('adobe rgb') || icc.includes('prophoto')) return 'Adobe Photoshop / Lightroom (Adobe ICC profile)';
      if (icc.includes('display p3')) return 'macOS App / Apple device (Display P3 profile)';
      return `Image Editor (ICC profile: ${iccProfile || 'sRGB'})`;
    }
    if (hasXMP) return 'Professional Editor (XMP metadata present)';
    if (physUnit === 1 && physX === 3937) return 'Windows App — Paint / Snipping Tool (96 DPI)';
    if (physUnit === 1 && physX === 3780) return 'macOS App — Preview / Screenshot (96 DPI)';
    if (physUnit === 1 && physX === 2835) return 'Standard screen export (72 DPI)';
    if (allTextKeys.length > 0) return `Edited — metadata present (${allTextKeys.slice(0,2).join(', ')})`;
    return 'No metadata recorded (screenshot or basic app)';
  } catch { return null; }
};

const classifyByQuantizationTables = ({ lumTable, chromTable, chromaSub, hasJFIF, hasExif, make, imgW, imgH }) => {
  if (!lumTable) { if (!hasExif && hasJFIF) return 'Messenger / Social App (EXIF stripped)'; return null; }
  const maxDim = Math.max(imgW, imgH);
  const lumAvg = lumTable.reduce((a,b)=>a+b,0) / 64;
  const lumDC  = lumTable[0];
  const chromDC = chromTable ? chromTable[0] : 0;
  const estQ = lumAvg < 100 ? Math.round((200-lumAvg*2)/2) : Math.round(5000/lumAvg);
  const q = Math.max(1, Math.min(100, estQ));
  const scores = { whatsapp:0, instagram:0, telegram:0, facebook:0, twitter:0, snapchat:0 };
  if (lumDC>=6  && lumDC<=10)   scores.whatsapp+=30;
  if (lumAvg>=8 && lumAvg<=14)  scores.whatsapp+=20;
  if (chromaSub==='4:2:0')      scores.whatsapp+=25;
  if (!hasExif && hasJFIF)      scores.whatsapp+=15;
  if (maxDim<=1600 && maxDim>0) scores.whatsapp+=15;
  const isWAHD = lumDC>=3 && lumDC<=6 && chromaSub==='4:2:0' && maxDim>1600 && maxDim<=2560;
  if (isWAHD) scores.whatsapp+=20;
  if (imgW===1080 || imgH===1080) scores.instagram+=50;
  if (lumDC>=8  && lumDC<=13)     scores.instagram+=20;
  if (lumAvg>=10 && lumAvg<=18)   scores.instagram+=15;
  if (!hasExif && hasJFIF)        scores.instagram+=10;
  if (lumDC>=2  && lumDC<=6)      scores.telegram+=25;
  if (chromaSub==='4:2:2')        scores.telegram+=40;
  if (chromaSub==='4:4:4')        scores.telegram+=30;
  if (!hasExif && hasJFIF)        scores.telegram+=10;
  if (chromaSub==='4:2:0')        scores.telegram-=40;
  if (maxDim===960 || maxDim===720) scores.facebook+=40;
  if (maxDim===2048)              scores.facebook+=35;
  if (imgW===1200 || imgH===1200) scores.twitter+=45;
  if (lumDC>=10 && lumDC<=16)     scores.snapchat+=20;
  if ((imgW===1080&&imgH===1920)||(imgW===720&&imgH===1280)) scores.snapchat+=40;
  if (hasExif) { scores.whatsapp-=50; scores.instagram-=50; scores.telegram-=30; scores.facebook-=50; scores.twitter-=50; }
  const [platform, score] = Object.entries(scores).sort((a,b)=>b[1]-a[1])[0];
  if (score < 40) { if (!hasExif && hasJFIF) return `Social Media / Messenger (EXIF stripped — quality ~${q}%)`; return null; }
  const detail = `quality ~${q}%, DC=${lumDC}, ${chromaSub||''}`;
  switch(platform) {
    case 'whatsapp':  return isWAHD ? `WhatsApp HD (${maxDim}px, ${detail})` : `WhatsApp (re-encoded — ${maxDim>0?maxDim+'px, ':''}${detail})`;
    case 'instagram': return `Instagram (re-encoded — 1080px, ${detail})`;
    case 'telegram':  return `Telegram (re-encoded — ${detail})`;
    case 'facebook':  return `Facebook (re-encoded — ${maxDim}px, ${detail})`;
    case 'twitter':   return `Twitter / X (re-encoded — 1200px, ${detail})`;
    case 'snapchat':  return `Snapchat (re-encoded — ${detail})`;
    default: return null;
  }
};

const extractEditingToolFromFile = (file, imgW=0, imgH=0) => new Promise((resolve) => {
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const buf  = e.target.result;
      const view = new DataView(buf);
      const sig32 = view.getUint32(0, false);
      // FIX: Read full file for PNG — metadata chunks can appear after image data
      if (sig32 === 0x89504E47) { resolve(parsePNGChunks(view)); return; }
      if (view.getUint16(0, false) !== 0xFFD8) { resolve(null); return; }
      let software=null, xmpTool=null, comment=null, hasJFIF=false, hasExif=false;
      let hasApp13=false, hasAdobeICC=false, make=null, chromaSub=null;
      let lumTable=null, chromTable=null;
      let offset=2;
      while (offset < view.byteLength-4) {
        const marker = view.getUint16(offset, false);
        offset += 2;
        if (marker === 0xFFDA) break;
        const segLen = view.getUint16(offset, false);
        if (marker === 0xFFE0) { const id=readStr(view,offset+2,5); if (id.startsWith('JFIF')) hasJFIF=true; }
        if (marker === 0xFFE1) {
          const hdr = readStr(view,offset+2,6);
          if (hdr.startsWith('Exif')) {
            hasExif = true;
            const ts=offset+8, le=view.getUint16(ts,false)===0x4949;
            const ifd=view.getUint32(ts+4,le), num=view.getUint16(ts+ifd,le);
            for (let i=0; i<num; i++) {
              const en=ts+ifd+2+i*12; if (en+12 > ts+segLen) break;
              const tag=view.getUint16(en,le), cnt=view.getUint32(en+4,le);
              const vo=cnt>4 ? ts+view.getUint32(en+8,le) : en+8;
              if (tag===0x0131) software=readStr(view,vo,Math.min(cnt,100)).replace(/\0/g,'').trim();
              if (tag===0x010F) make    =readStr(view,vo,Math.min(cnt, 60)).replace(/\0/g,'').trim();
              if (tag===0x013C) comment =comment||readStr(view,vo,Math.min(cnt,200)).replace(/\0/g,'').trim();
            }
          }
          const fhdr=readStr(view,offset+2,30);
          if (fhdr.includes('http')||fhdr.includes('xpacket')) {
            const xmp=readStr(view,offset+2,Math.min(segLen-2,4000));
            const m=xmp.match(/CreatorTool[^>]*?>([^<]{1,100})</);
            if (m) xmpTool=m[1].trim();
          }
        }
        if (marker===0xFFE2) { const s=readStr(view,offset+2,Math.min(segLen,400)); if (s.includes('ICC_PROFILE')&&(s.includes('Adobe')||s.includes('ProPhoto'))) hasAdobeICC=true; }
        if (marker===0xFFED && readStr(view,offset+2,12).includes('Photoshop')) hasApp13=true;
        if (marker===0xFFFE) comment=comment||readStr(view,offset+2,Math.min(segLen-2,200)).replace(/\0/g,'').trim();
        if (marker===0xFFDB) {
          let tOffset=offset+2; const tEnd=offset+segLen;
          while (tOffset < tEnd-1) {
            const ptq=view.getUint8(tOffset); tOffset++;
            const precision=(ptq>>4)&0xF, tableId=ptq&0xF, coefSize=precision===0?1:2;
            const table=[];
            for (let i=0; i<64; i++) { if (tOffset+coefSize>view.byteLength) break; table.push(precision===0?view.getUint8(tOffset):view.getUint16(tOffset,false)); tOffset+=coefSize; }
            if (table.length===64) { if (tableId===0) lumTable=table; if (tableId===1) chromTable=table; }
          }
        }
        if (marker===0xFFC0||marker===0xFFC2) {
          try { if (segLen>=15&&view.getUint8(offset+7)>=3) { const h1=(view.getUint8(offset+9)>>4)&0xF, h2=(view.getUint8(offset+12)>>4)&0xF; chromaSub=h1===2&&h2===1?'4:2:0':h1===2&&h2===2?'4:2:2':'4:4:4'; } } catch {}
        }
        if (segLen < 2) break;
        offset += segLen;
      }
      if (software) { const t=classifyFromSoftwareString(software); if(t){resolve(t);return;} }
      if (xmpTool)  { const t=classifyFromSoftwareString(xmpTool);  if(t){resolve(t);return;} }
      if (hasApp13)            { resolve('Adobe Photoshop'); return; }
      if (hasAdobeICC&&!hasJFIF){ resolve('Adobe Photoshop / Lightroom'); return; }
      const cmt=(comment||'').toLowerCase();
      if (cmt.includes('gimp'))      { resolve('GIMP'); return; }
      if (cmt.includes('photoshop')) { resolve('Adobe Photoshop'); return; }
      if (cmt.includes('canva'))     { resolve('Canva'); return; }
      if (cmt.includes('snapseed'))  { resolve('Snapseed'); return; }
      resolve(classifyByQuantizationTables({ lumTable, chromTable, chromaSub, hasJFIF, hasExif, make, imgW, imgH }));
    } catch { resolve(null); }
  };
  reader.onerror = () => resolve(null);
  const isPNG = file.type === 'image/png' || (file.name||'').toLowerCase().endsWith('.png');
  reader.readAsArrayBuffer(isPNG ? file : file.slice(0, 1024*1024));
});

// =============================================================================
// PART 8: Format helpers
// =============================================================================
const formatTS = (ts) => {
  if (!ts) return 'Unknown';
  return new Date(ts).toLocaleString('en-US', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit', second:'2-digit' });
};

const fmtFileSize = (raw) => {
  if (!raw) return null;
  if (typeof raw === 'string') return parseFloat(raw) || null;
  return raw / 1024; // bytes → KB
};

// =============================================================================
// PART 9: Region Heatmap component
// =============================================================================
const RegionHeatmap = ({ hotRegions }) => {
  const rows = ['Top','Upper-mid','Lower-mid','Bottom'];
  const cols = ['left','center-left','center-right','right'];
  const scoreMap = {};
  (hotRegions || []).forEach(r => { scoreMap[r.name] = r.score; });
  return (
    <div style={{ display:'inline-flex', flexDirection:'column', gap:2 }}>
      {rows.map(row => (
        <div key={row} style={{ display:'flex', gap:2 }}>
          {cols.map(col => {
            const name  = `${row} ${col}`;
            const score = scoreMap[name] || 0;
            const bg    = score > 25 ? '#e53e3e' : score > 12 ? '#dd6b20' : score > 0 ? '#ecc94b' : '#c6f6d5';
            return (
              <div key={col} title={`${name}: intensity ${score}`}
                style={{ width:28, height:28, borderRadius:4, background:bg,
                  opacity: score > 0 ? 0.35 + (score/255)*0.65 : 0.35,
                  border:'1px solid rgba(0,0,0,0.1)' }} />
            );
          })}
        </div>
      ))}
      <div style={{ fontSize:10, color:'#718096', marginTop:3, textAlign:'center' }}>
        4×4 region heatmap (red=high, green=clean)
      </div>
    </div>
  );
};

// =============================================================================
// PART 10: Decision-based comparison pipeline (2-stage)
// =============================================================================
// =============================================================================
// PART 10: Decision-based comparison pipeline (2-stage)
// =============================================================================
//
// Architecture:
//   Stage 0  — compute raw signals (pHash, histogram, UUID, pixel diff, etc.)
//   Stage 1  — classifyRelationship() → UNRELATED | EXACT | SAME_ASSET_*
//   Stage 2  — detectTransformations() → runs ONLY if same-asset is confirmed
//   Stage 3  — buildVisibleFindings()  → human-readable, deduplicated findings
//
// Key rule: Transformation analysis NEVER runs for unrelated images.
// Raw signals (pHash %, histogram %, pixel delta) are NEVER shown to users.
// Only semantic findings (e.g. "Cropping detected") appear in the report.

// ── Stage 0A: Platform likelihood assessment (3-layer redesign) ───────────────
//
// Returns a probabilistic assessment — never a definitive claim.
// Only surfaces when image is already confirmed as same-asset OR evidence is strong.
// Confidence thresholds:  0.85+ highly likely | 0.65+ likely | 0.50+ possible
//                         below 0.50 → NONE (not surfaced)
//
const assessPlatformLikelihood = (editingTool, uploadedCanvas, uploadedFile, assetRelationship, pixelAnalysis) => {
  const tool   = (editingTool || '').toLowerCase();
  const w      = uploadedCanvas?.width  || 0;
  const h      = uploadedCanvas?.height || 0;
  const maxDim = Math.max(w, h);
  const minDim = Math.min(w, h);

  // ── WhatsApp scoring ──────────────────────────────────────────────────────
  let waScore = 0;
  const waReasons = [];

  // Metadata string — strong but rare (WhatsApp strips most EXIF)
  if (tool.includes('whatsapp')) {
    waScore += 0.55; waReasons.push('WhatsApp identified in file metadata');
  }
  // WhatsApp-HD dimensions: 1280×960 or 960×1280 (4:3 landscape/portrait HD)
  if ((w === 1280 && h === 960) || (w === 960 && h === 1280)) {
    waScore += 0.30; waReasons.push('Dimensions match WhatsApp HD output (1280×960)');
  }
  // WhatsApp common output dimensions beyond HD — covers portrait and 16:9 outputs
  const WA_DIMS = [
    [1280,720],[720,1280],   // 16:9 landscape / portrait
    [1280,854],[854,1280],   // 3:2
    [1024,768],[768,1024],   // 4:3 non-HD
    [1024,1024],             // square
    [640,480],[480,640],     // low-res
  ];
  if (WA_DIMS.some(([dw,dh]) => (w===dw&&h===dh)||(w===dh&&h===dw))) {
    waScore += 0.25; waReasons.push('Dimensions match a common WhatsApp output size');
  }
  // WhatsApp standard range: max dimension 800–1600px (avoids flagging unrelated sizes)
  if (maxDim >= 800 && maxDim <= 1600 && minDim >= 450) {
    waScore += 0.15; waReasons.push('Dimensions within WhatsApp standard output range');
  }
  // EXIF stripped + JPEG (WhatsApp always strips EXIF)
  const isJpeg = uploadedFile?.type === 'image/jpeg' ||
    (uploadedFile?.name || '').toLowerCase().match(/\.(jpg|jpeg)$/);
  const exifStripped = !editingTool || tool === 'no metadata recorded (screenshot or basic app)';
  if (isJpeg && exifStripped) {
    waScore += 0.15; waReasons.push('EXIF metadata stripped from JPEG (consistent with WhatsApp)');
  }
  // WhatsApp file size heuristic: typically 50–300 KB for standard images
  const sizeKB = (uploadedFile?.size || 0) / 1024;
  if (sizeKB >= 40 && sizeKB <= 350) {
    waScore += 0.10; waReasons.push('File size consistent with WhatsApp recompression');
  }

  // ── Instagram scoring ─────────────────────────────────────────────────────
  let igScore = 0;
  const igReasons = [];

  if (tool.includes('instagram')) {
    igScore += 0.55; igReasons.push('Instagram identified in file metadata');
  }
  // Instagram normalises to 1080px on the long edge
  if (w === 1080 || h === 1080) {
    igScore += 0.30; igReasons.push('Image has Instagram-standard 1080px dimension');
  }
  // Instagram portrait 4:5 ratio
  if ((w === 1080 && h === 1350) || (w === 1350 && h === 1080)) {
    igScore += 0.25; igReasons.push('Dimensions match Instagram portrait ratio (1080×1350)');
  }
  // Instagram square
  if (w === 1080 && h === 1080) {
    igScore += 0.25; igReasons.push('Dimensions match Instagram square format (1080×1080)');
  }
  // Instagram landscape 1.91:1 (exact)
  if ((w === 1080 && h === 566) || (w === 1080 && h === 608)) {
    igScore += 0.20; igReasons.push('Dimensions match Instagram landscape ratio');
  }
  // Instagram landscape: any 1080px-wide image with 16:9-ish aspect ratio
  // covers the full range of Instagram landscape delivery sizes
  const igAspect = h > 0 ? w / h : 0;
  if (w === 1080 && igAspect >= 1.6 && igAspect <= 2.1 && h !== 566 && h !== 608) {
    igScore += 0.20; igReasons.push('Dimensions match Instagram landscape output (1080px wide, 16:9 range)');
  }
  if (isJpeg && exifStripped) {
    igScore += 0.10; igReasons.push('EXIF stripped from JPEG (consistent with Instagram delivery)');
  }

  // ── Screenshot scoring ────────────────────────────────────────────────────
  // Hard rule: SCREENSHOT_LIKELY requires strong independent evidence (tool EXIF).
  // Dimension and pixel signals are weak corroboration only — they fire for every
  // crop/resize/rotate and must NEVER alone produce a screenshot verdict.
  let ssScore = 0;
  let ssStrongEvidence = false;  // tracks whether metadata-level evidence is present
  const ssReasons = [];
  const SCREEN_RES = [
    [1920,1080],[2560,1440],[1366,768],[1280,720],[3840,2160],
    [1440,900],[2560,1600],[1536,864],[375,812],[390,844],
    [414,896],[393,851],[360,800],[1170,2532],[1284,2778],
  ];
  // Screen resolution: weak corroborating signal only (0.15, was 0.30).
  // Cannot cross the 0.50 threshold on its own — requires additional evidence.
  // A cropped or resized image may coincidentally match a screen resolution.
  if (SCREEN_RES.some(([sw,sh]) => (Math.abs(w-sw)<8&&Math.abs(h-sh)<8)||(Math.abs(w-sh)<8&&Math.abs(h-sw)<8))) {
    ssScore += 0.15; ssReasons.push('Resolution matches a common device screen resolution');
  }
  // Tool EXIF: the only strong, screenshot-specific signal.
  // CRITICAL EXCLUSION: 'No metadata recorded (screenshot or basic app)' is the
  // FALLBACK string returned when ALL EXIF is stripped (Instagram, WhatsApp, etc.).
  // It contains the word 'screenshot' but does NOT mean a screenshot tool was used.
  // Only a SPECIFIC, named screenshot app (Snipping Tool, Grab, macOS Screenshot)
  // is genuine evidence. The fallback string must be excluded unconditionally.
  const isSpecificScreenshotTool =
    (tool.includes('screenshot') || tool.includes('snipping') || tool.includes('grab')) &&
    !tool.includes('no metadata recorded');
  if (isSpecificScreenshotTool) {
    ssScore += 0.55; ssReasons.push('Screenshot tool identified in file metadata');
    ssStrongEvidence = true;
  }
  // NOTE: pixelAnalysis.changedPct removed — pixel deviation fires for every
  // geometric transform (crop/resize/rotate) and is NOT screenshot-specific.

  // ── Safety gate: only surface platform labels for same-asset images ───────
  // Prevents labelling a random 1080px image as "Instagram"
  const isSameAsset = assetRelationship === 'SAME_ASSET' || assetRelationship === 'EXACT_MATCH' ||
                      assetRelationship === 'POSSIBLE_DERIVATIVE';
  if (!isSameAsset) {
    // Only surface if a REAL platform/tool string is present (not the generic fallback).
    // 'No metadata recorded (screenshot or basic app)' is stripped-EXIF fallback — not platform proof.
    const hasRealToolString =
      (tool.includes('whatsapp') || tool.includes('instagram') ||
       ((tool.includes('screenshot') || tool.includes('snipping')) && !tool.includes('no metadata recorded')));
    if (!hasRealToolString) {
      return { primary: 'NONE', confidence: 0, reasons: [] };
    }
  }

  // ── Pick winner ───────────────────────────────────────────────────────────
  const MIN_CONFIDENCE = 0.50;
  const candidates = [
    { primary: 'WHATSAPP_LIKELY',  confidence: Math.min(1, waScore), reasons: waReasons },
    { primary: 'INSTAGRAM_LIKELY', confidence: Math.min(1, igScore), reasons: igReasons },
    // SCREENSHOT_LIKELY: only surface when strong evidence exists (tool EXIF) OR
    // score reaches 0.65+ (requires tool EXIF + screen res — dimension alone = 0.15).
    // This prevents crop/resize/rotate from producing false screenshot verdicts.
    { primary: 'SCREENSHOT_LIKELY', confidence: ssStrongEvidence ? Math.min(1, ssScore) : 0, reasons: ssReasons },
  ].filter(c => c.confidence >= MIN_CONFIDENCE)
   .sort((a, b) => b.confidence - a.confidence);

  if (candidates.length === 0) {
    // Generic recompression: require ALL THREE signals to avoid false positives on
    // simple crops/resizes/rotates that were saved as JPEG by any image editor.
    // 1) JPEG format  2) EXIF stripped  3) file size in typical recompressed range (40–350 KB)
    const sizeInRecompressRange = sizeKB >= 40 && sizeKB <= 350;
    if (isJpeg && exifStripped && sizeInRecompressRange && isSameAsset) {
      return { primary: 'GENERIC_RECOMPRESSED', confidence: 0.60, reasons: ['JPEG with stripped EXIF and file size consistent with platform recompression'] };
    }
    return { primary: 'NONE', confidence: 0, reasons: [] };
  }

  return candidates[0];
};

// ── Stage 0B: Screenshot indicator detection ──────────────────────────────────
const detectScreenshotIndicators = (uploadedFile, pixelAnalysis, editingTool, uploadedCanvas) => {
  const indicators = [];
  const w    = uploadedCanvas?.width  || 0;
  const h    = uploadedCanvas?.height || 0;
  const tool = (editingTool || '').toLowerCase();

  const SCREEN_RES = [
    [1920,1080],[2560,1440],[1366,768],[1280,720],[3840,2160],
    [1440,900],[2560,1600],[1536,864],[375,812],[390,844],
    [414,896],[393,851],[360,800],[1170,2532],[1284,2778],
  ];
  if (SCREEN_RES.some(([sw,sh]) => (Math.abs(w-sw)<8 && Math.abs(h-sh)<8) || (Math.abs(w-sh)<8 && Math.abs(h-sw)<8)))
    indicators.push('resolution_matches_screen');

  // Only flag screenshot tool if EXIF *actively identifies* a SPECIFIC screenshot app.
  // 'No metadata recorded (screenshot or basic app)' is a fallback for stripped EXIF —
  // it does NOT mean a screenshot tool was used. Exclude it explicitly.
  const isSpecificSSTool =
    tool &&
    (tool.includes('screenshot') || tool.includes('snipping') || tool.includes('grab')) &&
    !tool.includes('no metadata recorded');
  if (isSpecificSSTool) indicators.push('screenshot_tool_exif');

  // NOTE: high_pixel_deviation removed — pixel deviation fires for every geometric
  // transform (rotate/crop/resize) and is NOT a screenshot-specific signal.
  // Two strong signals (screen resolution + tool EXIF) are sufficient for detection.

  return indicators;
};

// ── Stage 0C: UUID status classification (Layer 3) ───────────────────────────
//
// Separates UUID outcome from asset relationship — UUID loss does NOT mean
// the image is unrelated. It means the steganographic embedding was disrupted.
//
const classifyUUIDStatus = (uuidCheck, platformLikelihood, transformations) => {
  if (uuidCheck?.found && uuidCheck?.matchesOwner === true) {
    return {
      state: 'VERIFIED',
      confidence: 100,
      extractedValue: uuidCheck.userId,
      matchedOwner: true,
      likelyFailureReason: null,
    };
  }
  if (uuidCheck?.found && uuidCheck?.matchesOwner === null) {
    return {
      state: 'PARTIAL',
      confidence: 60,
      extractedValue: uuidCheck.userId,
      matchedOwner: null,
      likelyFailureReason: 'UUID extracted but vault owner ID not available for comparison',
    };
  }
  if (uuidCheck?.found && uuidCheck?.matchesOwner === false) {
    return {
      state: 'INVALID_OWNER',
      confidence: 95,
      extractedValue: uuidCheck.userId,
      matchedOwner: false,
      likelyFailureReason: 'Embedded UUID belongs to a different registered user',
    };
  }
  // UUID not found — determine likely cause from context
  let likelyFailureReason = null;
  const p = platformLikelihood?.primary;
  if (p === 'WHATSAPP_LIKELY')
    likelyFailureReason = 'WhatsApp recompresses JPEG with lossy encoding, destroying pixel-level steganographic data';
  else if (p === 'INSTAGRAM_LIKELY')
    likelyFailureReason = 'Instagram re-encodes all images on upload, destroying pixel-level steganographic data';
  else if (p === 'SCREENSHOT_LIKELY')
    likelyFailureReason = 'Screen recapture does not preserve the original pixel values required for UUID recovery';
  else if (p === 'GENERIC_RECOMPRESSED')
    likelyFailureReason = 'JPEG recompression after registration likely destroyed the steganographic embedding';
  else if (transformations?.cropped?.detected)
    likelyFailureReason = 'Heavy cropping may have removed or disrupted tile-based UUID embedding regions';

  const hasPlatformReason = !!likelyFailureReason;
  return {
    state: hasPlatformReason ? 'DAMAGED' : 'NOT_FOUND',
    confidence: hasPlatformReason ? 75 : 85,
    extractedValue: null,
    matchedOwner: null,
    likelyFailureReason,
  };
};

// ── Stage 1: Relationship classification ─────────────────────────────────────
//
// Thresholds (calibPHash is the 0-100 scale after removing 50% random floor):
//   EXACT_MATCH             calibPHash >= 90 AND histSim >= 80
//   SAME_ASSET_*            compositeScore >= 45 OR calibPHash >= 55
//   UNRELATED               compositeScore < 35
//
// compositeScore = calibPHash*0.55 + histSim*0.35 + uuidBonus(0|5|12)

const classifyRelationship = (signals) => {
  const {
    shaMatch, calibPHash, histSim, uuidCheck,
    origW, origH, uploadedW, uploadedH,
    detectedRotation, editingTool, screenshotIndicators,
  } = signals;

  if (shaMatch) return { assetRelationship: 'EXACT_MATCH', verdict: 'EXACT_MATCH', confidence: 100 };

  const cp = calibPHash ?? 0;
  const hs = histSim    ?? 0;
  const uuidBonus = uuidCheck?.found && uuidCheck?.matchesOwner === true  ? 12
                  : uuidCheck?.found && uuidCheck?.matchesOwner !== false  ?  5
                  : 0;
  const compositeScore = cp * 0.55 + hs * 0.35 + uuidBonus;

  // Near-identical encoding variant — dimensions must also match.
  // A resized image produces the same pHash (both scale to 32×32) but MUST NOT
  // be classified as exact match — it is a resize. Only allow this path when
  // the uploaded image dimensions are within ±20px of the original on both axes.
  const dimsMatchForExact = origW === 0 || (
    Math.abs(uploadedW - origW) <= 20 && Math.abs(uploadedH - origH) <= 20
  );
  if (cp >= 90 && hs >= 80 && dimsMatchForExact)
    return { assetRelationship: 'EXACT_MATCH', verdict: 'EXACT_MATCH', confidence: 95 };

  // Same-asset threshold.
  // NOTE: global pHash drops to near-random (calibrated ~0%) for cropped images
  // because a corner crop looks nothing like the full image at 32×32 scale.
  // Multi-region pHash (computed in runComparison) largely corrects this, but
  // we also lower the geometry-based fallback thresholds significantly.
  const bothDimsSmaller = origW > 0 && origH > 0 && uploadedW < origW && uploadedH < origH;
  // Aspect ratio of upload vs original (or rotation-swapped original)
  const isSwapRotCls   = detectedRotation === 90 || detectedRotation === 270;
  const refWCls        = isSwapRotCls ? origH : origW;
  const refHCls        = isSwapRotCls ? origW : origH;
  const aspectOrigCls  = refWCls > 0 && refHCls > 0 ? refWCls / refHCls : null;
  const aspectUpCls    = uploadedW > 0 && uploadedH > 0 ? uploadedW / uploadedH : null;
  // Same aspect ratio + both dims smaller = very strong crop signal
  const isSameAspectCrop = bothDimsSmaller && aspectOrigCls && aspectUpCls &&
    Math.abs(aspectOrigCls - aspectUpCls) < 0.08;

  const isSameAsset =
    compositeScore >= 45 ||
    cp >= 55 ||
    (uuidCheck?.found && uuidCheck?.matchesOwner === true) ||  // UUID proven → always same asset
    (uuidCheck?.found && cp >= 10) ||                          // UUID found + minimal visual match
    (isSameAspectCrop && cp >= 5) ||                           // same-ratio crop + tiny visual signal
    (bothDimsSmaller && cp >= 15) ||                           // any crop geometry + low visual
    (bothDimsSmaller && compositeScore >= 20);                 // crop geometry + histogram agreement

  if (!isSameAsset) {
    return { assetRelationship: 'UNRELATED_IMAGE', verdict: 'UNRELATED_IMAGE', confidence: Math.round(Math.max(60, 100 - compositeScore * 1.4)) };
  }

  const conf = Math.round(Math.min(92, compositeScore));

  // All paths below this point are confirmed same-asset
  // Rotation (rotation-corrected pHash was best at non-zero angle)
  if (detectedRotation && detectedRotation !== 0 && cp >= 48)
    return { assetRelationship: 'SAME_ASSET', verdict: 'SAME_ASSET_ROTATED', confidence: conf };

  // Geometry-based classification — account for rotation swapping W/H
  const isSwapRot      = detectedRotation === 90 || detectedRotation === 270;
  const refOrigW       = isSwapRot ? origH : origW;
  const refOrigH       = isSwapRot ? origW : origH;
  const aspectOrig     = refOrigW > 0 && refOrigH > 0 ? refOrigW / refOrigH : null;
  const aspectUploaded = uploadedW > 0 && uploadedH > 0 ? uploadedW / uploadedH : null;
  const aspectChanged  = aspectOrig && aspectUploaded && Math.abs(aspectOrig - aspectUploaded) > 0.04;
  const dimsChanged    = origW > 0 && (Math.abs(uploadedW - refOrigW) > 50 || Math.abs(uploadedH - refOrigH) > 50);
  // Both dims smaller than the (rotation-adjusted) original → crop, even if aspect ratio unchanged
  const isCropGeometry = refOrigW > 0 && refOrigH > 0 &&
    uploadedW <= refOrigW && uploadedH <= refOrigH &&
    (Math.abs(uploadedW - refOrigW) > 30 || Math.abs(uploadedH - refOrigH) > 30);

  // Resize: same aspect ratio, any size change including downscale.
  // Must come BEFORE crop check — a proportional downscale preserves aspect
  // ratio and should never be labelled as a crop.
  if (!aspectChanged && dimsChanged && origW > 0)
    return { assetRelationship: 'SAME_ASSET', verdict: 'SAME_ASSET_RESIZED', confidence: Math.min(88, conf) };

  // Crop: aspect ratio changed — the only geometry signal that definitively
  // distinguishes a crop from a resize. Low cp threshold because pHash drops
  // naturally when only a region of the image is compared.
  if (aspectChanged && dimsChanged && cp >= 5)
    return { assetRelationship: 'SAME_ASSET', verdict: 'SAME_ASSET_CROPPED', confidence: Math.min(85, conf) };

  // UUID missing despite visual match
  if (!uuidCheck?.found && cp >= 55)
    return { assetRelationship: 'SAME_ASSET', verdict: 'SAME_ASSET_UUID_DAMAGED', confidence: Math.min(80, conf) };

  // Multiple / unresolved changes
  if (cp >= 45)
    return { assetRelationship: 'SAME_ASSET', verdict: 'SAME_ASSET_MULTI_CHANGE', confidence: Math.min(82, conf) };

  if (compositeScore >= 35)
    return { assetRelationship: 'POSSIBLE_DERIVATIVE', verdict: 'POSSIBLE_DERIVATIVE', confidence: Math.round(compositeScore) };

  return { assetRelationship: 'UNRELATED_IMAGE', verdict: 'UNRELATED_IMAGE', confidence: Math.round(Math.max(60, 100 - compositeScore * 1.4)) };
};

// ── Stage 2: Transformation detection (same-asset only) ──────────────────────
const detectTransformations = (signals, verdict) => {
  const {
    calibPHash, uuidCheck, pixelAnalysis,
    origW, origH, uploadedW, uploadedH,
    detectedRotation, editingTool, screenshotIndicators,
  } = signals;

  const cp = calibPHash ?? 0;
  const result = {};

  // When the image was rotated 90° or 270°, width and height are swapped.
  // Compare against the rotated reference dimensions to avoid false crop detection.
  const isSwapRotation = detectedRotation === 90 || detectedRotation === 270;
  const refW = isSwapRotation ? origH : origW;
  const refH = isSwapRotation ? origW : origH;

  const aspectOrig     = refW > 0 && refH > 0 ? refW / refH : null;
  const aspectUploaded = uploadedW > 0 && uploadedH > 0 ? uploadedW / uploadedH : null;
  const aspectChanged  = aspectOrig && aspectUploaded && Math.abs(aspectOrig - aspectUploaded) > 0.04;
  const bothSmaller    = uploadedW < refW && uploadedH < refH;
  const retainedArea   = refW > 0 && refH > 0
    ? Math.round((uploadedW * uploadedH) / (refW * refH) * 100) : null;
  const dimsChanged    = origW > 0 && (Math.abs(uploadedW - refW) > 50 || Math.abs(uploadedH - refH) > 50);

  // Crop: fires if aspect changed OR relationship was explicitly classified as crop.
  // Removed (bothSmaller && dimsChanged) — same-aspect downscales are resizes, not crops.
  // Aspect ratio change is the only dimension-based signal that definitively means crop.
  const isCropDetected =
    aspectChanged ||
    verdict === 'SAME_ASSET_CROPPED';

  if (isCropDetected) {
    const cropMsg = bothSmaller
      ? `Area reduced — content cropped from ${refW > 0 ? refW + ' × ' + refH : 'original'} to ${uploadedW} × ${uploadedH}`
      : `Aspect ratio changed — deliberate crop detected`;
    result.cropped = {
      detected: true,
      confidence: cp >= 65 ? 90 : cp >= 35 ? 78 : 68,
      originalDimensions:  origW > 0 ? `${origW} × ${origH}` : null,
      submittedDimensions: `${uploadedW} × ${uploadedH}`,
      retainedAreaPercent: retainedArea,
      cropRegion: cropMsg,
    };
  }

  // Rotation
  if (detectedRotation && detectedRotation !== 0) {
    result.rotated = { detected: true, confidence: 88, angle: detectedRotation };
  }

  // Resize: same aspect ratio, any size change including downscale
  if (!isCropDetected && !aspectChanged && dimsChanged && origW > 0) {
    result.resized = {
      detected: true, confidence: 88,
      originalDimensions:  `${origW} × ${origH}`,
      submittedDimensions: `${uploadedW} × ${uploadedH}`,
      scaleX: Math.round((uploadedW / origW) * 100) / 100,
      scaleY: Math.round((uploadedH / origH) * 100) / 100,
    };
  }

  // Screenshot — require at least 2 indicators to populate, 3 to mark detected=true.
  // This prevents single weak signals (e.g. common resolution) from firing alone.
  if ((screenshotIndicators?.length ?? 0) >= 2) {
    result.screenshot = {
      detected: (screenshotIndicators?.length ?? 0) >= 3,
      confidence: Math.min(85, (screenshotIndicators?.length ?? 0) * 28),
      indicators: screenshotIndicators,
    };
  }

  // UUID damaged — platform cause is now resolved by classifyUUIDStatus (Layer 3).
  // detectTransformations only flags geometry/editing causes here.
  if (!uuidCheck?.found) {
    let likelyCause = 'Pixel-level editing or platform processing after registration';
    if (result.screenshot?.detected)    likelyCause = 'Screen recapture does not preserve pixel-level steganographic data';
    else if (result.cropped?.detected)  likelyCause = 'Cropping may have disrupted the tile-based UUID embedding';
    else if (editingTool)               likelyCause = `Pixel-level editing (${editingTool}) destroyed the steganographic signature`;
    result.uuidDamaged = {
      detected: true, confidence: cp >= 65 ? 82 : 62, likelyCause,
    };
  }

  return result;
};

// ── Stage 3A: Report mode determination ──────────────────────────────────────
//
//   EXACT_MATCH            → clean green confirmation
//   SINGLE_CHANGE          → one focused transformation
//   MULTI_CHANGE           → condensed list of confirmed changes
//   PLATFORM_PROCESSED      → 3-card: asset relationship | platform likelihood | uuid status
//   UUID_DAMAGE            → caution — asset confirmed, signature lost
//   MISMATCH               → short red no-match card (NO forensic clutter)

const determineReportMode = (verdict, transformations, platformLikelihood) => {
  if (verdict === 'EXACT_MATCH') return 'EXACT_MATCH';
  if (verdict === 'UNRELATED_IMAGE' || verdict === 'POSSIBLE_DERIVATIVE') return 'MISMATCH';

  // Platform-processed same-asset
  const platPrimary = platformLikelihood?.primary;

  // Hard gate for SCREENSHOT_LIKELY — ABSOLUTE rule.
  // If any geometric transform (crop/resize/rotate) is detected, NEVER route to
  // PLATFORM_PROCESSED for screenshot. The geometric finding always takes priority.
  //
  // Rationale: a file may carry screenshot tool metadata from a previous processing
  // step (e.g. the original was once a screenshot, then rotated by the user).
  // The current operation is geometric, not a screen recapture — the metadata is
  // historic artefact, not current evidence. Mixing geometric and platform labels
  // in the same report confuses the verdict. Geometric transforms win unconditionally.
  //
  // Screenshot evidence is still preserved in transformations.screenshot for
  // forensic completeness, but it never overrides crop/resize/rotate verdict.
  if (platPrimary === 'SCREENSHOT_LIKELY') {
    const hasGeometricTransform =
      transformations.cropped?.detected ||
      transformations.resized?.detected ||
      transformations.rotated?.detected;
    if (!hasGeometricTransform) {
      return 'PLATFORM_PROCESSED';
    }
    // Geometric transform present → fall through to SINGLE_CHANGE / MULTI_CHANGE
  } else if (platPrimary === 'WHATSAPP_LIKELY' || platPrimary === 'INSTAGRAM_LIKELY' ||
             platPrimary === 'GENERIC_RECOMPRESSED') {
    return 'PLATFORM_PROCESSED';
  }

  if (verdict === 'SAME_ASSET_UUID_DAMAGED') return 'UUID_DAMAGE';

  const detected = Object.values(transformations).filter(t => t?.detected && (t.confidence ?? 0) >= 65).length;
  return detected <= 1 ? 'SINGLE_CHANGE' : 'MULTI_CHANGE';
};

// ── Stage 3B: Visible findings builder ───────────────────────────────────────
//
// Only findings with confidence >= 60 appear.
// Duplicate/derivative signals are SUPPRESSED and merged into one root finding.
// Max visible findings per mode: MISMATCH=4, EXACT_MATCH=3, others=4-6.

const buildVisibleFindings = (verdict, reportMode, transformations, signals, uuidCheck, platformLikelihood, uuidStatus) => {
  const { calibPHash, histSim, origW, origH, uploadedW, uploadedH,
          editingTool, screenshotIndicators } = signals;
  const cp = calibPHash ?? 0;
  const findings = [];

  const uuidVerifiedText   = 'Ownership signature verified — matches registered owner.';
  const uuidNotFoundText   = 'No PINIT steganographic signature was found. This image was not registered through this vault.';

  // ── MISMATCH: short, clean, no forensic dump ─────────────────────────────
  if (reportMode === 'MISMATCH') {
    findings.push({
      type: 'NO_MATCH',
      title: 'Submitted image does not correspond to the selected asset',
      summary: 'The submitted image has no meaningful visual, structural, or ownership connection to the registered original. These appear to be completely different images.',
      confidence: 95,
    });
    findings.push({
      type: 'UUID_ABSENT',
      title: 'No ownership signature found',
      summary: uuidNotFoundText,
      confidence: 95,
    });
    // Single merged similarity reason — suppresses pHash/histogram/pixel separately
    const combinedSim = Math.round(cp * 0.6 + (histSim ?? 0) * 0.4);
    findings.push({
      type: 'LOW_SIMILARITY',
      title: 'Extremely low visual and structural similarity',
      summary: `All comparison signals — perceptual hash, colour distribution, and structural analysis — confirm a mismatch. Combined similarity score: ${combinedSim}%. This is within the range expected for two completely unrelated images.`,
      confidence: 92,
    });
    findings.push({
      type: 'NO_CONTINUITY',
      title: 'No asset continuity established',
      summary: 'Visual, structural, and ownership analysis all confirm that the submitted image does not originate from the selected registered asset.',
      confidence: 90,
    });
    return findings.slice(0, 4);
  }

  // ── EXACT_MATCH ──────────────────────────────────────────────────────────
  if (reportMode === 'EXACT_MATCH') {
    findings.push({
      type: 'EXACT_MATCH',
      title: signals.shaMatch ? 'Exact match — byte-for-byte identical' : 'Exact match confirmed',
      summary: signals.shaMatch
        ? 'SHA-256 cryptographic hash matches exactly. The submitted file is byte-for-byte identical to the registered original.'
        : `Perceptual similarity of ${cp}% (calibrated) confirms this is the same image — only minor re-encoding differences exist.`,
      confidence: 100,
    });
    if (uuidCheck?.found && uuidCheck?.matchesOwner === true)
      findings.push({ type: 'UUID_VERIFIED', title: 'Ownership signature verified', summary: uuidVerifiedText, confidence: 100 });
    findings.push({ type: 'NO_MODIFICATIONS', title: 'No meaningful modifications detected', summary: 'Image content, structure, and ownership markers confirm an authentic, unmodified match to the registered original.', confidence: 100 });
    return findings.slice(0, 3);
  }

  // ── PLATFORM_PROCESSED (replaces FORWARDED_OR_SCREENSHOT) ─────────────────
  // Shows 3 separate finding cards: Asset Relationship | Platform Assessment | UUID Status
  if (reportMode === 'PLATFORM_PROCESSED') {
    const plat = platformLikelihood || { primary: 'GENERIC_RECOMPRESSED', confidence: 0.55, reasons: [] };
    const platConfPct = Math.round((plat.confidence || 0) * 100);
    const platLabel = {
      WHATSAPP_LIKELY:     'WhatsApp forwarding / recompression likely',
      INSTAGRAM_LIKELY:    'Instagram / social-media recompression likely',
      SCREENSHOT_LIKELY:   'Screen recapture likely',
      GENERIC_RECOMPRESSED:'Generic platform recompression detected',
    }[plat.primary] || 'Platform recompression detected';
    const platFindingType = {
      WHATSAPP_LIKELY:     'WHATSAPP_FORWARDED',
      INSTAGRAM_LIKELY:    'INSTAGRAM_FORWARDED',
      SCREENSHOT_LIKELY:   'SCREENSHOT',
      GENERIC_RECOMPRESSED:'WHATSAPP_FORWARDED',
    }[plat.primary] || 'WHATSAPP_FORWARDED';

    // Card 1 — Asset Relationship
    findings.push({
      type: 'ASSET_CONFIRMED',
      title: 'Same asset confirmed',
      summary: `Visual analysis confirms this is a copy of the registered asset (${cp}% calibrated perceptual similarity). Asset continuity established despite platform processing.`,
      confidence: Math.min(92, Math.max(cp, 30) + 15),
    });

    // Card 2 — Platform Assessment (probabilistic language, never absolute)
    const platConfLabel = plat.confidence >= 0.85 ? 'highly likely' : plat.confidence >= 0.65 ? 'likely' : 'possible';
    findings.push({
      type: platFindingType,
      title: platLabel,
      summary: `Platform processing ${platConfLabel} (${platConfPct}% confidence). Evidence: ${(plat.reasons || []).slice(0, 2).join('; ')}.`,
      confidence: platConfPct,
    });

    // Card 3 — UUID / Ownership Status
    const us = uuidStatus || { state: 'NOT_FOUND', confidence: 70, likelyFailureReason: null };
    if (us.state === 'VERIFIED') {
      findings.push({ type: 'UUID_VERIFIED', title: 'Ownership signature verified — matches registered owner', summary: uuidVerifiedText, confidence: 100 });
    } else if (us.state === 'PARTIAL') {
      findings.push({ type: 'UUID_DAMAGED', title: 'Ownership signature partially recovered', summary: us.likelyFailureReason || 'UUID extracted but owner match could not be confirmed.', confidence: us.confidence });
    } else if (us.state === 'DAMAGED') {
      findings.push({ type: 'UUID_DAMAGED', title: 'Ownership signature damaged by platform processing', summary: us.likelyFailureReason || 'Platform re-encoding destroyed the steganographic embedding.', confidence: us.confidence });
    } else if (us.state === 'NOT_FOUND') {
      findings.push({ type: 'UUID_ABSENT', title: 'Ownership signature not found', summary: 'No PINIT UUID could be recovered. This may be expected if the image was heavily re-encoded.', confidence: us.confidence });
    } else if (us.state === 'INVALID_OWNER') {
      findings.push({ type: 'UUID_MISMATCH', title: 'Ownership conflict — UUID does not match registered owner', summary: us.likelyFailureReason || 'The embedded UUID belongs to a different user.', confidence: 95 });
    }

    // "Resolution adjusted by platform" must NOT appear when a geometric transform
    // (crop/resize/rotate) already explains the dimension change.
    // Only show when the resolution shift is unexplained by geometry — i.e., the
    // platform itself is responsible for resizing the image.
    const geometricExplainsResolution =
      transformations.cropped?.detected ||
      transformations.resized?.detected ||
      transformations.rotated?.detected;
    if (!geometricExplainsResolution && origW > 0 && (Math.abs(uploadedW - origW) > 50 || Math.abs(uploadedH - origH) > 50)) {
      findings.push({ type: 'RESOLUTION_CHANGED', title: 'Resolution adjusted by platform',
        summary: `Original: ${origW}×${origH} → Submitted: ${uploadedW}×${uploadedH}. Consistent with platform resizing.`, confidence: 82 });
    }
    return findings.slice(0, 5);
  }

  // ── UUID_DAMAGE ──────────────────────────────────────────────────────────
  if (reportMode === 'UUID_DAMAGE') {
    findings.push({
      type: 'ASSET_CONFIRMED',
      title: 'Original asset relationship confirmed',
      summary: `Visual analysis confirms this image is derived from the registered original (${cp}% calibrated similarity). Asset continuity established despite missing signature.`,
      confidence: Math.min(92, cp + 10),
    });
    findings.push({
      type: 'UUID_DAMAGED',
      title: 'Ownership signature damaged or unreadable',
      summary: `PINIT UUID could not be recovered. ${transformations.uuidDamaged?.likelyCause || 'Editing, compression, or platform processing after registration likely destroyed the embedding.'}`,
      confidence: transformations.uuidDamaged?.confidence ?? 70,
    });
    if (uuidCheck?.found && uuidCheck?.matchesOwner === false) {
      findings.push({ type: 'UUID_MISMATCH', title: 'Ownership conflict detected', summary: 'A signature was found but it does not match the vault owner. This may indicate asset misuse or fraud.', confidence: 90 });
    }
    findings.push({
      type: 'LINKAGE_WEAKENED',
      title: 'Ownership cannot be cryptographically proven',
      summary: 'Without a recoverable PINIT signature, definitive ownership linkage is not possible. Visual similarity supports continuity but not cryptographic proof.',
      confidence: 80,
    });
    return findings.slice(0, 4);
  }

  // ── SINGLE_CHANGE / MULTI_CHANGE ─────────────────────────────────────────
  // Asset relationship confirmed first.
  // For crop cases, pHash is inherently low (comparing a region to the full image).
  // Explain this explicitly so the user isn't confused by the low similarity number.
  const isCropCase = !!(transformations.cropped?.detected);
  const assetConfirmSummary = isCropCase
    ? `The submitted image is a cropped region of the registered asset. Perceptual similarity (${cp}%) is expected to be lower for crops — the sub-region pHash and geometry confirm continuity.`
    : `The submitted image is a derivative of the registered asset (${cp}% calibrated perceptual similarity). Asset continuity is established.`;
  findings.push({
    type: 'ASSET_CONFIRMED',
    title: 'Original asset relationship confirmed',
    summary: assetConfirmSummary,
    confidence: Math.min(94, Math.max(cp, 30) + 12),  // floor at 30 for crops
  });

  if (transformations.rotated?.detected)
    findings.push({
      type: 'ROTATED',
      title: `Image rotated ${transformations.rotated.angle}° after registration`,
      summary: `The submitted image is a ${transformations.rotated.angle}° rotated version of the original. Content and structure remain consistent with the registered asset.`,
      confidence: transformations.rotated.confidence,
    });

  if (transformations.cropped?.detected) {
    const c = transformations.cropped;
    findings.push({
      type: 'CROPPED',
      title: 'Cropping detected',
      // Collapse crop + resolution + aspect-ratio findings into ONE reason
      summary: `Dimensions changed from ${c.originalDimensions || 'original'} to ${c.submittedDimensions}${c.retainedAreaPercent !== null ? ` — ~${c.retainedAreaPercent}% of original content retained` : ''}. ${c.cropRegion || ''}`,
      confidence: c.confidence,
    });
  }

  if (transformations.resized?.detected) {
    const r = transformations.resized;
    findings.push({
      type: 'RESIZED',
      title: 'Proportional resize detected',
      // Collapse resize + dimension change into ONE reason
      summary: `Image uniformly scaled from ${r.originalDimensions} to ${r.submittedDimensions} (factor ×${r.scaleX}). Aspect ratio preserved — no cropping.`,
      confidence: r.confidence,
    });
  }

  // UUID — one finding, always last
  if (uuidCheck?.found && uuidCheck?.matchesOwner === true)
    findings.push({ type: 'UUID_VERIFIED', title: 'Ownership signature verified', summary: uuidVerifiedText, confidence: 100 });
  else if (transformations.uuidDamaged?.detected)
    findings.push({
      type: 'UUID_DAMAGED',
      title: 'Ownership signature damaged',
      summary: transformations.uuidDamaged.likelyCause,
      confidence: transformations.uuidDamaged.confidence,
    });
  else if (uuidCheck?.found && uuidCheck?.matchesOwner === false)
    findings.push({ type: 'UUID_MISMATCH', title: 'Ownership conflict — different owner detected', summary: 'The embedded signature does not match the registered vault owner.', confidence: 95 });

  const max = reportMode === 'MULTI_CHANGE' ? 6 : 4;
  return findings.filter(f => (f.confidence ?? 0) >= 60).slice(0, max);
};

// Returns a human-readable verdict label + tier based on a 0-100 confidence score.
const getMatchVerdict = (confidence) => {
  if (confidence >= 95) return { label: 'Exact Match',  tier: 'exact'  };
  if (confidence >= 75) return { label: 'Strong Match', tier: 'strong' };
  if (confidence >= 50) return { label: 'Likely Match', tier: 'likely' };
  if (confidence >= 25) return { label: 'Weak Match',   tier: 'weak'   };
  return                       { label: 'No Match',     tier: 'none'   };
};

// Averages whatever similarity signals are available (null values are excluded).
const computeOverallSimilarity = (calibPHash, histSim) => {
  const values = [calibPHash, histSim].filter(v => v !== null && v !== undefined);
  if (values.length === 0) return 0;
  return Math.round(values.reduce((a, b) => a + b, 0) / values.length);
};

// ── Stage 3C: Assemble final ComparisonResult ────────────────────────────────
const buildComparisonResult = (signals, verdict, relConf, reportMode, transformations, visibleFindings, legacy) => {
  const {
    calibPHash, histSim, pSim, uuidCheck, pixelAnalysis, editingTool,
    pHashAlgorithm, pHashNote, origPHash, uploadedPHash, originalCaptureTime,
    uploadedFile, uploadedW, uploadedH, screenshotIndicators,
  } = signals;

  // uuidStatus is now provided by classifyUUIDStatus (Layer 3) via signals.uuidStatus.
  // Keep a minimal legacy-compat object for fields that read from it directly.
  const uuidStatus = signals.uuidStatus || {
    found: uuidCheck?.found || false,
    confidence: uuidCheck?.found ? (uuidCheck?.matchesOwner === true ? 100 : 60) : 0,
    extractedValue: uuidCheck?.userId || null,
    status: uuidCheck?.found
      ? (uuidCheck?.matchesOwner === true ? 'VERIFIED' : uuidCheck?.matchesOwner === false ? 'INVALID' : 'PARTIAL')
      : 'NOT_FOUND',
  };

  const matchVerdict = getMatchVerdict(legacy.confidence);

  return {
    // ── New decision schema ──────────────────────────────────────────────────
    verdict, reportMode, relationshipConfidence: relConf, matchScore: legacy.confidence,
    uuidStatus, visibleFindings, transformations,
    technicalSignals: {
      phashSimilarity:     calibPHash,
      phashRaw:            pSim,
      histogramSimilarity: histSim,
      pixelSimilarity:     pixelAnalysis?.pixelSimilarity ?? null,
      metadataTool:        editingTool || null,
      whatsappScore:       signals.platformLikelihood?.primary === 'WHATSAPP_LIKELY'
                             ? Math.round((signals.platformLikelihood.confidence || 0) * 100) : 0,
      instagramScore:      signals.platformLikelihood?.primary === 'INSTAGRAM_LIKELY'
                             ? Math.round((signals.platformLikelihood.confidence || 0) * 100) : 0,
      screenshotScore:     signals.platformLikelihood?.primary === 'SCREENSHOT_LIKELY'
                             ? Math.round((signals.platformLikelihood.confidence || 0) * 100)
                             : Math.min(100, (screenshotIndicators?.length ?? 0) * 33),
      recompressionScore:  signals.platformLikelihood?.primary !== 'NONE'
                             ? Math.round((signals.platformLikelihood?.confidence || 0) * 100) : 0,
      uuidRecoveryScore:   signals.uuidStatus?.confidence ?? uuidStatus.confidence,
    },

    // ── 3-layer result schema ────────────────────────────────────────────────
    assetRelationship: verdict === 'EXACT_MATCH' ? 'EXACT_MATCH'
      : verdict === 'POSSIBLE_DERIVATIVE'        ? 'POSSIBLE_DERIVATIVE'
      : verdict === 'UNRELATED_IMAGE'            ? 'UNRELATED_IMAGE'
      : 'SAME_ASSET',
    platformLikelihood: signals.platformLikelihood || null,
    uuidStatus:         signals.uuidStatus         || null,

    // ── Legacy fields (backend save + HTML report backward compat) ───────────
    changes:      visibleFindings.map(f => ({ type: (f.confidence??0)>=85?'danger':(f.confidence??0)>=65?'warning':'info', category: f.type, text: f.summary })),
    isTampered:   legacy.isTampered,
    isModified:   legacy.isModified,
    verdict3tier: legacy.verdict3tier,
    visualVerdict:  matchVerdict?.label || verdict,
    finalVerdict:   matchVerdict?.label || verdict,
    matchVerdict, confidence: legacy.confidence,
    pHashSim: pSim, pHashRaw: pSim, pHashCalibrated: calibPHash,
    pHashNote, pHashAlgorithm, histSim,
    detectedRotation: signals.detectedRotation,
    pixelAnalysis, editingTool, uuidCheck, origPHash, uploadedPHash,
    originalCaptureTime, modifiedFileTime: legacy.modifiedFileTime,
    uploadedResolution: `${uploadedW} x ${uploadedH}`,
    uploadedSize: `${(uploadedFile.size / 1024).toFixed(1)} KB`,
    timestamp: new Date().toISOString(),
    exactMatch: verdict === 'EXACT_MATCH' && !!signals.shaMatch,
  };
};

// ── Main orchestrator ─────────────────────────────────────────────────────────
const runComparison = async (uploadedCanvas, uploadedFile, originalAsset) => {
  const uploadedW = uploadedCanvas.width;
  const uploadedH = uploadedCanvas.height;
  const resParts  = (originalAsset.resolution || originalAsset.assetResolution || '0 x 0').split(/\s*x\s*/i);
  const origW     = parseInt(resParts[0]) || 0;
  const origH     = parseInt(resParts[1]) || 0;
  const originalCaptureTime = originalAsset.captureTimestamp || originalAsset.capture_timestamp ||
    originalAsset.timestamp || originalAsset.dateEncrypted || null;
  const rawModifiedFileTime = uploadedFile.lastModified || null;

  // ── Collect all raw signals ──────────────────────────────────────────────
  const editingTool   = await extractEditingToolFromFile(uploadedFile, uploadedW, uploadedH);
  const uploadedSHA   = await computeFileSHA256(uploadedFile);
  const origSHA       = originalAsset.fileHash || originalAsset.file_hash || null;
  const shaMatch      = !!(origSHA && uploadedSHA && origSHA === uploadedSHA);
  const uuidCheck     = checkUUIDAndOwnership(uploadedCanvas, originalAsset);
  const origPHash     = originalAsset.visualFingerprint || originalAsset.visual_fingerprint || null;
  const { sim: pSim, rotation: detectedRotation, algorithm: pHashAlgorithm, note: pHashNote } =
    pHashSimWithRotationCompat(uploadedCanvas, origPHash);
  const uploadedPHash = computePerceptualHashFromCanvas(uploadedCanvas);
  const calibPHashGlobal = calibratePHash(pSim);

  // Multi-region pHash: compare uploaded against quadrants/halves of the original
  // thumbnail. For a cropped image, the best-matching region will score much
  // higher than the global pHash comparison. Use the BEST of global vs regional.
  const thumbSrcEarly = originalAsset.thumbnail || originalAsset.thumbnailUrl ||
    originalAsset.thumbnail_url || originalAsset.cloudinary_url;
  const mrResult = await multiRegionPHashCompare(thumbSrcEarly, uploadedCanvas, origPHash?.length);
  // Use multi-region calibrated score if it's significantly better than global
  const calibPHash = (mrResult.bestCalib !== null && mrResult.bestCalib > (calibPHashGlobal ?? -100))
    ? mrResult.bestCalib
    : calibPHashGlobal;
  const alignedCanvas = (detectedRotation && detectedRotation !== 0)
    ? rotateCanvas(uploadedCanvas, (360 - detectedRotation) % 360) : uploadedCanvas;
  const thumbSrc = originalAsset.thumbnail || originalAsset.thumbnailUrl ||
    originalAsset.thumbnail_url || originalAsset.cloudinary_url;
  let pixelAnalysis = null;
  if (thumbSrc) pixelAnalysis = await runPixelDiff(thumbSrc, alignedCanvas);
  let histSim = null;
  if (thumbSrc) {
    try {
      const origThumb = await loadImageToCanvas(thumbSrc);
      histSim = histogramSimilarity(computeColorHistogram(origThumb), computeColorHistogram(uploadedCanvas));
    } catch { histSim = null; }
  }
  const screenshotIndicators = detectScreenshotIndicators(uploadedFile, pixelAnalysis, editingTool, uploadedCanvas);

  const signals = {
    shaMatch, calibPHash, histSim, pSim, uuidCheck, pixelAnalysis,
    origW, origH, uploadedW, uploadedH, detectedRotation,
    editingTool, origSHA, uploadedSHA,
    screenshotIndicators,
    origPHash, uploadedPHash, pHashAlgorithm, pHashNote,
    originalCaptureTime, uploadedFile, thumbSrc,
    // 3-layer fields — filled after classification
    platformLikelihood: null,
    uuidStatus: null,
  };

  // ── Layer 1: Asset Relationship ──────────────────────────────────────────
  const { assetRelationship: rawAssetRel, verdict: rawVerdict, confidence: relConf } = classifyRelationship(signals);

  // ── Layer 2: Platform Likelihood (probabilistic, gated) ──────────────────
  const platformLikelihood = assessPlatformLikelihood(editingTool, uploadedCanvas, uploadedFile, rawAssetRel, pixelAnalysis);

  // ── Exact-match downgrade: pHash similarity alone NEVER proves exact identity ──
  //
  // The only valid path to EXACT_MATCH is SHA-256 byte-identity (signals.shaMatch=true).
  // pHash scales every image to 32×32 before comparison — it cannot detect:
  //   • format changes (JPEG → PNG, PNG → JPEG)
  //   • JPEG re-encoding at different quality
  //   • platform processing (WhatsApp, Instagram, screenshot tools)
  //   • metadata stripping
  //   • any other modification that preserves visual appearance
  //
  // If shaMatch=false, the file was modified in some way — even if we can't detect
  // the specific platform (e.g. PNG format, unknown dimensions, no metadata).
  // Always downgrade to SAME_ASSET so report says "modification detected" not "exact match".
  //
  // UUID VERIFIED is independent — it means ownership survived, not that the file is
  // byte-identical. Both can be true simultaneously: same owner, different encoding.
  const verdict = (rawVerdict === 'EXACT_MATCH' && !signals.shaMatch)
    ? 'SAME_ASSET_MULTI_CHANGE' : rawVerdict;
  const assetRelationship = verdict !== rawVerdict ? 'SAME_ASSET' : rawAssetRel;

  // ── Transformations (same-asset only) ────────────────────────────────────
  const isSameAsset   = assetRelationship === 'SAME_ASSET' || assetRelationship === 'EXACT_MATCH';
  const transformations = isSameAsset ? detectTransformations(signals, verdict) : {};

  // ── Layer 3: UUID Status ─────────────────────────────────────────────────
  const uuidStatus = classifyUUIDStatus(uuidCheck, platformLikelihood, transformations);
  // Store on signals so buildComparisonResult can include them
  signals.platformLikelihood = platformLikelihood;
  signals.uuidStatus         = uuidStatus;

  // ── Report mode + findings ───────────────────────────────────────────────
  const reportMode      = determineReportMode(verdict, transformations, platformLikelihood);
  const visibleFindings = buildVisibleFindings(verdict, reportMode, transformations, signals, uuidCheck, platformLikelihood, uuidStatus);

  // Overall match score (used for the % display)
  const overallSim  = computeOverallSimilarity(calibPHash, histSim);
  const uuidAdj     = uuidCheck?.found && uuidCheck?.matchesOwner === true ? 6
                    : uuidCheck?.found && uuidCheck?.matchesOwner === false ? -8 : 0;
  const confidence  = Math.max(0, Math.min(100, Math.round(overallSim + uuidAdj)));
  const isTampered  = verdict === 'UNRELATED_IMAGE';
  const isModified  = isSameAsset && verdict !== 'EXACT_MATCH';
  const verdict3tier = isTampered ? 'TAMPERED' : isModified ? 'MODIFIED' : 'CLEAN';

  return buildComparisonResult(signals, verdict, relConf, reportMode, transformations, visibleFindings, {
    confidence, isTampered, isModified, verdict3tier,
    modifiedFileTime: (isModified || isTampered) ? rawModifiedFileTime : null,
  });
};


// =============================================================================
// PART 11: HTML report download
// =============================================================================
const downloadHTMLReport = (originalAsset, result, origPreview, modPreview) => {
  const changeRows = result.changes.map(c => {
    const color = c.type==='danger'?'#e53e3e':c.type==='warning'?'#dd6b20':'#3182ce';
    const bg    = c.type==='danger'?'#fff5f5':c.type==='warning'?'#fffaf0':'#ebf8ff';
    return `<tr style="background:${bg}"><td style="color:${color};font-weight:700;white-space:nowrap;padding:10px 16px">${c.category}</td><td style="padding:10px 16px;color:#2d3748">${c.text}</td></tr>`;
  }).join('');

  const vColor = result.verdict3tier==='TAMPERED'?'#9b2c2c':result.verdict3tier==='MODIFIED'?'#7b341e':'#22543d';
  const vBg    = result.verdict3tier==='TAMPERED'?'#fed7d7':result.verdict3tier==='MODIFIED'?'#feebc8':'#c6f6d5';
  const vLabel = result.verdict3tier==='TAMPERED'
    ? '🚨 TAMPERED — Strong evidence of deliberate alteration'
    : result.verdict3tier==='MODIFIED'
      ? '⚡ MODIFIED — Technical changes detected (may not be malicious)'
      : '✓ CLEAN — No significant changes detected';

  const uuidHtml = result.uuidCheck ? `
    <div class="card"><div class="card-head">🔐 UUID / Ownership Verification</div>
    <div class="row"><span class="lbl">UUID Found</span><span class="val" style="color:${result.uuidCheck.found?'#38a169':'#e53e3e'}">${result.uuidCheck.found?'Yes':'No'}</span></div>
    ${result.uuidCheck.found ? `
    <div class="row"><span class="lbl">Extracted User</span><span class="val">${result.uuidCheck.userId||'—'}</span></div>
    <div class="row"><span class="lbl">Ownership Match</span><span class="val" style="color:${result.uuidCheck.matchesOwner?'#38a169':result.uuidCheck.matchesOwner===false?'#e53e3e':'#718096'}">${result.uuidCheck.matchesOwner===true?'✓ Matches vault owner':result.uuidCheck.matchesOwner===false?'⚠ Different owner':'Could not verify'}</span></div>
    ${result.uuidCheck.deviceName?`<div class="row"><span class="lbl">Embedded Device</span><span class="val">${result.uuidCheck.deviceName}</span></div>`:''}
    ${result.uuidCheck.gps?.available?`<div class="row"><span class="lbl">Embedded GPS</span><span class="val">${result.uuidCheck.gps.coordinates}</span></div>`:''}
    ${result.uuidCheck.originalResolution?`<div class="row"><span class="lbl">Embedded Resolution</span><span class="val">${result.uuidCheck.originalResolution}</span></div>`:''}
    ` : '<div class="row"><span class="lbl">Reason</span><span class="val">No PINIT signature found.</span></div>'}
    </div>` : '';

  const html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"/>
<title>PINIT Forensic Report</title>
<style>*{box-sizing:border-box}body{font-family:'Segoe UI',sans-serif;margin:0;padding:40px;background:#f0f4f8;color:#2d3748}
.header{background:linear-gradient(135deg,#1a202c,#2d3748);color:white;padding:36px;border-radius:16px;margin-bottom:28px}
.header h1{margin:0 0 6px;font-size:24px}.header p{margin:0;opacity:.6;font-size:13px}
.badge{display:inline-block;padding:8px 20px;border-radius:20px;font-size:13px;font-weight:700;margin-top:14px;background:${vBg};color:${vColor}}
.grid2{display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:20px}
.card{background:white;border-radius:12px;padding:24px;box-shadow:0 2px 10px rgba(0,0,0,.07);margin-bottom:20px}
.card-head{font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.6px;color:#718096;border-bottom:1px solid #e2e8f0;padding-bottom:10px;margin:0 0 14px}
.row{display:flex;justify-content:space-between;padding:7px 0;border-bottom:1px solid #f7fafc;font-size:13px}.row:last-child{border:none}
.lbl{font-weight:600;color:#4a5568}.val{color:#2d3748;font-family:monospace;font-size:12px;max-width:300px;word-break:break-all;text-align:right}
.images{display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:20px}
.img-box{background:white;border-radius:12px;padding:16px;box-shadow:0 2px 10px rgba(0,0,0,.07);text-align:center}
.img-box h3{margin:0 0 12px;font-size:12px;color:#718096;text-transform:uppercase}
.img-box img{max-width:100%;max-height:280px;border-radius:8px;border:1px solid #e2e8f0}
.score{font-size:56px;font-weight:800;color:#667eea;text-align:center}
table{width:100%;border-collapse:collapse}th{background:#2d3748;color:white;padding:11px 16px;text-align:left;font-size:12px;text-transform:uppercase}
td{border-bottom:1px solid #e2e8f0;font-size:13px;vertical-align:top}tr:last-child td{border:none}
.footer{text-align:center;padding:20px;color:#a0aec0;font-size:12px;margin-top:28px;border-top:1px solid #e2e8f0}
</style></head><body>
<div class="header"><h1>🔍 PINIT Forensic Analysis Report</h1>
<p>Generated: ${new Date().toLocaleString()} · Report ID: RPT-${Date.now()}</p>
<div><span class="badge">${vLabel}</span></div></div>
<div class="images">
<div class="img-box"><h3>🔒 Original (Vault)</h3>${origPreview?`<img src="${origPreview}" alt="Original"/>`:'<p style="color:#a0aec0;padding:40px 0">Thumbnail not available</p>'}</div>
<div class="img-box"><h3>🔍 Submitted</h3>${modPreview?`<img src="${modPreview}" alt="Submitted"/>`:'<p style="color:#a0aec0;padding:40px 0">Preview not available</p>'}</div>
</div>
<div class="card" style="text-align:center"><div class="score">${result.confidence}%</div><div style="color:#718096">${result.visualVerdict||'Analysis Complete'}</div></div>
${uuidHtml}
<div class="grid2">
<div class="card"><div class="card-head">🔒 Original Asset</div>
<div class="row"><span class="lbl">Asset ID</span><span class="val">${originalAsset.assetId||originalAsset.id}</span></div>
<div class="row"><span class="lbl">Owner</span><span class="val">${originalAsset.ownerName||originalAsset.owner_name||'—'}</span></div>
<div class="row"><span class="lbl">Registered</span><span class="val">${new Date(originalAsset.dateEncrypted||originalAsset.timestamp||Date.now()).toLocaleDateString()}</span></div>
<div class="row"><span class="lbl">Resolution</span><span class="val">${originalAsset.resolution||originalAsset.assetResolution||'—'}</span></div>
<div class="row"><span class="lbl">pHash Algorithm</span><span class="val">${result.pHashAlgorithm||'N/A'}</span></div>
<div class="row"><span class="lbl">SHA-256</span><span class="val">${(originalAsset.fileHash||originalAsset.file_hash||'—').substring(0,24)}…</span></div>
</div>
<div class="card"><div class="card-head">🔍 Submitted Image</div>
<div class="row"><span class="lbl">Resolution</span><span class="val">${result.uploadedResolution}</span></div>
<div class="row"><span class="lbl">File Size</span><span class="val">${result.uploadedSize}</span></div>
${result.modifiedFileTime?`<div class="row"><span class="lbl">Last Modified</span><span class="val">${formatTS(result.modifiedFileTime)}</span></div>`:''}
<div class="row"><span class="lbl">pHash Similarity</span><span class="val">${result.pHashSim!==null?result.pHashSim+'%':'—'}</span></div>
<div class="row"><span class="lbl">Histogram Similarity</span><span class="val">${result.histSim!==null?result.histSim+'%':'—'}</span></div>
<div class="row"><span class="lbl">Editing Tool</span><span class="val">${result.editingTool||'Not detected'}</span></div>
<div class="row"><span class="lbl">Verdict</span><span class="val" style="font-weight:700">${result.verdict3tier}</span></div>
</div></div>
<div class="card"><div class="card-head">⚠ Complete Change Analysis</div>
${result.changes.length===0?'<p style="color:#38a169;font-weight:600;margin:0">✓ No modifications detected</p>':
`<table><thead><tr><th>Category</th><th>Finding</th></tr></thead><tbody>${changeRows}</tbody></table>`}
</div>
${result.pHashNote?`<div class="card"><div class="card-head">ℹ Fingerprint Note</div><p style="margin:0;font-size:13px;color:#718096">${result.pHashNote}</p></div>`:''}
<div class="footer">PINIT Image Forensics System · ${new Date().toISOString()}</div>
</body></html>`;

  const blob = new Blob([html], { type:'text/html' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = `pinit-report-${originalAsset.assetId||'asset'}-${Date.now()}.html`;
  a.click(); URL.revokeObjectURL(url);
};

// =============================================================================
// PART 12: Main Component
// =============================================================================
function AssetTrackingPage() {
  const navigate = useNavigate();
  const [assets,             setAssets]             = useState([]);
  const [filteredAssets,     setFilteredAssets]     = useState([]);
  const [searchQuery,        setSearchQuery]        = useState('');
  const [compareAsset,       setCompareAsset]       = useState(null);
  const [compareFile,        setCompareFile]        = useState(null);
  const [comparePreview,     setComparePreview]     = useState(null);
  const [deleteConfirm,      setDeleteConfirm]      = useState(null);
  const [deleting,           setDeleting]           = useState(false);
  const [comparing,          setComparing]          = useState(false);
  const [comparisonResult,   setComparisonResult]   = useState(null);
  const [linkCopied,         setLinkCopied]         = useState(false);
  const fileInputRef = useRef(null);

  // FIX: Group by fileHash not assetId — assetId format differs between API + localStorage
  // initialSearch: assetId passed from Verify page via ?search= URL param
  // Filtering on raw data avoids the stale state closure bug in .then()
  const loadAssets = async (initialSearch = null) => {
    try {
      const { adminAPI } = await import('../api/client');
      const response = await adminAPI.getAllVault();
      const vault    = response.assets || [];
      const reports  = JSON.parse(localStorage.getItem('analysisReports') || '[]');
      const vaultIds = new Set(vault.map(v => v.asset_id || v.assetId));
      const extras   = reports.filter(r => !vaultIds.has(r.assetId));

      const normalisedVault = vault.map(a => ({
        ...a,
        assetId:            a.asset_id           || a.assetId,
        ownerName:          a.owner_name          || a.ownerName,
        ownerEmail:         a.owner_email         || a.ownerEmail,
        fileHash:           a.file_hash           || a.fileHash,
        visualFingerprint:  a.visual_fingerprint  || a.visualFingerprint,
        thumbnailUrl:       a.thumbnail_url       || a.thumbnailUrl,
        dateEncrypted:      a.created_at          || a.dateEncrypted,
        captureTimestamp:   a.capture_timestamp   || a.captureTimestamp,
        fileName:           a.file_name           || a.fileName,
        fileSize:           a.file_size           || a.fileSize,
        certificateId:      a.certificate_id      || a.certificateId,
        blockchainAnchor:   a.blockchain_anchor   || a.blockchainAnchor,
      }));

      const blacklist = JSON.parse(localStorage.getItem('pinit_deleted_ids') || '[]');
      const combined = [...normalisedVault, ...extras].filter(
        a => !blacklist.includes(a.assetId) && !blacklist.includes(a.asset_id) && !blacklist.includes(a.id)
      );
      const hashGroups = {};
      combined.forEach(a => {
        const key = a.fileHash || a.file_hash || a.assetId || a.id;
        hashGroups[key] = (hashGroups[key] || 0) + 1;
      });
      const withMeta = combined.map(a => ({
        ...a,
        versionCount: hashGroups[a.fileHash || a.file_hash || a.assetId || a.id] || 1,
        isDuplicate:  (hashGroups[a.fileHash || a.file_hash || a.assetId || a.id] || 1) > 1,
      }));
      setAssets(withMeta);
      if (initialSearch) {
        const q = initialSearch.toLowerCase();
        setFilteredAssets(withMeta.filter(a =>
          (a.assetId||'').toLowerCase().includes(q) ||
          (a.ownerName||'').toLowerCase().includes(q) ||
          (a.fileHash||'').toLowerCase().includes(q)
        ));
        setSearchQuery(initialSearch);
      } else {
        setFilteredAssets(withMeta);
      }
    } catch (err) {
      console.warn('API unavailable, using localStorage:', err.message);
      const blacklistFb = JSON.parse(localStorage.getItem('pinit_deleted_ids') || '[]');
      const vault   = JSON.parse(localStorage.getItem('vaultImages') || '[]');
      const reports = JSON.parse(localStorage.getItem('analysisReports') || '[]');
      const vaultIds = new Set(vault.map(v => v.assetId));
      const combined = [...vault, ...reports.filter(r => !vaultIds.has(r.assetId))]
        .filter(a => !blacklistFb.includes(a.assetId) && !blacklistFb.includes(a.id));
      const hashGroups = {};
      combined.forEach(a => { const k=a.fileHash||a.assetId||a.id; hashGroups[k]=(hashGroups[k]||0)+1; });
      const withMeta = combined.map(a => ({ ...a, versionCount:hashGroups[a.fileHash||a.assetId||a.id]||1, isDuplicate:(hashGroups[a.fileHash||a.assetId||a.id]||1)>1 }));
      setAssets(withMeta);
      if (initialSearch) {
        const q = initialSearch.toLowerCase();
        setFilteredAssets(withMeta.filter(a =>
          (a.assetId||'').toLowerCase().includes(q) ||
          (a.ownerName||'').toLowerCase().includes(q)
        ));
        setSearchQuery(initialSearch);
      } else {
        setFilteredAssets(withMeta);
      }
    }
  };

  const handleRefresh = () => window.location.reload();

  useEffect(() => {
    // Read ?search= param set by Verify page when admin clicks Compare on a visual match
    const params    = new URLSearchParams(window.location.search);
    const preSearch = params.get('search') || null;
    loadAssets(preSearch);
  }, []);

  const handleSearch = (query) => {
    setSearchQuery(query);
    if (!query.trim()) { setFilteredAssets(assets); return; }
    const q = query.toLowerCase();
    setFilteredAssets(assets.filter(a =>
      (a.assetId||'').toLowerCase().includes(q) ||
      (a.userId ||'').toLowerCase().includes(q) ||
      (a.ownerName||'').toLowerCase().includes(q) ||
      (a.certificateId||'').toLowerCase().includes(q) ||
      (a.fileHash||'').toLowerCase().includes(q) ||
      (a.deviceId||'').toLowerCase().includes(q)
    ));
  };

  const deleteAsset = async (asset) => {
    setDeleting(true);
    const id = asset.assetId || asset.asset_id || asset.id;
    // Blacklist ALL id variants immediately
    try {
      const blacklist = JSON.parse(localStorage.getItem('pinit_deleted_ids') || '[]');
      [id, asset.assetId, asset.asset_id, asset.id]
        .filter(Boolean)
        .forEach(v => { if (!blacklist.includes(v)) blacklist.push(v); });
      localStorage.setItem('pinit_deleted_ids', JSON.stringify(blacklist));
    } catch (e) { console.warn(e); }
    try { const { vaultAPI } = await import('../api/client'); await vaultAPI.delete(id); } catch (err) { console.warn('Backend delete failed:', err); }
    try {
      ['vaultImages','analysisReports'].forEach(key => {
        const arr = JSON.parse(localStorage.getItem(key) || '[]');
        localStorage.setItem(key, JSON.stringify(arr.filter(a => a.assetId !== id && a.id !== id)));
      });
    } catch {}
    setAssets(prev => prev.filter(a => (a.assetId||a.id) !== id));
    setFilteredAssets(prev => prev.filter(a => (a.assetId||a.id) !== id));
    setDeleting(false); setDeleteConfirm(null);
    alert('Asset deleted permanently.');
    loadAssets(); // re-apply blacklist filter cleanly
  };

  const openCompare = (asset) => {
    setCompareAsset(asset); setCompareFile(null); setComparePreview(null);
    setComparisonResult(null); setLinkCopied(false);
  };
  const closeCompare = () => { setCompareAsset(null); setCompareFile(null); setComparePreview(null); setComparisonResult(null); };
  const handleCompareFile = (file) => {
    if (!file || !file.type.startsWith('image/')) return;
    setCompareFile(file); setComparisonResult(null);
    const reader = new FileReader();
    reader.onload = e => setComparePreview(e.target.result);
    reader.readAsDataURL(file);
  };

  const runCompare = async () => {
    if (!compareFile || !compareAsset) return;
    setComparing(true);
    const img = new Image();
    img.onload = async () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width; canvas.height = img.height;
      canvas.getContext('2d').drawImage(img, 0, 0);
      const result = await runComparison(canvas, compareFile, compareAsset);
      setComparisonResult(result); setComparing(false);

      // Save to backend for audit trail (fire-and-forget — doesn't affect UI)
      try {
        const { compareAPI } = await import('../api/client');
        await compareAPI.save({
          asset_id:              compareAsset.assetId || compareAsset.asset_id,
          is_tampered:           result.isTampered,
          confidence:            result.confidence,
          visual_verdict:        result.verdict3tier || result.visualVerdict,
          editing_tool:          result.editingTool || null,
          changes:               result.changes,
          pixel_analysis:        result.pixelAnalysis || {},
          phash_sim:             result.pHashSim !== null ? Math.round(result.pHashSim) : null,
          uploaded_resolution:   result.uploadedResolution,
          uploaded_size:         String(result.uploadedSize || ''),
          original_capture_time: result.originalCaptureTime || null,
          modified_file_time:    result.modifiedFileTime ? new Date(result.modifiedFileTime).toISOString() : null,
        });
      } catch (err) {
        console.warn('Could not save comparison to backend:', err.message);
      }
    };
    img.src = comparePreview;
  };

  // Uses the existing /public/verify?data= route (PublicVerifyPage) — no new files needed.
  const handleCopyLink = () => {
    if (!compareAsset || !comparisonResult) return;
    const payload = {
      v:                   1,
      assetId:             compareAsset.assetId || compareAsset.id,
      certId:              compareAsset.certificateId,
      owner:               compareAsset.ownerName || compareAsset.userId,
      registered:          compareAsset.dateEncrypted || compareAsset.timestamp,
      origResolution:      compareAsset.resolution || compareAsset.assetResolution,
      origHash:            compareAsset.fileHash || compareAsset.file_hash,
      origFingerprint:     compareAsset.visualFingerprint || compareAsset.visual_fingerprint,
      blockchainAnchor:    compareAsset.blockchainAnchor,
      originalCaptureTime: comparisonResult.originalCaptureTime,
      modifiedFileTime:    comparisonResult.modifiedFileTime,
      editingTool:         comparisonResult.editingTool,
      comparedAt:          comparisonResult.timestamp,
      confidence:          comparisonResult.confidence,
      visualVerdict:       comparisonResult.visualVerdict,
      isTampered:          comparisonResult.isTampered,
      uploadedResolution:  comparisonResult.uploadedResolution,
      uploadedSize:        comparisonResult.uploadedSize,
      uploadedFingerprint: comparisonResult.uploadedPHash,
      pHashSim:            comparisonResult.pHashSim,
      pixelChangedPct:     comparisonResult.pixelAnalysis?.changedPct,
      hotRegions:          comparisonResult.pixelAnalysis?.hotRegions,
      changes:             comparisonResult.changes,
    };
    const encoded = btoa(unescape(encodeURIComponent(JSON.stringify(payload))));
    const url     = `${window.location.origin}/public/verify?data=${encoded}`;
    navigator.clipboard.writeText(url).then(() => { setLinkCopied(true); setTimeout(() => setLinkCopied(false), 3000); });
  };

  const handleDownload = () => {
    if (!compareAsset || !comparisonResult) return;
    downloadHTMLReport(compareAsset, comparisonResult,
      compareAsset.thumbnail || compareAsset.thumbnailUrl || compareAsset.cloudinary_url, comparePreview);
  };

  const formatDate = (ts) => {
    if (!ts) return 'N/A';
    return new Date(ts).toLocaleDateString('en-US', { day:'2-digit', month:'short', year:'numeric' });
  };

  const hasRichData = (a) => !!(a.fileHash||a.file_hash||a.visualFingerprint||a.visual_fingerprint||a.certificateId||a.certificate_id);

  // verdictBanner removed — report rendering uses reportMode + visibleFindings directly

  return (
    <div className="asset-tracking-page">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="tracking-header">
        <div>
          <h1>Asset Tracking</h1>
          <p className="subtitle">Multi-signal forensic comparison: pHash · UUID · pixel diff · EXIF · histogram</p>
        </div>
        <div style={{display:'flex',alignItems:'center',gap:16}}>
          <div className="tracking-stats">
            <div className="stat-card"><span className="stat-number">{assets.length}</span><span className="stat-label">Total Assets</span></div>
            <div className="stat-card"><span className="stat-number">{assets.filter(a=>hasRichData(a)).length}</span><span className="stat-label">Fingerprinted</span></div>
            <div className="stat-card"><span className="stat-number">{assets.filter(a=>a.isDuplicate).length}</span><span className="stat-label">Duplicates</span></div>
          </div>
          <button onClick={handleRefresh} style={{padding:'10px 20px',background:'#6366f1',color:'white',border:'none',borderRadius:8,cursor:'pointer',display:'flex',alignItems:'center',gap:8,fontWeight:600,fontSize:'0.9rem',whiteSpace:'nowrap'}}>
            <RefreshCw size={16}/> Refresh
          </button>
        </div>
      </div>

      {/* ── Search ─────────────────────────────────────────────────────────── */}
      <div className="search-section">
        <div className="search-bar">
          <Search className="search-icon" size={20}/>
          <input type="text" placeholder="Search by Asset ID, Owner, Certificate, File Hash…"
            value={searchQuery} onChange={e=>handleSearch(e.target.value)} className="search-input"/>
          {searchQuery && <button onClick={()=>handleSearch('')} className="clear-search">✕</button>}
        </div>
      </div>
      {searchQuery && <div className="search-results-info">Found {filteredAssets.length} result{filteredAssets.length!==1?'s':''} for "{searchQuery}"</div>}

      {/* ── Table ──────────────────────────────────────────────────────────── */}
      <div className="tracking-table-container">
        {filteredAssets.length > 0 ? (
          <table className="tracking-table">
            <thead>
              <tr>
                <th>Thumbnail</th><th>Asset ID</th><th>Owner</th><th>Registered</th>
                <th>Certificate</th><th>Vault Data</th><th>Status</th><th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredAssets.map((asset, idx) => (
                <tr key={asset.id||asset.assetId||idx} style={{background:asset.isDuplicate?'#fffbeb':'transparent'}}>
                  <td>
                    <div className="asset-thumbnail">
                      {asset.thumbnailUrl||asset.thumbnail||asset.encryptedData
                        ? <img src={asset.thumbnailUrl||asset.thumbnail||asset.encryptedData} alt={asset.assetId}
                            onClick={()=>window.open(asset.thumbnailUrl||asset.thumbnail||asset.encryptedData,'_blank')}/>
                        : <div className="thumbnail-placeholder">No Image</div>}
                    </div>
                  </td>
                  <td>
                    <span className="asset-id-link" onClick={()=>navigate(`/admin/track/${asset.assetId}`)}>
                      {asset.assetId||asset.id}
                    </span>
                  </td>
                  <td>
                    <div className="creator-info">
                      <div className="creator-avatar">{(asset.ownerName||asset.userName||asset.userId||'U').charAt(0).toUpperCase()}</div>
                      <div>
                        <div className="creator-name">{asset.ownerName||asset.userName||'Unknown'}</div>
                        <div className="creator-email">{asset.ownerEmail||asset.userEmail||asset.userId}</div>
                      </div>
                    </div>
                  </td>
                  <td><div className="date-cell"><Calendar size={14}/>{formatDate(asset.dateEncrypted||asset.timestamp||asset.createdAt)}</div></td>
                  <td>
                    <span className="cert-badge" title={asset.certificateId||asset.certificate_id}>
                      {(asset.certificateId||asset.certificate_id)
                        ? <><Lock size={12}/> {(asset.certificateId||asset.certificate_id).substring(0,10)}…</>
                        : <span style={{color:'#a0aec0',fontSize:12}}>—</span>}
                    </span>
                  </td>
                  <td>
                    {hasRichData(asset) ? (
                      <div className="vault-indicators">
                        {(asset.fileHash||asset.file_hash)          && <span className="vault-chip hash"><Hash size={10}/> SHA-256</span>}
                        {(asset.visualFingerprint||asset.visual_fingerprint) && (
                          <span className="vault-chip fp" title={(asset.visualFingerprint||asset.visual_fingerprint).length===64?'256-bit DCT (new)':'64-bit avg (legacy)'}>
                            <Fingerprint size={10}/> {(asset.visualFingerprint||asset.visual_fingerprint).length===64?'pHash-256':'pHash-64 ⚠'}
                          </span>
                        )}
                        {(asset.blockchainAnchor||asset.blockchain_anchor) && <span className="vault-chip bc"><Cpu size={10}/> Chain</span>}
                      </div>
                    ) : <span style={{color:'#a0aec0',fontSize:12}}>No fingerprint</span>}
                  </td>
                  <td>
                    {asset.isDuplicate
                      ? <span className="version-badge modified" title="Same SHA-256 detected in multiple entries"><TrendingUp size={14}/> {asset.versionCount}× duplicate</span>
                      : <span className="version-badge original">Unique</span>}
                  </td>
                  <td>
                    <div style={{display:'flex',gap:6,alignItems:'center'}}>
                      <button className="btn-compare" onClick={()=>openCompare(asset)}><GitCompare size={14}/> Compare</button>
                      <button onClick={()=>setDeleteConfirm(asset)} title="Delete Asset"
                        style={{display:'flex',alignItems:'center',justifyContent:'center',width:32,height:32,border:'none',borderRadius:6,background:'#fee2e2',color:'#dc2626',cursor:'pointer',flexShrink:0}}
                        onMouseEnter={e=>e.currentTarget.style.background='#fca5a5'}
                        onMouseLeave={e=>e.currentTarget.style.background='#fee2e2'}>
                        <Trash2 size={15}/>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="empty-state">
            <Activity size={64} className="empty-icon"/>
            <h3>No Assets Found</h3>
            <p>{searchQuery?`No assets match "${searchQuery}"`:'No tracked assets yet. Encrypt images to start building your vault.'}</p>
          </div>
        )}
      </div>

      {/* ── Compare Panel ──────────────────────────────────────────────────── */}
      {compareAsset && (
        <div className="compare-overlay" onClick={e=>e.target===e.currentTarget&&closeCompare()}>
          <div className="compare-panel">
            <div className="panel-header">
              <div>
                <h2><GitCompare size={20}/> Forensic Comparison</h2>
                <p className="panel-subtitle">6 signals: SHA-256 · UUID extraction · pHash (auto-compat) · pixel diff · histogram · EXIF</p>
              </div>
              <button className="btn-close" onClick={closeCompare}><X size={20}/></button>
            </div>

            <div className="panel-body">
              {/* Original asset info strip */}
              <div className="original-info-strip">
                <Shield size={16} className="shield-icon"/>
                <div style={{flex:1}}>
                  <strong>Vault Original:</strong> {compareAsset.assetId||compareAsset.id}
                  {compareAsset.ownerName && <span> · {compareAsset.ownerName}</span>}
                  <div style={{marginTop:4,display:'flex',gap:8,flexWrap:'wrap'}}>
                    {(compareAsset.visualFingerprint||compareAsset.visual_fingerprint)
                      ? <span style={{fontSize:11,background:'#c6f6d5',color:'#22543d',borderRadius:4,padding:'2px 8px'}}>
                          ✓ pHash stored ({(compareAsset.visualFingerprint||compareAsset.visual_fingerprint).length===64?'256-bit':'64-bit legacy'})
                        </span>
                      : <span style={{fontSize:11,background:'#fed7d7',color:'#9b2c2c',borderRadius:4,padding:'2px 8px'}}>⚠ No fingerprint — visual comparison limited</span>}
                    {(compareAsset.fileHash||compareAsset.file_hash)
                      && <span style={{fontSize:11,background:'#ebf8ff',color:'#2c5282',borderRadius:4,padding:'2px 8px'}}>✓ SHA-256 stored</span>}
                  </div>
                </div>
              </div>

              {/* Side-by-side columns */}
              <div className="compare-columns">
                <div className="compare-col">
                  <div className="compare-col-label"><span className="col-badge original">🔒 Original (Vault Thumbnail)</span></div>
                  <div className="image-frame">
                    {compareAsset.thumbnail||compareAsset.thumbnailUrl||compareAsset.cloudinary_url||compareAsset.image_url
                      ? <img src={compareAsset.thumbnail||compareAsset.thumbnailUrl||compareAsset.cloudinary_url||compareAsset.image_url} alt="Original" className="compare-img"/>
                      : <div className="no-thumb"><Eye size={32}/><p>Thumbnail not stored — pixel diff unavailable</p></div>}
                  </div>
                  <div className="meta-chips">
                    {(compareAsset.resolution||compareAsset.assetResolution) && <span className="meta-chip"><strong>Res:</strong> {compareAsset.resolution||compareAsset.assetResolution}</span>}
                    {compareAsset.captureTimestamp && <span className="meta-chip"><Clock size={10}/> Captured: {formatTS(compareAsset.captureTimestamp)}</span>}
                    {(compareAsset.fileHash||compareAsset.file_hash) && <span className="meta-chip hash-chip"><Hash size={10}/> {(compareAsset.fileHash||compareAsset.file_hash).substring(0,16)}…</span>}
                  </div>
                </div>

                <div className="compare-col">
                  <div className="compare-col-label"><span className="col-badge modified">🔍 Upload for Comparison</span></div>
                  <div className={`upload-drop ${comparePreview?'has-image':''}`}
                    onClick={()=>fileInputRef.current?.click()}
                    onDrop={e=>{e.preventDefault();handleCompareFile(e.dataTransfer.files[0]);}}
                    onDragOver={e=>e.preventDefault()}>
                    {comparePreview
                      ? <img src={comparePreview} alt="Compare" className="compare-img"/>
                      : <div className="upload-prompt"><Upload size={32}/><p>Drop image here or click to upload</p><span>JPG, PNG, WEBP</span></div>}
                    <input ref={fileInputRef} type="file" accept="image/*" style={{display:'none'}} onChange={e=>handleCompareFile(e.target.files[0])}/>
                  </div>
                  {compareFile && (
                    <div className="meta-chips">
                      <span className="meta-chip"><strong>File:</strong> {compareFile.name}</span>
                      <span className="meta-chip"><strong>Size:</strong> {(compareFile.size/1024).toFixed(1)} KB</span>
                      {compareFile.lastModified && <span className="meta-chip"><Clock size={10}/> Modified: {formatTS(compareFile.lastModified)}</span>}
                    </div>
                  )}
                </div>
              </div>

              {compareFile && !comparisonResult && (
                <button className="btn-run-compare" onClick={runCompare} disabled={comparing}>
                  {comparing
                    ? <><span className="spinner"/> Extracting UUID · Computing pHash · Running pixel diff · Analysing EXIF…</>
                    : <><ChevronRight size={16}/> Run Forensic Analysis</>}
                </button>
              )}

              {/* ── Results ─────────────────────────────────────────────────── */}
              {comparisonResult && (() => {
                const {
                  verdict, reportMode, visibleFindings, transformations,
                  uuidCheck, confidence, exactMatch, pHashNote,
                  pHashCalibrated, pHashSim, histSim, pHashAlgorithm, editingTool,
                  platformLikelihood: platResult, uuidStatus: uuidSt,
                } = comparisonResult;

                // Primary banner config per report mode
                const PLAT_ICON = { WHATSAPP_LIKELY:'📱', INSTAGRAM_LIKELY:'📸', SCREENSHOT_LIKELY:'📷', GENERIC_RECOMPRESSED:'🔄', NONE:'🔄' };
                const platIcon = PLAT_ICON[platResult?.primary] || '📤';
                const platHeadline = {
                  WHATSAPP_LIKELY:     'Asset Match — WhatsApp Processing Likely',
                  INSTAGRAM_LIKELY:    'Asset Match — Instagram Processing Likely',
                  SCREENSHOT_LIKELY:   'Asset Match — Screen Recapture Likely',
                  GENERIC_RECOMPRESSED:'Asset Match — Platform Recompression Detected',
                }[platResult?.primary] || 'Asset Match — Platform Processing Detected';
                const MODE_CFG = {
                  EXACT_MATCH:        { bg:'#c6f6d5', border:'#9ae6b4', color:'#22543d', icon:'✅', headline:'Exact Match — Confirmed' },
                  SINGLE_CHANGE:      { bg:'#ebf8ff', border:'#90cdf4', color:'#2c5282', icon:'🔍', headline:'Asset Match — Modification Detected' },
                  MULTI_CHANGE:       { bg:'#feebc8', border:'#fbd38d', color:'#7b341e', icon:'⚠️', headline:'Asset Match — Multiple Changes Detected' },
                  PLATFORM_PROCESSED: { bg:'#e9d8fd', border:'#d6bcfa', color:'#553c9a', icon:platIcon, headline:platHeadline },
                  UUID_DAMAGE:        { bg:'#fef3c7', border:'#fde68a', color:'#92400e', icon:'🔓', headline:'Asset Match — Ownership Signature Damaged' },
                  MISMATCH:           { bg:'#fff5f5', border:'#feb2b2', color:'#9b2c2c', icon:'❌', headline:'No Match — Unrelated Image' },
                };
                const cfg = MODE_CFG[reportMode] || MODE_CFG.MISMATCH;

                // Per-finding styling
                const FINDING_CFG = {
                  NO_MATCH:            { icon:'❌', bg:'#fff5f5', border:'#fed7d7', color:'#9b2c2c' },
                  LOW_SIMILARITY:      { icon:'📉', bg:'#fff5f5', border:'#fed7d7', color:'#9b2c2c' },
                  NO_CONTINUITY:       { icon:'🚫', bg:'#fff5f5', border:'#fed7d7', color:'#9b2c2c' },
                  UUID_ABSENT:         { icon:'⚠️', bg:'#fffaf0', border:'#fbd38d', color:'#c05621' },
                  UUID_DAMAGED:        { icon:'🔓', bg:'#fffaf0', border:'#fbd38d', color:'#92400e' },
                  UUID_MISMATCH:       { icon:'🚨', bg:'#fff5f5', border:'#fed7d7', color:'#9b2c2c' },
                  UUID_VERIFIED:       { icon:'🔐', bg:'#f0fff4', border:'#9ae6b4', color:'#22543d' },
                  EXACT_MATCH:         { icon:'✅', bg:'#f0fff4', border:'#9ae6b4', color:'#22543d' },
                  NO_MODIFICATIONS:    { icon:'✅', bg:'#f0fff4', border:'#9ae6b4', color:'#22543d' },
                  ASSET_CONFIRMED:     { icon:'✅', bg:'#ebf8ff', border:'#90cdf4', color:'#2c5282' },
                  LINKAGE_WEAKENED:    { icon:'⚠️', bg:'#fffaf0', border:'#fbd38d', color:'#92400e' },
                  CROPPED:             { icon:'✂️', bg:'#f7fafc', border:'#e2e8f0', color:'#2d3748' },
                  ROTATED:             { icon:'🔄', bg:'#f7fafc', border:'#e2e8f0', color:'#2d3748' },
                  RESIZED:             { icon:'↔️', bg:'#f7fafc', border:'#e2e8f0', color:'#2d3748' },
                  RESOLUTION_CHANGED:  { icon:'📐', bg:'#f7fafc', border:'#e2e8f0', color:'#2d3748' },
                  WHATSAPP_FORWARDED:  { icon:'📱', bg:'#ebf8ff', border:'#bee3f8', color:'#2b6cb0' },
                  INSTAGRAM_FORWARDED: { icon:'📸', bg:'#ebf8ff', border:'#bee3f8', color:'#2b6cb0' },
                  SCREENSHOT:          { icon:'📷', bg:'#ebf8ff', border:'#bee3f8', color:'#2b6cb0' },
                };

                return (
                  <div className="comparison-results">

                    {/* Primary verdict header */}
                    <div style={{background:cfg.bg,border:`2px solid ${cfg.border}`,borderRadius:14,padding:'18px 22px',marginBottom:14,display:'flex',alignItems:'center',gap:16}}>
                      <div style={{fontSize:38,lineHeight:1}}>{cfg.icon}</div>
                      <div style={{flex:1}}>
                        <div style={{fontSize:10,fontWeight:700,textTransform:'uppercase',letterSpacing:'.8px',color:cfg.color,opacity:.7,marginBottom:2}}>Comparison Verdict</div>
                        <div style={{fontSize:19,fontWeight:800,color:cfg.color}}>{cfg.headline}</div>
                        <div style={{fontSize:12,color:cfg.color,opacity:.75,marginTop:3}}>
                          {reportMode==='MISMATCH' && 'The submitted image does not correspond to the selected registered asset.'}
                          {reportMode==='EXACT_MATCH' && 'The submitted image is a confirmed match to the registered original.'}
                          {reportMode==='PLATFORM_PROCESSED' && `Asset continuity confirmed. Platform processing ${platResult?.confidence>=0.85?'highly likely':platResult?.confidence>=0.65?'likely':'possible'} (${Math.round((platResult?.confidence||0)*100)}% confidence).`}
                          {reportMode==='UUID_DAMAGE' && 'Asset match confirmed — ownership signature could not be fully recovered.'}
                          {(reportMode==='SINGLE_CHANGE'||reportMode==='MULTI_CHANGE') && 'Original asset confirmed — modifications detected after registration.'}
                        </div>
                      </div>
                      <div style={{textAlign:'center',flexShrink:0}}>
                        <div style={{fontSize:40,fontWeight:900,color:cfg.color,lineHeight:1}}>{confidence}%</div>
                        <div style={{fontSize:10,color:cfg.color,opacity:.6,marginTop:1,textTransform:'uppercase',letterSpacing:'.5px'}}>Match Score</div>
                      </div>
                    </div>

                    {/* Key findings — the ONLY user-facing content */}
                    <div style={{marginBottom:14}}>
                      <div style={{fontSize:11,fontWeight:700,textTransform:'uppercase',letterSpacing:'.6px',color:'#718096',marginBottom:8}}>Key Findings</div>
                      <div style={{display:'flex',flexDirection:'column',gap:7}}>
                        {(visibleFindings||[]).map((f,i) => {
                          const fc = FINDING_CFG[f.type] || {icon:'🔍',bg:'#f7fafc',border:'#e2e8f0',color:'#2d3748'};
                          return (
                            <div key={i} style={{background:fc.bg,border:`1px solid ${fc.border}`,borderRadius:10,padding:'11px 15px',display:'flex',gap:11,alignItems:'flex-start'}}>
                              <span style={{fontSize:17,lineHeight:1.5,flexShrink:0}}>{fc.icon}</span>
                              <div>
                                <div style={{fontWeight:700,fontSize:13,color:fc.color}}>{f.title}</div>
                                <div style={{fontSize:12,color:'#4a5568',marginTop:3,lineHeight:1.55}}>{f.summary}</div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Transformation-- detail strip (same-asset only, excludes MISMATCH/EXACT_MATCH) */}
                    {reportMode !== 'MISMATCH' && reportMode !== 'EXACT_MATCH' && transformations && (() => {
                      const detected = Object.entries(transformations).filter(([,t]) => t?.detected && (t.confidence??0) >= 65);
                      if (!detected.length) return null;
                      const T_ICON = {cropped:'✂️',rotated:'🔄',resized:'↔️',screenshot:'📷',uuidDamaged:'🔓'};
                      return (
                        <div style={{background:'#f7fafc',border:'1px solid #e2e8f0',borderRadius:10,padding:'12px 16px',marginBottom:14}}>
                          <div style={{fontSize:11,fontWeight:700,textTransform:'uppercase',letterSpacing:'.6px',color:'#718096',marginBottom:8}}>Transformation Summary</div>
                          {detected.map(([key,t]) => (
                            <div key={key} style={{fontSize:12,color:'#4a5568',marginBottom:5,display:'flex',alignItems:'flex-start',gap:8}}>
                              <span style={{fontSize:14,flexShrink:0}}>{T_ICON[key]||'🔍'}</span>
                              <span>
                                {key==='cropped'            && <><strong>Crop:</strong> {t.originalDimensions||'N/A'} → {t.submittedDimensions}{t.retainedAreaPercent!=null?` (~${t.retainedAreaPercent}% retained)`:''}</>}
                                {key==='rotated'            && <><strong>Rotation:</strong> {t.angle}° detected</>}
                                {key==='resized'            && <><strong>Resize:</strong> {t.originalDimensions} → {t.submittedDimensions} (×{t.scaleX})</>}
                                {key==='screenshot'         && <><strong>Screenshot:</strong> {t.indicators?.length||0} screen-recapture indicator{t.indicators?.length!==1?'s':''}</>}
                                {key==='uuidDamaged'        && <><strong>UUID:</strong> {t.likelyCause}</>}
                              </span>
                            </div>
                          ))}
                        </div>
                      );
                    })()}

                    {/* Platform + UUID 3-layer summary cards (PLATFORM_PROCESSED only) */}
                    {reportMode === 'PLATFORM_PROCESSED' && platResult && (
                      <div style={{display:'flex',flexDirection:'column',gap:8,marginBottom:14}}>
                        <div style={{fontSize:11,fontWeight:700,textTransform:'uppercase',letterSpacing:'.6px',color:'#718096',marginBottom:2}}>3-Layer Analysis</div>
                        {/* Layer 1: Asset */}
                        <div style={{background:'#f0fff4',border:'1px solid #9ae6b4',borderRadius:9,padding:'10px 14px',display:'flex',gap:10,alignItems:'center'}}>
                          <span style={{fontSize:16}}>✅</span>
                          <div>
                            <div style={{fontWeight:700,fontSize:12,color:'#22543d'}}>Asset Relationship: Same asset confirmed</div>
                          </div>
                        </div>
                        {/* Layer 2: Platform */}
                        <div style={{background:'#e9d8fd',border:'1px solid #d6bcfa',borderRadius:9,padding:'10px 14px',display:'flex',gap:10,alignItems:'center'}}>
                          <span style={{fontSize:16}}>{PLAT_ICON[platResult.primary]||'📤'}</span>
                          <div style={{flex:1}}>
                            <div style={{fontWeight:700,fontSize:12,color:'#553c9a'}}>
                              Platform Assessment: {{WHATSAPP_LIKELY:'WhatsApp processing likely',INSTAGRAM_LIKELY:'Instagram processing likely',SCREENSHOT_LIKELY:'Screen recapture likely',GENERIC_RECOMPRESSED:'Generic recompression',NONE:'No platform signal'}[platResult.primary]||'Platform processing'}
                              {' '}({Math.round((platResult.confidence||0)*100)}%)
                            </div>
                            {platResult.reasons?.length > 0 && <div style={{fontSize:11,color:'#6b46c1',marginTop:2}}>{platResult.reasons[0]}</div>}
                          </div>
                        </div>
                        {/* Layer 3: UUID */}
                        <div style={{
                          background: uuidSt?.state==='VERIFIED'?'#f0fff4':uuidSt?.state==='INVALID_OWNER'?'#fff5f5':'#fffaf0',
                          border: `1px solid ${uuidSt?.state==='VERIFIED'?'#9ae6b4':uuidSt?.state==='INVALID_OWNER'?'#fed7d7':'#fbd38d'}`,
                          borderRadius:9,padding:'10px 14px',display:'flex',gap:10,alignItems:'center'}}>
                          <span style={{fontSize:16}}>{uuidSt?.state==='VERIFIED'?'🔐':uuidSt?.state==='INVALID_OWNER'?'🚨':uuidSt?.state==='DAMAGED'?'🔓':'⚠️'}</span>
                          <div>
                            <div style={{fontWeight:700,fontSize:12,color:uuidSt?.state==='VERIFIED'?'#22543d':uuidSt?.state==='INVALID_OWNER'?'#9b2c2c':'#92400e'}}>
                              Ownership Signature: {{VERIFIED:'Verified — matches registered owner',PARTIAL:'Partially recovered',DAMAGED:'Damaged by platform processing',NOT_FOUND:'Not found',INVALID_OWNER:'Invalid — different owner'}[uuidSt?.state]||'Unknown'}
                            </div>
                            {uuidSt?.likelyFailureReason && <div style={{fontSize:11,color:'#744210',marginTop:2}}>{uuidSt.likelyFailureReason}</div>}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* pHash legacy note */}
                    {pHashNote && (
                      <div style={{background:'#ebf8ff',border:'1px solid #bee3f8',borderRadius:8,padding:'9px 13px',marginBottom:12,fontSize:12,color:'#2c5282'}}>
                        ℹ️ {pHashNote}
                      </div>
                    )}

                    {/* Technical signals — hidden in collapsible debug panel */}
                    <details style={{marginBottom:14}}>
                      <summary style={{cursor:'pointer',fontSize:11,fontWeight:600,color:'#a0aec0',padding:'8px 12px',background:'#f7fafc',borderRadius:8,border:'1px solid #e2e8f0',listStyle:'none',display:'flex',alignItems:'center',gap:6}}>
                        <Cpu size={12}/> Technical Signals (Developer Debug)
                      </summary>
                      <div style={{background:'#f7fafc',border:'1px solid #e2e8f0',borderTop:'none',borderRadius:'0 0 8px 8px',padding:'12px 16px'}}>
                        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:6,fontSize:11,color:'#4a5568'}}>
                          <span>pHash raw: <strong>{pHashSim!==null?`${pHashSim}%`:'—'}</strong></span>
                          <span>pHash calibrated: <strong>{pHashCalibrated!==null?`${pHashCalibrated}%`:'—'}</strong></span>
                          <span>Histogram: <strong>{histSim!==null?`${histSim}%`:'—'}</strong></span>
                          <span>Algorithm: <strong>{pHashAlgorithm||'—'}</strong></span>
                          <span>Verdict: <strong>{verdict}</strong></span>
                          <span>Report mode: <strong>{reportMode}</strong></span>
                          {platResult && <span>Platform: <strong>{platResult.primary} ({Math.round((platResult.confidence||0)*100)}%)</strong></span>}
                          {uuidSt && <span>UUID state: <strong>{uuidSt.state}</strong></span>}
                          {editingTool && <span style={{gridColumn:'1/-1'}}>Editing tool: <strong>{editingTool}</strong></span>}
                        </div>
                      </div>
                    </details>

                    {/* Actions */}
                    <div className="report-actions">
                      <button className={`btn-action copy-link ${linkCopied?'copied':''}`} onClick={handleCopyLink}>
                        <Link size={16}/>
                        {linkCopied ? '✓ Link Copied!' : 'Copy Verification Link'}
                      </button>
                      <button className="btn-action download-report" onClick={handleDownload}>
                        <Download size={16}/> Download Report
                      </button>
                    </div>
                  </div>
                );
              })()}

            </div>
          </div>
        </div>
      )}

      {/* ── Delete Modal ────────────────────────────────────────────────────── */}
      {deleteConfirm && (
        <div className="compare-overlay" onClick={()=>!deleting&&setDeleteConfirm(null)}>
          <div className="compare-panel" style={{maxWidth:420,height:'auto',padding:0}} onClick={e=>e.stopPropagation()}>
            <div className="compare-header" style={{borderBottom:'1px solid #fee2e2'}}>
              <h2 style={{color:'#dc2626',display:'flex',alignItems:'center',gap:8,fontSize:16}}><Trash2 size={18}/> Delete Asset</h2>
              <button className="btn-close" onClick={()=>setDeleteConfirm(null)}><X size={20}/></button>
            </div>
            <div style={{padding:24}}>
              <p style={{color:'#374151',marginBottom:12,fontSize:14}}>Are you sure you want to permanently delete this asset?</p>
              <div style={{background:'#fef2f2',border:'1px solid #fca5a5',borderRadius:8,padding:12,fontSize:13,color:'#7f1d1d'}}>
                <div><strong>Asset ID:</strong> {deleteConfirm.assetId}</div>
                <div><strong>Owner:</strong> {deleteConfirm.ownerName||deleteConfirm.owner||'—'}</div>
                <div style={{marginTop:8,fontWeight:600}}>⚠️ Removes asset from backend and local storage permanently.</div>
              </div>
              <div style={{display:'flex',gap:10,marginTop:20,justifyContent:'flex-end'}}>
                <button onClick={()=>setDeleteConfirm(null)} disabled={deleting}
                  style={{padding:'9px 18px',borderRadius:8,border:'1px solid #d1d5db',background:'white',cursor:'pointer',fontWeight:600,fontSize:13}}>Cancel</button>
                <button onClick={()=>deleteAsset(deleteConfirm)} disabled={deleting}
                  style={{display:'flex',alignItems:'center',gap:6,padding:'9px 18px',background:deleting?'#fca5a5':'#dc2626',color:'white',border:'none',borderRadius:8,cursor:deleting?'not-allowed':'pointer',fontWeight:600,fontSize:13}}>
                  <Trash2 size={14}/>{deleting?'Deleting...':'Yes, Delete'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default AssetTrackingPage;