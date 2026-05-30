import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "0.0.0.0",
    port: process.env.PORT ? parseInt(process.env.PORT) : 8080,
    allowedHosts: true,
    hmr: {
      overlay: false,
    },
    // Proxy all backend routes → local FastAPI (port 8000).
    // This lets a single ngrok tunnel serve both the Vite frontend AND the API:
    //   mobile/ngrok  →  port 8080 (Vite)  →  proxy  →  port 8000 (FastAPI)
    proxy: {
      '/api'       : { target: 'http://127.0.0.1:8000', changeOrigin: true, secure: false },
      '/vault'     : { target: 'http://127.0.0.1:8000', changeOrigin: true, secure: false },
      '/auth'      : { target: 'http://127.0.0.1:8000', changeOrigin: true, secure: false },
      '/resume'    : { target: 'http://127.0.0.1:8000', changeOrigin: true, secure: false },
      '/pinit'     : { target: 'http://127.0.0.1:8000', changeOrigin: true, secure: false },
      '/health'    : { target: 'http://127.0.0.1:8000', changeOrigin: true, secure: false },
      '/forensic'  : { target: 'http://127.0.0.1:8000', changeOrigin: true, secure: false },
      '/inference' : { target: 'http://127.0.0.1:8000', changeOrigin: true, secure: false },
      '/unified'   : { target: 'http://127.0.0.1:8000', changeOrigin: true, secure: false },
      '/document'  : { target: 'http://127.0.0.1:8000', changeOrigin: true, secure: false },
      '/r/'        : { target: 'http://127.0.0.1:8000', changeOrigin: true, secure: false },
      '/share/og'  : {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
        secure: false,
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq: any, req: any) => {
            // Preserve original host so backend builds the correct redirect URL
            const originalHost = req.headers['host'] || 'localhost:8080';
            proxyReq.setHeader('x-forwarded-host', originalHost);
            proxyReq.setHeader('x-forwarded-proto',
              (req.socket as any)?.encrypted ? 'https' : 'http');
          });
        },
      },
    },
  },
  plugins: [
    react(),
    mode === "development" && (() => {
      try {
        const { componentTagger } = require("lovable-tagger");
        return componentTagger();
      } catch (error) {
        console.warn("lovable-tagger not available, skipping component tagging");
        return null;
      }
    })()
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
// Force rebuild timestamp: 2026-04-17 02:11:07
