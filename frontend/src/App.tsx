import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Component, ReactNode } from "react";
import Index from "./pages/Index";
import Login from "./pages/Login";
import Register from "./pages/Register";
import NotFound from "./pages/NotFound";
import ProtectedRoute from "./components/ProtectedRoute";
import Home from "./pages/Home";
import Encrypt from "./pages/Encrypt";
import DocumentForensics from "./pages/DocumentForensics";
import SecureResumeViewer from "./pages/SecureResumeViewer";
import ResumeShareDashboard from "./pages/ResumeShareDashboard";

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
        <div
          style={{
            width: "100%",
            height: "100vh",
            backgroundColor: "#0f172a",
            color: "#ffffff",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            padding: "20px",
            fontFamily: "monospace",
            overflow: "auto",
          }}
        >
          <div
            style={{
              maxWidth: "600px",
              textAlign: "center",
              backgroundColor: "#1e293b",
              padding: "30px",
              borderRadius: "12px",
              border: "2px solid #ef4444",
            }}
          >
            <h1
              style={{
                fontSize: "28px",
                fontWeight: "bold",
                color: "#f87171",
                margin: "0 0 20px 0",
              }}
            >
              🔴 CRITICAL APP ERROR
            </h1>

            <p
              style={{
                fontSize: "14px",
                marginBottom: "20px",
                color: "#cbd5e1",
              }}
            >
              The application encountered a fatal error and could not continue.
            </p>

            <div
              style={{
                backgroundColor: "#0f172a",
                padding: "15px",
                borderRadius: "8px",
                marginBottom: "20px",
                textAlign: "left",
                maxHeight: "300px",
                overflowY: "auto",
                fontSize: "12px",
                color: "#fca5a5",
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
                border: "1px solid #7f1d1d",
              }}
            >
              <strong>Error Message:</strong>
              <br />
              {this.state.error?.message || "Unknown error"}
              <br />
              <br />
              <strong>Stack Trace:</strong>
              <br />
              {this.state.error?.stack || "No stack trace available"}
            </div>

            <div
              style={{
                display: "flex",
                gap: "10px",
                justifyContent: "center",
              }}
            >
              <button
                onClick={() => window.location.reload()}
                style={{
                  padding: "10px 20px",
                  backgroundColor: "#06b6d4",
                  color: "#ffffff",
                  border: "none",
                  borderRadius: "6px",
                  cursor: "pointer",
                  fontSize: "14px",
                  fontWeight: "bold",
                }}
              >
                Reload App
              </button>
              <button
                onClick={() => {
                  localStorage.removeItem("biovault_token");
                  localStorage.removeItem("biovault_userId");
                  window.location.href = "/login";
                }}
                style={{
                  padding: "10px 20px",
                  backgroundColor: "#8b5cf6",
                  color: "#ffffff",
                  border: "none",
                  borderRadius: "6px",
                  cursor: "pointer",
                  fontSize: "14px",
                  fontWeight: "bold",
                }}
              >
                Go to Login
              </button>
            </div>

            <p
              style={{
                fontSize: "11px",
                color: "#64748b",
                marginTop: "20px",
              }}
            >
              This error has been logged to the console for debugging.
            </p>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

const queryClient = new QueryClient();

const App = () => (
  <ErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route
              path="/home"
              element={
                <ProtectedRoute>
                  <Home />
                </ProtectedRoute>
              }
            />
            <Route
              path="/encrypt"
              element={
                <ProtectedRoute>
                  <Encrypt />
                </ProtectedRoute>
              }
            />
            <Route
              path="/document-forensics"
              element={
                <ProtectedRoute>
                  <DocumentForensics />
                </ProtectedRoute>
              }
            />
            {/* Secure resume viewer — public (token-gated, no login required) */}
            <Route path="/shared-view/:token" element={<SecureResumeViewer />} />
            {/* Resume share dashboard — owner only (login required) */}
            <Route
              path="/resume/dashboard/:assetId"
              element={
                <ProtectedRoute>
                  <ResumeShareDashboard />
                </ProtectedRoute>
              }
            />
            {/* Legacy redirects — old routes point to the unified engine */}
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
