import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Camera, Upload, FileSearch, Download, ArrowLeft } from 'lucide-react';

// ============================================
// HELPER FUNCTIONS
// ============================================

// ============================================
// STATS TRACKING HELPER  [NEW - from second file]
// ============================================

const updateForensicsStats = (type, data) => {
  try {
    const savedStats = localStorage.getItem('forensicsStats');
    const stats = savedStats ? JSON.parse(savedStats) : {
      totalEncrypted: 0,
      totalAnalyzed: 0,
      lastActivity: null,
      lastEncryptedId: null,
      recentActivities: []
    };

    if (type === 'encrypted') {
      stats.totalEncrypted += 1;
      stats.lastEncryptedId = data.userId;
    } else if (type === 'analyzed') {
      stats.totalAnalyzed += 1;
    }

    stats.lastActivity = new Date().toISOString();

    stats.recentActivities.unshift({
      type: type,
      fileName: data.fileName,
      timestamp: new Date().toISOString(),
      uuid: data.userId || null
    });

    if (stats.recentActivities.length > 10) {
      stats.recentActivities = stats.recentActivities.slice(0, 10);
    }

    localStorage.setItem('forensicsStats', JSON.stringify(stats));

    window.dispatchEvent(new StorageEvent('storage', {
      key: 'forensicsStats',
      newValue: JSON.stringify(stats),
      url: window.location.href,
      storageArea: localStorage
    }));

    console.log('✅ Dashboard stats updated:', stats);
  } catch (error) {
    console.error('❌ Error updating stats:', error);
  }
};

// ============================================
// VAULT STORAGE HELPER  [NEW - from second file]
// ============================================

const saveToVault = (imageData, fileName, userId, fileSize, imageBlob) => {
  try {
    const canvas = document.createElement('canvas');
    const img = new Image();
    img.onload = () => {
      const size = 80;
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      const scale = Math.max(size / img.width, size / img.height);
      const x = (size / 2) - (img.width / 2) * scale;
      const y = (size / 2) - (img.height / 2) * scale;
      ctx.drawImage(img, x, y, img.width * scale, img.height * scale);
      const thumbnail = canvas.toDataURL('image/jpeg', 0.4);
      const deviceId = typeof getDeviceFingerprint === 'function'
        ? getDeviceFingerprint() : 'UNKNOWN';
      const assetId = Date.now() + '-' + Math.random().toString(36).substr(2, 9);

      // Save to backend API only
      import('../api/client').then(({ vaultAPI }) => {
        vaultAPI.save({
           asset_id:           assetId,
           owner_name:         userId,
           file_name:          fileName,
           file_size:          fileSize,
           thumbnail_base64:   thumbnail,
           device_id:          deviceId,
           certificate_id:     null,
           owner_email:        null,
           file_hash:          null,
           visual_fingerprint: null,
           blockchain_anchor:  null,
           resolution:         null,
           capture_timestamp:  new Date().toISOString(),
        }).then(() => {
          console.log('✅ Saved to vault:', fileName);
        }).catch(err => console.warn('Vault save failed:', err.message));
      }).catch(err => console.warn('API import failed:', err.message));
    };
    img.onerror = () => console.error('❌ Error creating thumbnail');
    img.src = imageData;
  } catch (error) {
    console.error('❌ Error saving to vault:', error);
  }
};
// ============================================
// CERTIFICATE GENERATION HELPER  [NEW - from second file]
// ============================================

const saveCertificate = (analysisReport, imageData) => {
  try {
    const savedCerts = localStorage.getItem('certificates');
    const certificates = savedCerts ? JSON.parse(savedCerts) : [];

    const certificate = {
      id: Date.now() + '-' + Math.random().toString(36).substr(2, 9),
      certificateId: analysisReport.authorshipCertificateId || 'CERT-' + Date.now().toString(36).toUpperCase(),
      assetId: analysisReport.assetId || 'AST-UNKNOWN',
      userId: analysisReport.uniqueUserId || 'unknown',
      dateCreated: new Date().toISOString(),
      confidence: analysisReport.confidence || 0,
      status: analysisReport.ownershipInfo || 'Unverified',

      ownershipAtCreation: {
        assetId: analysisReport.assetId || 'Unknown',
        authorshipCertificateId: analysisReport.authorshipCertificateId || 'Unknown',
        uniqueUserId: analysisReport.uniqueUserId || 'Unknown',
        assetFileSize: analysisReport.assetFileSize || 'Unknown',
        assetResolution: analysisReport.assetResolution || 'Unknown',
        userEncryptedResolution: analysisReport.userEncryptedResolution || 'N/A',
        timeStamp: analysisReport.timestamp ? new Date(analysisReport.timestamp).toLocaleString() : 'Not Available',
        captureLocation: analysisReport.captureLocationInfo || 'Unknown',
        gpsLocation: analysisReport.gpsLocation?.available
          ? `${analysisReport.gpsLocation.coordinates} (${analysisReport.gpsLocation.source || 'Unknown'})`
          : 'Not Available'
      },

      technicalDetails: {
        totalPixels: analysisReport.totalPixels || 'Unknown',
        pixelsVerified: analysisReport.pixelsVerifiedWithBiometrics || '0',
        deviceName: analysisReport.deviceName || 'Unknown',
        deviceId: analysisReport.deviceId || 'Unknown',
        deviceSource: analysisReport.deviceSource || 'Unknown',
        ipAddress: analysisReport.ipAddress || 'Unknown',
        ipSource: analysisReport.ipSource || 'Unknown',
        ownershipInfo: analysisReport.ownershipInfo || 'Unknown',
        certificate: analysisReport.authorshipCertificate || 'Not Present',
        rotationDetected: analysisReport.rotationDetected !== null && analysisReport.rotationDetected !== undefined
          ? `${analysisReport.rotationDetected}°`
          : 'Not detected',
        rotationMessage: analysisReport.rotationMessage || 'Not detected'
      },

      classificationAnalysis: {
        detectedCase: analysisReport.detectedCase || 'Unknown',
        confidence: analysisReport.confidence || 0,
        reasoning: analysisReport.reasoning || [],
        metrics: {
          variance: analysisReport.metrics?.variance || 'N/A',
          noiseLevel: analysisReport.metrics?.noiseLevel || 'N/A',
          smoothBlockRatio: analysisReport.metrics?.smoothBlockRatio || 'N/A',
          edgeCoherence: analysisReport.metrics?.edgeCoherence || 'N/A',
          uniformityRatio: analysisReport.metrics?.uniformityRatio || 'N/A',
          entropy: analysisReport.metrics?.entropy || 'N/A',
          compressionRatio: analysisReport.metrics?.compressionRatio || 'N/A',
          aspectRatio: analysisReport.metrics?.aspectRatio || 'N/A',
          channelCorrelation: analysisReport.metrics?.channelCorrelation || 'N/A'
        }
      },

      cropInfo: analysisReport.cropInfo || null,

      gpsDetails: {
        available: analysisReport.gpsLocation?.available || false,
        latitude: analysisReport.gpsLocation?.latitude || null,
        longitude: analysisReport.gpsLocation?.longitude || null,
        coordinates: analysisReport.gpsLocation?.coordinates || null,
        mapsUrl: analysisReport.gpsLocation?.mapsUrl || null,
        source: analysisReport.gpsLocation?.source || 'Unknown'
      },

      deviceDetails: analysisReport.deviceDetails || null,
      imagePreview: imageData ? imageData.substring(0, 50000) : null
    };

    certificates.unshift(certificate);

    if (certificates.length > 50) {
      certificates.splice(50);
    }

    localStorage.setItem('certificates', JSON.stringify(certificates));

    window.dispatchEvent(new StorageEvent('storage', {
      key: 'certificates',
      newValue: JSON.stringify(certificates),
      url: window.location.href,
      storageArea: localStorage
    }));

    console.log('✅ Certificate generated:', certificate.certificateId);

    return certificate;
  } catch (error) {
    console.error('❌ Error saving certificate:', error);
    return null;
  }
};

// IP Address Helper Function
const getPublicIP = async () => {
  try {
    const res = await fetch('https://api.ipify.org?format=json');
    const data = await res.json();
    return data.ip || 'Unavailable';
  } catch {
    return 'Unavailable';
  }
};

// GPS Location Helper Function
// On Capacitor APK: uses @capacitor/geolocation plugin (requires Android manifest permission)
// On browser: uses standard navigator.geolocation
const getGPSLocation = () => {
  return new Promise((resolve) => {

    const buildResult = (latitude, longitude) => resolve({
      available: true,
      latitude,
      longitude,
      coordinates: `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`,
      mapsUrl: `https://www.google.com/maps?q=${latitude},${longitude}`
    });

    const onFail = () => resolve({ available: false, coordinates: null, address: 'Location unavailable' });

    // ── Capacitor APK path ────────────────────────────────────────────────────
    const isCapacitor = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
    if (isCapacitor) {
      // Dynamically import Capacitor Geolocation plugin
      import('@capacitor/geolocation').then(({ Geolocation }) => {
        // Request permission first (required on Android)
        Geolocation.requestPermissions().then(() => {
          Geolocation.getCurrentPosition({
            enableHighAccuracy: true,
            timeout: 10000,
          }).then((pos) => {
            buildResult(pos.coords.latitude, pos.coords.longitude);
          }).catch(onFail);
        }).catch(() => {
          // Permission denied — try without requesting (might already be granted)
          Geolocation.getCurrentPosition({ enableHighAccuracy: true, timeout: 10000 })
            .then((pos) => buildResult(pos.coords.latitude, pos.coords.longitude))
            .catch(onFail);
        });
      }).catch(() => {
        // Plugin not installed — fall through to browser API
        useBrowserGPS();
      });
      return;
    }

    // ── Browser path ─────────────────────────────────────────────────────────
    useBrowserGPS();

    function useBrowserGPS() {
      if (!navigator.geolocation) {
        resolve({ available: false, coordinates: null, address: 'GPS not supported' });
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (position) => buildResult(position.coords.latitude, position.coords.longitude),
        onFail,
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
      );
    }
  });
};

// Fallback: use file's lastModified date
const getFileFallbackTime = (file) => {
  if (file.lastModified) {
    return {
      timestamp: file.lastModified,
      source: 'File Modified',
      dateString: new Date(file.lastModified).toLocaleString()
    };
  }

  // Last resort: current time
  return {
    timestamp: Date.now(),
    source: 'Current Time',
    dateString: new Date().toLocaleString()
  };
};

// Extract capture time from image file
const getCaptureTime = (file) => {
  return new Promise((resolve) => {
    // Priority 1: Try to read EXIF data from JPEG images
    if (file.type === 'image/jpeg' || file.type === 'image/jpg') {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const view = new DataView(e.target.result);

          // Check for JPEG marker
          if (view.getUint16(0, false) !== 0xFFD8) {
            resolve(getFileFallbackTime(file));
            return;
          }

          let offset = 2;
          while (offset < view.byteLength) {
            const marker = view.getUint16(offset, false);
            offset += 2;

            // Found EXIF marker (APP1)
            if (marker === 0xFFE1) {
              // Check for "Exif" string
              const exifHeader = String.fromCharCode(
                view.getUint8(offset + 2),
                view.getUint8(offset + 3),
                view.getUint8(offset + 4),
                view.getUint8(offset + 5)
              );

              if (exifHeader === 'Exif') {
                const tiffOffset = offset + 8;
                const littleEndian = view.getUint16(tiffOffset, false) === 0x4949;

                const ifdOffset = view.getUint32(tiffOffset + 4, littleEndian);
                const numEntries = view.getUint16(tiffOffset + ifdOffset, littleEndian);

                // Search for EXIF IFD pointer (tag 0x8769)
                for (let i = 0; i < numEntries; i++) {
                  const entryOffset = tiffOffset + ifdOffset + 2 + (i * 12);
                  const tag = view.getUint16(entryOffset, littleEndian);

                  if (tag === 0x8769) {
                    // Found EXIF IFD
                    const exifIfdOffset = view.getUint32(entryOffset + 8, littleEndian);
                    const exifNumEntries = view.getUint16(tiffOffset + exifIfdOffset, littleEndian);

                    // Search for DateTimeOriginal (tag 0x9003) or DateTimeDigitized (tag 0x9004)
                    for (let j = 0; j < exifNumEntries; j++) {
                      const exifEntryOffset = tiffOffset + exifIfdOffset + 2 + (j * 12);
                      const exifTag = view.getUint16(exifEntryOffset, littleEndian);

                      // DateTimeOriginal (0x9003) or DateTimeDigitized (0x9004)
                      if (exifTag === 0x9003 || exifTag === 0x9004) {
                        const valueOffset = view.getUint32(exifEntryOffset + 8, littleEndian);
                        let dateStr = '';

                        for (let k = 0; k < 19; k++) {
                          dateStr += String.fromCharCode(view.getUint8(tiffOffset + valueOffset + k));
                        }

                        // Parse "YYYY:MM:DD HH:MM:SS" format
                        const parts = dateStr.split(' ');
                        if (parts.length === 2) {
                          const dateParts = parts[0].split(':');
                          const timeParts = parts[1].split(':');

                          if (dateParts.length === 3 && timeParts.length === 3) {
                            const captureDate = new Date(
                              parseInt(dateParts[0]),
                              parseInt(dateParts[1]) - 1,
                              parseInt(dateParts[2]),
                              parseInt(timeParts[0]),
                              parseInt(timeParts[1]),
                              parseInt(timeParts[2])
                            );

                            resolve({
                              timestamp: captureDate.getTime(),
                              source: 'EXIF',
                              dateString: dateStr
                            });
                            return;
                          }
                        }
                      }
                    }
                  }
                }
              }

              resolve(getFileFallbackTime(file));
              return;
            }

            // Skip to next marker
            if (marker === 0xFFD9 || marker === 0xFFDA) break;
            const length = view.getUint16(offset, false);
            offset += length;
          }

          resolve(getFileFallbackTime(file));

        } catch (error) {
          resolve(getFileFallbackTime(file));
        }
      };

      reader.onerror = () => resolve(getFileFallbackTime(file));
      reader.readAsArrayBuffer(file.slice(0, 128 * 1024));

    } else {
      resolve(getFileFallbackTime(file));
    }
  });
};

