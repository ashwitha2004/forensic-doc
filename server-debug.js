import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const DIST_DIR = path.resolve(__dirname, 'dist');

console.error('');
console.error('█████████████████████████████████████████████████████████');
console.error('🚀 EXPRESS SERVER IS STARTING - WITH DEBUG');
console.error('█████████████████████████████████████████████████████████');
console.error('');
console.error('Checking dist directory...');
console.error(`DIST_DIR: ${DIST_DIR}`);
console.error(`Exists: ${fs.existsSync(DIST_DIR)}`);
if (fs.existsSync(DIST_DIR)) {
  console.error(`Files: ${fs.readdirSync(DIST_DIR).slice(0, 10).join(', ')}`);
}
console.error('');

// Serve static files
app.use(express.static(DIST_DIR));

// Debug endpoints
app.get('/test', (req, res) => {
  res.status(200).send('✅ /test ENDPOINT WORKS\n');
});

app.get('/debug', (req, res) => {
  const debugInfo = {
    PORT,
    DIST_DIR,
    distExists: fs.existsSync(DIST_DIR),
    distFiles: fs.existsSync(DIST_DIR) ? fs.readdirSync(DIST_DIR).slice(0, 5) : [],
    indexExists: fs.existsSync(path.join(DIST_DIR, 'index.html')),
    __dirname,
    version: '2',
    timestamp: new Date().toISOString()
  };
  res.json(debugInfo);
});

// SPA fallback - serve index.html for all unknown routes
app.get('*', (req, res) => {
  const indexPath = path.join(DIST_DIR, 'index.html');
  console.log(`[${req.method}] ${req.url} -> Serving ${indexPath}`);
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.status(500).send(`Error: index.html not found at ${indexPath}`);
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log('');
  console.log('═'.repeat(70));
  console.log('🚀 BIOVAULT SPA SERVER - EXPRESS (DEBUG MODE)');
  console.log('═'.repeat(70));
  console.log(`📂 Serving from: ${DIST_DIR}`);
  console.log(`🔌 Port: ${PORT}`);
  console.log('✅ SERVER ONLINE AND READY');
  console.log(`🌍 https://biovault-app.onrender.com`);
  console.log('');
  console.log('Debug Endpoints:');
  console.log('  /test     → Simple test');
  console.log('  /debug    → Full debug info (JSON)');
  console.log('═'.repeat(70));
  console.log('');
});
