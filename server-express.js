import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const DIST_DIR = path.resolve(__dirname, 'dist');

console.error('');
console.error('█████████████████████████████████████████████████████████');
console.error('🚀 EXPRESS SERVER IS STARTING');
console.error('█████████████████████████████████████████████████████████');
console.error('');

// Serve static files
app.use(express.static(DIST_DIR));

// Health check
app.get('/test', (req, res) => {
  res.status(200).send('✅ SERVER IS RUNNING - Express server is working!\n');
});

// SPA fallback - serve index.html for all unknown routes
app.get('*', (req, res) => {
  res.sendFile(path.join(DIST_DIR, 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log('');
  console.log('═'.repeat(70));
  console.log('🚀 BIOVAULT SPA SERVER - EXPRESS');
  console.log('═'.repeat(70));
  console.log(`📂 Serving from: ${DIST_DIR}`);
  console.log(`🔌 Port: ${PORT}`);
  console.log('✅ SERVER ONLINE AND READY');
  console.log(`🌍 https://biovault-app.onrender.com`);
  console.log('═'.repeat(70));
  console.log('');
});