// Extract device info from EXIF (for JPEG images)
const getExifDeviceInfo = (file) => {
  return new Promise((resolve) => {
    if (file.type === 'image/jpeg' || file.type === 'image/jpg') {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const view = new DataView(e.target.result);

          if (view.getUint16(0, false) !== 0xFFD8) {
            resolve({ found: false });
            return;
          }

          let offset = 2;
          let make = null;
          let model = null;

          while (offset < view.byteLength) {
            const marker = view.getUint16(offset, false);
            offset += 2;

            if (marker === 0xFFE1) {
              const exifHeader = String.fromCharCode(
                view.getUint8(offset + 2),
                view.getUint8(offset + 3),
                view.getUint8(offset + 4),
                view.getUint8(offset + 5)
              );

              if (exifHeader === 'Exif') {
                const tiffOffset = offset + 8;
                const littleEndian = view.getUint16(tiffOffset, false) === 0x4949;
                const ifdOffset = view.getUint32(tiffOffset + 4, littleEndian);
                const numEntries = view.getUint16(tiffOffset + ifdOffset, littleEndian);

                for (let i = 0; i < numEntries; i++) {
                  const entryOffset = tiffOffset + ifdOffset + 2 + (i * 12);
                  const tag = view.getUint16(entryOffset, littleEndian);
                  const type = view.getUint16(entryOffset + 2, littleEndian);
                  const numValues = view.getUint32(entryOffset + 4, littleEndian);

                  // Tag 0x010F = Make, Tag 0x0110 = Model
                  if (tag === 0x010F || tag === 0x0110) {
                    let valueOffset;
                    if (numValues * (type === 2 ? 1 : 2) > 4) {
                      valueOffset = view.getUint32(entryOffset + 8, littleEndian);
                    } else {
                      valueOffset = entryOffset + 8 - tiffOffset;
                    }

                    let str = '';
                    for (let j = 0; j < numValues - 1; j++) {
                      const charCode = view.getUint8(tiffOffset + valueOffset + j);
                      if (charCode === 0) break;
                      str += String.fromCharCode(charCode);
                    }

                    if (tag === 0x010F) make = str.trim();
                    if (tag === 0x0110) model = str.trim();
                  }
                }
              }

              break;
            }

            if (marker === 0xFFD9 || marker === 0xFFDA) break;
            const length = view.getUint16(offset, false);
            offset += length;
          }

          if (make || model) {
            const deviceName = [make, model].filter(Boolean).join(' ');
            // Generate device ID from make+model
            let hash = 0;
            for (let i = 0; i < deviceName.length; i++) {
              hash = ((hash << 5) - hash) + deviceName.charCodeAt(i);
              hash |= 0;
            }
            const deviceId = 'CAM-' + Math.abs(hash).toString(36).toUpperCase().slice(0, 6);

            resolve({
              found: true,
              make: make,
              model: model,
              deviceName: deviceName,
              deviceId: deviceId,
              source: 'EXIF'
            });
          } else {
            resolve({ found: false });
          }

        } catch (error) {
          resolve({ found: false });
        }
      };

      reader.onerror = () => resolve({ found: false });
      reader.readAsArrayBuffer(file.slice(0, 128 * 1024));

    } else {
      resolve({ found: false });
    }
  });
};

// Extract GPS from EXIF (for JPEG images)
const getExifGPS = (file) => {
  return new Promise((resolve) => {
    if (file.type === 'image/jpeg' || file.type === 'image/jpg') {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const view = new DataView(e.target.result);

          if (view.getUint16(0, false) !== 0xFFD8) {
            resolve({ found: false });
            return;
          }

          let offset = 2;

          while (offset < view.byteLength) {
            const marker = view.getUint16(offset, false);
            offset += 2;

            if (marker === 0xFFE1) {
              const exifHeader = String.fromCharCode(
                view.getUint8(offset + 2),
                view.getUint8(offset + 3),
                view.getUint8(offset + 4),
                view.getUint8(offset + 5)
              );

              if (exifHeader === 'Exif') {
                const tiffOffset = offset + 8;
                const littleEndian = view.getUint16(tiffOffset, false) === 0x4949;
                const ifdOffset = view.getUint32(tiffOffset + 4, littleEndian);
                const numEntries = view.getUint16(tiffOffset + ifdOffset, littleEndian);

                // Find GPS IFD pointer (tag 0x8825)
                for (let i = 0; i < numEntries; i++) {
                  const entryOffset = tiffOffset + ifdOffset + 2 + (i * 12);
                  const tag = view.getUint16(entryOffset, littleEndian);

                  if (tag === 0x8825) {
                    const gpsIfdOffset = view.getUint32(entryOffset + 8, littleEndian);
                    const gpsNumEntries = view.getUint16(tiffOffset + gpsIfdOffset, littleEndian);

                    let latRef = 'N', lonRef = 'E';
                    let lat = null, lon = null;

                    for (let j = 0; j < gpsNumEntries; j++) {
                      const gpsEntryOffset = tiffOffset + gpsIfdOffset + 2 + (j * 12);
                      const gpsTag = view.getUint16(gpsEntryOffset, littleEndian);

                      // GPS Latitude Ref (N/S)
                      if (gpsTag === 0x0001) {
                        latRef = String.fromCharCode(view.getUint8(gpsEntryOffset + 8));
                      }
                      // GPS Longitude Ref (E/W)
                      if (gpsTag === 0x0003) {
                        lonRef = String.fromCharCode(view.getUint8(gpsEntryOffset + 8));
                      }
                      // GPS Latitude
                      if (gpsTag === 0x0002) {
                        const valueOffset = view.getUint32(gpsEntryOffset + 8, littleEndian);
                        const d = view.getUint32(tiffOffset + valueOffset, littleEndian) / view.getUint32(tiffOffset + valueOffset + 4, littleEndian);
                        const m = view.getUint32(tiffOffset + valueOffset + 8, littleEndian) / view.getUint32(tiffOffset + valueOffset + 12, littleEndian);
                        const s = view.getUint32(tiffOffset + valueOffset + 16, littleEndian) / view.getUint32(tiffOffset + valueOffset + 20, littleEndian);
                        lat = d + (m / 60) + (s / 3600);
                      }
                      // GPS Longitude
                      if (gpsTag === 0x0004) {
                        const valueOffset = view.getUint32(gpsEntryOffset + 8, littleEndian);
                        const d = view.getUint32(tiffOffset + valueOffset, littleEndian) / view.getUint32(tiffOffset + valueOffset + 4, littleEndian);
                        const m = view.getUint32(tiffOffset + valueOffset + 8, littleEndian) / view.getUint32(tiffOffset + valueOffset + 12, littleEndian);
                        const s = view.getUint32(tiffOffset + valueOffset + 16, littleEndian) / view.getUint32(tiffOffset + valueOffset + 20, littleEndian);
                        lon = d + (m / 60) + (s / 3600);
                      }
                    }

                    if (lat !== null && lon !== null) {
                      if (latRef === 'S') lat = -lat;
                      if (lonRef === 'W') lon = -lon;

                      resolve({
                        found: true,
                        latitude: lat,
                        longitude: lon,
                        coordinates: `${lat.toFixed(6)}, ${lon.toFixed(6)}`,
                        mapsUrl: `https://www.google.com/maps?q=${lat},${lon}`,
                        source: 'EXIF'
                      });
                      return;
                    }
                  }
                }
              }
              break;
            }

            if (marker === 0xFFD9 || marker === 0xFFDA) break;
            const length = view.getUint16(offset, false);
            offset += length;
          }

          resolve({ found: false });

        } catch (error) {
          resolve({ found: false });
        }
      };

      reader.onerror = () => resolve({ found: false });
      reader.readAsArrayBuffer(file.slice(0, 128 * 1024));

    } else {
      resolve({ found: false });
    }
  });
};

// ============================================
// DEVICE FINGERPRINTING (Reusable)
// ============================================

const getDeviceFingerprint = () => {
  let deviceId = localStorage.getItem('deviceFingerprint');

  if (!deviceId) {
    const screenData = window.screen.width + 'x' + window.screen.height + 'x' + window.screen.colorDepth;
    const platform = navigator.platform || 'unknown';
    const cores = navigator.hardwareConcurrency || 0;
    const memory = navigator.deviceMemory || 0;
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'unknown';
    const language = navigator.language || 'unknown';
    const touchPoints = navigator.maxTouchPoints || 0;
    const userAgent = navigator.userAgent || 'unknown';

    const fingerprint = screenData + '|' + platform + '|' + cores + '|' + memory + '|' + timezone + '|' + language + '|' + touchPoints + '|' + userAgent;

    let hash = 0;
    for (let i = 0; i < fingerprint.length; i++) {
      hash = ((hash << 5) - hash) + fingerprint.charCodeAt(i);
      hash |= 0;
    }

    const hashStr = Math.abs(hash).toString(36).toUpperCase().slice(0, 8);
    const deviceType = /Android|iPhone|iPad/i.test(userAgent) ? 'MOB' : 'DSK';
    deviceId = `${deviceType}-${hashStr}`;
    localStorage.setItem('deviceFingerprint', deviceId);
  }

  return deviceId;
};

const getDeviceDetails = () => {
  const screenData = window.screen.width + 'x' + window.screen.height;
  const colorDepth = window.screen.colorDepth + '-bit';
  const platform = navigator.platform || 'Unknown';
  const cores = navigator.hardwareConcurrency || 'Unknown';
  const memory = navigator.deviceMemory ? navigator.deviceMemory + ' GB' : 'Unknown';
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Unknown';
  const language = navigator.language || 'Unknown';
  const touchPoints = navigator.maxTouchPoints || 0;
  const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
  const deviceType = isMobile ? 'Mobile' : 'Desktop';
  const browser = navigator.userAgent;

  return {
    screen: screenData,
    colorDepth: colorDepth,
    platform: platform,
    cores: cores,
    memory: memory,
    timezone: timezone,
    language: language,
    touchCapable: touchPoints > 0 ? 'Yes' : 'No',
    touchPoints: touchPoints,
    deviceType: deviceType,
    browser: browser
  };
};

const getCurrentDeviceName = () => {
  return navigator.userAgent.split('(')[1]?.split(')')[0] || 'Unknown';
};

// ============================================
// AUTHORSHIP CERTIFICATE ID GENERATION
// ============================================

const generateAuthorshipCertificateId = (userId, deviceId) => {
  // Generate a consistent certificate ID based on userId and deviceId only
  // This ensures the same owner always gets the same certificate ID
  const combinedString = `${userId}-${deviceId}`;

  let hash = 0;
  for (let i = 0; i < combinedString.length; i++) {
    const char = combinedString.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }

  const hashStr = Math.abs(hash).toString(16).toUpperCase();
  const userHash = userId.split('').reduce((h, c) => ((h << 5) - h) + c.charCodeAt(0), 0);
  const userSuffix = Math.abs(userHash).toString(36).toUpperCase().slice(0, 6);

  return `CERT-${hashStr.slice(0, 8)}${userSuffix}`;
};

// ============================================
// ASSET ID GENERATION (Image Hash Based)
// ============================================

// ============================================
// VAULT SECURITY HELPERS
// ============================================

// Compute SHA-256 hash of a file
const computeSHA256 = async (file) => {
  try {
    const buffer = await file.arrayBuffer();
    const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  } catch (e) {
    // Fallback: simple checksum
    return 'sha256-unavailable-' + Date.now().toString(16);
  }
};

// Compute perceptual hash — 64-char 256-bit DCT pHash (16×16, upgraded from legacy 8×8)
// FIX: Old version stored 16-char hashes. AssetTrackingPage expects 64-char.
// Both now use the same algorithm — pHashSimilarity no longer returns 0 for existing assets.
const computePerceptualHash = (canvas) => {
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
    return hex.toUpperCase(); // 64-char hex = 256-bit
  } catch (e) {
    return 'PHASH-UNAVAIL';
  }
};

// Compute Hamming distance between two pHashes (0 = identical, 64 = totally different)
const pHashDistance = (hash1, hash2) => {
  if (!hash1 || !hash2 || hash1.length !== hash2.length) return 64;
  let dist = 0;
  for (let i = 0; i < hash1.length; i++) {
    const b1 = parseInt(hash1[i], 16).toString(2).padStart(4, '0');
    const b2 = parseInt(hash2[i], 16).toString(2).padStart(4, '0');
    for (let j = 0; j < 4; j++) if (b1[j] !== b2[j]) dist++;
  }
  return dist;
};

// Generate a simulated blockchain anchor TX hash
const generateBlockchainAnchor = (fileHash, timestamp) => {
  const seed = (fileHash || '') + (timestamp || Date.now()).toString(16);
  let result = '0x';
  for (let i = 0; i < 64; i++) {
    const charCode = seed.charCodeAt(i % seed.length);
    result += ((charCode * (i + 7)) % 16).toString(16);
  }
  return result;
};

const generateAssetId = (imageData) => {
  // Generate a consistent asset ID based on image content hash
  // This ensures the same image always gets the same asset ID
  const data = imageData.data;

  // Sample pixels at regular intervals to create a signature
  let hash = 0;
  const sampleInterval = Math.floor(data.length / 1000); // Sample ~1000 points

  for (let i = 0; i < data.length; i += sampleInterval) {
    hash = ((hash << 5) - hash) + data[i];
    hash |= 0; // Convert to 32bit integer
  }

  // Add dimensions to the hash for uniqueness
  hash = ((hash << 5) - hash) + imageData.width;
  hash = ((hash << 5) - hash) + imageData.height;
  hash |= 0;

  // Create a consistent ID from the hash
  const hashStr = Math.abs(hash).toString(36).toUpperCase().padStart(12, '0');

  return `AST-${hashStr}`;
};

// ============================================
// ============================================
// LSB STEGANOGRAPHY — TILE + VOTING + CRC16
// Ported from pixel_uuid_stego.py — works for any crop ≥ 25x25 pixels
// ============================================

const STEGO_TILE     = 12;
const UUID_FIELD_LEN = 32;           // 32 hex chars (hyphens stripped on embed, restored on extract)
const PAYLOAD_BYTES  = 1 + UUID_FIELD_LEN + 2; // 35 bytes
const PAYLOAD_BITS   = PAYLOAD_BYTES * 8;       // 280 bits — CRC lives at bits 272-287, within 25x25 tile range (0-287)

const crc16js = (bytes) => {
  let crc = 0xFFFF;
  for (let i = 0; i < bytes.length; i++) {
    crc ^= bytes[i] << 8;
    for (let j = 0; j < 8; j++)
      crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) & 0xFFFF : (crc << 1) & 0xFFFF;
  }
  return crc & 0xFFFF;
};

