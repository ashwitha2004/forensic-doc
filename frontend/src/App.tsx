import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Component, ReactNode } from "react";

// ── Existing pages (untouched) ─────────────────────────────────────────────
import Index                from "./pages/Index";
import Login                from "./pages/Login";
import Register             from "./pages/Register";
import NotFound             from "./pages/NotFound";
import ProtectedRoute       from "./components/ProtectedRoute";
import Encrypt              from "./pages/Encrypt";
import DocumentForensics    from "./pages/DocumentForensics";
import SecureResumeViewer   from "./pages/SecureResumeViewer";
import ResumeShareDashboard from "./pages/ResumeShareDashboard";

// ── Dashboard shell ────────────────────────────────────────────────────────
import DashboardLayout      from "./components/DashboardLayout";

// ── Dashboard pages ────────────────────────────────────────────────────────
import DashboardHome        from "./pages/dashboard/DashboardHome";
import SecureVault          from "./pages/dashboard/SecureVault";
import SharingCenter        from "./pages/dashboard/SharingCenter";
import ActivityCenter       from "./pages/dashboard/ActivityCenter";
import SecurityCenter       from "./pages/dashboard/SecurityCenter";
import ForensicsCenter      from "./pages/dashboard/ForensicsCenter";
import SettingsPage         from "./pages/dashboard/SettingsPage";

// ===================== GLOBAL ERROR BOUNDARY =====================
class ErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: any) {
    console.error("🔴 [GLOBAL ERROR BOUNDARY] CRITICAL APP ERROR:", error);
    console.error("Error Info:", errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          width: "100%", height: "100vh", backgroundColor: "#0f172a",
          color: "#ffffff", display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "center", padding: "20px",
          fontFamily: "monospace", overflow: "auto",
        }}>
          <div style={{
            maxWidth: "600px", textAlign: "center", backgroundColor: "#1e293b",
            padding: "30px", borderRadius: "12px", border: "2px solid #ef4444",
          }}>
            <h1 style={{ fontSize: "28px", fontWeight: "bold", color: "#f87171", margin: "0 0 20px 0" }}>
              🔴 CRITICAL APP ERROR
            </h1>
            <p style={{ fontSize: "14px", marginBottom: "20px", color: "#cbd5e1" }}>
              The application encountered a fatal error and could not continue.
            </p>
            <div style={{
              backgroundColor: "#0f172a", padding: "15px", borderRadius: "8px",
              marginBottom: "20px", textAlign: "left", maxHeight: "300px",
              overflowY: "auto", fontSize: "12px", color: "#fca5a5",
              whiteSpace: "pre-wrap", wordBreak: "break-word", border: "1px solid #7f1d1d",
            }}>
              <strong>Error Message:</strong><br />
              {this.state.error?.message || "Unknown error"}<br /><br />
              <strong>Stack Trace:</strong><br />
              {this.state.error?.stack || "No stack trace available"}
            </div>
            <div style={{ display: "flex", gap: "10px", justifyContent: "center" }}>
              <button onClick={() => window.location.reload()} style={{
                padding: "10px 20px", backgroundColor: "#06b6d4", color: "#ffffff",
                border: "none", borderRadius: "6px", cursor: "pointer", fontSize: "14px", fontWeight: "bold",
              }}>Reload App</button>
              <button onClick={() => {
                localStorage.removeItem("biovault_token");
                localStorage.removeItem("biovault_userId");
                window.location.href = "/login";
              }} style={{
                padding: "10px 20px", backgroundColor: "#8b5cf6", color: "#ffffff",
                border: "none", borderRadius: "6px", cursor: "pointer", fontSize: "14px", fontWeight: "bold",
              }}>Go to Login</button>
            </div>
            <p style={{ fontSize: "11px", color: "#64748b", marginTop: "20px" }}>
              This error has been logged to the console for debugging.
            </p>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

// ── Dashboard wrapper (applies DashboardLayout + ProtectedRoute) ──────────

function DashPage({ children }: { children: ReactNode }) {
  return (
    <ProtectedRoute>
      <DashboardLayout>
        {children}
      </DashboardLayout>
    </ProtectedRoute>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

const queryClient = new QueryClient();

const App = () => (
  <ErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>

            {/* ── Public / auth routes ─────────────────────────────────── */}
            <Route path="/"         element={<Index />} />
            <Route path="/login"    element={<Login />} />
            <Route path="/register" element={<Register />} />

            {/* ── Secure resume viewer — public, token-gated ───────────── */}
            <Route path="/shared-view/:token" element={<SecureResumeViewer />} />

            {/* ── /home → redirect to dashboard ────────────────────────── */}
            <Route
              path="/home"
              element={
                <ProtectedRoute>
                  <Navigate to="/dashboard" replace />
                </ProtectedRoute>
              }
            />

            {/* ── Persistent Dashboard ─────────────────────────────────── */}
            <Route path="/dashboard"            element={<DashPage><DashboardHome   /></DashPage>} />
            <Route path="/dashboard/vault"      element={<DashPage><SecureVault     /></DashPage>} />
            <Route path="/dashboard/sharing"             element={<DashPage><SharingCenter        /></DashPage>} />
            <Route path="/dashboard/sharing/:assetId"  element={<DashPage><ResumeShareDashboard /></DashPage>} />
            <Route path="/dashboard/activity"   element={<DashPage><ActivityCenter  /></DashPage>} />
            <Route path="/dashboard/forensics"  element={<DashPage><ForensicsCenter /></DashPage>} />
            <Route path="/dashboard/security"   element={<DashPage><SecurityCenter  /></DashPage>} />
            <Route path="/dashboard/settings"   element={<DashPage><SettingsPage    /></DashPage>} />

            {/* ── Existing routes — preserved exactly ──────────────────── */}
            <Route
              path="/encrypt"
              element={<ProtectedRoute><Encrypt /></ProtectedRoute>}
            />
            <Route
              path="/document-forensics"
              element={<ProtectedRoute><DocumentForensics /></ProtectedRoute>}
            />
            <Route
              path="/resume/dashboard/:assetId"
              element={<ProtectedRoute><ResumeShareDashboard /></ProtectedRoute>}
            />

            {/* ── Legacy redirects — unchanged ─────────────────────────── */}
            <Route path="/verify-proof"      element={<ProtectedRoute><DocumentForensics /></ProtectedRoute>} />
            <Route path="/unified-forensics" element={<ProtectedRoute><DocumentForensics /></ProtectedRoute>} />
            <Route path="/detection-result"  element={<ProtectedRoute><DocumentForensics /></ProtectedRoute>} />
            <Route path="/ai-detection-test" element={<ProtectedRoute><DocumentForensics /></ProtectedRoute>} />

            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  </ErrorBoundary>
);

export default App;
