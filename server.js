// ✅ ZERO DEPENDENCIES - BUILT-IN NODE ONLY (ES MODULES)
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Get __dirname equivalent in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// CRITICAL: Log immediately to see if server starts at all
console.error('');
console.error('█████████████████████████████████████████████████████████');
console.error('🚀 SERVER.JS IS STARTING - THIS LINE MUST APPEAR IN LOGS');
console.error('█████████████████████████████████████████████████████████');
console.error('');

const PORT = process.env.PORT || 3000;
const DIST_DIR = path.resolve(__dirname, 'dist');

// Simple MIME type map
const mimeTypes = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2'
};

function getMimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return mimeTypes[ext] || 'application/octet-stream';
}

console.log('');
console.log('═'.repeat(70));
console.log('🚀 BIOVAULT SPA SERVER - NATIVE NODE (NO DEPENDENCIES)');
console.log('═'.repeat(70));
console.log(`📂 Serving from: ${DIST_DIR}`);
console.log(`🔌 Port: ${PORT}`);
console.log(`✅ Dist exists: ${fs.existsSync(DIST_DIR)}`);
console.log('═'.repeat(70));
console.log('');

// Create server
const server = http.createServer((req, res) => {
  // Test endpoint to verify server is running
  if (req.url === '/test') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('✅ SERVER IS RUNNING - server.js is working!\n');
    return;
  }

  // Normalize URL
  let urlPath = decodeURIComponent(req.url);
  if (urlPath === '/') {
    urlPath = '/index.html';
  }

  const filePath = path.join(DIST_DIR, urlPath.startsWith('/') ? urlPath.slice(1) : urlPath);
  const dirPath = path.dirname(filePath);

  // Security check - prevent directory traversal
  if (!dirPath.startsWith(DIST_DIR)) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('Forbidden');
    return;
  }

  // Try to serve the exact file
  fs.stat(filePath, (err, stats) => {
    if (!err && stats.isFile()) {
      // File exists - serve it
      const mimeType = getMimeType(filePath);
      const content = fs.readFileSync(filePath);
      res.writeHead(200, { 'Content-Type': mimeType });
      res.end(content);
      return;
    }

    // File not found - serve index.html for SPA routing
    const indexPath = path.join(DIST_DIR, 'index.html');
    if (fs.existsSync(indexPath)) {
      const content = fs.readFileSync(indexPath);
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(content);
    } else {
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end('Server Error: index.html not found');
    }
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log('✅ SERVER ONLINE AND READY');
  console.log(`🌍 https://biovault-app.onrender.com`);
  console.log('');
});

server.on('error', (err) => {
  console.error('❌ Server Error:', err.message);
  process.exit(1);
});