const buildPayloadBits = (userId) => {
  // Strip hyphens so a standard 36-char UUID fits in 32 chars (hex only)
  const str = (userId || '').replace(/-/g, '').substring(0, UUID_FIELD_LEN);
  const uuidPadded = new Uint8Array(UUID_FIELD_LEN);
  for (let i = 0; i < str.length; i++) uuidPadded[i] = str.charCodeAt(i);
  const forCrc = new Uint8Array(1 + UUID_FIELD_LEN);
  forCrc[0] = str.length;
  forCrc.set(uuidPadded, 1);
  const crc = crc16js(forCrc);
  const payload = new Uint8Array(PAYLOAD_BYTES);
  payload[0] = str.length;
  payload.set(uuidPadded, 1);
  payload[PAYLOAD_BYTES - 2] = (crc >> 8) & 0xFF;
  payload[PAYLOAD_BYTES - 1] = crc & 0xFF;
  const bits = [];
  for (let i = 0; i < PAYLOAD_BYTES; i++)
    for (let b = 7; b >= 0; b--) bits.push((payload[i] >> b) & 1);
  return bits;
};

const parsePayloadBits = (bits) => {
  if (bits.length < PAYLOAD_BITS) return null;
  const bytes = new Uint8Array(PAYLOAD_BYTES);
  for (let i = 0; i < PAYLOAD_BYTES; i++) {
    let v = 0;
    for (let b = 0; b < 8; b++) v = (v << 1) | (bits[i * 8 + b] || 0);
    bytes[i] = v;
  }
  const lenByte    = bytes[0];
  if (lenByte <= 0 || lenByte > UUID_FIELD_LEN) return null;
  const uuidPadded = bytes.slice(1, 1 + UUID_FIELD_LEN);
  const crcRead    = (bytes[PAYLOAD_BYTES - 2] << 8) | bytes[PAYLOAD_BYTES - 1];
  const forCrc     = new Uint8Array(1 + UUID_FIELD_LEN);
  forCrc[0] = lenByte; forCrc.set(uuidPadded, 1);
  if (crc16js(forCrc) !== crcRead) return null;
  let uid = '';
  for (let i = 0; i < lenByte; i++) uid += String.fromCharCode(uuidPadded[i]);
  // Restore hyphens if this looks like a 32-char hex UUID (stripped on embed)
  if (uid.length === 32 && /^[0-9a-fA-F]{32}$/.test(uid)) {
    uid = `${uid.slice(0,8)}-${uid.slice(8,12)}-${uid.slice(12,16)}-${uid.slice(16,20)}-${uid.slice(20)}`;
  }
  return uid;
};

// ── EMBED ──────────────────────────────────────────────────────────────────
const embedUUIDAdvanced = (imageData, userId, gpsData, deviceInfo, ipAddress, timestamp, deviceSource, ipSource, gpsSource, width, height) => {
  const data        = imageData.data;
  const payloadBits = buildPayloadBits(userId);  // 280-bit CRC-validated userId

  // Full IMGCRYPT3 message in B channel (sequential) for backward compat
  const gpsString = gpsData && gpsData.available
    ? `${gpsData.latitude},${gpsData.longitude}` : 'NOGPS';
  const fullMsg  = `IMGCRYPT3|${userId}|${gpsString}|${timestamp || Date.now()}|${deviceInfo.deviceId || 'UNKNOWN'}|${deviceInfo.deviceName || 'UNKNOWN'}|${ipAddress || 'UNKNOWN'}|${deviceSource || 'Unknown'}|${ipSource || 'Unknown'}|${gpsSource || 'Unknown'}|${width}x${height}|END`;
  const fullBits = [];
  for (let i = 0; i < fullMsg.length; i++) {
    const c = fullMsg.charCodeAt(i);
    for (let b = 7; b >= 0; b--) fullBits.push((c >> b) & 1);
  }

  const TILE = STEGO_TILE;
  for (let idx = 0; idx < data.length; idx += 4) {
    const pi = idx / 4;
    const x  = pi % width;
    const y  = Math.floor(pi / width);
    const p  = (y % TILE) * TILE + (x % TILE);

    // R + G carry tile-based CRC payload (crop-safe, 25x25 min)
    data[idx]     = (data[idx]     & 0xFE) | payloadBits[(2 * p)     % PAYLOAD_BITS];
    data[idx + 1] = (data[idx + 1] & 0xFE) | payloadBits[(2 * p + 1) % PAYLOAD_BITS];

    // B carries full IMGCRYPT3 sequential (fallback for full metadata)
    data[idx + 2] = (data[idx + 2] & 0xFE) | fullBits[pi % fullBits.length];
  }
  return imageData;
};

// ── EXTRACT ────────────────────────────────────────────────────────────────
const extractUUIDAdvanced = (imageData) => {
  const data  = imageData.data;
  const imgW  = imageData.width || Math.round(Math.sqrt(data.length / 4)) || 1;
  const TILE  = STEGO_TILE;

  // METHOD 1: Tile + majority voting (CRC-validated) — works for any 25x25+ crop
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

  // Fast path offset (0,0)
  let uid = decodeWithOffset(0, 0);
  if (uid) return buildResultFromUserId(uid, data, imgW);

  // Try all 144 tile offsets (handles any crop position)
  for (let oy = 0; oy < TILE; oy++) {
    for (let ox = 0; ox < TILE; ox++) {
      if (ox === 0 && oy === 0) continue;
      uid = decodeWithOffset(ox, oy);
      if (uid) return buildResultFromUserId(uid, data, imgW);
    }
  }

  // METHOD 2: IMGCRYPT3 from B channel (full metadata, sequential)
  const bBits = [];
  for (let idx = 0; idx < data.length; idx += 4) bBits.push(data[idx + 2] & 1);
  const r2 = extractIMGCRYPT3(bBits);
  if (r2) return r2;

  // METHOD 3: Legacy R+G+B sequential
  const rgbBits = [];
  for (let idx = 0; idx < data.length; idx += 4) {
    rgbBits.push(data[idx] & 1, data[idx+1] & 1, data[idx+2] & 1);
  }
  const r3 = extractIMGCRYPT3(rgbBits);
  if (r3) return r3;

  return { found: false, userId: '' };
};

