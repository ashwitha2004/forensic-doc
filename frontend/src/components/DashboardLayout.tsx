/**
 * DashboardLayout
 * ===============
 * Persistent sidebar + top-bar shell that wraps all authenticated dashboard pages.
 * Public routes (SecureResumeViewer, Login, Register) do NOT use this layout.
 *
 * Responsive:
 *   desktop  — fixed 256-px sidebar always visible, main area gets full remaining width
 *   mobile   — slide-out overlay sidebar triggered by hamburger button
 */

import { useState, useEffect } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  LayoutDashboard, Database,
  Microscope, Settings, LogOut, Menu, X,
  ChevronRight, Bell,
} from "lucide-react";

// ─── Nav items ────────────────────────────────────────────────────────────────

const NAV_ITEMS = [
  { label: "Dashboard",          icon: LayoutDashboard, path: "/dashboard"           },
  { label: "Secure Vault",       icon: Database,        path: "/dashboard/vault"     },
  { label: "Unified Forensics",  icon: Microscope,      path: "/dashboard/forensics" },
  { label: "Settings",           icon: Settings,        path: "/dashboard/settings"  },
];

// ─── Sidebar inner component ──────────────────────────────────────────────────

function SidebarContent({
  userId,
  onClose,
  onLogout,
}: {
  userId: string;
  onClose?: () => void;
  onLogout: () => void;
}) {
  const location = useLocation();

  return (
    <div className="flex flex-col h-full bg-slate-900 border-r border-slate-800">
      {/* ── Brand ── */}
      <div className="px-5 py-5 border-b border-slate-800 flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600
                        flex items-center justify-center shrink-0 shadow-lg shadow-cyan-900/30">
          <Shield className="w-4 h-4 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-white font-bold text-sm tracking-wide">PINIT Vault</p>
          <p className="text-slate-500 text-xs">Secure Platform</p>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="text-slate-500 hover:text-white transition-colors ml-1"
            aria-label="Close sidebar"
          >
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* ── Nav ── */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {NAV_ITEMS.map(item => {
          const active =
            item.path === "/dashboard"
              ? location.pathname === "/dashboard"
              : location.pathname.startsWith(item.path);

          return (
            <Link
              key={item.path}
              to={item.path}
              onClick={onClose}
              className={`
                flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium
                transition-all duration-150 group
                ${active
                  ? "bg-cyan-600/15 text-cyan-400 border border-cyan-600/25 shadow-sm"
                  : "text-slate-400 hover:text-white hover:bg-slate-800/70"
                }
              `}
            >
              <item.icon className={`w-4 h-4 shrink-0 ${active ? "text-cyan-400" : "group-hover:text-slate-300"}`} />
              <span className="flex-1">{item.label}</span>
              {active && <ChevronRight className="w-3 h-3 text-cyan-500 opacity-70" />}
            </Link>
          );
        })}
      </nav>

      {/* ── User / Logout ── */}
      <div className="px-3 pt-3 pb-4 border-t border-slate-800 space-y-1">
        <div className="px-3 py-2 rounded-xl bg-slate-800/50">
          <p className="text-xs text-slate-500 mb-0.5">Signed in as</p>
          <p className="text-xs text-slate-300 font-mono truncate" title={userId}>
            {userId || "—"}
          </p>
        </div>
        <button
          onClick={onLogout}
          className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm
                     text-red-400 hover:bg-red-950/30 hover:text-red-300
                     transition-colors w-full"
        >
          <LogOut className="w-4 h-4 shrink-0" />
          Sign out
        </button>
      </div>
    </div>
  );
}

// ─── Main layout export ───────────────────────────────────────────────────────

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [userId, setUserId] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    const uid =
      localStorage.getItem("biovault_userId") ||
      localStorage.getItem("biovault_user_id") ||
      "";
    setUserId(uid);
    if (!uid) navigate("/login");
  }, [navigate]);

  const handleLogout = () => {
    localStorage.removeItem("biovault_token");
    localStorage.removeItem("biovault_userId");
    localStorage.removeItem("biovault_user_id");
    navigate("/login");
  };

  return (
    <div className="min-h-screen bg-slate-950 flex">

      {/* ── Desktop sidebar (always visible) ── */}
      <aside className="hidden lg:flex lg:flex-col lg:fixed lg:inset-y-0 lg:w-64 lg:z-50">
        <SidebarContent userId={userId} onLogout={handleLogout} />
      </aside>

      {/* ── Mobile sidebar overlay ── */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-slate-950/70 backdrop-blur-sm"
            onClick={() => setSidebarOpen(false)}
          />
          {/* Drawer */}
          <div className="relative w-64 z-10">
            <SidebarContent
              userId={userId}
              onClose={() => setSidebarOpen(false)}
              onLogout={handleLogout}
            />
          </div>
        </div>
      )}

      {/* ── Content area ── */}
      <div className="flex-1 flex flex-col lg:pl-64 min-w-0">

        {/* Mobile top-bar */}
        <header className="sticky top-0 z-40 lg:hidden bg-slate-900/95 backdrop-blur-sm
                           border-b border-slate-800 px-4 py-3 flex items-center gap-3">
          <button
            onClick={() => setSidebarOpen(true)}
            className="text-slate-400 hover:text-white transition-colors p-1 -ml-1"
            aria-label="Open menu"
          >
            <Menu className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2 flex-1">
            <Shield className="w-4 h-4 text-cyan-400" />
            <span className="text-white font-semibold text-sm">PINIT Vault</span>
          </div>
          <button className="text-slate-400 hover:text-white transition-colors">
            <Bell className="w-4 h-4" />
          </button>
        </header>

        {/* Page content */}
        <main className="flex-1 px-4 py-6 lg:px-8 lg:py-8 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
