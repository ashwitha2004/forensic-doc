const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;

http.createServer((req, res) => {
  const filePath = path.join(__dirname, 'dist', req.url === '/' ? 'index.html' : req.url.slice(1));
  
  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    res.write(fs.readFileSync(filePath));
    res.end();
  } else {
    res.write(fs.readFileSync(path.join(__dirname, 'dist/index.html')));
    res.end();
  }
}).listen(PORT, '0.0.0.0');
