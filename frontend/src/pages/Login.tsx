import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { ArrowLeft, Shield, ChevronRight, User, Key } from "lucide-react";
import { useNavigate, useLocation } from "react-router-dom";
import { HexGrid } from "@/components/HexGrid";
import { Button } from "@/components/ui/button";
import { StatusIndicator } from "@/components/StatusIndicator";
import { appStorage } from "@/lib/storage";
import { verifyFingerprint } from "@/lib/authService";

type Step = "login" | "success" | "error";

const Login = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [step, setStep] = useState<Step>("login");
  const [isLoading, setIsLoading] = useState(true);
  const [userId, setUserId] = useState<string>("");
  const [loginError, setLoginError] = useState<string | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  useEffect(() => {
    // Check if user is already logged in
    const checkAuth = async () => {
      try {
        const token = await appStorage.getItem("biovault_token");
        const storedUserId = await appStorage.getItem("biovault_userId");
        
        if (token && storedUserId) {
          navigate("/home", { replace: true });
          return;
        }
        
        if (storedUserId) {
          setUserId(storedUserId);
        }
      } catch (error) {
        console.error("Error checking auth:", error);
      } finally {
        setIsLoading(false);
      }
    };

    checkAuth();
  }, [navigate]);

  const handleUserIdChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setUserId(e.target.value);
    setLoginError(null);
  };

  const handleLogin = async () => {
    const trimmedUserId = userId.trim();
    
    if (!trimmedUserId) {
      setLoginError("Please enter your PINIT ID");
      return;
    }

    setIsLoggingIn(true);
    setLoginError(null);

    try {
      // Validate PINIT ID format - accept any USR-XXXXXX format
      const pinitIdRegex = /^USR-\d{6}$/;
      if (!pinitIdRegex.test(trimmedUserId)) {
        setLoginError("Invalid PINIT ID format. Please check your ID and try again.");
        return;
      }

      // For simplified web version, accept any valid PINIT ID format
      // In production, this would validate against the backend
      await appStorage.setItem("biovault_token", "demo-token-" + Date.now());
      await appStorage.setItem("biovault_userId", trimmedUserId);
      localStorage.setItem("biovault_token", "demo-token-" + Date.now());
      localStorage.setItem("biovault_userId", trimmedUserId);
      localStorage.setItem("pinit_user_id", trimmedUserId); // Store PINIT user ID for encryption
      
      setStep("success");
      setTimeout(() => {
        navigate("/home", { replace: true });
      }, 1500);
    } catch (error) {
      console.error("Login error:", error);
      setLoginError("Login failed. Please try again.");
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleRegister = () => {
    navigate("/register");
  };

  // Show loading state
  if (isLoading) {
    return (
      <div className="min-h-screen relative overflow-hidden">
        <HexGrid />
        <div className="relative z-10 flex items-center justify-center min-h-screen px-4 py-12">
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
            className="flex flex-col items-center gap-4"
          >
            <div className="w-12 h-12 border-3 border-cyan-500/30 border-t-cyan-500 rounded-full"></div>
            <p className="text-cyan-400/70 text-sm font-mono">Loading...</p>
          </motion.div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen relative overflow-hidden">
      <HexGrid />
      <div className="relative z-10 flex items-center justify-center min-h-screen px-4 py-12">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.6 }}
          className="w-full max-w-md"
        >
          {/* Header */}
          <div className="text-center mb-8">
            <motion.div
              initial={{ y: -20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.2, duration: 0.6 }}
              className="flex items-center justify-center gap-3 mb-6"
            >
              <div className="w-12 h-12 rounded-full bg-gradient-to-br from-cyan-500 to-blue-500 shadow-lg flex items-center justify-center">
                <Shield className="w-6 h-6 text-white" />
              </div>
            </motion.div>

            <motion.h1
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.4, duration: 0.6 }}
              className="text-3xl font-display font-bold tracking-wider text-foreground text-glow-cyan mb-2"
            >
              Welcome Back
            </motion.h1>

            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.6, duration: 0.4 }}
              className="text-sm text-muted-foreground font-mono tracking-widest uppercase"
            >
              Enter your PINIT ID to continue
            </motion.p>
          </div>

          {/* Login Form */}
          {step === "login" && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.8, duration: 0.6 }}
              className="bg-background/80 backdrop-blur-xl border border-border/50 rounded-2xl p-6 shadow-2xl"
            >
              <div className="space-y-6">
                {/* User ID Input */}
                <div>
                  <label className="block text-sm font-medium text-foreground mb-2">
                    PINIT ID
                  </label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
                    <input
                      type="text"
                      value={userId}
                      onChange={handleUserIdChange}
                      placeholder="USR-XXXXXX"
                      className="w-full pl-10 pr-4 py-3 bg-muted/50 border border-border/50 rounded-lg text-foreground placeholder-muted-foreground focus:outline-none focus:border-cyan-500/50 focus:ring-2 focus:ring-cyan-500/20"
                      disabled={isLoggingIn}
                    />
                  </div>
                </div>

                {/* Error Message */}
                {loginError && (
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-destructive/10 border border-destructive/30 rounded-lg p-3"
                  >
                    <p className="text-sm text-destructive">{loginError}</p>
                  </motion.div>
                )}

                {/* Login Button */}
                <Button
                  onClick={handleLogin}
                  disabled={isLoggingIn}
                  className="w-full bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-700 hover:to-blue-700"
                >
                  {isLoggingIn ? (
                    <div className="flex items-center gap-2">
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                      Signing In...
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <Key className="w-4 h-4" />
                      Sign In
                    </div>
                  )}
                </Button>

                {/* Register Link */}
                <div className="text-center">
                  <p className="text-sm text-muted-foreground">
                    Don't have an account?{" "}
                    <button
                      onClick={handleRegister}
                      className="text-cyan-400 hover:text-cyan-300 font-medium transition-colors"
                    >
                      Create Account
                    </button>
                  </p>
                </div>
              </div>
            </motion.div>
          )}

          {/* Success State */}
          {step === "success" && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.6 }}
              className="bg-background/80 backdrop-blur-xl border border-border/50 rounded-2xl p-8 shadow-2xl text-center"
            >
              <div className="w-16 h-16 rounded-full bg-gradient-to-br from-green-500 to-emerald-500 flex items-center justify-center mx-auto mb-4">
                <Shield className="w-8 h-8 text-white" />
              </div>

              <h2 className="text-xl font-semibold text-foreground mb-2">Login Successful!</h2>
              <p className="text-muted-foreground">
                Redirecting to your dashboard...
              </p>
            </motion.div>
          )}

          {/* Status Indicator */}
          <div className="fixed bottom-4 right-4">
            <StatusIndicator status="active" />
          </div>
        </motion.div>
      </div>
    </div>
  );
};

export default Login;
