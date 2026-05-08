import React, { useState, useEffect } from 'react';
import { Search, Eye, Download, Filter, Calendar, CheckCircle, XCircle, Trash2 } from 'lucide-react';
import { adminAPI, vaultAPI } from '../api/client';
import './AssetsPage.css';

function AssetsPage() {
  const [assets, setAssets] = useState([]);
  const [filteredAssets, setFilteredAssets] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedAsset, setSelectedAsset] = useState(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [loading, setLoading] = useState(true);
  const [deleteConfirm, setDeleteConfirm] = useState(null); // asset to delete
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    const loadAssets = async () => {
      try {
        const res = await adminAPI.getAllVault();
        const raw = res.assets || [];
        const blacklist = JSON.parse(localStorage.getItem('pinit_deleted_ids') || '[]');
        const mapped = raw
          .filter(a => !blacklist.includes(a.asset_id) && !blacklist.includes(a.id) && !blacklist.includes(a.assetId))
          .map(a => ({
          ...a,
          assetId:        a.asset_id       || a.assetId,
          reportId:       a.id             || a.asset_id,
          thumbnailUrl:   a.thumbnail_url  || a.preview_url || a.image_url || a.encrypted_data || a.image_data || null,
          assetResolution: a.resolution    || a.assetResolution || '—',
          assetFileSize:  a.file_size      || a.assetFileSize   || '—',
          uniqueUserId:   a.user_id        || a.uniqueUserId    || null,
          userName:       a.owner_name     || a.userName        || 'Unknown',
          userEmail:      a.owner_email    || a.userEmail       || null,
          deviceId:       a.device_id      || a.deviceId        || null,
          deviceName:     a.device_name    || a.deviceName      || null,
          ipAddress:      a.ip_address     || a.ipAddress       || null,
          confidence:     a.confidence     || 95,
          status:         a.status         || 'Verified',
          timestamp:      a.created_at     || a.timestamp,
          createdAt:      a.created_at     || a.createdAt,
          platformCopies: a.platform_copies|| a.platformCopies  || 0,
          authorshipCertificateId: a.certificate_id || a.authorshipCertificateId || null,
          fileHash:       a.file_hash      || a.fileHash        || null,
          blockchainAnchor: a.blockchain_anchor || a.blockchainAnchor || null,
          gpsLocation:    a.gps_location   || a.gpsLocation     || null,
          detectedCase:   a.status === 'verified' ? 'Case 1: Verified' : 'Case 2: Unknown',
          isCropped:      a.is_cropped || false,
          cropOriginalResolution:   a.crop_original_resolution  || null,
          cropCurrentResolution:    a.crop_current_resolution   || null,
          cropRemainingPercentage:  a.crop_remaining_percentage || null,
        }));
        setAssets(mapped);
        setFilteredAssets(mapped);
      } catch (err) {
        console.error('Failed to load assets:', err);
      } finally {
        setLoading(false);
      }
    };
    loadAssets();
  }, []);

  // Search functionality - searches ALL fields
  const handleSearch = (query) => {
    setSearchQuery(query);
    
    if (!query.trim()) {
      setFilteredAssets(assets);
      return;
    }

    const lowerQuery = query.toLowerCase();
    
    const filtered = assets.filter(asset => {
      return (
        // Asset ID
        asset.assetId?.toLowerCase().includes(lowerQuery) ||
        // User ID / UUID
        asset.uniqueUserId?.toLowerCase().includes(lowerQuery) ||
        // Authorship Certificate ID
        asset.authorshipCertificateId?.toLowerCase().includes(lowerQuery) ||
        // Email
        asset.userEmail?.toLowerCase().includes(lowerQuery) ||
        // Username
        asset.userName?.toLowerCase().includes(lowerQuery) ||
        // Device ID
        asset.deviceId?.toLowerCase().includes(lowerQuery) ||
        // IP Address
        asset.ipAddress?.toLowerCase().includes(lowerQuery) ||
        // Report ID (using timestamp as ID)
        asset.reportId?.toLowerCase().includes(lowerQuery) ||
        // Status
        asset.status?.toLowerCase().includes(lowerQuery) ||
        // Detected Case
        asset.detectedCase?.toLowerCase().includes(lowerQuery)
      );
    });

    setFilteredAssets(filtered);
  };

  const deleteAsset = async (asset) => {
    setDeleting(true);
    const id = asset.asset_id || asset.assetId || asset.reportId || asset.id;

    // Blacklist ALL id variants immediately — covers every refresh scenario
    try {
      const blacklist = JSON.parse(localStorage.getItem('pinit_deleted_ids') || '[]');
      [id, asset.asset_id, asset.assetId, asset.reportId, asset.id]
        .filter(Boolean)
        .forEach(v => { if (!blacklist.includes(v)) blacklist.push(v); });
      localStorage.setItem('pinit_deleted_ids', JSON.stringify(blacklist));
    } catch (e) { console.warn(e); }

    // Delete from backend
    try { await vaultAPI.delete(id); } catch (err) { console.warn('Backend delete failed:', err); }

    // Remove from all localStorage
    try {
      ['vaultImages', 'analysisReports'].forEach(key => {
        const arr = JSON.parse(localStorage.getItem(key) || '[]');
        localStorage.setItem(key, JSON.stringify(
          arr.filter(a => a.assetId !== id && a.asset_id !== id && a.id !== id && a.reportId !== id)
        ));
      });
    } catch (e) { console.warn(e); }

    // Remove from React state — filter on ALL id variants
    const match = (a) => [id, asset.asset_id, asset.assetId, asset.reportId]
      .filter(Boolean)
      .some(v => (a.asset_id || a.assetId || a.reportId || a.id) === v);
    setAssets(prev => prev.filter(a => !match(a)));
    setFilteredAssets(prev => prev.filter(a => !match(a)));

    setDeleting(false);
    setDeleteConfirm(null);
  };

    // 4. Remove from state
    setDeleting(false);
    setDeleteConfirm(null);
  };

  const viewDetails = (asset) => {
    setSelectedAsset(asset);
    setShowDetailModal(true);
  };

  const downloadReport = (asset) => {
    const isVerified = asset.status === 'Verified' || asset.status === 'verified';
    const html = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"/><title>Asset Report - ${asset.assetId}</title>
<style>
  body{font-family:Arial,sans-serif;margin:40px;color:#1f2937;}
  h1{font-size:1.5rem;border-bottom:2px solid #6366f1;padding-bottom:8px;}
  h2{font-size:1rem;color:#6366f1;margin-top:24px;margin-bottom:8px;}
  .grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px;}
  .item{background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:12px;}
  .label{font-size:0.7rem;font-weight:700;color:#6b7280;margin-bottom:4px;text-transform:uppercase;}
  .value{font-size:0.9rem;font-weight:500;}
  .badge{display:inline-block;padding:2px 10px;border-radius:20px;font-size:0.8rem;font-weight:600;}
  .verified{background:#d1fae5;color:#065f46;}.unknown{background:#fee2e2;color:#991b1b;}
  .footer{margin-top:40px;font-size:0.8rem;color:#6b7280;border-top:1px solid #e5e7eb;padding-top:12px;}
</style></head><body>
  <h1>Asset Details Report</h1>
  <h2>Asset Information</h2>
  <div class="grid">
    <div class="item"><div class="label">Asset ID</div><div class="value">${asset.assetId||'—'}</div></div>
    <div class="item"><div class="label">Status</div><div class="value"><span class="badge ${isVerified?'verified':'unknown'}">${isVerified?'✓ Verified':'⊗ Unknown'}</span></div></div>
    <div class="item"><div class="label">Certificate ID</div><div class="value">${asset.authorshipCertificateId||'Not Present'}</div></div>
    <div class="item"><div class="label">Device ID</div><div class="value">${asset.deviceId||'—'}</div></div>
    <div class="item"><div class="label">Device Name</div><div class="value">${asset.deviceName||'—'}</div></div>
    <div class="item"><div class="label">Confidence</div><div class="value">${asset.confidence}%</div></div>
  </div>
  <h2>Creator Information</h2>
  <div class="grid">
    <div class="item"><div class="label">Name</div><div class="value">${asset.userName||'—'}</div></div>
    <div class="item"><div class="label">Email</div><div class="value">${asset.userEmail||'—'}</div></div>
    <div class="item"><div class="label">User ID</div><div class="value">${asset.uniqueUserId||'—'}</div></div>
    <div class="item"><div class="label">IP Address</div><div class="value">${asset.ipAddress||'—'}</div></div>
  </div>
  <h2>Technical Details</h2>
  <div class="grid">
    <div class="item"><div class="label">Resolution</div><div class="value">${asset.assetResolution||'—'}</div></div>
    <div class="item"><div class="label">File Size</div><div class="value">${asset.assetFileSize||'—'}</div></div>
    <div class="item"><div class="label">Created</div><div class="value">${asset.createdAt ? new Date(asset.createdAt).toLocaleDateString() : '—'}</div></div>
    <div class="item"><div class="label">Platform Copies</div><div class="value">${asset.platformCopies||0}</div></div>
    <div class="item"><div class="label">Image Cropped</div><div class="value">${asset.isCropped ? `Yes ✂️ — ${asset.cropOriginalResolution} → ${asset.cropCurrentResolution} (${asset.cropRemainingPercentage} remaining)` : 'No'}</div></div>
  </div>
  <div class="footer">Report generated: ${new Date().toLocaleString()} | Image Forensics App</div>
</body></html>`;
    const w = window.open('', '_blank');
    if (w) { w.document.write(html); w.document.close(); w.onload = () => w.print(); }
  };

  const formatDate = (timestamp) => {
    if (!timestamp) return 'N/A';
    const date = new Date(timestamp);
    return date.toLocaleDateString('en-US', { 
      day: 'numeric', 
      month: 'short',
      year: 'numeric'
    });
  };

  const getStatusBadge = (status) => {
    if (status === 'Verified') {
      return <span className="badge-verified"><CheckCircle size={14} /> Verified</span>;
    }
    return <span className="badge-unknown"><XCircle size={14} /> Unknown</span>;
  };

  return (
    <div className="assets-page">
      <div className="assets-header">
        <div>
          <h1>Assets Management</h1>
          <p className="subtitle">View and search all encrypted assets and analysis reports</p>
        </div>
        <div className="assets-stats">
          <div className="stat-box">
            <span className="stat-number">{assets.length}</span>
            <span className="stat-label">Total Assets</span>
          </div>
          <div className="stat-box">
            <span className="stat-number">{assets.filter(a => a.status === 'Verified' || a.status === 'verified').length}</span>
            <span className="stat-label">Verified</span>
          </div>
        </div>
      </div>

      {/* Search Bar */}
      <div className="search-section">
        <div className="search-bar">
          <Search className="search-icon" size={20} />
          <input
            type="text"
            placeholder="Search by UUID, Asset ID, Authorship ID, Email, Username, Device ID, IP Address, Report ID..."
            value={searchQuery}
            onChange={(e) => handleSearch(e.target.value)}
            className="search-input"
          />
          {searchQuery && (
            <button 
              onClick={() => handleSearch('')}
              className="clear-search"
            >
              ✕
            </button>
          )}
        </div>
        <button className="filter-btn">
          <Filter size={18} />
          Filters
        </button>
      </div>

      {/* Results Count */}
      {searchQuery && (
        <div className="search-results-info">
          Found {filteredAssets.length} result{filteredAssets.length !== 1 ? 's' : ''} for "{searchQuery}"
        </div>
      )}

      {/* Assets Table */}
      <div className="assets-table-container">
        {filteredAssets.length > 0 ? (
          <table className="assets-table">
            <thead>
              <tr>
                <th>Thumbnail</th>
                <th>Asset ID</th>
                <th>Creator</th>
                <th>Date</th>
                <th>Status</th>
                <th>Platform Copies</th>
                <th>Confidence</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredAssets.map((asset) => (
                <tr key={asset.reportId}>
                  <td>
                    <div className="asset-thumbnail">
                      {asset.thumbnail_url || asset.thumbnailUrl || asset.encrypted_data || asset.encryptedData || asset.image_url || asset.imageUrl ? (
                        <img 
                          src={asset.thumbnail_url || asset.thumbnailUrl || asset.encrypted_data || asset.encryptedData || asset.image_url || asset.imageUrl}
                          alt={asset.assetId}
                          onClick={() => window.open(asset.thumbnail_url || asset.thumbnailUrl || asset.encrypted_data || asset.encryptedData || asset.image_url || asset.imageUrl, '_blank')}
                        />
                      ) : (
                        <div className="thumbnail-placeholder">
                          No Image
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="asset-id">{asset.assetId}</td>
                  <td>
                    <div className="creator-info">
                      <div className="creator-avatar">
                        {asset.userName?.charAt(0).toUpperCase() || asset.uniqueUserId?.charAt(0).toUpperCase() || 'U'}
                      </div>
                      <div>
                        <div className="creator-name">{asset.userName || 'Unknown'}</div>
                        <div className="creator-email">{asset.userEmail || asset.uniqueUserId}</div>
                      </div>
                    </div>
                  </td>
                  <td>
                    <div className="date-cell">
                      <Calendar size={14} />
                      {formatDate(asset.timestamp || asset.createdAt)}
                    </div>
                  </td>
                  <td>{getStatusBadge(asset.status)}</td>
                  <td className="platform-copies">{asset.platformCopies || 0}</td>
                  <td>
                    <div className="confidence-bar">
                      <div className="confidence-fill" style={{ width: `${asset.confidence}%` }}></div>
                      <span className="confidence-text">{asset.confidence}%</span>
                    </div>
                  </td>
                  <td>
                    <div className="action-buttons">
                      <button 
                        onClick={() => viewDetails(asset)}
                        className="btn-view"
                        title="View Details"
                      >
                        <Eye size={16} />
                      </button>
                      <button 
                        onClick={() => downloadReport(asset)}
                        className="btn-download"
                        title="Download Report"
                      >
                        <Download size={16} />
                      </button>
                      <button
                        onClick={() => setDeleteConfirm(asset)}
                        title="Delete Asset"
                        style={{
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          width: '32px', height: '32px', border: 'none', borderRadius: '6px',
                          background: '#fee2e2', color: '#dc2626', cursor: 'pointer',
                          transition: 'background 0.2s'
                        }}
                        onMouseEnter={e => e.currentTarget.style.background = '#fca5a5'}
                        onMouseLeave={e => e.currentTarget.style.background = '#fee2e2'}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="empty-state">
            <div className="empty-icon">📊</div>
            <h3>No Assets Found</h3>
            <p>
              {searchQuery 
                ? `No assets match your search "${searchQuery}"`
                : 'No analysis reports have been saved yet. Encrypted images will appear here after analysis.'
              }
            </p>
          </div>
        )}
      </div>

      {/* Detail Modal */}
      {showDetailModal && selectedAsset && (
        <div className="modal-overlay" onClick={() => setShowDetailModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Asset Details</h2>
              <button 
                onClick={() => setShowDetailModal(false)}
                className="modal-close"
              >
                ✕
              </button>
            </div>

            <div className="modal-body">
              {/* Status Banner */}
              <div className={`status-banner ${selectedAsset.status === 'Verified' ? 'verified' : 'unknown'}`}>
                <div className="status-icon">
                  {selectedAsset.status === 'Verified' ? <CheckCircle size={24} /> : <XCircle size={24} />}
                </div>
                <div>
                  <h3>{selectedAsset.detectedCase}</h3>
                  <p>Confidence: {selectedAsset.confidence}%</p>
                </div>
              </div>

              {/* Asset Information */}
              <div className="detail-section">
                <h3>Asset Information</h3>
                <div className="detail-grid">
                  <div className="detail-item">
                    <span className="label">Asset ID:</span>
                    <span className="value">{selectedAsset.assetId}</span>
                  </div>
                  <div className="detail-item">
                    <span className="label">Authorship Certificate ID:</span>
                    <span className="value">{selectedAsset.authorshipCertificateId}</span>
                  </div>
                  <div className="detail-item">
                    <span className="label">Device ID:</span>
                    <span className="value">{selectedAsset.deviceId}</span>
                  </div>
                  <div className="detail-item">
                    <span className="label">Device Name:</span>
                    <span className="value">{selectedAsset.deviceName}</span>
                  </div>
                </div>
              </div>

              {/* Creator Information */}
              <div className="detail-section">
                <h3>Creator Information</h3>
                <div className="detail-grid">
                  <div className="detail-item">
                    <span className="label">Name:</span>
                    <span className="value">{selectedAsset.userName || 'Unknown'}</span>
                  </div>
                  <div className="detail-item">
                    <span className="label">Email:</span>
                    <span className="value">{selectedAsset.userEmail || 'N/A'}</span>
                  </div>
                  <div className="detail-item">
                    <span className="label">User ID:</span>
                    <span className="value">{selectedAsset.uniqueUserId}</span>
                  </div>
                  <div className="detail-item">
                    <span className="label">IP Address:</span>
                    <span className="value">{selectedAsset.ipAddress}</span>
                  </div>
                </div>
              </div>

              {/* Technical Details */}
              <div className="detail-section">
                <h3>Technical Details</h3>
                <div className="detail-grid">
                  <div className="detail-item">
                    <span className="label">Resolution:</span>
                    <span className="value">{selectedAsset.assetResolution}</span>
                  </div>
                  <div className="detail-item">
                    <span className="label">File Size:</span>
                    <span className="value">{selectedAsset.assetFileSize}</span>
                  </div>
                  <div className="detail-item">
                    <span className="label">Created:</span>
                    <span className="value">{formatDate(selectedAsset.timestamp || selectedAsset.createdAt)}</span>
                  </div>
                  <div className="detail-item">
                    <span className="label">Image Cropped:</span>
                    {selectedAsset.isCropped ? (
                      <span className="value" style={{ color: '#7c3aed', fontWeight: '600' }}>
                        Yes ✂️ ({selectedAsset.cropOriginalResolution} → {selectedAsset.cropCurrentResolution}, {selectedAsset.cropRemainingPercentage} remaining)
                      </span>
                    ) : (
                      <span className="value" style={{ color: '#6b7280' }}>No</span>
                    )}
                  </div>
                  {selectedAsset.gpsLocation?.available && (
                    <div className="detail-item">
                      <span className="label">GPS Location:</span>
                      <a 
                        href={selectedAsset.gpsLocation.mapsUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="value gps-link"
                      >
                        📍 {selectedAsset.gpsLocation.coordinates}
                      </a>
                    </div>
                  )}
                </div>
              </div>

              {/* Analysis Results */}
              {selectedAsset.reasoning && selectedAsset.reasoning.length > 0 && (
                <div className="detail-section">
                  <h3>Analysis Results</h3>
                  <ul className="reasoning-list">
                    {selectedAsset.reasoning.map((reason, idx) => (
                      <li key={idx}>{reason}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            <div className="modal-footer">
              <button 
                onClick={() => downloadReport(selectedAsset)}
                className="btn-download-modal"
              >
                <Download size={16} />
                Download Full Report
              </button>
              <button 
                onClick={() => setShowDetailModal(false)}
                className="btn-close-modal"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Delete Confirmation Modal */}
      {deleteConfirm && (
        <div className="modal-overlay" onClick={() => !deleting && setDeleteConfirm(null)}>
          <div className="modal-content" style={{ maxWidth: '420px' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header" style={{ borderBottom: '1px solid #fee2e2' }}>
              <h2 style={{ color: '#dc2626', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Trash2 size={20} /> Delete Asset
              </h2>
              <button onClick={() => setDeleteConfirm(null)} className="modal-close">✕</button>
            </div>

            <div className="modal-body" style={{ padding: '24px' }}>
              <p style={{ color: '#374151', marginBottom: '12px' }}>
                Are you sure you want to permanently delete this asset?
              </p>
              <div style={{
                background: '#fef2f2', border: '1px solid #fca5a5',
                borderRadius: '8px', padding: '12px', fontSize: '13px', color: '#7f1d1d'
              }}>
                <div><strong>Asset ID:</strong> {deleteConfirm.assetId}</div>
                <div><strong>Owner:</strong> {deleteConfirm.userName}</div>
                <div style={{ marginTop: '8px', fontWeight: '600' }}>
                  ⚠️ This will remove the asset from the backend database and all local storage. This cannot be undone.
                </div>
              </div>
            </div>

            <div className="modal-footer" style={{ gap: '10px' }}>
              <button
                onClick={() => setDeleteConfirm(null)}
                className="btn-close-modal"
                disabled={deleting}
              >
                Cancel
              </button>
              <button
                onClick={() => deleteAsset(deleteConfirm)}
                disabled={deleting}
                style={{
                  display: 'flex', alignItems: 'center', gap: '6px',
                  padding: '10px 20px', background: deleting ? '#fca5a5' : '#dc2626',
                  color: 'white', border: 'none', borderRadius: '8px',
                  cursor: deleting ? 'not-allowed' : 'pointer',
                  fontWeight: '600', fontSize: '14px'
                }}
              >
                <Trash2 size={15} />
                {deleting ? 'Deleting...' : 'Yes, Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default AssetsPage;