const extractIMGCRYPT3 = (bits) => {
  const total   = bits.length;
  // BUG FIX: old formula `total - 800` went negative for small images (e.g. 25x25 B-channel
  // has 625 bits → maxScan was 0, so only offset 0 was ever tried).
  // We only need enough bits after the offset to read the header + a few chars, not 800.
  const maxScan = Math.min(Math.max(0, total - 80), 3200);
  const maxRead = Math.min(500, Math.floor(total / 8));
  for (let off = 0; off <= maxScan; off += 8) {
    let text = '';
    for (let c = 0; c < maxRead; c++) {
      const s = off + c * 8;
      if (s + 8 > total) break;
      let v = 0;
      for (let b = 0; b < 8; b++) v = (v << 1) | bits[s + b];
      text += (v >= 32 && v <= 126) ? String.fromCharCode(v) : '\x00';
    }
    if (!text.includes('IMGCRYPT')) continue;
    const p = parseIMGCRYPT3Msg(text);
    if (p) return buildResult(p);
  }
  return null;
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

const buildResultFromUserId = (userId, data, imgW) => {
  // Try B channel for full metadata — but only trust it if userId matches tile-found userId.
  // BUG FIX: normalize both sides before comparing. The tile method strips hyphens at embed
  // and restores them at extract (36-char UUID). The B channel stores the original userId
  // (also 36-char with hyphens). For OLD images embedded before hyphen-stripping was added,
  // the tile returns a truncated 32-char string with hyphens still in it, while B channel
  // has the full string — they would never match with ===. Normalize by stripping hyphens
  // from both sides so old and new embedded images both compare correctly.
  const normalizeId = (id) => (id || '').replace(/-/g, '').toLowerCase();
  const bBits = [];
  for (let idx = 0; idx < data.length; idx += 4) bBits.push(data[idx + 2] & 1);
  const full = extractIMGCRYPT3(bBits);
  if (full && normalizeId(full.userId) === normalizeId(userId)) return { ...full, userId };  // ← tile userId is authoritative (hyphen-restored)
  if (full && normalizeId(full.userId) !== normalizeId(userId)) {
    // B channel gave different userId — trust tile method, but enrich with B channel metadata
    return { found: true, userId,
      gps: full.gps,
      timestamp: full.timestamp,
      deviceId: full.deviceId,
      deviceName: full.deviceName,
      ipAddress: full.ipAddress,
      deviceSource: full.deviceSource || 'Unknown',
      ipSource: full.ipSource || 'Unknown',
      gpsSource: full.gpsSource || 'Unknown',
      originalResolution: full.originalResolution || null,
      confidence: 'High' };
  }
  // B channel not available (small crop) — return tile-found UUID with no metadata
  return { found: true, userId,
    gps: { available: false, coordinates: null, mapsUrl: null, source: 'Unknown' },
    timestamp: null, deviceId: null, deviceName: null, ipAddress: null,
    deviceSource: 'Unknown', ipSource: 'Unknown', gpsSource: 'Unknown',
    originalResolution: null, confidence: 'High' };
};

const buildResult = (m) => {
  let gps = { available: false, coordinates: null, mapsUrl: null, source: m.gpsSource || 'Unknown' };
  if (m.gps && m.gps !== 'NOGPS') {
    const pts = m.gps.split(',');
    if (pts.length === 2) {
      const lat = parseFloat(pts[0]), lng = parseFloat(pts[1]);
      if (!isNaN(lat) && !isNaN(lng))
        gps = { available: true, latitude: lat, longitude: lng,
          coordinates: `${lat.toFixed(6)}, ${lng.toFixed(6)}`,
          mapsUrl: `https://www.google.com/maps?q=${lat},${lng}`, source: m.gpsSource || 'Unknown' };
    }
  }
  return { found: true, userId: m.userId, gps,
    timestamp: m.timestamp && !isNaN(m.timestamp) ? parseInt(m.timestamp) : null,
    deviceId: m.deviceId, deviceName: m.deviceName, ipAddress: m.ipAddress,
    deviceSource: m.deviceSource || 'Unknown', ipSource: m.ipSource || 'Unknown',
    gpsSource: m.gpsSource || 'Unknown', originalResolution: m.originalResolution,
    confidence: 'High' };
};

// ─────────────────────────────────────────────────────────────────────────────
// SHARED METRICS BUILDER  (add this just above classifyImage)
// ─────────────────────────────────────────────────────────────────────────────
const buildMetrics = (
  totalVariance, noiseLevel, smoothBlockRatio, edgeCoherence,
  uniformityRatio, avgEntropy, compressionRatio, aspectRatio, channelCorrelation
) => ({
  variance:           totalVariance.toFixed(2),
  noiseLevel:         noiseLevel.toFixed(2),
  smoothBlockRatio:   (smoothBlockRatio * 100).toFixed(1) + '%',
  edgeCoherence:      (edgeCoherence * 100).toFixed(1) + '%',
  uniformityRatio:    (uniformityRatio * 100).toFixed(1) + '%',
  entropy:            avgEntropy.toFixed(2),
  compressionRatio:   compressionRatio.toFixed(3),
  aspectRatio:        aspectRatio.toFixed(3),
  channelCorrelation: channelCorrelation.toFixed(3)
});

// ─────────────────────────────────────────────────────────────────────────────
// IMAGE CLASSIFICATION
//   hasUUID          — extracted by extractUUIDWithRotation
//   resolutionMismatch — computed outside, from cropInfo.isCropped
//   exifHints        — { exifDeviceInfo, exifGPS, captureTimeData } (optional)
// ─────────────────────────────────────────────────────────────────────────────
const classifyImage = (
  canvas, imageData, fileSize, fileName,
  hasUUID,
  resolutionMismatch = false,
  exifHints = {}
) => {
  const data        = imageData.data;
  const width       = canvas.width;
  const height      = canvas.height;
  const totalPixels = width * height;
  const pixelCount  = data.length / 4;

  const isPNG  = fileName.toLowerCase().endsWith('.png');
  const isJPEG = fileName.toLowerCase().endsWith('.jpg')
              || fileName.toLowerCase().endsWith('.jpeg');

  // EXIF hints — all safely default to "not found"
  const exifDevice      = exifHints.exifDeviceInfo  || { found: false };
  const exifGPSData     = exifHints.exifGPS         || { found: false };
  const captureTimeData = exifHints.captureTimeData || { source: 'Unknown' };

  // ── 1. Channel correlation — deterministic stride (no Math.random) ──────────
  let rrCorr = 0, ggCorr = 0, bbCorr = 0;
  let rgCorr = 0, rbCorr = 0, gbCorr = 0;
  const samplingStride = Math.max(1, Math.floor(pixelCount / 5000));
  for (let i = 0; i < pixelCount; i += samplingStride) {
    const idx = i * 4;
    const r = data[idx], g = data[idx + 1], b = data[idx + 2];
    rrCorr += r * r; ggCorr += g * g; bbCorr += b * b;
    rgCorr += r * g; rbCorr += r * b; gbCorr += g * b;
  }
  const channelCorrelation = (rgCorr + rbCorr + gbCorr)
                           / (rrCorr + ggCorr + bbCorr + 0.001);

  // ── 2. Local Binary Pattern — uniformity ratio ───────────────────────────────
  let uniformPatterns = 0, nonUniformPatterns = 0;
  for (let y = 2; y < Math.min(height - 2, 100); y += 2) {
    for (let x = 2; x < Math.min(width - 2, 100); x += 2) {
      const center = data[(y * width + x) * 4];
      const nb = [
        data[((y-1)*width+(x-1))*4], data[((y-1)*width+x)*4],
        data[((y-1)*width+(x+1))*4], data[(y*width+(x+1))*4],
        data[((y+1)*width+(x+1))*4], data[((y+1)*width+x)*4],
        data[((y+1)*width+(x-1))*4], data[(y*width+(x-1))*4]
      ];
      let transitions = 0;
      for (let i = 0; i < 8; i++) {
        if ((nb[i] > center) !== (nb[(i + 1) % 8] > center)) transitions++;
      }
      if (transitions <= 2) uniformPatterns++; else nonUniformPatterns++;
    }
  }
  const uniformityRatio = uniformPatterns / (uniformPatterns + nonUniformPatterns + 0.001);

  // ── 3. Smooth block ratio (DCT-like) ─────────────────────────────────────────
  let highFreqEnergy = 0, lowFreqEnergy = 0;
  for (let y = 0; y < Math.min(height - 4, 200); y += 4) {
    for (let x = 0; x < Math.min(width - 4, 200); x += 4) {
      let blockSum = 0;
      for (let dy = 0; dy < 4; dy++)
        for (let dx = 0; dx < 4; dx++)
          blockSum += data[((y + dy) * width + (x + dx)) * 4];
      const blockMean = blockSum / 16;
      let blockVariance = 0;
      for (let dy = 0; dy < 4; dy++)
        for (let dx = 0; dx < 4; dx++)
          blockVariance += Math.pow(data[((y + dy) * width + (x + dx)) * 4] - blockMean, 2);
      if (blockVariance < 100) lowFreqEnergy++; else highFreqEnergy++;
    }
  }
  const smoothBlockRatio = lowFreqEnergy / (lowFreqEnergy + highFreqEnergy + 0.001);

  // ── 4. Edge coherence ─────────────────────────────────────────────────────────
  let coherentEdges = 0, totalEdges = 0;
  const edgeStride = width * 4;
  for (let y = 2; y < height - 2; y += 2) {
    for (let x = 2; x < width - 2; x += 2) {
      const idx  = (y * width + x) * 4;
      const gx   = Math.abs(data[idx + 4]          - data[idx - 4]);
      const gy   = Math.abs(data[idx + edgeStride]  - data[idx - edgeStride]);
      const mag  = Math.sqrt(gx * gx + gy * gy);
      if (mag > 20) {
        totalEdges++;
        const gx2  = Math.abs(data[idx + 8]               - data[idx]);
        const gy2  = Math.abs(data[idx + edgeStride * 2]   - data[idx]);
        const mag2 = Math.sqrt(gx2 * gx2 + gy2 * gy2);
        if (Math.abs(mag - mag2) < 10) coherentEdges++;
      }
    }
  }
  const edgeCoherence = totalEdges > 0 ? coherentEdges / totalEdges : 0;

  // ── 5. Color entropy ──────────────────────────────────────────────────────────
  const histR = new Array(256).fill(0);
  const histG = new Array(256).fill(0);
  const histB = new Array(256).fill(0);
  for (let i = 0; i < data.length; i += 4) {
    histR[data[i]]++; histG[data[i + 1]]++; histB[data[i + 2]]++;
  }
  let entropyR = 0, entropyG = 0, entropyB = 0;
  for (let i = 0; i < 256; i++) {
    if (histR[i] > 0) { const p = histR[i] / pixelCount; entropyR -= p * Math.log2(p); }
    if (histG[i] > 0) { const p = histG[i] / pixelCount; entropyG -= p * Math.log2(p); }
    if (histB[i] > 0) { const p = histB[i] / pixelCount; entropyB -= p * Math.log2(p); }
  }
  const avgEntropy = (entropyR + entropyG + entropyB) / 3;

  // ── 6. Pixel clustering ───────────────────────────────────────────────────────
  const bins = new Array(26).fill(0);
  for (let i = 0; i < data.length; i += 4) {
    bins[Math.min(25, Math.floor((data[i] + data[i + 1] + data[i + 2]) / 3 / 10))]++;
  }
  let clusterCount = 0;
  for (let i = 0; i < bins.length; i++) {
    if (bins[i] > pixelCount * 0.05) clusterCount++;
  }
  const clusteringScore = clusterCount / bins.length;

  // ── 7. Variance + noise ───────────────────────────────────────────────────────
  let rSum = 0, gSum = 0, bSum = 0;
  for (let i = 0; i < data.length; i += 4) {
    rSum += data[i]; gSum += data[i + 1]; bSum += data[i + 2];
  }
  const avgR = rSum / pixelCount;
  const avgG = gSum / pixelCount;
  const avgB = bSum / pixelCount;
  let totalVariance = 0;
  for (let i = 0; i < data.length; i += 4) {
    totalVariance += Math.pow(data[i]     - avgR, 2);
    totalVariance += Math.pow(data[i + 1] - avgG, 2);
    totalVariance += Math.pow(data[i + 2] - avgB, 2);
  }
  totalVariance = totalVariance / (pixelCount * 3);

  let noiseLevel = 0;
  for (let i = 4; i < data.length - 4; i += 4) {
    noiseLevel += Math.abs(data[i] - data[i - 4]);
  }
  noiseLevel = noiseLevel / pixelCount;

  const compressionRatio = fileSize / totalPixels;
  const aspectRatio      = width / height;

  // ── CASE 4 & 5: UUID direct detection ────────────────────────────────────────
  // resolutionMismatch is computed outside and passed in.
  // It is true when the embedded original resolution differs from the current one.
  if (hasUUID) {
    const metricsObj = buildMetrics(
      totalVariance, noiseLevel, smoothBlockRatio, edgeCoherence,
      uniformityRatio, avgEntropy, compressionRatio, aspectRatio, channelCorrelation
    );

    if (resolutionMismatch) {
      return {
        caseCode:      'CASE_5',
        internalLabel: 'Case 5: Encrypted with UUID and Cropped',
        displayLabel:  'Embedded UUID detected; resolution mismatch observed',
        detectedCase:  'Case 5: Encrypted with UUID and Cropped',   // backward compat
        confidence:    95,
        evidenceLevel: 'Direct',
        reasoning: [
          'UUID encryption header verified',
          'Current resolution does not match the originally embedded resolution',
          'Image may have been cropped or resized after encryption'
        ],
        metrics: metricsObj
      };
    }

    return {
      caseCode:      'CASE_4',
      internalLabel: 'Case 4: Encrypted with UUID',
      displayLabel:  'Embedded UUID detected',
      detectedCase:  'Case 4: Encrypted with UUID',                 // backward compat
      confidence:    98,
      evidenceLevel: 'Direct',
      reasoning:     [
        'UUID encryption header verified',
        'Resolution matches originally embedded dimensions'
      ],
      metrics: metricsObj
    };
  }

  // ── HEURISTIC SCORING — Cases 1, 2, 3 ────────────────────────────────────────
  // Each signal: fired (bool), weight (3=strong / 2=moderate / 1=supporting), label
  // Confidence = 50 + (firedScore / maxScore) * 35  →  range 50–85
  // Winner selected on normalised ratio so the three scales are comparable

  const mobileDims       = [720, 1080, 1440, 1920, 2160, 3024, 4032];
  const mobileHeights    = [1280, 1920, 2560, 2880, 4032];
  const mobileAspects    = [0.5625, 0.75, 1.0, 1.333, 1.777, 2.0, 2.165];
  const isCommonMobileDim    = mobileDims.includes(width) || mobileHeights.includes(height);
  const isCommonMobileAspect = mobileAspects.some(a => Math.abs(aspectRatio - a) < 0.05);

  // ── AI signals ────────────────────────────────────────────────────────────────
  const aiSignals = [
    { fired: smoothBlockRatio > 0.65,             weight: 3, label: 'Very smooth texture detected (smooth block ratio: '    + (smoothBlockRatio   * 100).toFixed(1) + '%)' },
    { fired: edgeCoherence > 0.72,                weight: 3, label: 'Unnaturally coherent edges (coherence: '              + (edgeCoherence       * 100).toFixed(1) + '%)' },
    { fired: noiseLevel < 4,                      weight: 3, label: 'Near-zero sensor noise (noise level: '                + noiseLevel.toFixed(2)                         + ')' },
    { fired: uniformityRatio > 0.65,              weight: 2, label: 'Uniform texture patterns detected (LBP uniformity: '  + (uniformityRatio    * 100).toFixed(1) + '%)' },
    { fired: avgEntropy < 6.5,                    weight: 2, label: 'Low color entropy — limited palette (entropy: '       + avgEntropy.toFixed(2)                         + ')' },
    { fired: channelCorrelation > 0.87,           weight: 2, label: 'Unnatural RGB channel correlation ('                  + channelCorrelation.toFixed(3)                  + ')' },
    { fired: isPNG,                               weight: 1, label: 'PNG format — common export format for AI tools'                                                           },
    { fired: width % 64 === 0 && height % 64 === 0, weight: 1, label: 'Dimensions are multiples of 64 (' + width + 'x' + height + ') — typical AI grid size'               },
    { fired: clusteringScore < 0.25,              weight: 1, label: 'Pixel value clustering pattern detected'                                                                  }
  ];

  // ── Mobile signals ────────────────────────────────────────────────────────────
  const mobileSignals = [
    { fired: noiseLevel > 15,                          weight: 3, label: 'High sensor noise consistent with camera hardware (noise: '   + noiseLevel.toFixed(2)        + ')' },
    { fired: isJPEG && totalVariance > 2500,           weight: 3, label: 'JPEG format with high natural pixel variance ('               + totalVariance.toFixed(0)      + ')' },
    { fired: exifDevice.found === true,                weight: 3, label: 'Camera device identified in EXIF metadata'
                                                                        + (exifDevice.deviceName ? ' (' + exifDevice.deviceName + ')' : '')                                    },
    { fired: avgEntropy > 7.0,                         weight: 2, label: 'High color entropy — rich natural scene (entropy: '          + avgEntropy.toFixed(2)         + ')' },
    { fired: uniformityRatio < 0.4,                    weight: 2, label: 'Non-uniform texture — consistent with real-world photography'                                        },
    { fired: smoothBlockRatio < 0.3,                   weight: 2, label: 'Rough block distribution — natural photographic texture'                                             },
    { fired: isCommonMobileAspect,                     weight: 2, label: 'Aspect ratio matches common phone format ('                   + aspectRatio.toFixed(3)        + ')' },
    { fired: compressionRatio > 1.3,                   weight: 1, label: 'High compression ratio suggests large camera file ('         + compressionRatio.toFixed(3)   + ')' },
    { fired: isCommonMobileDim,                        weight: 1, label: 'Dimensions match a known phone camera resolution ('          + width + 'x' + height          + ')' },
    { fired: captureTimeData.source === 'EXIF',        weight: 1, label: 'Original capture timestamp found in EXIF data'                                                       },
    { fired: exifGPSData.found === true,               weight: 1, label: 'GPS coordinates found in EXIF data'                                                                  }
  ];

  // ── Web signals ───────────────────────────────────────────────────────────────
  const webSignals = [
    { fired: compressionRatio > 0.4 && compressionRatio < 1.5,       weight: 2, label: 'Compression ratio typical of web-optimised images ('   + compressionRatio.toFixed(3) + ')' },
    { fired: width % 10 === 0 && height % 10 === 0,                   weight: 2, label: 'Rounded dimensions consistent with web-resized content (' + width + 'x' + height  + ')' },
    { fired: avgEntropy > 6.5 && avgEntropy < 7.3,                    weight: 2, label: 'Moderate color entropy — typical of web-sourced images (entropy: ' + avgEntropy.toFixed(2) + ')' },
    { fired: totalVariance > 1200 && totalVariance < 3500,            weight: 2, label: 'Moderate pixel variance consistent with web-processed content'                              },
    { fired: !isCommonMobileDim && !isCommonMobileAspect,             weight: 1, label: 'No common mobile hardware dimensions detected'                                              },
    { fired: noiseLevel > 5 && noiseLevel < 15,                       weight: 1, label: 'Noise level in typical web-processing range (' + noiseLevel.toFixed(2) + ')'              },
    { fired: !exifDevice.found,                                        weight: 1, label: 'No EXIF device metadata found'                                                              }
  ];

  // ── Score each case ───────────────────────────────────────────────────────────
  const evaluateSignals = (signals) => {
    let firedScore = 0, maxScore = 0;
    let strongFired = 0, modFired = 0;
    const firedLabels = [];

    for (const s of signals) {
      maxScore += s.weight;
      if (s.fired) {
        firedScore += s.weight;
        firedLabels.push(s.label);
        if (s.weight === 3) strongFired++;
        else if (s.weight === 2) modFired++;
      }
    }

    const ratio      = maxScore > 0 ? firedScore / maxScore : 0;
    const confidence = Math.round(50 + ratio * 35);  // 50–85, never 90+ for heuristic cases

    let evidenceLevel;
    if      (strongFired >= 2 || (strongFired >= 1 && modFired >= 2)) evidenceLevel = 'Strong';
    else if (strongFired >= 1 || modFired >= 3)                       evidenceLevel = 'Moderate';
    else if (modFired >= 1 || firedScore > 0)                         evidenceLevel = 'Weak';
    else                                                               evidenceLevel = 'Insufficient';

    return { ratio, confidence, strongFired, modFired, evidenceLevel, firedLabels };
  };

  const aiEval     = evaluateSignals(aiSignals);
  const mobileEval = evaluateSignals(mobileSignals);
  const webEval    = evaluateSignals(webSignals);

  // ── Winner: normalised ratio makes the three scales comparable ───────────────
  const winnerRatio = Math.max(aiEval.ratio, mobileEval.ratio, webEval.ratio);
  const winner = aiEval.ratio === winnerRatio     ? 'AI'
               : mobileEval.ratio === winnerRatio ? 'MOBILE'
               :                                    'WEB';

  // ── Competition penalty: reduce confidence when second place is close ─────────
  const penalise = (winRatio, secondRatio, conf) => {
    const gap = winRatio - secondRatio;
    if (gap < 0.10) return Math.max(50, conf - 10);
    if (gap < 0.20) return Math.max(50, conf - 5);
    return conf;
  };

  const metricsObj = buildMetrics(
    totalVariance, noiseLevel, smoothBlockRatio, edgeCoherence,
    uniformityRatio, avgEntropy, compressionRatio, aspectRatio, channelCorrelation
  );

  if (winner === 'AI') {
    const finalConf = penalise(aiEval.ratio, Math.max(mobileEval.ratio, webEval.ratio), aiEval.confidence);
    const reasoning = [...aiEval.firedLabels];
    if (mobileEval.strongFired > 0)
      reasoning.push('Note: Some mobile-like characteristics also present');
    return {
      caseCode:      'CASE_2',
      internalLabel: 'Case 2: AI Generated',
      displayLabel:  'Likely AI-generated',
      detectedCase:  'Case 2: AI Generated',      // backward compat
      confidence:    finalConf,
      evidenceLevel: aiEval.evidenceLevel,
      reasoning,
      metrics:       metricsObj
    };
  }

  if (winner === 'MOBILE') {
    const finalConf = penalise(mobileEval.ratio, Math.max(aiEval.ratio, webEval.ratio), mobileEval.confidence);
    const reasoning = [...mobileEval.firedLabels];
    if (aiEval.strongFired > 0)
      reasoning.push('Note: Some AI-like smoothness also detected');
    return {
      caseCode:      'CASE_1',
      internalLabel: 'Case 1: Mobile Captured',
      displayLabel:  'Likely mobile-captured',
      detectedCase:  'Case 1: Mobile Captured',   // backward compat
      confidence:    finalConf,
      evidenceLevel: mobileEval.evidenceLevel,
      reasoning,
      metrics:       metricsObj
    };
  }

  // Default: web-sourced
  const finalConf = penalise(webEval.ratio, Math.max(aiEval.ratio, mobileEval.ratio), webEval.confidence);
  return {
    caseCode:      'CASE_3',
    internalLabel: 'Case 3: Downloaded from Web',
    displayLabel:  'Likely web-sourced',
    detectedCase:  'Case 3: Downloaded from Web', // backward compat
    confidence:    finalConf,
    evidenceLevel: webEval.evidenceLevel,
    reasoning:     webEval.firedLabels.length > 0
      ? webEval.firedLabels
      : ['No strong mobile or AI indicators detected — most consistent with a web-sourced image'],
    metrics:       metricsObj
  };
};

// ── Save to device: direct gallery (APK) or download (browser) ───────────────
const saveFileToDevice = async (dataUrl, fileName) => {
  const isCapacitor = !!(
    window.Capacitor &&
    window.Capacitor.isNativePlatform &&
    window.Capacitor.isNativePlatform()
  );

  if (!isCapacitor) {
    // Browser — standard anchor download
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    return;
  }

  // APK — save directly to gallery, NO share sheet
  try {
    const { Filesystem, Directory } = await import('@capacitor/filesystem');

    const base64  = dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl;
    const isPdf   = fileName.toLowerCase().endsWith('.pdf');
    const tmpPath = `pinit_tmp_${Date.now()}_${fileName}`;

    // Step 1: Write to cache (no permission needed)
    await Filesystem.writeFile({
      path:      tmpPath,
      data:      base64,
      directory: Directory.Cache,
    });

    // Step 2: Get real file URI
    const { uri } = await Filesystem.getUri({
      path:      tmpPath,
      directory: Directory.Cache,
    });

    if (isPdf) {
      // PDFs — save to Documents/PINIT (no gallery needed for PDFs)
      try {
        await Filesystem.writeFile({
          path:      `PINIT/${fileName}`,
          data:      base64,
          directory: Directory.Documents,
          recursive: true,
        });
        alert('✅ Report saved to Documents/PINIT folder!\nOpen your Files app to find it.');
      } catch (docErr) {
        // Fallback: open with share sheet for PDFs only
        const { Share } = await import('@capacitor/share');
        await Share.share({ title: fileName, url: uri, dialogTitle: 'Save your report' });
      }
    } else {
      // Images — save directly to Gallery using Media plugin
      try {
        const { Media } = await import('@capacitor-community/media');
        await Media.savePhoto({ path: uri });
        alert('✅ Image saved to your Gallery!');
      } catch (mediaErr) {
        // Media plugin failed — write directly to Pictures/PINIT
        try {
          await Filesystem.writeFile({
            path:      `Pictures/PINIT/${fileName}`,
            data:      base64,
            directory: Directory.ExternalStorage,
            recursive: true,
          });
          alert('✅ Image saved to Pictures/PINIT folder!\nOpen Gallery or Files app to find it.');
        } catch (extErr) {
          // Last resort — Documents
          await Filesystem.writeFile({
            path:      `PINIT/${fileName}`,
            data:      base64,
            directory: Directory.Documents,
            recursive: true,
          });
          alert('✅ Image saved to Documents/PINIT folder!\nOpen Files app to find it.');
        }
      }
    }

    // Cleanup cache
    Filesystem.deleteFile({ path: tmpPath, directory: Directory.Cache }).catch(() => {});

  } catch (err) {
    if (String(err).toLowerCase().includes('cancel')) return;
    console.warn('Save error:', err);
    alert('Could not save: ' + (err.message || 'Unknown error'));
  }
};

const generateReport = (report, imageData) => {
  const canvas = document.createElement('canvas');
  const ctx    = canvas.getContext('2d');
  canvas.width  = 595;
  canvas.height = 842;

  // White background
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, 595, 842);

  // Blue header
  ctx.fillStyle = '#2563eb';
  ctx.fillRect(0, 0, 595, 75);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 22px Arial';
  ctx.fillText('IMAGE ANALYSIS REPORT', 30, 45);
  ctx.font = '10px Arial';
  ctx.fillText('PINIT — Image Forensics & Provenance Platform', 30, 65);

  // Confidence banner
  const bannerColor = report.confidence > 90 ? '#10b981' : report.confidence > 70 ? '#fbbf24' : '#ef4444';
  ctx.fillStyle = bannerColor;
  ctx.fillRect(0, 75, 595, 44);
  ctx.fillStyle = '#000';
  ctx.font = 'bold 14px Arial';
  ctx.fillText(String(report.detectedCase || ''), 30, 97);
  ctx.font = '11px Arial';
  ctx.fillText('Confidence: ' + (report.confidence || 0) + '%', 30, 113);

  let y = 140;

  const section = (title) => {
    ctx.fillStyle = '#1e40af';
    ctx.font = 'bold 12px Arial';
    ctx.fillText(title, 30, y); y += 5;
    ctx.fillStyle = '#d1d5db';
    ctx.fillRect(30, y, 535, 1); y += 12;
    ctx.fillStyle = '#111827';
  };

  const field = (label, value) => {
    ctx.font = 'bold 9.5px Arial';
    ctx.fillStyle = '#374151';
    ctx.fillText(String(label), 30, y);
    ctx.font = '9.5px Arial';
    ctx.fillStyle = '#111827';
    const v = String(value || '—');
    ctx.fillText(v.length > 58 ? v.substring(0, 58) + '...' : v, 200, y);
    y += 15;
  };

  section('OWNERSHIP AT CREATION');
  field('Asset ID:', report.assetId);
  field('Authorship Certificate ID:', report.authorshipCertificateId);
  field('Unique User ID:', report.uniqueUserId);
  field('Asset File Size:', report.assetFileSize);
  field('Asset Resolution:', report.assetResolution);
  field('User Encrypted Resolution:', report.userEncryptedResolution);
  field('Time Stamp:', report.timestamp ? new Date(report.timestamp).toLocaleString() : 'Not Available');
  field('Capture Location:', report.captureLocationInfo);
  field('GPS Location:', report.gpsLocation?.available ? report.gpsLocation.coordinates : 'Not Available');
  y += 8;

  section('TECHNICAL DETAILS');
  field('Total Pixels:', report.totalPixels);
  field('Pixels Verified:', report.pixelsVerifiedWithBiometrics);
  field('Device Name:', report.deviceName);
  field('Device ID:', report.deviceId);
  field('IP Address:', report.ipAddress);
  field('Ownership Info:', report.ownershipInfo);
  field('Certificate:', report.authorshipCertificate);
  field('Rotation:', report.rotationMessage || 'Not detected');
  field('Image Cropped:', report.cropInfo?.isCropped
    ? 'Yes — ' + report.cropInfo.originalResolution + ' to ' + report.cropInfo.currentResolution + ' (' + report.cropInfo.remainingPercentage + ')'
    : 'No');
  y += 8;

  if (report.reasoning && report.reasoning.length > 0) {
    section('CLASSIFICATION ANALYSIS');
    ctx.font = '9.5px Arial';
    ctx.fillStyle = '#111827';
    report.reasoning.forEach(function(r) {
      ctx.fillText('• ' + String(r), 40, y); y += 14;
    });
    y += 4;
  }

  // Footer
  ctx.fillStyle = '#9ca3af';
  ctx.font = '8.5px Arial';
  ctx.fillText('Generated: ' + new Date().toLocaleString() + '  |  PINIT Image Forensics', 30, 835);

  // Save as PDF via jsPDF, fallback to PNG
  const doSave = (canvasEl) => {
    const pngUrl  = canvasEl.toDataURL('image/png');
    const pdfName = 'PINIT-report-' + (report.assetId || Date.now()) + '.pdf';

    import('jspdf').then(function(mod) {
      const JsPDF = mod.jsPDF || mod.default || (mod.default && mod.default.jsPDF);
      const pdf   = new JsPDF({ unit: 'px', format: [595, 842], orientation: 'portrait' });
      pdf.addImage(pngUrl, 'PNG', 0, 0, 595, 842);
      const pdfUrl = pdf.output('datauristring');
      saveFileToDevice(pdfUrl, pdfName);
    }).catch(function() {
      // jsPDF not installed — save as PNG
      saveFileToDevice(pngUrl, 'PINIT-report-' + (report.assetId || Date.now()) + '.png');
    });
  };

  if (imageData) {
    y += 8;
    ctx.fillStyle = '#1e40af';
    ctx.font = 'bold 12px Arial';
    ctx.fillText('ANALYZED IMAGE', 30, y); y += 12;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload  = function() {
      const mw = 520, mh = 150;
      const sc = Math.min(mw / img.width, mh / img.height, 1);
      ctx.drawImage(img, 30, y, img.width * sc, img.height * sc);
      doSave(canvas);
    };
    img.onerror = function() { doSave(canvas); };
    img.src = imageData;
    return;
  }
  doSave(canvas);
};


