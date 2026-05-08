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
console.error('🚀 EXPRESS FALLBACK SERVER - WITH FALLBACK INDEX');
console.error('█████████████████████████████████████████████████████████');
console.error('');

let htmlContent = '';

// Check if dist exists and has index.html
if (fs.existsSync(DIST_DIR) && fs.existsSync(path.join(DIST_DIR, 'index.html'))) {
  console.error(`✅ dist/ found, reading index.html...`);
  htmlContent = fs.readFileSync(path.join(DIST_DIR, 'index.html'), 'utf8');
  app.use(express.static(DIST_DIR));
} else {
  console.error(`⚠️  dist/ NOT FOUND or index.html missing`);
  console.error(`   DIST_DIR: ${DIST_DIR}`);
  console.error(`   Exists: ${fs.existsSync(DIST_DIR)}`);
  if (fs.existsSync(DIST_DIR)) {
    console.error(`   Contents: ${fs.readdirSync(DIST_DIR).join(', ')}`);
  }
  console.error(`   Creating fallback HTML...`);
  
  // Create fallback HTML that will at least load
  htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>BiVault</title>
  <style>
    body { font-family: sans-serif; padding: 20px; background: #f5f5f5; }
    .container { max-width: 600px; margin: 0 auto; background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
    h1 { color: #333; }
    .status { background: #fff3cd; border: 1px solid #ffc107; padding: 12px; border-radius: 4px; margin: 10px 0; }
    .success { background: #d4edda; border: 1px solid #28a745; color: #155724; }
    .error { background: #f8d7da; border: 1px solid #f5c6cb; color: #721c24; }
    code { background: #f4f4f4; padding: 2px 6px; border-radius: 3px; font-family: monospace; }
    ul { margin: 10px 0; }
  </style>
</head>
<body>
  <div class="container">
    <h1>BiVault App - Loading...</h1>
    <div class="status error">
      ⚠️ <strong>Build Issue Detected</strong><br>
      The dist/ folder is missing or index.html could not be found.
    </div>
    <p><strong>Debug Info:</strong></p>
    <ul>
      <li>Server: ✅ Running (Express)</li>
      <li>dist/ Directory: ❌ Missing</li>
      <li>Port: ${PORT}</li>
    </ul>
    <p><strong>Next Steps:</strong></p>
    <ul>
      <li>Check if <code>npm run build</code> completed successfully</li>
      <li>Verify that dist/ was generated before server started</li>
      <li>Check Render build logs for errors</li>
    </ul>
    <p><small>If you're seeing this, the build may have failed silently.</small></p>
  </div>
</body>
</html>`;
}

console.error('');

// Debug endpoint
app.get('/test', (req, res) => {
  res.status(200).send('✅ EXPRESS SERVER IS WORKING!\n');
});

app.get('/debug', (req, res) => {
  const debugInfo = {
    server: 'Express',
    port: PORT,
    time: new Date().toISOString(),
    distExists: fs.existsSync(DIST_DIR),
    distFiles: fs.existsSync(DIST_DIR) ? fs.readdirSync(DIST_DIR) : [],
    indexExists: fs.existsSync(path.join(DIST_DIR, 'index.html')),
    htmlContentLength: htmlContent.length,
    serverReady: true
  };
  res.json(debugInfo);
});

// Serve static files if dist exists
if (fs.existsSync(DIST_DIR)) {
  app.use(express.static(DIST_DIR));
}

// SPA fallback — serve our HTML for all unknown routes
app.get('*', (req, res) => {
  res.type('text/html').send(htmlContent);
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Express Error:', err);
  res.status(500).send(`<pre>Server Error: ${err.message}</pre>`);
});

app.listen(PORT, '0.0.0.0', () => {
  console.log('');
  console.log('═'.repeat(70));
  console.log('🚀 BIOVAULT SPA SERVER - EXPRESS (FALLBACK MODE)');
  console.log('═'.repeat(70));
  console.log(`🔌 Port: ${PORT}`);
  console.log(`📂 Dist: ${fs.existsSync(DIST_DIR) ? '✅ EXISTS' : '❌ MISSING'}`);
  console.log('✅ SERVER ONLINE AND READY');
  console.log(`🌍 https://biovault-app.onrender.com`);
  console.log('');
  console.log('Routes:');
  console.log('  GET /test       → Server health check');
  console.log('  GET /debug      → Detailed debug info');
  console.log('  GET *           → Serve index.html (SPA fallback)');
  console.log('═'.repeat(70));
  console.log('');
});
