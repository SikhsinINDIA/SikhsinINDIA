const http = require('http');
const fs = require('fs');
const path = require('path');
const root = __dirname;
const mime = { '.html':'text/html', '.jpg':'image/jpeg', '.jpeg':'image/jpeg', '.png':'image/png', '.svg':'image/svg+xml', '.webp':'image/webp' };
http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  let filePath = path.join(root, p);
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not found: ' + filePath); return; }
    const ext = path.extname(filePath);
    res.writeHead(200, { 'Content-Type': mime[ext] || 'application/octet-stream' });
    res.end(data);
  });
}).listen(8899, () => console.log('Server running on http://localhost:8899'));