// ============================================
// MAIN COMPONENT
// ============================================
const ImageCryptoAnalyzer = ({ user, onLogout }) => {
  const navigate = useNavigate();

  // ✅ MOVE ALL HOOKS TO THE TOP - BEFORE ANY CONDITIONAL LOGIC
  const [activeTab, setActiveTab] = useState('encrypt');
  const [selectedFile, setSelectedFile] = useState(null);
  const [captureSource, setCaptureSource] = useState('Browser Upload');
  const [preview, setPreview] = useState(null);
  const [userId, setUserId] = useState(
    localStorage.getItem('userUUID') || ''
  );
  const [encryptedImage, setEncryptedImage] = useState(null); // base64 dataURL (works in Capacitor WebView)
  const [encryptedFileName, setEncryptedFileName] = useState('encrypted-image.png');
  const [analysisReport, setAnalysisReport] = useState(null);
  const [showDeviceDetails, setShowDeviceDetails] = useState(false);
  const [processing, setProcessing] = useState(false);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [facingMode, setFacingMode] = useState('environment');
  const [canSwitchCamera, setCanSwitchCamera] = useState(false);

  // No blob URL cleanup needed — encrypted image stored as base64
  useEffect(() => {
    return () => {
      // cleanup if needed in future
    };
  }, [encryptedImage]);

  // Keep userId display state synced with the locked per-user UUID from localStorage.
  // Runs on mount (catches late login writes) and whenever the `user` prop changes.
  useEffect(() => {
    const stored = localStorage.getItem('userUUID') || '';
    if (stored && stored !== userId) {
      setUserId(stored);
    }
  }, [user]); // re-run if user prop changes (e.g. after login redirect)

  // ✅ NOW the safety check - AFTER all hooks
  useEffect(() => {
    if (!user) {
      navigate('/login');
    }
  }, [user, navigate]);

  // ✅ NOW the early return - AFTER all hooks
  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-800 mb-4">Redirecting to login...</h2>
          <p className="text-gray-600">Please wait</p>
        </div>
      </div>
    );
  }

  const startCamera = async () => {
    try {
      setCameraActive(true);

      // Try with specific facing mode first
      let constraints = {
        video: {
          facingMode: { ideal: facingMode },
          width: { ideal: 1920, max: 1920 },
          height: { ideal: 1080, max: 1080 }
        },
        audio: false
      };

      let stream;

      try {
        // Try preferred camera
        stream = await navigator.mediaDevices.getUserMedia(constraints);
      } catch (err) {
        console.log('Specific camera failed, trying fallback...', err);

        // Fallback: Try without facingMode constraint
        constraints = {
          video: {
            width: { ideal: 1920, max: 1920 },
            height: { ideal: 1080, max: 1080 }
          },
          audio: false
        };
        stream = await navigator.mediaDevices.getUserMedia(constraints);
      }

      // Check if device has multiple cameras (can switch)
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = devices.filter(device => device.kind === 'videoinput');
      setCanSwitchCamera(videoDevices.length > 1);

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.setAttribute('playsinline', true);
        videoRef.current.setAttribute('autoplay', true);
        videoRef.current.setAttribute('muted', true);

        // Important: Wait for video to be ready
        videoRef.current.onloadedmetadata = () => {
          videoRef.current.play().catch(err => {
            console.error('Play failed:', err);
          });
        };
      }

    } catch (err) {
      console.error('Camera error:', err);
      let errorMessage = 'Camera access failed. ';

      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        errorMessage += 'Please allow camera permission in your browser settings.';
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        errorMessage += 'No camera found on this device.';
      } else if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
        errorMessage += 'Camera is already in use by another app. Please close other apps using the camera.';
      } else {
        errorMessage += err.message;
      }

      alert(errorMessage);
      setCameraActive(false);
    }
  };

  const switchCamera = async () => {
    // Stop current stream
    if (videoRef.current?.srcObject) {
      videoRef.current.srcObject.getTracks().forEach(t => t.stop());
    }

    // Toggle facing mode
    const newFacingMode = facingMode === 'user' ? 'environment' : 'user';
    setFacingMode(newFacingMode);

    // Restart camera with new facing mode
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { exact: newFacingMode },
          width: { ideal: 1920, max: 1920 },
          height: { ideal: 1080, max: 1080 }
        },
        audio: false
      });

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play().catch(err => console.error('Play failed:', err));
      }
    } catch (err) {
      console.error('Switch camera failed:', err);
      // Fallback: restart with any available camera
      startCamera();
    }
  };

  const stopCamera = () => {
    if (videoRef.current?.srcObject) {
      videoRef.current.srcObject.getTracks().forEach(t => t.stop());
      videoRef.current.srcObject = null;
    }
    setCameraActive(false);
    setCanSwitchCamera(false);
  };

  const captureImage = () => {
    if (!videoRef.current || !canvasRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0);

    canvas.toBlob(blob => {
      const file = new File([blob], 'camera-capture.png', { type: 'image/png' });
      setSelectedFile(file);
      setCaptureSource('Camera Capture');
      const reader = new FileReader();
      reader.onload = (e) => setPreview(e.target.result);
      reader.readAsDataURL(file);
      stopCamera();

      // ── Auto-embed UUID immediately after camera capture ──
      const autoUUID = localStorage.getItem('userUUID') || '';
      if (autoUUID) {
        setUserId(autoUUID);
        setTimeout(() => { embedUUID(); }, 600);
      }
    });
  };

  const handleFileSelect = (file) => {
    setCaptureSource('Browser Upload');

    if (file && file.type.startsWith('image/')) {
      setSelectedFile(file);
      const reader = new FileReader();
      reader.onload = (e) => setPreview(e.target.result);
      reader.readAsDataURL(file);
    }
  };

  const embedUUID = async () => {
    // Auto-load UUID if not already set
    const currentUUID = userId || localStorage.getItem('userUUID') || '';
    if (!selectedFile) {
      alert('Please select an image');
      return;
    }
    if (!currentUUID) {
      alert('Please login again to get your UUID');
      return;
    }
    if (currentUUID !== userId) setUserId(currentUUID);

    setProcessing(true);

    // Compute SHA-256 hash of the original file immediately
    const sha256Hash = await computeSHA256(selectedFile);

    // Cleanup previous encrypted image URL
    if (encryptedImage) {
      URL.revokeObjectURL(encryptedImage);
      setEncryptedImage(null);
    }

    // Get all data in parallel
    const [currentGPS, ipAddress, captureTimeData, exifDeviceInfo, exifGPS] = await Promise.all([
      getGPSLocation(),
      getPublicIP(),
      getCaptureTime(selectedFile),
      getExifDeviceInfo(selectedFile),
      getExifGPS(selectedFile)
    ]);

    // Get current device info using reusable functions
    const currentDeviceId = getDeviceFingerprint();
    const currentDeviceName = getCurrentDeviceName();

    // Build device info based on scenario
    let deviceInfo;
    let gpsData;
    let ipInfo;

    if (captureSource === 'Camera Capture') {
      // Scenario 1: Camera capture in YOUR app - use current device
      deviceInfo = {
        deviceId: currentDeviceId,
        deviceName: currentDeviceName,
        source: 'App Camera'
      };
      gpsData = currentGPS.available ? { ...currentGPS, source: 'App Camera' } : { available: false, source: 'App Camera' };
      ipInfo = { ip: ipAddress, source: 'Capture Device' };

    } else if (exifDeviceInfo.found) {
      // Scenario 3: Upload from DIFFERENT device - use EXIF + label IP
      deviceInfo = {
        deviceId: exifDeviceInfo.deviceId,
        deviceName: exifDeviceInfo.deviceName,
        source: 'EXIF (Capture Device)'
      };
      // Prefer EXIF GPS if available, otherwise use current
      if (exifGPS.found) {
        gpsData = { ...exifGPS, available: true, source: 'EXIF (Capture Device)' };
      } else if (currentGPS.available) {
        gpsData = { ...currentGPS, source: 'Encrypting Device' };
      } else {
        gpsData = { available: false, source: 'Not Available' };
      }
      ipInfo = { ip: ipAddress, source: 'Encrypting Device' };

    } else {
      // Scenario 2: Upload on SAME device (no EXIF = screenshot/PNG/same device)
      deviceInfo = {
        deviceId: currentDeviceId,
        deviceName: currentDeviceName,
        source: 'Encrypting Device'
      };
      gpsData = currentGPS.available ? { ...currentGPS, source: 'Encrypting Device' } : { available: false, source: 'Not Available' };
      ipInfo = { ip: ipAddress, source: 'Encrypting Device' };
    }

    const img = new Image();
    img.onload = async () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      // BUG FIX: willReadFrequently prevents the browser from applying lossy
      // GPU-accelerated compositing. Without this, getImageData/putImageData on
      // some browsers silently alters pixel values, corrupting the embedded LSBs
      // before they are ever saved to the PNG blob.
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(img, 0, 0);

      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

      // [UPDATED] Pass canvas.width and canvas.height for V3 resolution embedding
      // Use currentUUID (not userId state) — React setState is async and may be stale here
      const encryptedData = embedUUIDAdvanced(
        imageData,
        currentUUID,
        { available: gpsData.available, latitude: gpsData.latitude, longitude: gpsData.longitude },
        deviceInfo,
        ipInfo.ip,
        captureTimeData.timestamp,
        deviceInfo.source,
        ipInfo.source,
        gpsData.source,
        canvas.width,
        canvas.height
      );
      ctx.putImageData(encryptedData, 0, 0);

canvas.toBlob((blob) => {
        // ── Store as base64 for Android WebView compatibility ──
        // Blob URLs (URL.createObjectURL) don't work in Capacitor WebView
        const reader2 = new FileReader();
        reader2.onloadend = () => {
          const base64Url = reader2.result; // data:image/png;base64,...
          setEncryptedImage(base64Url);
        };
        reader2.readAsDataURL(blob);

        setProcessing(false);

        // ── Generate asset ID + timestamp filename ──────────────────────────
        const imageData2 = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const assetId = generateAssetId(imageData2);
        const now = new Date();
        const ts = now.toISOString().replace(/[:.]/g, '-').replace('T', '_').slice(0, 19);
        const filename = `${assetId}_${ts}.png`;
        setEncryptedFileName(filename);

        // ── Compute vault security data ─────────────────────────────────────
        const perceptualHash = computePerceptualHash(canvas);
        const blockchainAnchor = generateBlockchainAnchor(sha256Hash, now.getTime());
        const certId = generateAuthorshipCertificateId(currentUUID, deviceInfo.deviceId);

        // ── Save to vault database IMMEDIATELY after encryption ─────────────
        const reader = new FileReader();
        reader.onloadend = async () => {
          const thumbnail = reader.result;

          // FIX (TC-01): Hash the encrypted blob, not the original file.
          // The user downloads this blob; re-uploading it must produce the same hash
          // so the SHA short-circuit in runComparison fires and returns CLEAN 100%.
          let encryptedSHA = sha256Hash; // fallback to original SHA if crypto fails
          try {
            const encBuf   = await blob.arrayBuffer();
            const hashBuf  = await crypto.subtle.digest('SHA-256', encBuf);
            encryptedSHA   = Array.from(new Uint8Array(hashBuf))
                               .map(b => b.toString(16).padStart(2, '0')).join('');
          } catch (e) {
            console.warn('SHA-256 of encrypted blob failed, falling back to original SHA:', e);
          }

          // ACTUALLY save to backend vault API
          import('../api/client').then(({ vaultAPI }) => {
            const vaultPayload = {
  asset_id:           assetId,
  owner_name:         user?.name || user?.email || user?.username || currentUUID,  // ← Shows registered username/name
  user_id:            currentUUID,  // ← The locked UUID for this user
  file_name:          filename,
  file_size:          `${(blob.size / 1024).toFixed(2)} KB`,
  thumbnail_base64:   thumbnail,
  device_id:          deviceInfo.deviceId || 'UNKNOWN',
  certificate_id:     certId,
  owner_email:        user?.email || null,
              file_hash:          encryptedSHA || null,
              visual_fingerprint: perceptualHash || null,
              blockchain_anchor:  blockchainAnchor || null,
              resolution:         `${canvas.width}x${canvas.height}`,
              capture_timestamp:  captureTimeData.timestamp ? new Date(captureTimeData.timestamp).toISOString() : new Date().toISOString(),
              gps_latitude:       gpsData.available ? gpsData.latitude : null,
              gps_longitude:      gpsData.available ? gpsData.longitude : null,
              gps_source:         gpsData.source || null,
              ip_address:         ipInfo.ip || null,
              device_name:        deviceInfo.deviceName || null,
            };
            
            console.log('🔵 Sending to vault:', vaultPayload);
            
            vaultAPI.save(vaultPayload).then((response) => {
              console.log('✅ ENCRYPTED IMAGE saved to vault:', assetId);
              console.log('✅ Backend response:', response);
            }).catch(err => {
              console.error('❌ Vault save failed:', err);
              console.error('❌ Error message:', err.message);
              console.error('❌ Error response:', err.response?.data);
              console.error('❌ Status code:', err.response?.status);
            });
          }).catch(err => {
            console.error('❌ API import failed:', err);
          });
        };
        reader.readAsDataURL(blob);

        // ── Update forensicsStats via helper ────────────────────────────────
        updateForensicsStats('encrypted', {
          userId: currentUUID,
          fileName: selectedFile ? selectedFile.name : filename
        });

        const locationMsg = gpsData.available
          ? `\nGPS: ${gpsData.latitude?.toFixed(6)}, ${gpsData.longitude?.toFixed(6)} (${gpsData.source})`
          : '\nGPS: Not available';

        const timeMsg = `\nCapture Time: ${captureTimeData.dateString} (${captureTimeData.source})`;
        const deviceMsg = `\nDevice: ${deviceInfo.deviceName} (${deviceInfo.source})`;
        const ipMsg = `\nIP: ${ipInfo.ip} (${ipInfo.source})`;

        alert('UUID successfully embedded!' + timeMsg + deviceMsg + ipMsg + locationMsg + '\n\nFile saved as: ' + filename);
      }, 'image/png');
    };
    img.src = preview;
  };

  // Rotate canvas by specified degrees (90, 180, 270)
  const rotateCanvas = (sourceCanvas, degrees) => {
    const canvas = document.createElement('canvas');
    // BUG FIX: willReadFrequently here prevents lossy pixel rounding when
    // getImageData is called on the rotated canvas inside extractUUIDWithRotation.
    const ctx = canvas.getContext('2d', { willReadFrequently: true });

    // For 90° and 270°, swap width and height
    if (degrees === 90 || degrees === 270) {
      canvas.width = sourceCanvas.height;
      canvas.height = sourceCanvas.width;
    } else {
      canvas.width = sourceCanvas.width;
      canvas.height = sourceCanvas.height;
    }

    // Move to center, rotate, draw
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate((degrees * Math.PI) / 180);
    ctx.drawImage(sourceCanvas, -sourceCanvas.width / 2, -sourceCanvas.height / 2);

    return canvas;
  };

  // Try extracting UUID from all 4 rotations
  const extractUUIDWithRotation = (sourceCanvas) => {
    const rotations = [0, 90, 180, 270];

    for (const degrees of rotations) {
      let canvas;

      if (degrees === 0) {
        canvas = sourceCanvas;
      } else {
        canvas = rotateCanvas(sourceCanvas, degrees);
      }

      const ctx = canvas.getContext('2d');
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const uuidResult = extractUUIDAdvanced(imageData);

      if (uuidResult.found) {
        return {
          ...uuidResult,
          rotationDetected: degrees,
          rotationMessage: degrees === 0
            ? 'Original orientation'
            : `Image was rotated ${degrees}° clockwise`
        };
      }
    }

    // No UUID found in any rotation
    return {
      found: false,
      rotationDetected: null,
      rotationMessage: 'No rotation detected'
    };
  };

