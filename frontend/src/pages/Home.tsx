import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { HexGrid } from '@/components/HexGrid';
import { Button } from '@/components/ui/button';
import { Shield, Upload, LogOut, Microscope, User } from 'lucide-react';
import { motion } from 'framer-motion';
import { appStorage } from '@/lib/storage';

const Home = () => {
  const navigate = useNavigate();
  const [userId, setUserId] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadUserData = async () => {
      try {
        const storedUserId = await appStorage.getItem('biovault_userId');
        if (storedUserId) {
          setUserId(storedUserId);
        } else {
          navigate('/login');
        }
      } catch (error) {
        console.error('Error loading user data:', error);
        navigate('/login');
      } finally {
        setIsLoading(false);
      }
    };

    loadUserData();
  }, [navigate]);

  const handleLogout = async () => {
    try {
      await appStorage.removeItem('biovault_token');
      await appStorage.removeItem('biovault_userId');
      localStorage.removeItem('biovault_token');
      localStorage.removeItem('biovault_userId');
      navigate('/login');
    } catch (error) {
      console.error('Error during logout:', error);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen relative overflow-hidden">
        <HexGrid />
        <div className="relative z-10 flex items-center justify-center min-h-screen">
          <div className="text-center">
            <div className="w-12 h-12 border-3 border-cyan-500/30 border-t-cyan-500 rounded-full animate-spin mx-auto mb-4"></div>
            <p className="text-cyan-400/70 text-sm font-mono">Loading dashboard...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen relative overflow-hidden">
      <HexGrid />
      <div className="relative z-10">
        {/* Header */}
        <header className="bg-background/80 backdrop-blur-xl border-b border-border/50">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between h-16">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-cyan-500 to-blue-500 flex items-center justify-center">
                  <Shield className="w-4 h-4 text-white" />
                </div>
                <h1 className="text-xl font-bold text-foreground">PINIT Vault</h1>
              </div>
              
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <User className="w-4 h-4" />
                  {userId}
                </div>
                <Button
                  onClick={handleLogout}
                  variant="outline"
                  size="sm"
                  className="border-red-500/50 text-red-400 hover:bg-red-500/10"
                >
                  <LogOut className="w-4 h-4 mr-2" />
                  Logout
                </Button>
              </div>
            </div>
          </div>
        </header>

        {/* Main Content */}
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          {/* Welcome Section */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="text-center mb-12"
          >
            <h2 className="text-3xl font-bold text-foreground mb-4">
              Welcome back, {userId}
            </h2>
            <p className="text-lg text-muted-foreground">
              Secure document management and verification system
            </p>
          </motion.div>

          {/* Action Cards — two primary capabilities */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-12 max-w-3xl mx-auto">
            {/* Encrypt & Vault */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.2, duration: 0.6 }}
              className="bg-background/80 backdrop-blur-xl border border-border/50 rounded-2xl p-8 hover:border-cyan-500/50 transition-colors cursor-pointer group"
              onClick={() => navigate('/encrypt')}
            >
              <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center mb-5 group-hover:scale-105 transition-transform">
                <Upload className="w-7 h-7 text-white" />
              </div>
              <h3 className="text-xl font-bold text-foreground mb-2">Encrypt &amp; Vault</h3>
              <p className="text-sm text-muted-foreground mb-6">
                Cryptographically sign and encrypt your documents and images.
                Store them in your secure vault with PINIT watermarking.
              </p>
              <Button
                onClick={e => { e.stopPropagation(); navigate('/encrypt'); }}
                className="w-full bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-700 hover:to-blue-700 text-white font-semibold py-3"
              >
                Open Vault
              </Button>
            </motion.div>

            {/* Document Forensics — single unified engine */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.35, duration: 0.6 }}
              className="bg-background/80 backdrop-blur-xl border border-border/50 rounded-2xl p-8 hover:border-violet-500/50 transition-colors cursor-pointer group"
              onClick={() => navigate('/document-forensics')}
            >
              <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-600 flex items-center justify-center mb-5 group-hover:scale-105 transition-transform">
                <Microscope className="w-7 h-7 text-white" />
              </div>
              <h3 className="text-xl font-bold text-foreground mb-2">Document Forensics</h3>
              <p className="text-sm text-muted-foreground mb-3">
                AI-generation detection · ELA tamper heatmaps · OCR comparison ·
                Metadata analysis · Fake ID / certificate detection.
              </p>
              <div className="flex flex-wrap gap-1.5 mb-6">
                {["Fake IDs", "AI Docs", "Tampered", "Forged Certs"].map(t => (
                  <span key={t}
                    className="text-[10px] px-2 py-0.5 rounded-full bg-violet-950/60 border border-violet-700/40 text-violet-300">
                    {t}
                  </span>
                ))}
              </div>
              <Button
                onClick={e => { e.stopPropagation(); navigate('/document-forensics'); }}
                className="w-full bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-700 hover:to-fuchsia-700 text-white font-semibold py-3"
              >
                Analyze Document
              </Button>
            </motion.div>
          </div>
        </main>
      </div>
    </div>
  );
};

export default Home;
