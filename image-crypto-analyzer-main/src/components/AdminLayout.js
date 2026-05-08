import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  BarChart3, Users, FolderOpen, FileSearch, Activity,
  Settings, Shield, LogOut
} from 'lucide-react';
import './AdminLayout.css';

function AdminLayout({ user, onLogout, children }) {
  const navigate  = useNavigate();
  const location  = useLocation();

  const handleLogout = () => {
    if (onLogout) onLogout();
    navigate('/login');
  };

  // Tab-based items stay on /admin/dashboard but change ?tab=
  // Route-based items navigate to a different path
  const navItems = [
    { type: 'tab',   tab: 'overview',   path: '/admin/dashboard', icon: <BarChart3 size={18} />,  label: 'Overview'     },
    { type: 'tab',   tab: 'users',      path: '/admin/dashboard', icon: <Users size={18} />,      label: 'Users'        },
    { type: 'tab',   tab: 'assets',     path: '/admin/dashboard', icon: <FolderOpen size={18} />, label: 'Assets'       },
    { type: 'route', tab: null,         path: '/admin/assets',    icon: <Shield size={18} />,     label: 'Track Assets' },
    { type: 'route', tab: null,         path: '/admin/verify',    icon: <FileSearch size={18} />, label: 'Verify'       },
    { type: 'tab',   tab: 'analytics',  path: '/admin/dashboard', icon: <Activity size={18} />,   label: 'Analytics'   },
    { type: 'tab',   tab: 'settings',   path: '/admin/dashboard', icon: <Settings size={18} />,   label: 'Settings'    },
  ];

  // Get current tab from URL (e.g. ?tab=users) or default to 'overview'
  const currentTab = new URLSearchParams(location.search).get('tab') || 'overview';

  const isActive = (item) => {
    if (item.type === 'route') return location.pathname === item.path;
    // Tab item: must be on /admin/dashboard AND tab matches
    return location.pathname === '/admin/dashboard' && currentTab === item.tab;
  };

  const handleClick = (item) => {
    if (item.type === 'route') {
      navigate(item.path);
    } else {
      // Navigate to /admin/dashboard with ?tab= query param
      const query = item.tab === 'overview' ? '' : `?tab=${item.tab}`;
      navigate(`/admin/dashboard${query}`);
    }
  };

  return (
    <div className="admin-layout">
      {/* Top Nav */}
      <div className="admin-nav">
        <div className="nav-brand">
          <h2>🔍 PINIT CORE - Admin</h2>
        </div>
        <div className="nav-user">
          <span>Admin: {user?.username || user?.name || 'Admin'}</span>
          <button onClick={handleLogout} className="btn-logout">
            <LogOut size={16} /> Logout
          </button>
        </div>
      </div>

      <div className="admin-body">
        {/* Sidebar */}
        <div className="admin-sidebar">
          <ul className="sidebar-menu">
            {navItems.map((item) => (
              <li
                key={item.label}
                className={isActive(item) ? 'active' : ''}
                onClick={() => handleClick(item)}
              >
                {item.icon} {item.label}
              </li>
            ))}
          </ul>
        </div>

        {/* Page Content */}
        <div className="admin-main">
          {children}
        </div>
      </div>
    </div>
  );
}

export default AdminLayout;