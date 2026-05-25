import React from 'react';
import { useNavigate } from 'react-router-dom';
import { HexGrid } from '@/components/HexGrid';
import { Button } from '@/components/ui/button';
import { Shield, ArrowRight } from 'lucide-react';
import { motion } from 'framer-motion';

const Index = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen relative overflow-hidden">
      <HexGrid />
      <div className="relative z-10 flex items-center justify-center min-h-screen px-4 py-12">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.6 }}
          className="w-full max-w-4xl text-center"
        >
          {/* Logo and Title */}
          <motion.div
            initial={{ y: -20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.2, duration: 0.6 }}
            className="flex flex-col items-center gap-6 mb-12"
          >
            <div className="w-20 h-20 rounded-full bg-gradient-to-br from-cyan-500 to-blue-500 shadow-2xl flex items-center justify-center">
              <Shield className="w-10 h-10 text-white" />
            </div>
            
            <div>
              <h1 className="text-5xl font-display font-bold tracking-wider text-foreground text-glow-cyan mb-4">
                PINIT Vault
              </h1>
              <p className="text-xl text-muted-foreground font-mono tracking-widest uppercase">
                Secure Identity Verification System
              </p>
            </div>
          </motion.div>

          {/* Description */}
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4, duration: 0.6 }}
            className="text-lg text-muted-foreground mb-12 max-w-2xl mx-auto"
          >
            Secure document verification and storage for the modern digital world.
            Protect your documents with cutting-edge cryptographic proof systems.
          </motion.p>

          {/* Action Buttons */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6, duration: 0.6 }}
            className="flex flex-col sm:flex-row gap-4 justify-center items-center"
          >
            <Button
              onClick={() => navigate('/login')}
              size="lg"
              className="bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-700 hover:to-blue-700 text-white px-8 py-3 text-lg"
            >
              Sign In
              <ArrowRight className="w-5 h-5 ml-2" />
            </Button>
            
            <Button
              onClick={() => navigate('/register')}
              variant="outline"
              size="lg"
              className="border-cyan-500/50 text-cyan-400 hover:bg-cyan-500/10 px-8 py-3 text-lg"
            >
              Create Account
            </Button>
          </motion.div>

          {/* Features */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.8, duration: 0.6 }}
            className="mt-16 grid grid-cols-1 md:grid-cols-3 gap-8 text-left"
          >
            <div className="bg-background/50 backdrop-blur-sm border border-border/50 rounded-lg p-6">
              <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-cyan-500 to-blue-500 flex items-center justify-center mb-4">
                <Shield className="w-6 h-6 text-white" />
              </div>
              <h3 className="text-lg font-semibold text-foreground mb-2">AI Forensic Detection</h3>
              <p className="text-sm text-muted-foreground">Advanced AI-generated image detection and document forensics</p>
            </div>
            
            <div className="bg-background/50 backdrop-blur-sm border border-border/50 rounded-lg p-6">
              <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center mb-4">
                <Shield className="w-6 h-6 text-white" />
              </div>
              <h3 className="text-lg font-semibold text-foreground mb-2">Zero-Knowledge Proofs</h3>
              <p className="text-sm text-muted-foreground">Cryptographic verification without revealing sensitive data</p>
            </div>
            
            <div className="bg-background/50 backdrop-blur-sm border border-border/50 rounded-lg p-6">
              <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-green-500 to-emerald-500 flex items-center justify-center mb-4">
                <Shield className="w-6 h-6 text-white" />
              </div>
              <h3 className="text-lg font-semibold text-foreground mb-2">End-to-End Encryption</h3>
              <p className="text-sm text-muted-foreground">Military-grade encryption for all your documents</p>
            </div>
          </motion.div>
        </motion.div>
      </div>
    </div>
  );
};

export default Index;