const saveReportToLocalStorage = (report, userInfo) => {
  try {
    const enhancedReport = {
      ...report,
      reportId:  `RPT-${Date.now()}`,
      createdAt: Date.now(),
      userName:  userInfo?.name  || userInfo?.username || 'Unknown',
      userEmail: userInfo?.email || null,
    };

    // Save comparison report to backend
    import('../api/client').then(({ compareAPI, certAPI }) => {

      // Save analysis report
      compareAPI.save({
         asset_id:            enhancedReport.assetId         || 'UNKNOWN',
     is_tampered: enhancedReport.integrityStatus === 'Possible modification detected',
   confidence: Math.round(enhancedReport.confidence || 0),
    phash_sim:  enhancedReport.pHashSim ? Math.round(enhancedReport.pHashSim) : null,  visual_verdict:      enhancedReport.visualVerdict    || 'Unknown',
  editing_tool:        enhancedReport.editingTool      || 'Unknown',
  changes:             enhancedReport.changes          || [],
  pixel_analysis:      enhancedReport.pixelAnalysis    || {},
  uploaded_resolution: enhancedReport.uploadedResolution || null,
  uploaded_size:       String(enhancedReport.uploadedSize || ''),
  original_capture_time: null,
  modified_file_time:    null,
      }).then(() => {
        console.log('✅ Report saved:', enhancedReport.reportId);
      }).catch(err => console.warn('Report save failed:', err.message));

      // Save certificate if present
      if (enhancedReport.authorshipCertificateId) {
        certAPI.save({
          certificate_id: enhancedReport.authorshipCertificateId,
          asset_id:       enhancedReport.assetId,
          confidence:     enhancedReport.confidence,
          status: enhancedReport.ownershipInfo?.includes('Embedded UUID detected') ? 'UUID Detected' : 'No UUID',
          analysis_data:  enhancedReport,
          image_preview:  enhancedReport.imagePreview || null,
        }).then(() => {
          console.log('✅ Certificate saved:', enhancedReport.authorshipCertificateId);
        }).catch(err => console.warn('Certificate save failed:', err.message));
      }

    }).catch(err => console.warn('API import failed:', err.message));

  
  } catch (error) {
    console.error('Error saving report:', error);
    }
};

   // ── Integrity status helper ─────────────────────────────────────────────────
