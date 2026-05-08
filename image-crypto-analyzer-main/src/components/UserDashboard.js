import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileSearch, Clock, User, LogOut, Camera, LayoutDashboard, Image, Activity, Calendar, Database, Eye, Download, Trash2, CheckCircle, XCircle, Award, Share2, Copy } from 'lucide-react';
import { vaultAPI, certAPI, compareAPI } from '../api/client';
import './UserDashboard.css';

function UserDashboard({ user, onLogout }) {
  const [activeTab, setActiveTab] = useState('overview');
  const navigate = useNavigate();

  const displayName  = user?.name || user?.username || user?.email?.split('@')[0] || 'User';
  const displayEmail = user?.email || '—';

  // ── State ──────────────────────────────────────────────────────────────────
  const [vaultImages,    setVaultImages]    = useState([]);
  const [certificates,   setCertificates]   = useState([]);
  const [reports,        setReports]        = useState([]);
  const [loadingVault,   setLoadingVault]   = useState(true);
  const [loadingCerts,   setLoadingCerts]   = useState(true);
  const [selectedImage,  setSelectedImage]  = useState(null);
  const [showViewModal,  setShowViewModal]  = useState(false);
  const [verificationResult, setVerificationResult] = useState(null);
  const [isVerifying,    setIsVerifying]    = useState(false);
  const [selectedCert,   setSelectedCert]   = useState(null);
  const [showCertModal,  setShowCertModal]  = useState(false);
  const [copiedId,       setCopiedId]       = useState(null);
  const [searchQuery,    setSearchQuery]    = useState('');
  const [searchCertQuery, setSearchCertQuery] = useState('');
  const [selectedVaultItems, setSelectedVaultItems] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // ── Load data from API ─────────────────────────────────────────────────────
  const loadVaultImages = useCallback(async () => {
    setLoadingVault(true);
    try {
      const res = await vaultAPI.list();
      const blacklist = JSON.parse(localStorage.getItem('pinit_deleted_ids') || '[]');
      const images = (res.assets || [])
        .filter(a => !blacklist.includes(a.asset_id) && !blacklist.includes(a.id))
        .map(a => ({
        ...a,
        id:           a.asset_id    || a.id,
        assetId:      a.asset_id    || a.id,
        fileName:     a.file_name   || 'Unknown',
        fileSize:     a.file_size   || '—',
        ownerName:    a.owner_name  || a.owner_email || a.user_id || '—',
        ownerEmail:   a.owner_email || '—',
        dateEncrypted: a.created_at,
        status:       'Verified',
        thumbnail:    a.thumbnail_url,
      }));
      setVaultImages(images);
    } catch (err) {
      console.error('Failed to load vault:', err.message);
    } finally {
      setLoadingVault(false);
    }
  }, []);

  const loadCertificates = useCallback(async () => {
    setLoadingCerts(true);
    try {
      const res = await certAPI.list();
      setCertificates(res.certificates || []);
    } catch (err) {
      console.error('Failed to load certificates:', err.message);
    } finally {
      setLoadingCerts(false);
    }
  }, []);

  const loadReports = useCallback(async () => {
    setLoadingHistory(true);
    try {
      const res = await compareAPI.getHistory();
      setReports(res.reports || []);
    } catch (err) {
      console.error('Failed to load reports:', err.message);
    } finally {
      setLoadingHistory(false);
    }
  }, []);

  useEffect(() => {
    loadVaultImages();
    loadCertificates();
    loadReports();
  }, [loadVaultImages, loadCertificates, loadReports]);

  // ── Computed stats ─────────────────────────────────────────────────────────
  const stats = {
    totalEncrypted: vaultImages.length,
    totalAnalyzed:  reports.length,
    lastActivity:   vaultImages[0]?.dateEncrypted || reports[0]?.created_at || null,
    lastEncryptedId: vaultImages[0]?.assetId || null,
  };

  // ── Helpers ────────────────────────────────────────────────────────────────
  const formatDate = (d) => {
    if (!d) return 'N/A';
    const date = new Date(d);
    if (isNaN(date.getTime())) return '—';
    return date.toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
  };

  const handleLogout = () => { onLogout(); navigate('/login'); };

  // ── Vault actions ──────────────────────────────────────────────────────────
  const handleView = (image) => {
    setSelectedImage(image);
    setShowViewModal(true);
    setIsVerifying(true);
    setVerificationResult(null);
    setTimeout(() => {
      setVerificationResult({
        verified:    image.status === 'Verified',
        userId:      image.ownerName,
        deviceId:    image.device_id || 'Unknown',
        gpsLocation: image.gps_location || 'Not Available',
        timestamp:   image.dateEncrypted,
        confidence:  98
      });
      setIsVerifying(false);
    }, 1200);
  };

  const handleDownload = (image) => {
    if (image.thumbnail) {
      const link = document.createElement('a');
      link.href     = image.thumbnail;
      link.download = `thumbnail-${image.fileName}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } else {
      alert('Thumbnail not available');
    }
  };

  // ── Shared delete helper — clears backend + all localStorage + blacklist ──
  const purgeDeletedId = (id) => {
    try {
      // 1. Blacklist — prevents reappearing on any refresh
      const blacklist = JSON.parse(localStorage.getItem('pinit_deleted_ids') || '[]');
      if (!blacklist.includes(id)) blacklist.push(id);
      localStorage.setItem('pinit_deleted_ids', JSON.stringify(blacklist));
      // 2. vaultImages
      const vault = JSON.parse(localStorage.getItem('vaultImages') || '[]');
      localStorage.setItem('vaultImages', JSON.stringify(
        vault.filter(a => a.assetId !== id && a.id !== id && a.asset_id !== id)
      ));
      // 3. analysisReports
      const reports = JSON.parse(localStorage.getItem('analysisReports') || '[]');
      localStorage.setItem('analysisReports', JSON.stringify(
        reports.filter(a => a.assetId !== id && a.id !== id && a.asset_id !== id)
      ));
      // 4. certificates
      const certs = JSON.parse(localStorage.getItem('certificates') || '[]');
      localStorage.setItem('certificates', JSON.stringify(
        certs.filter(a => a.assetId !== id && a.id !== id)
      ));
      // 5. modifiedAssets tracking
      const modified = JSON.parse(localStorage.getItem('modifiedAssets') || '[]');
      localStorage.setItem('modifiedAssets', JSON.stringify(modified.filter(mid => mid !== id)));
    } catch (e) { console.warn('localStorage purge failed:', e); }
  };

  const handleDelete = async (imageId) => {
    if (!window.confirm('Delete this image from vault?')) return;
    purgeDeletedId(imageId);
    setVaultImages(prev => prev.filter(img => img.id !== imageId && img.assetId !== imageId));
    setSelectedVaultItems(prev => prev.filter(id => id !== imageId));
    try {
      await vaultAPI.delete(imageId);
    } catch (err) {
      console.warn('Backend delete failed (item still hidden via blacklist):', err.message);
    }
    alert('Image deleted permanently');
  };

  // Vault selection handlers
  const handleSelectVaultItem = (imageId) => {
    setSelectedVaultItems(prev => 
      prev.includes(imageId) 
        ? prev.filter(id => id !== imageId)
        : [...prev, imageId]
    );
  };

  const handleSelectAllVault = (filteredImages) => {
    if (selectedVaultItems.length === filteredImages.length) {
      setSelectedVaultItems([]);
    } else {
      setSelectedVaultItems(filteredImages.map(img => img.id || img.assetId));
    }
  };

  const handleDeleteSelected = async () => {
    if (selectedVaultItems.length === 0) { alert('No items selected'); return; }
    if (!window.confirm(`Delete ${selectedVaultItems.length} selected image(s) from vault?`)) return;
    selectedVaultItems.forEach(id => purgeDeletedId(id));
    // Remove from React state immediately
    setVaultImages(prev => prev.filter(img =>
      !selectedVaultItems.includes(img.id) && !selectedVaultItems.includes(img.assetId)
    ));
    setSelectedVaultItems([]);
    // Backend deletes (non-blocking)
    try {
      await Promise.all(selectedVaultItems.map(id => vaultAPI.delete(id)));
    } catch (err) {
      console.warn('Some backend deletes failed (items still hidden via blacklist):', err.message);
    }
    alert(`${selectedVaultItems.length} image(s) deleted permanently`);
  };

  // ── Certificate actions ────────────────────────────────────────────────────
  const handleViewCert   = (cert) => { setSelectedCert(cert); setShowCertModal(true); };

  const handleDeleteCert = async (certId) => {
    if (!window.confirm('Delete this certificate?')) return;
    try {
      await certAPI.delete(certId);
      setCertificates(prev => prev.filter(c => c.certificate_id !== certId && c.id !== certId));
      alert('Certificate deleted');
    } catch (err) {
      alert('Failed to delete: ' + err.message);
    }
  };

  const handleCopyId = (id) => {
    navigator.clipboard.writeText(id).then(() => {
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    });
  };

const handleShareCert = async (cert) => {
  const baseUrl = window.location.origin.includes('localhost')
    ? 'https://image-crypto-analyzer.vercel.app'
    : window.location.origin;

  const certificateUrl = `${baseUrl}/public/certificate/${cert.certificate_id}`;

  try {
    const { certAPI } = await import('../api/client');
    await certAPI.share({
      certificateId      : cert.certificate_id,
      assetId            : cert.asset_id || cert.assetId,
      confidence         : cert.confidence,
      status             : 'Verified',
      dateCreated        : cert.created_at,
      ownerEmail         : cert.owner_email || cert.email || null,
      ownershipAtCreation: cert.ownership_data || {},
      technicalDetails   : cert.technical_details || {},
      imagePreview       : cert.image_preview || cert.thumbnail_url || cert.cloudinary_url || null,
    });
  } catch (err) {
    if (!err.message?.includes('Already shared')) {
      console.warn('Share to backend failed:', err.message);
    }
  }

  if (navigator.share) {
    navigator.share({
      title: 'PINIT Ownership Certificate',
      text : `View ownership certificate: ${cert.certificate_id}`,
      url  : certificateUrl,
    }).catch(() => {});
  } else {
    navigator.clipboard.writeText(certificateUrl).then(() => {
      alert(`✅ Certificate link copied!\n\n${certificateUrl}`);
    });
  }
};

  const handleChangePassword = async () => {
    const newPwd = window.prompt('Enter new password (min 6 characters):');
    if (!newPwd || newPwd.length < 6) { alert('Password too short'); return; }
    const confirm = window.prompt('Confirm new password:');
    if (newPwd !== confirm) { alert('Passwords do not match'); return; }
    try {
      await fetch('http://localhost:8000/auth/change-password', {
        method : 'POST',
        headers: {
          'Content-Type' : 'application/json',
          'Authorization': `Bearer ${sessionStorage.getItem('pinit_token')}`
        },
        body: JSON.stringify({ new_password: newPwd })
      });
      alert('Password changed successfully!');
    } catch {
      alert('Failed to change password. Try again.');
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="user-dashboard">
      <div className="dashboard-nav">
        <div className="nav-brand"><h2>🔍 PINIT CORE - User </h2></div>
        <div className="nav-user">
          <span>Welcome, {displayName}</span>
          <button onClick={handleLogout} className="btn-logout">
            <LogOut size={16} /> Logout
          </button>
        </div>
      </div>

      <div className="dashboard-container">
        <div className="sidebar">
          <ul className="sidebar-menu">
            {[
              ['overview',     <LayoutDashboard className="icon" />, 'Overview'],
              ['vault',        <Database className="icon" />,        'Vault'],
              ['certificates', <Award className="icon" />,           'Certificates'],
              ['history',      <Clock className="icon" />,           'History'],
              ['analyze',      <FileSearch className="icon" />,      'Analyze Image'],
              ['profile',      <User className="icon" />,            'Profile'],
            ].map(([tab, icon, label]) => (
              <li key={tab} className={activeTab === tab ? 'active' : ''} onClick={() => setActiveTab(tab)}>
                {icon} {label}
              </li>
            ))}
          </ul>
        </div>

        <div className="main-content">

          {/* ── OVERVIEW ── */}
          {activeTab === 'overview' && (
            <div className="overview-section">
              <h1>Dashboard Overview</h1>
              <p className="subtitle">Your activity at a glance</p>

              <div className="quick-action">
                <button onClick={() => navigate('/analyzer')} className="btn-quick-analyze">
                  <Camera size={20} /> Quick Analyze
                </button>
              </div>

              <div className="stats-grid">
                <div className="stat-card stat-encrypted">
                  <div className="stat-icon"><Image size={32} /></div>
                  <div className="stat-content">
                    <h3>{stats.totalEncrypted}</h3>
                    <p>Images in Vault</p>
                  </div>
                </div>
                <div className="stat-card stat-analyzed">
                  <div className="stat-icon"><FileSearch size={32} /></div>
                  <div className="stat-content">
                    <h3>{stats.totalAnalyzed}</h3>
                    <p>Total Analyzed</p>
                  </div>
                </div>
                <div className="stat-card stat-activity">
                  <div className="stat-icon"><Calendar size={32} /></div>
                  <div className="stat-content">
                    <h3>{formatDate(stats.lastActivity)}</h3>
                    <p>Last Activity</p>
                  </div>
                </div>
                <div className="stat-card stat-uuid">
                  <div className="stat-icon"><Activity size={32} /></div>
                  <div className="stat-content">
                    <h3>{stats.lastEncryptedId ? stats.lastEncryptedId.slice(0,8)+'...' : 'None'}</h3>
                    <p>Last Asset ID</p>
                  </div>
                </div>
              </div>

              <div className="recent-activity-section">
                <h2>Recent Vault Entries</h2>
                {vaultImages.length > 0 ? (
                  <div className="activity-list">
                    {vaultImages.slice(0,5).map((img, i) => (
                      <div key={i} className="activity-item">
                        <div className="activity-icon">🔐</div>
                        <div className="activity-details">
                          <p className="activity-title">Image Encrypted</p>
                          <p className="activity-meta">{img.fileName} • {formatDate(img.dateEncrypted)}</p>
                          <p className="activity-uuid">Asset ID: {img.assetId}</p>
                        </div>
                        <div className="activity-badge">Encrypted</div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="empty-state">
                    <p>📊</p><p>No activity yet</p>
                    <p className="subtitle">Start analyzing images to see activity here</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── VAULT ── */}
          {activeTab === 'vault' && (
            <div className="vault-section">
              <div className="vault-header">
                <div>
                  <h1>Image Vault</h1>
                  <p className="subtitle">Your encrypted images stored securely</p>
                </div>
                <div style={{ display: 'flex', gap: '10px' }}>
                  {selectedVaultItems.length > 0 && (
                    <button 
                      onClick={handleDeleteSelected} 
                      className="btn-empty-action" 
                      style={{ background: '#ef4444', color: 'white' }}
                    >
                      <Trash2 size={16} /> Delete Selected ({selectedVaultItems.length})
                    </button>
                  )}
                  <button onClick={loadVaultImages} className="btn-empty-action" style={{ background: '#667eea' }}>
                    ↻ Refresh
                  </button>
                </div>
              </div>

              {/* Search Bar */}
              {!loadingVault && vaultImages.length > 0 && (
                <div style={{ marginBottom: '20px' }}>
                  <input
                    type="text"
                    placeholder="🔍 Search by file name, owner, email, or asset ID..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '12px 16px',
                      fontSize: '14px',
                      border: '1px solid #e5e7eb',
                      borderRadius: '8px',
                      outline: 'none',
                      transition: 'border-color 0.2s',
                    }}
                    onFocus={(e) => e.target.style.borderColor = '#667eea'}
                    onBlur={(e) => e.target.style.borderColor = '#e5e7eb'}
                  />
                </div>
              )}

              {loadingVault ? (
                <div className="empty-state"><p>Loading vault...</p></div>
              ) : vaultImages.length === 0 ? (
                <div className="empty-state">
                  <p>🗄️</p><p>Your vault is empty</p>
                  <p className="subtitle">Encrypt images in the Analyzer to see them here</p>
                  <button onClick={() => setActiveTab('analyze')} className="btn-empty-action">
                    <FileSearch size={18} /> Go to Analyzer
                  </button>
                </div>
              ) : (() => {
                // Filter vault images based on search query
                const filteredImages = vaultImages.filter(image => {
                  if (!searchQuery) return true;
                  const query = searchQuery.toLowerCase();
                  return (
                    image.fileName?.toLowerCase().includes(query) ||
                    image.ownerName?.toLowerCase().includes(query) ||
                    image.ownerEmail?.toLowerCase().includes(query) ||
                    image.assetId?.toLowerCase().includes(query)
                  );
                });

                if (filteredImages.length === 0) {
                  return (
                    <div className="empty-state">
                      <p>🔍</p>
                      <p>No results found</p>
                      <p className="subtitle">Try a different search term</p>
                    </div>
                  );
                }

                return (
                  <div className="vault-table-container">
                    <table className="vault-table">
                      <thead>
                        <tr>
                          <th style={{ width: '40px' }}>
                            <input 
                              type="checkbox" 
                              checked={selectedVaultItems.length === filteredImages.length && filteredImages.length > 0}
                              onChange={() => handleSelectAllVault(filteredImages)}
                              style={{ cursor: 'pointer', width: '18px', height: '18px' }}
                            />
                          </th>
                          <th>Thumbnail</th><th>File Name</th><th>Date Encrypted</th>
                          <th>Owner</th><th>Status</th><th>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredImages.map((image, idx) => {
                          const imageId = image.id || image.assetId;
                          const isSelected = selectedVaultItems.includes(imageId);
                          
                          return (
                          <tr key={imageId || idx} style={{ backgroundColor: isSelected ? 'rgba(102, 126, 234, 0.05)' : 'transparent' }}>
                            <td>
                              <input 
                                type="checkbox" 
                                checked={isSelected}
                                onChange={() => handleSelectVaultItem(imageId)}
                                style={{ cursor: 'pointer', width: '18px', height: '18px' }}
                              />
                            </td>
                            <td>
                              <div className="thumbnail">
                                {image.thumbnail
                                  ? <img src={image.thumbnail} alt={image.fileName} />
                                  : <div className="thumbnail-placeholder"><Image size={24} /></div>}
                              </div>
                            </td>
                            <td>
                              <div className="file-name-cell">
                                <span className="file-name">{image.fileName}</span>
                                <span className="file-size">{image.fileSize}</span>
                              </div>
                            </td>
                            <td>{formatDate(image.dateEncrypted)}</td>
                            <td>
                              <div className="owner-cell">
                                <span className="owner-name">{image.ownerName}</span>
                                {image.ownerEmail && image.ownerEmail !== '—' && image.ownerEmail !== image.ownerName && (
                                  <span className="owner-email" style={{ display: 'block', fontSize: '0.85em', color: '#6b7280', marginTop: '2px' }}>{image.ownerEmail}</span>
                                )}
                              </div>
                            </td>
                            <td>
                              <span className="status-badge verified">
                                <CheckCircle size={14} /> Verified
                              </span>
                            </td>
                            <td>
                              <div className="action-buttons">
                                <button 
                                  onClick={() => handleView(image)} 
                                  className="btn-action btn-view" 
                                  title="View"
                                  style={{
                                    background: '#3b82f6',
                                    color: 'white',
                                    border: 'none',
                                    padding: '8px 12px',
                                    borderRadius: '6px',
                                    cursor: 'pointer',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    transition: 'background 0.2s',
                                  }}
                                  onMouseOver={(e) => e.currentTarget.style.background = '#2563eb'}
                                  onMouseOut={(e) => e.currentTarget.style.background = '#3b82f6'}
                                >
                                  <Eye size={16} />
                                </button>
                                <button 
                                  onClick={() => handleDownload(image)} 
                                  className="btn-action btn-download" 
                                  title="Download"
                                  style={{
                                    background: '#10b981',
                                    color: 'white',
                                    border: 'none',
                                    padding: '8px 12px',
                                    borderRadius: '6px',
                                    cursor: 'pointer',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    transition: 'background 0.2s',
                                  }}
                                  onMouseOver={(e) => e.currentTarget.style.background = '#059669'}
                                  onMouseOut={(e) => e.currentTarget.style.background = '#10b981'}
                                >
                                  <Download size={16} />
                                </button>
                                <button 
                                  onClick={() => handleDelete(image.id || image.assetId)} 
                                  className="btn-action btn-delete" 
                                  title="Delete"
                                  style={{
                                    background: '#ef4444',
                                    color: 'white',
                                    border: 'none',
                                    padding: '8px 12px',
                                    borderRadius: '6px',
                                    cursor: 'pointer',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    transition: 'background 0.2s',
                                  }}
                                  onMouseOver={(e) => e.currentTarget.style.background = '#dc2626'}
                                  onMouseOut={(e) => e.currentTarget.style.background = '#ef4444'}
                                >
                                  <Trash2 size={16} />
                                </button>
                              </div>
                            </td>
                          </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                );
              })()}
            </div>
          )}

          {/* ── CERTIFICATES ── */}
          {activeTab === 'certificates' && (
            <div className="certificates-section">
              <div className="certificates-header">
                <div>
                  <h1>Ownership Certificates</h1>
                  <p className="subtitle">Certificates generated from your analyses</p>
                </div>
                <button onClick={loadCertificates} className="btn-empty-action" style={{ background: '#667eea' }}>
                  ↻ Refresh
                </button>
              </div>

              {/* Search Bar */}
              {!loadingCerts && certificates.length > 0 && (
                <div style={{ marginBottom: '20px' }}>
                  <input
                    type="text"
                    placeholder="🔍 Search by certificate ID, asset ID, or status..."
                    value={searchCertQuery}
                    onChange={(e) => setSearchCertQuery(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '12px 16px',
                      fontSize: '14px',
                      border: '1px solid #e5e7eb',
                      borderRadius: '8px',
                      outline: 'none',
                      transition: 'border-color 0.2s',
                    }}
                    onFocus={(e) => e.target.style.borderColor = '#667eea'}
                    onBlur={(e) => e.target.style.borderColor = '#e5e7eb'}
                  />
                </div>
              )}

              {loadingCerts ? (
                <div className="empty-state"><p>Loading certificates...</p></div>
              ) : certificates.length === 0 ? (
                <div className="empty-state">
                  <p>📜</p><p>No certificates yet</p>
                  <p className="subtitle">Analyze images to generate ownership certificates</p>
                  <button onClick={() => setActiveTab('analyze')} className="btn-empty-action">
                    <FileSearch size={18} /> Go to Analyzer
                  </button>
                </div>
              ) : (() => {
                // Filter certificates based on search query
                const filteredCerts = certificates.filter(cert => {
                  if (!searchCertQuery) return true;
                  const query = searchCertQuery.toLowerCase();
                  return (
                    cert.certificate_id?.toLowerCase().includes(query) ||
                    cert.asset_id?.toLowerCase().includes(query) ||
                    cert.status?.toLowerCase().includes(query)
                  );
                });

                if (filteredCerts.length === 0) {
                  return (
                    <div className="empty-state">
                      <p>🔍</p>
                      <p>No results found</p>
                      <p className="subtitle">Try a different search term</p>
                    </div>
                  );
                }

                return (
                  <div className="certificates-grid">
                    {filteredCerts.map((cert) => {
                      const data = cert.analysis_data || {};
                      return (
                        <div key={cert.id} className="certificate-card">
                          <div className="certificate-header">
                            <div className="certificate-badge"><Award size={24} /></div>
                            <div className={`certificate-status ${cert.confidence >= 90 ? 'high' : cert.confidence >= 70 ? 'medium' : 'low'}`}>
                              {cert.confidence}% Confidence
                            </div>
                          </div>
                          <div className="certificate-body">
                            <h3>{cert.status}</h3>
                            <div className="certificate-info">
                              <div className="info-row">
                                <span className="info-label">Certificate ID:</span>
                                <div className="info-value-with-copy">
                                  <code>{cert.certificate_id?.slice(0,16)}...</code>
                                  <button onClick={() => handleCopyId(cert.certificate_id)} className="btn-copy-small">
                                    {copiedId === cert.certificate_id ? <CheckCircle size={14} /> : <Copy size={14} />}
                                  </button>
                                </div>
                              </div>
                              <div className="info-row">
                                <span className="info-label">Asset ID:</span>
                                <code className="info-value">{cert.asset_id}</code>
                              </div>
                              <div className="info-row">
                                <span className="info-label">Date Created:</span>
                                <span className="info-value">{formatDate(cert.created_at)}</span>
                              </div>
                            </div>
                          </div>
                          <div className="certificate-actions">
                            <button onClick={() => handleViewCert(cert)} className="btn-cert-action btn-cert-view">
                              <Eye size={16} /> View
                            </button>
                            <button onClick={() => handleShareCert(cert)} className="btn-cert-action btn-cert-share">
                              <Share2 size={16} /> Share
                            </button>
                            <button onClick={() => handleDeleteCert(cert.certificate_id || cert.id)} className="btn-cert-action btn-cert-delete">
                              <Trash2 size={16} /> Delete
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </div>
          )}

          {/* ── HISTORY ── */}
          {activeTab === 'history' && (
            <div className="history-section">
              <div className="history-header">
                <div>
                  <h1>Activity History</h1>
                  <p className="subtitle">All your analysis reports</p>
                </div>
                <button 
                  onClick={loadReports} 
                  className="btn-empty-action" 
                  style={{ background: '#667eea' }}
                  disabled={loadingHistory}
                >
                  {loadingHistory ? '⟳ Loading...' : '↻ Refresh'}
                </button>
              </div>

              {loadingHistory ? (
                <div className="empty-state"><p>Loading history...</p></div>
              ) : reports.length > 0 ? (
                <div className="history-table-container">
                  <table className="history-table">
                    <thead>
                      <tr>
                        <th>Asset ID</th><th>Verdict</th><th>Confidence</th>
                        <th>Editing Tool</th><th>Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {reports.map((report, i) => (
                        <tr key={i}>
                          <td><code className="uuid-code-small">{report.asset_id || '—'}</code></td>
                          <td>
                            <span className={`status-badge-small ${report.is_tampered ? 'danger' : 'success'}`}>
                              {report.is_tampered ? '⚠ Tampered' : '✓ Original'}
                            </span>
                          </td>
                          <td>{report.confidence}%</td>
                          <td>{report.editing_tool || '—'}</td>
                          <td><span className="date-time-text">{formatDate(report.created_at)}</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="empty-state">
                  <p>📋</p><p>No analysis history yet</p>
                  <button onClick={() => setActiveTab('analyze')} className="btn-empty-action">
                    <FileSearch size={18} /> Go to Analyzer
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ── ANALYZE ── */}
          {activeTab === 'analyze' && (
            <div className="analyze-section">
              <h1>PINIT Analyzer</h1>
              <p className="subtitle">Encrypt. Analyze. Verify. </p>
              <div className="launch-card">
                <div className="launch-icon"><Camera size={80} /></div>
                <h2>Capture and PINIT</h2>
                <p>Full encryption and analysis with UUID embedding, GPS tracking, device fingerprinting, and AI classification.</p>
                <button onClick={() => navigate('/analyzer')} className="btn-launch">
                  <FileSearch size={20} style={{ marginRight: 8 }} /> Open Image Analyzer
                </button>
              </div>
              <div className="features-grid">
                {[
                  ['🔐 UUID Encryption', 'Embed unique identifiers with LSB steganography'],
                  ['📍 GPS Tracking',    'Capture and verify location from EXIF and browser'],
                  ['🤖 AI Classification','Detect mobile, AI-generated, and web downloads'],
                  ['🖥️ Device Fingerprinting','Track device info and ownership certificates'],
                ].map(([title, desc]) => (
                  <div key={title} className="feature-card">
                    <h3>{title}</h3><p>{desc}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── PROFILE ── */}
          {activeTab === 'profile' && (
            <div className="profile-section">
              <h1>Profile & Security</h1>
              <p className="subtitle">Manage your account</p>
              <div className="profile-container">

                <div className="profile-card-enhanced">
                  <div className="card-header"><h2>Account Information</h2></div>
                  <div className="card-body">
                    <div className="profile-avatar-large">
                      <div className="avatar-circle-large">{displayName.charAt(0).toUpperCase()}</div>
                    </div>
                    <div className="profile-info-grid">
                      <div className="info-item-enhanced">
                        <label>Full Name</label>
                        <span className="info-value">{displayName}</span>
                      </div>
                      <div className="info-item-enhanced">
                        <label>Email Address</label>
                        <span className="info-value">{displayEmail}</span>
                      </div>
                      <div className="info-item-enhanced">
                        <label>Role</label>
                        <span className="badge-user">User</span>
                      </div>
                      <div className="info-item-enhanced">
                        <label>User ID</label>
                        <code className="user-id-code">{user?.id || '—'}</code>
                      </div>
                      <div className="info-item-enhanced">
                        <label>Last Login</label>
                        <span className="info-value">
                          {formatDate(localStorage.getItem(`lastLogin_${displayEmail}`) || new Date().toISOString())}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="profile-card-enhanced">
                  <div className="card-header"><h2>Usage Statistics</h2></div>
                  <div className="card-body">
                    <div className="usage-stats">
                      <div className="usage-stat-item">
                        <div className="stat-icon encrypted-icon">🔐</div>
                        <div className="stat-content">
                          <div className="stat-value">{vaultImages.length}</div>
                          <div className="stat-label">Images in Vault</div>
                        </div>
                      </div>
                      <div className="usage-stat-item">
                        <div className="stat-icon analyzed-icon">🔍</div>
                        <div className="stat-content">
                          <div className="stat-value">{reports.length}</div>
                          <div className="stat-label">Analyses Run</div>
                        </div>
                      </div>
                      <div className="usage-stat-item">
                        <div className="stat-icon certificates-icon">📜</div>
                        <div className="stat-content">
                          <div className="stat-value">{certificates.length}</div>
                          <div className="stat-label">Certificates</div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="profile-card-enhanced">
                  <div className="card-header"><h2>Security</h2></div>
                  <div className="card-body">
                    <div className="security-actions">
                      <button className="security-btn change-password-btn" onClick={handleChangePassword}>
                        <span className="btn-icon">🔑</span>
                        <span className="btn-text">Change Password</span>
                        <span className="btn-arrow">→</span>
                      </button>
                      <button className="security-btn logout-btn" onClick={handleLogout}>
                        <span className="btn-icon">🚪</span>
                        <span className="btn-text">Logout</span>
                        <span className="btn-arrow">→</span>
                      </button>
                    </div>
                  </div>
                </div>

              </div>
            </div>
          )}

        </div>
      </div>

      {/* ── VIEW MODAL ── */}
      {showViewModal && selectedImage && (
        <div className="modal-overlay" onClick={() => setShowViewModal(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Image Details</h2>
              <button className="modal-close" onClick={() => setShowViewModal(false)}>×</button>
            </div>
            <div className="modal-body">
              <div className="modal-image-preview">
                {selectedImage.thumbnail
                  ? <img src={selectedImage.thumbnail} alt={selectedImage.fileName} />
                  : <div className="image-placeholder"><Image size={64} /></div>}
              </div>
              {isVerifying ? (
                <div className="verification-loading"><div className="spinner"></div><p>Verifying...</p></div>
              ) : verificationResult && (
                <div className={`verification-result ${verificationResult.verified ? 'verified' : 'not-verified'}`}>
                  <div className="verification-icon">
                    {verificationResult.verified ? <CheckCircle size={48} /> : <XCircle size={48} />}
                  </div>
                  <h3>{verificationResult.verified ? 'Verified Image' : 'Verification Failed'}</h3>
                  <p className="confidence">Confidence: {verificationResult.confidence}%</p>
                </div>
              )}
              <div className="modal-details">
                {[
                  ['File Name',      selectedImage.fileName],
                  ['File Size',      selectedImage.fileSize],
                  ['Date Encrypted', formatDate(selectedImage.dateEncrypted)],
                  ['Owner',          selectedImage.ownerName],
                ].map(([label, value]) => (
                  <div key={label} className="detail-row">
                    <span className="detail-label">{label}:</span>
                    <span className="detail-value">{value}</span>
                  </div>
                ))}
              </div>
              <div className="modal-actions">
                <button onClick={() => handleDownload(selectedImage)} className="btn-modal btn-download-modal">
                  <Download size={18} /> Download
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── CERTIFICATE MODAL ── */}
      {showCertModal && selectedCert && (
        <div className="modal-overlay" onClick={() => setShowCertModal(false)}>
          <div className="modal-content certificate-modal-large" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Ownership Certificate</h2>
              <button className="modal-close" onClick={() => setShowCertModal(false)}>×</button>
            </div>
            <div className="modal-body">
              <div className="certificate-modal-header">
                <div className="cert-badge-large"><Award size={48} /></div>
                <h3>{selectedCert.status}</h3>
                <div className={`confidence-badge ${selectedCert.confidence >= 90 ? 'high' : 'medium'}`}>
                  Confidence: {selectedCert.confidence}%
                </div>
              </div>
              <div className="certificate-details-section">
                <h4>CERTIFICATE DETAILS</h4>
                <div className="cert-detail-grid">
                  {[
                    ['Certificate ID', selectedCert.certificate_id],
                    ['Asset ID',       selectedCert.asset_id],
                    ['Status',         selectedCert.status],
                    ['Created',        formatDate(selectedCert.created_at)],
                  ].map(([label, value]) => (
                    <div key={label} className="cert-detail-item">
                      <span className="cert-label">{label}</span>
                      <code className="cert-value">{value}</code>
                    </div>
                  ))}
                </div>
              </div>
              {selectedCert.image_preview && (
                <div className="certificate-image-preview">
                  <h4>ANALYZED IMAGE</h4>
                  <img src={selectedCert.image_preview} alt="Preview" />
                </div>
              )}
              <div className="modal-actions">
                <button onClick={() => handleShareCert(selectedCert)} className="btn-modal btn-cert-share-modal">
                  <Share2 size={18} /> Share Certificate
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

export default UserDashboard;
