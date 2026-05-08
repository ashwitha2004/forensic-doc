import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { ArrowLeft, UserPlus, ChevronRight, Copy, Check, XCircle } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { HexGrid } from "@/components/HexGrid";
import { Button } from "@/components/ui/button";
import { StatusIndicator } from "@/components/StatusIndicator";
import { appStorage } from "@/lib/storage";

type Step = "userId" | "complete";

function generateId(prefix: string) {
  return `${prefix}-${Math.floor(100000 + Math.random() * 900000)}`;
}

const Register = () => {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>("userId");
  const [userId] = useState(() => generateId("USR"));
  const [copied, setCopied] = useState(false);
  const [registerError, setRegisterError] = useState<string | null>(null);
  const [isRegistering, setIsRegistering] = useState(false);
  const [userIdSaved, setUserIdSaved] = useState(false);

  useEffect(() => {
    // Check if user is already registered - but allow them to stay on register page
    // This prevents immediate redirect when clicking "Create Account"
    const checkExistingUser = async () => {
      try {
        const existingUserId = await appStorage.getItem("biovault_userId");
        if (existingUserId) {
          // Don't immediately redirect - let user decide what to do
          console.log("Existing user found:", existingUserId);
        }
      } catch (error) {
        console.error("Error checking existing user:", error);
      }
    };
    checkExistingUser();
  }, []);

  const handleCopyUserId = () => {
    navigator.clipboard.writeText(userId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleRegister = async () => {
    setIsRegistering(true);
    setRegisterError(null);

    try {
      // Simple registration - just save the PINIT ID locally
      // No biometric authentication needed
      await appStorage.setItem("biovault_userId", userId);
      localStorage.setItem("biovault_userId", userId);
      
      setUserIdSaved(true);
      setStep("complete");
    } catch (error) {
      console.error("Registration error:", error);
      setRegisterError("An unexpected error occurred during registration");
    } finally {
      setIsRegistering(false);
    }
  };

  const handleContinue = () => {
    navigate("/login");
  };

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
                <UserPlus className="w-6 h-6 text-white" />
              </div>
            </motion.div>

            <motion.h1
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.4, duration: 0.6 }}
              className="text-3xl font-display font-bold tracking-wider text-foreground text-glow-cyan mb-2"
            >
              Create Account
            </motion.h1>

            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.6, duration: 0.4 }}
              className="text-sm text-muted-foreground font-mono tracking-widest uppercase"
            >
              Generate your secure PINIT ID
            </motion.p>
          </div>

          {/* Registration Steps */}
          {step === "userId" && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.8, duration: 0.6 }}
              className="bg-background/80 backdrop-blur-xl border border-border/50 rounded-2xl p-6 shadow-2xl"
            >
              <div className="text-center mb-6">
                <h2 className="text-lg font-semibold text-foreground mb-2">Your PINIT ID</h2>
                <p className="text-sm text-muted-foreground mb-4">
                  This ID will be used to access your account. Save it securely.
                </p>
              </div>

              <div className="bg-muted/50 border border-border/50 rounded-lg p-4 mb-6">
                <div className="flex items-center justify-between">
                  <code className="text-sm font-mono text-foreground break-all mr-2">
                    {userId}
                  </code>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleCopyUserId}
                    className="flex-shrink-0"
                  >
                    {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  </Button>
                </div>
              </div>

              {registerError && (
                <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-3 mb-4">
                  <div className="flex items-center gap-2">
                    <XCircle className="w-4 h-4 text-destructive" />
                    <span className="text-sm text-destructive">{registerError}</span>
                  </div>
                </div>
              )}

              <div className="space-y-3">
                <Button
                  onClick={handleRegister}
                  disabled={isRegistering || userIdSaved}
                  className="w-full bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-700 hover:to-blue-700"
                >
                  {isRegistering ? (
                    <div className="flex items-center gap-2">
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                      Creating Account...
                    </div>
                  ) : userIdSaved ? (
                    <div className="flex items-center gap-2">
                      <Check className="w-4 h-4" />
                      Account Created
                    </div>
                  ) : (
                    "Create Account"
                  )}
                </Button>

                <Button
                  variant="outline"
                  onClick={() => navigate("/login")}
                  className="w-full"
                >
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Back to Login
                </Button>
              </div>
            </motion.div>
          )}

          {step === "complete" && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
              className="bg-background/80 backdrop-blur-xl border border-border/50 rounded-2xl p-6 shadow-2xl text-center"
            >
              <div className="w-16 h-16 rounded-full bg-gradient-to-br from-green-500 to-emerald-500 flex items-center justify-center mx-auto mb-4">
                <Check className="w-8 h-8 text-white" />
              </div>

              <h2 className="text-xl font-semibold text-foreground mb-2">Account Created!</h2>
              <p className="text-muted-foreground mb-6">
                Your PINIT account has been successfully created. You can now login to access the verification platform.
              </p>

              <div className="bg-muted/50 border border-border/50 rounded-lg p-4 mb-6">
                <p className="text-xs text-muted-foreground mb-1">Your PINIT ID:</p>
                <code className="text-sm font-mono text-foreground">{userId}</code>
              </div>

              <Button onClick={handleContinue} className="w-full">
                Continue to Login
                <ChevronRight className="w-4 h-4 ml-2" />
              </Button>
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

export default Register;