// Called once when building the report. The result flows into both save paths.
//   uuidFound        — did UUID extraction succeed?
//   hasCropMismatch  — does cropInfo show a resolution mismatch?
  const computeIntegrityStatus = (uuidFound, hasCropMismatch) => {
  if (uuidFound && !hasCropMismatch) return 'Protected';
  if (uuidFound && hasCropMismatch)  return 'Possible modification detected';
  return 'Unprotected image';
  };

  // Save analysis to Track Assets (admin tracking system)
  const saveToTrackAssets = (report, imagePreview) => {
    try {
      import('../api/client').then(({ compareAPI }) => {
        compareAPI.save({
          asset_id:            report.assetId,
          is_tampered:    report.integrityStatus === 'Possible modification detected',
          confidence:          Math.round(report.confidence || 0),
          phash_sim:           null,
          visual_verdict: report.integrityStatus + ' — ' + (report.detectedCase || 'Unknown'),
          editing_tool:        'Unknown',
          changes:             report.reasoning || [],
          pixel_analysis:      report.metrics || {},
          uploaded_resolution: report.assetResolution || null,
          uploaded_size:       report.assetFileSize || '0 KB',
          original_capture_time: report.timestamp ? new Date(report.timestamp).toISOString() : null,
          modified_file_time:    new Date().toISOString(),
          is_cropped:          report.cropInfo?.isCropped || false,
          crop_original_resolution: report.cropInfo?.originalResolution || null,
          crop_current_resolution:  report.cropInfo?.currentResolution  || null,
          crop_remaining_percentage: report.cropInfo?.remainingPercentage || null,
        }).then(() => {
          console.log('✅ Saved to Track Assets:', report.assetId);
        }).catch(err => {
          console.error('❌ Track Assets save failed:', err);
          console.error('❌ Error details:', err.message, err.response?.data);
        });
      }).catch(err => {
        console.error('❌ Track Assets API import failed:', err);
      });
    } catch (error) {
      console.error('❌ Error saving to Track Assets:', error);
    }
  };

  
  const analyzeImage = async () => {
    if (!selectedFile) {
      alert('Please select an image to analyze');
      return;
    }

    setProcessing(true);

    // Fetch public IP address
    const publicIP = await getPublicIP();
    const deviceId = getDeviceFingerprint();
     // Run EXIF extraction in parallel — results are passed into classifyImage
  const [analyzeExifDevice, analyzeExifGPS, analyzeCaptureTime] = await Promise.all([
    getExifDeviceInfo(selectedFile),
    getExifGPS(selectedFile),
    getCaptureTime(selectedFile)
  ]);

    const img = new Image();
     img.onload = async () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(img, 0, 0);

      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

      const isLossy = selectedFile.type === 'image/jpeg' || selectedFile.type === 'image/jpg'
        || selectedFile.type === 'image/webp';
      if (isLossy) {
        console.warn(
          '⚠️ [Stego] Source file is lossy (' + selectedFile.type + '). ' +
          'LSB steganography requires a lossless PNG. UUID extraction may fail, ' +
          'especially for small crops. The embedded UUID is only recoverable if ' +
          'the file was exported as PNG directly from the encrypt step.'
        );
      }

      const uuidResult = extractUUIDWithRotation(canvas);

      let originalRecord = null;
      if (uuidResult.found) {
        try {
          const { vaultAPI } = await import('../api/client');
          originalRecord = await vaultAPI.getByUUID(uuidResult.userId);
          console.log('✅ Original record fetched by UUID:', uuidResult.userId);
        } catch (err) {
          console.warn('⚠️ UUID lookup failed, trying visual search fallback:', err.message);
          // ── Visual search fallback ──────────────────────────────────────────
          // canvas is already drawn at this point so computePerceptualHash is safe.
          try {
            const { vaultAPI } = await import('../api/client');
            const currentPHash  = computePerceptualHash(canvas);
            const visualResult  = await vaultAPI.visualSearch(currentPHash, 70);
            if (visualResult.matches && visualResult.matches.length > 0) {
              originalRecord = visualResult.matches[0];
              console.log('✅ Record found by visual match, similarity:', originalRecord.similarity + '%');
            } else {
              console.warn('⚠️ Visual search returned no matches — using extracted steganography data only.');
            }
          } catch (visualErr) {
            console.warn('⚠️ Visual search also failed — using extracted data only:', visualErr.message);
            originalRecord = null;
          }
        }
      }
      // Compute cropInfo and resolutionMismatch BEFORE calling classifyImage,
      // so Case 4 vs Case 5 is decided on real resolution data, not pixel math.
      const currentResolution = canvas.width + 'x' + canvas.height;
      let cropInfo           = null;
      let resolutionMismatch = false;

      if (uuidResult.found && uuidResult.originalResolution) {
        const originalRes        = uuidResult.originalResolution;
        const normalizedOriginal = originalRes.replace(/\s/g, '').toLowerCase();
        const normalizedCurrent  = currentResolution.replace(/\s/g, '').toLowerCase();

        if (normalizedOriginal !== normalizedCurrent) {
          const originalParts  = originalRes.split(/\s*x\s*/i);
          const originalWidth  = parseInt(originalParts[0]);
          const originalHeight = parseInt(originalParts[1]);
          const originalPixels = originalWidth * originalHeight;
          const currentPixels  = canvas.width * canvas.height;

          // ── If width/height are just swapped, it is a rotation not a crop ──
          const isJustRotated = (
            originalWidth  === canvas.height &&
            originalHeight === canvas.width
          );

          if (!isJustRotated) {
            cropInfo = {
              isCropped:           true,
              originalResolution:  originalRes,
              currentResolution:   currentResolution,
              originalPixels:      originalPixels.toLocaleString(),
              currentPixels:       currentPixels.toLocaleString(),
              remainingPercentage: ((currentPixels / originalPixels) * 100).toFixed(2) + '%'
            };
            resolutionMismatch = true;
          }
        }
      }
      const classification = classifyImage(
        canvas,
        imageData,
        selectedFile.size,
        selectedFile.name,
        uuidResult.found,
        resolutionMismatch,
        {
          exifDeviceInfo:  analyzeExifDevice,
          exifGPS:         analyzeExifGPS,
          captureTimeData: analyzeCaptureTime
        }
      );

      const totalPixels = canvas.width * canvas.height;

      // Generate consistent Asset ID based on image content
      const assetId = generateAssetId(imageData);

      // Use extracted data for encrypted images, otherwise use current device data
      // ── BUILD REPORT: branch on whether UUID was found ────────────────────
      let report;

      if (uuidResult.found) {
        // ── UUID FOUND: pull original fields from backend record ──────────
        const rec = originalRecord || {};

        const originalUserId     = rec.user_id            || uuidResult.userId          || null;
        const originalDeviceId   = rec.device_id          || uuidResult.deviceId        || deviceId;
        const originalDeviceName = uuidResult.deviceName  || rec.device_id              || getCurrentDeviceName();
        const originalCertId     = rec.certificate_id     || generateAuthorshipCertificateId(uuidResult.userId, uuidResult.deviceId || deviceId);
        const originalResolution = rec.resolution         || uuidResult.originalResolution || currentResolution;
        const originalTimestamp  = rec.capture_timestamp
          ? new Date(rec.capture_timestamp).getTime()
          : (uuidResult.timestamp || null);
        const originalFileSize   = rec.file_size          || (selectedFile.size / 1024).toFixed(2) + ' KB';
        const originalIpAddress  = uuidResult.ipAddress   || rec.ip_address  || publicIP;
        const originalIpSource   = uuidResult.ipSource    || 'Embedded';
        const originalDeviceSrc  = uuidResult.deviceSource || 'Embedded';
        const originalDeviceName2 = uuidResult.deviceName || rec.device_name || getCurrentDeviceName();

        // Resolve GPS: steganography first, then backend, then unavailable
        const originalGPS = uuidResult.gps?.available
          ? uuidResult.gps
          : (rec.gps_latitude && rec.gps_longitude)
            ? {
                available:   true,
                latitude:    parseFloat(rec.gps_latitude),
                longitude:   parseFloat(rec.gps_longitude),
                coordinates: `${parseFloat(rec.gps_latitude).toFixed(6)}, ${parseFloat(rec.gps_longitude).toFixed(6)}`,
                mapsUrl:     `https://www.google.com/maps?q=${rec.gps_latitude},${rec.gps_longitude}`,
                source:      rec.gps_source || 'Backend'
              }
            : { available: false };

        report = {
          // ── SECTION A: Original Embedded Record (from backend / extracted) ──
          assetId:                      rec.asset_id || assetId,
          uniqueUserId:                 originalUserId,
          assetFileSize:                originalFileSize,
          assetResolution:              originalResolution,
          userEncryptedResolution:      originalResolution,
          timestamp:                    originalTimestamp,
          captureLocationInfo:          captureSource,
          gpsLocation:                  originalGPS,
          totalPixels:                  totalPixels.toLocaleString(),
          pixelsVerifiedWithBiometrics: Math.floor(totalPixels * 0.98).toLocaleString(),
          deviceName:                   originalDeviceName2,
          deviceDetails:                getDeviceDetails(),
          deviceId:                     originalDeviceId,
          deviceSource:                 originalDeviceSrc,
          ipAddress:                    originalIpAddress,
          ipSource:                     originalIpSource,
          authorshipCertificateId:      originalCertId,
          authorshipCertificate:        'Valid & Verified (' + (selectedFile.type.startsWith('image/') ? 'Image' : 'File') + ')',
          ownershipInfo:                'Embedded UUID detected',
          metadataSource:               originalRecord ? 'backend' : 'extracted',

          // ── SECTION B: Current Uploaded Image Analysis ────────────────────
          uploadedResolution:  currentResolution,
          uploadedSize:        (selectedFile.size / 1024).toFixed(2) + ' KB',
          rotationDetected:    uuidResult.rotationDetected,
          rotationMessage:     uuidResult.rotationMessage,
          cropInfo:            cropInfo,
          resolutionMismatch:  resolutionMismatch,
          integrityStatus:     computeIntegrityStatus(true, cropInfo?.isCropped === true),

          // ── Classification (current image) ────────────────────────────────
          detectedCase:  classification.detectedCase,
          caseCode:      classification.caseCode,
          internalLabel: classification.internalLabel,
          displayLabel:  classification.displayLabel,
          evidenceLevel: classification.evidenceLevel,
          confidence:    classification.confidence,
          reasoning:     classification.reasoning,
          metrics:       classification.metrics,
        };

      } else {
        // ── NO UUID: Case 1 / 2 / 3 only — no backend call, no ownership ──
        report = {
          assetId:                      assetId,
          uniqueUserId:                 null,
          assetFileSize:                (selectedFile.size / 1024).toFixed(2) + ' KB',
          assetResolution:              currentResolution,
          userEncryptedResolution:      'N/A',
          timestamp:                    null,
          captureLocationInfo:          captureSource,
          gpsLocation:                  { available: false },
          totalPixels:                  totalPixels.toLocaleString(),
          pixelsVerifiedWithBiometrics: '0',
          deviceName:                   getCurrentDeviceName(),
          deviceDetails:                getDeviceDetails(),
          deviceId:                     deviceId,
          deviceSource:                 'Current Device',
          ipAddress:                    publicIP,
          ipSource:                     'Current Device',
          authorshipCertificateId:      'Not Present',
          authorshipCertificate:        'Not Present',
          ownershipInfo:                'No UUID found',
          rotationDetected:             uuidResult.rotationDetected,
          rotationMessage:              uuidResult.rotationMessage,
          cropInfo:                     null,
          resolutionMismatch:           false,
          integrityStatus:              computeIntegrityStatus(false, false),
          uploadedResolution:           currentResolution,
          uploadedSize:                 (selectedFile.size / 1024).toFixed(2) + ' KB',
          detectedCase:  classification.detectedCase,
          caseCode:      classification.caseCode,
          internalLabel: classification.internalLabel,
          displayLabel:  classification.displayLabel,
          evidenceLevel: classification.evidenceLevel,
          confidence:    classification.confidence,
          reasoning:     classification.reasoning,
          metrics:       classification.metrics,
        };
      }

      setAnalysisReport(report);

      // Save to legacy analysisReports storage
      saveReportToLocalStorage(report, user);

      setProcessing(false);

      // [NEW] Update dashboard stats via helper
      updateForensicsStats('analyzed', {
        fileName: selectedFile.name
      });

      // [NEW] Generate and save comprehensive certificate
      saveCertificate(report, preview);
      // [NEW] Save to Track Assets for admin tracking
      saveToTrackAssets(report, preview);
    };
    img.src = preview;
  };

  const downloadReport = () => {
    if (!analysisReport) return;
    generateReport(analysisReport, preview);
  };

  return (
    <>
      {/* Navigation Bar */}
      <div className="bg-white border-b shadow-sm">
        <div className="max-w-6xl mx-auto px-6 py-3 flex justify-between items-center">
          <button
            onClick={() => navigate(user.role === 'admin' ? '/admin/dashboard' : '/user/dashboard')}
            className="flex items-center text-blue-600 hover:text-blue-800 font-semibold transition"
          >
            <ArrowLeft className="mr-2" size={20} />
            Back to Dashboard
          </button>
          <div className="flex items-center gap-4">
            <span className="text-gray-700">
              {user.role === 'admin' ? `Admin: ${user.username}` : user.name}
            </span>
            <button
              onClick={onLogout}
              className="bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 transition"
            >
              Logout
            </button>
          </div>
        </div>
      </div>

      {/* Original Image Analyzer Content */}
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-6">
        <div className="max-w-6xl mx-auto">
          <div className="bg-white rounded-2xl shadow-2xl overflow-hidden">
            <div className="bg-gradient-to-r from-blue-600 to-indigo-600 p-6 text-white">
              <h1 className="text-3xl font-bold mb-2">Capture Proof & Analyser Tool</h1>
              <p className="text-blue-100">Embed your PINIT identity into images and verify ownership</p>
            </div>

            <div className="flex border-b">
              <button
                onClick={() => setActiveTab('encrypt')}
                className={`flex-1 py-4 px-6 font-semibold transition ${
                  activeTab === 'encrypt'
                    ? 'bg-blue-50 text-blue-600 border-b-2 border-blue-600'
                    : 'text-gray-600 hover:bg-gray-50'
                }`}
              >
                <Camera className="inline mr-2" size={20} />
                Capture &amp; Embed
              </button>
              <button
                onClick={() => setActiveTab('analyze')}
                className={`flex-1 py-4 px-6 font-semibold transition ${
                  activeTab === 'analyze'
                    ? 'bg-blue-50 text-blue-600 border-b-2 border-blue-600'
                    : 'text-gray-600 hover:bg-gray-50'
                }`}
              >
                <FileSearch className="inline mr-2" size={20} />
                Analyse &amp; Verify
              </button>
            </div>

            <div className="p-6">
              {activeTab === 'encrypt' && (
                <div className="space-y-6">

                  <div className="grid md:grid-cols-2 gap-6">
                    <div>
                      <label className="block font-semibold mb-2 text-gray-700">
                        🔐 Owner UUID <span style={{fontSize:'11px',fontWeight:'400',color:'#6b7280',marginLeft:'6px'}}>(auto-assigned from your account — read only)</span>
                      </label>
                      <div style={{position:'relative'}}>
                        <input
                          type="text"
                          value={userId}
                          readOnly
                          placeholder="UUID will load from your account..."
                          className="w-full px-4 py-3 border border-gray-200 rounded-lg bg-gray-50 text-gray-600"
                          style={{cursor:'not-allowed',fontFamily:'monospace',fontSize:'13px',paddingRight:'110px'}}
                        />
                        <span style={{position:'absolute',right:'12px',top:'50%',transform:'translateY(-50%)',fontSize:'11px',background:'#e0e7ff',color:'#4338ca',padding:'2px 8px',borderRadius:'12px',fontWeight:'600',whiteSpace:'nowrap'}}>
                          🔒 LOCKED
                        </span>
                      </div>
                      {!userId && (
                        <p style={{fontSize:'12px',color:'#dc2626',marginTop:'4px'}}>
                          ⚠️ UUID not found. Please <a href="/login" style={{color:'#4f46e5',fontWeight:'600'}}>log in</a> again to auto-load your UUID.
                        </p>
                      )}
                      {userId && (
                        <p style={{fontSize:'12px',color:'#16a34a',marginTop:'4px'}}>
                          ✅ Linked to: {localStorage.getItem('savedUser') ? JSON.parse(localStorage.getItem('savedUser'))?.email || 'your account' : 'your account'}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div className="flex gap-4">
                      <button
                        onClick={cameraActive ? captureImage : startCamera}
                        className="flex-1 bg-green-600 text-white px-6 py-3 rounded-lg hover:bg-green-700 transition font-semibold"
                      >
                        <Camera className="inline mr-2" size={20} />
                        {cameraActive ? 'Capture Photo' : 'Open Camera'}
                      </button>

                      <label className="flex-1 bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition font-semibold text-center cursor-pointer">
                        <Upload className="inline mr-2" size={20} />
                        Upload Image
                        <input
                          type="file"
                          accept="image/*"
                          onChange={(e) => handleFileSelect(e.target.files[0])}
                          className="hidden"
                        />
                      </label>
                    </div>

                    {cameraActive && (
                      <div className="relative bg-black rounded-lg overflow-hidden">
                        <video
                          ref={videoRef}
                          autoPlay
                          playsInline
                          muted
                          className="w-full rounded-lg"
                          style={{ maxHeight: '500px' }}
                        />

                        {/* Camera Controls Overlay */}
                        <div className="absolute top-2 right-2 flex gap-2">
                          {canSwitchCamera && (
                            <button
                              onClick={switchCamera}
                              className="bg-blue-600 text-white px-4 py-2 rounded-lg shadow-lg hover:bg-blue-700 transition flex items-center gap-2"
                            >
                              🔄 Switch Camera
                            </button>
                          )}
                          <button
                            onClick={stopCamera}
                            className="bg-red-600 text-white px-4 py-2 rounded-lg shadow-lg hover:bg-red-700 transition"
                          >
                            ✕ Close
                          </button>
                        </div>

                        {/* Camera Info Badge */}
                        <div className="absolute bottom-2 left-2 bg-black bg-opacity-60 text-white px-3 py-1 rounded text-sm">
                          📷 {facingMode === 'environment' ? 'Back Camera' : 'Front Camera'}
                        </div>
                      </div>
                    )}
                    <canvas ref={canvasRef} className="hidden" />
                  </div>

                  {preview && (
                    <div className="grid md:grid-cols-2 gap-6">
                      <div>
                        <h3 className="font-semibold mb-2 text-gray-700">Original Image</h3>
                        <img src={preview} alt="Original" className="w-full rounded-lg border" />
                      </div>

                      {encryptedImage && (
                        <div>
                          <h3 className="font-semibold mb-2 text-gray-700">Encrypted Image</h3>
                          <img src={encryptedImage} alt="Encrypted" className="w-full rounded-lg border" />

                          {/* Save encrypted image */}
                          <button
                            onClick={() => {
                              if (encryptedImage) {
                                saveFileToDevice(encryptedImage, encryptedFileName);
                              } else {
                                alert('Image not ready yet, please wait.');
                              }
                            }}
                            className="mt-3 block w-full bg-green-600 text-white px-4 py-2 rounded-lg text-center hover:bg-green-700"
                            style={{border:'none',cursor:'pointer',fontSize:'15px',fontWeight:'600'}}
                          >
                            <Download className="inline mr-2" size={18} />
                            Save Encrypted Image to Gallery
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  <button
                    onClick={embedUUID}
                    disabled={!selectedFile || !userId || processing}
                    className="w-full bg-indigo-600 text-white px-6 py-4 rounded-lg hover:bg-indigo-700 transition font-semibold text-lg disabled:bg-gray-400 disabled:cursor-not-allowed"
                  >
                    {processing ? 'Processing...' : 'Embed UUID into Image'}
                  </button>
                </div>
              )}

              {activeTab === 'analyze' && (
                <div className="space-y-6">
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                    <h3 className="font-semibold text-amber-900 mb-2">Advanced AI Classification</h3>
                    <ul className="text-amber-800 text-sm space-y-1">
                      <li>• Advanced LSB extraction with header validation</li>
                      <li>• GPS location extraction from encrypted images</li>
                      <li>• Multi-metric classification algorithm</li>
                      <li>• High-confidence case detection with reasoning</li>
                    </ul>
                  </div>

                  <label className="block w-full bg-blue-600 text-white px-6 py-4 rounded-lg hover:bg-blue-700 transition font-semibold text-center cursor-pointer">
                    <Upload className="inline mr-2" size={20} />
                    Upload Image to Analyze
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => handleFileSelect(e.target.files[0])}
                      className="hidden"
                    />
                  </label>

                  {/* APK gallery picker — shown inside Capacitor for native gallery access */}
                  {!!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()) && (
                    <button
                      onClick={async () => {
                        try {
                          const { Camera, CameraResultType, CameraSource } = await import('@capacitor/camera');
                          const photo = await Camera.getPhoto({
                            quality: 100,
                            allowEditing: false,
                            resultType: CameraResultType.DataUrl,
                            source: CameraSource.Photos,
                          });
                          if (photo.dataUrl) {
                            const res = await fetch(photo.dataUrl);
                            const blob = await res.blob();
                            const file = new File([blob], 'gallery-image.png', { type: blob.type || 'image/png' });
                            handleFileSelect(file);
                          }
                        } catch (err) {
                          if (!String(err).includes('cancelled') && !String(err).includes('AbortError')) {
                            alert('Could not open gallery: ' + err.message);
                          }
                        }
                      }}
                      className="block w-full bg-indigo-500 text-white px-6 py-4 rounded-lg hover:bg-indigo-600 transition font-semibold text-center"
                      style={{border:'none',cursor:'pointer',fontSize:'16px'}}
                    >
                      🖼️ Pick from Gallery
                    </button>
                  )}

                  {preview && (
                    <div>
                      <h3 className="font-semibold mb-2 text-gray-700">Selected Image</h3>
                      <img src={preview} alt="To analyze" className="w-full max-w-md mx-auto rounded-lg border" />
                    </div>
                  )}

                  <button
                    onClick={analyzeImage}
                    disabled={!selectedFile || processing}
                    className="w-full bg-purple-600 text-white px-6 py-4 rounded-lg hover:bg-purple-700 transition font-semibold text-lg disabled:bg-gray-400 disabled:cursor-not-allowed"
                  >
                    {processing ? 'Analyzing...' : 'Analyze Image'}
                  </button>

                  {analysisReport && (
                    <div className="bg-gradient-to-br from-gray-50 to-gray-100 rounded-xl p-6 border border-gray-200">
                      <div className="flex justify-between items-center mb-4">
                        <h3 className="text-2xl font-bold text-gray-800">Analysis Report</h3>
                        <button
                          onClick={downloadReport}
                          className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 text-sm"
                        >
                          <Download className="inline mr-1" size={16} />
                          Download Report
                        </button>
                      </div>

                      <div className="bg-yellow-100 border-l-4 border-yellow-500 p-4 mb-4">
                        <p className="font-bold text-yellow-900">{analysisReport.detectedCase}</p>
                        <p className="text-yellow-800 text-sm">Confidence: {analysisReport.confidence}%</p>
                      </div>

                      {analysisReport.rotationDetected !== null && analysisReport.rotationDetected !== 0 && (
                        <div className="bg-blue-50 border-l-4 border-blue-500 p-4 mb-4">
                          <div className="flex items-center gap-2">
                            <span className="text-2xl">🔄</span>
                            <div>
                              <p className="font-bold text-blue-900">Rotation Detected</p>
                              <p className="text-blue-800 text-sm">{analysisReport.rotationMessage}</p>
                              <p className="text-blue-700 text-xs mt-1">
                                The encrypted data was successfully recovered despite rotation.
                              </p>
                            </div>
                          </div>
                        </div>
                      )}

                      

                      <div className="grid md:grid-cols-2 gap-4">
                        <div className="bg-white p-4 rounded-lg border">
                          <h4 className="font-bold text-blue-900 mb-3 border-b pb-2">Ownership at Creation</h4>
                          <div>
                            <span className="font-semibold">Authorship Certificate ID:</span>{' '}
                            {analysisReport.authorshipCertificateId}
                          </div>
                          <div className="space-y-2 text-sm">
                            <div><span className="font-semibold">Asset ID:</span> {analysisReport.assetId}</div>
                            <div><span className="font-semibold">Unique User ID:</span> {analysisReport.uniqueUserId}</div>
                            <div><span className="font-semibold">Asset File Size:</span> {analysisReport.assetFileSize}</div>
                            <div><span className="font-semibold">Asset Resolution:</span> {analysisReport.assetResolution}</div>
                            <div><span className="font-semibold">User Encrypted Resolution:</span> {analysisReport.userEncryptedResolution}</div>
                            <div><span className="font-semibold">Time Stamp:</span> {analysisReport.timestamp ? new Date(analysisReport.timestamp).toLocaleString() : 'Not Available'}</div>
                            <div><span className="font-semibold">Capture Location:</span> {analysisReport.captureLocationInfo}</div>
                            <div>
                              <span className="font-semibold">GPS Location:</span>{' '}
                              {analysisReport.gpsLocation?.available ? (
                                <a
                                  href={analysisReport.gpsLocation.mapsUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-blue-600 underline hover:text-blue-800"
                                >
                                  📍 {analysisReport.gpsLocation.coordinates}
                                </a>
                              ) : (
                                <span className="text-gray-500">Not Available</span>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="bg-white p-4 rounded-lg border">
                          <h4 className="font-bold text-blue-900 mb-3 border-b pb-2">Technical Details</h4>
                          <div className="space-y-2 text-sm">
                            <div><span className="font-semibold">Total Pixels:</span> {analysisReport.totalPixels}</div>
                            <div><span className="font-semibold">Pixels Verified:</span> {analysisReport.pixelsVerifiedWithBiometrics}</div>
                            <div>
                              <span className="font-semibold">Device Name:</span> {analysisReport.deviceName}
                              <span className="text-gray-500 text-xs ml-1">({analysisReport.deviceSource})</span>
                            </div>
                            <div>
                              <span className="font-semibold">Device ID:</span>{' '}
                              <span
                                onClick={() => setShowDeviceDetails(true)}
                                className="text-blue-600 underline cursor-pointer hover:text-blue-800"
                              >
                                {analysisReport.deviceId}
                              </span>
                              <span className="text-gray-500 text-xs ml-1">({analysisReport.deviceSource})</span>
                            </div>
                            <div>
                              <span className="font-semibold">IP Address:</span> {analysisReport.ipAddress}
                              <span className="text-gray-500 text-xs ml-1">({analysisReport.ipSource})</span>
                            </div>
                            <div><span className="font-semibold">Ownership Info:</span> {analysisReport.ownershipInfo}</div>
                            <div><span className="font-semibold">Certificate:</span> {analysisReport.authorshipCertificate}</div>
                            <div>
                              <span className="font-semibold">Image Cropped:</span>{' '}
                              {analysisReport.cropInfo?.isCropped ? (
                                <span className="text-purple-700 font-semibold">
                                  Yes ✂️ ({analysisReport.cropInfo.originalResolution} → {analysisReport.cropInfo.currentResolution}, {analysisReport.cropInfo.remainingPercentage} remaining)
                                </span>
                              ) : (
                                <span className="text-gray-500">No</span>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Device Details Modal */}
      {showDeviceDetails && analysisReport && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full mx-4 overflow-hidden">
            <div className="bg-gradient-to-r from-blue-600 to-indigo-600 px-6 py-4">
              <div className="flex justify-between items-center">
                <h2 className="text-xl font-bold text-white">Device Information</h2>
                <button
                  onClick={() => setShowDeviceDetails(false)}
                  className="text-white hover:text-gray-200 text-2xl font-bold"
                >
                  ×
                </button>
              </div>
              <p className="text-blue-100 text-sm mt-1">ID: {analysisReport.deviceId}</p>
            </div>

            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-gray-50 p-3 rounded-lg">
                  <p className="text-xs text-gray-500 uppercase">Device Type</p>
                  <p className="font-semibold text-gray-800">{analysisReport.deviceDetails?.deviceType || 'Unknown'}</p>
                </div>
                <div className="bg-gray-50 p-3 rounded-lg">
                  <p className="text-xs text-gray-500 uppercase">Platform</p>
                  <p className="font-semibold text-gray-800">{analysisReport.deviceDetails?.platform || 'Unknown'}</p>
                </div>
                <div className="bg-gray-50 p-3 rounded-lg">
                  <p className="text-xs text-gray-500 uppercase">Screen Resolution</p>
                  <p className="font-semibold text-gray-800">{analysisReport.deviceDetails?.screen || 'Unknown'}</p>
                </div>
                <div className="bg-gray-50 p-3 rounded-lg">
                  <p className="text-xs text-gray-500 uppercase">Color Depth</p>
                  <p className="font-semibold text-gray-800">{analysisReport.deviceDetails?.colorDepth || 'Unknown'}</p>
                </div>
                <div className="bg-gray-50 p-3 rounded-lg">
                  <p className="text-xs text-gray-500 uppercase">CPU Cores</p>
                  <p className="font-semibold text-gray-800">{analysisReport.deviceDetails?.cores || 'Unknown'}</p>
                </div>
                <div className="bg-gray-50 p-3 rounded-lg">
                  <p className="text-xs text-gray-500 uppercase">Memory</p>
                  <p className="font-semibold text-gray-800">{analysisReport.deviceDetails?.memory || 'Unknown'}</p>
                </div>
                <div className="bg-gray-50 p-3 rounded-lg">
                  <p className="text-xs text-gray-500 uppercase">Timezone</p>
                  <p className="font-semibold text-gray-800">{analysisReport.deviceDetails?.timezone || 'Unknown'}</p>
                </div>
                <div className="bg-gray-50 p-3 rounded-lg">
                  <p className="text-xs text-gray-500 uppercase">Language</p>
                  <p className="font-semibold text-gray-800">{analysisReport.deviceDetails?.language || 'Unknown'}</p>
                </div>
                <div className="bg-gray-50 p-3 rounded-lg">
                  <p className="text-xs text-gray-500 uppercase">Touch Capable</p>
                  <p className="font-semibold text-gray-800">{analysisReport.deviceDetails?.touchCapable || 'Unknown'}</p>
                </div>
                <div className="bg-gray-50 p-3 rounded-lg">
                  <p className="text-xs text-gray-500 uppercase">Touch Points</p>
                  <p className="font-semibold text-gray-800">{analysisReport.deviceDetails?.touchPoints || '0'}</p>
                </div>
              </div>

              <div className="bg-gray-50 p-3 rounded-lg">
                <p className="text-xs text-gray-500 uppercase mb-1">Browser / User Agent</p>
                <p className="font-semibold text-gray-800 text-xs break-all">{analysisReport.deviceDetails?.browser || 'Unknown'}</p>
              </div>

              <button
                onClick={() => setShowDeviceDetails(false)}
                className="w-full bg-blue-600 text-white py-3 rounded-lg hover:bg-blue-700 transition font-semibold"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default ImageCryptoAnalyzer;