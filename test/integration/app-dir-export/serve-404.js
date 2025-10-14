const http = require('http');
const fs = require('fs');
const path = require('path');

const MIME_TYPES = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain',
  '.ico': 'image/x-icon',
};

function createServer(dir, port) {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      // Remove query string
      const cleanUrl = req.url.split('?')[0];

      // Try multiple file paths in order
      const pathsToTry = [
        cleanUrl === '/' ? path.join(dir, 'index.html') : path.join(dir, cleanUrl),
        path.join(dir, cleanUrl + '.html'),
        path.join(dir, cleanUrl, 'index.html'),
      ];

      function tryNextPath(index) {
        if (index >= pathsToTry.length) {
          // All paths failed, serve 404.html as SPA fallback
          const notFoundPath = path.join(dir, '404.html');
          fs.readFile(notFoundPath, (err404, content404) => {
            if (err404) {
              res.writeHead(404, { 'Content-Type': 'text/html' });
              res.end('<h1>404 Not Found</h1>', 'utf-8');
            } else {
              res.writeHead(200, { 'Content-Type': 'text/html' });
              res.end(content404, 'utf-8');
            }
          });
          return;
        }

        const filePath = pathsToTry[index];
        const ext = path.extname(filePath);
        const contentType = MIME_TYPES[ext] || 'application/octet-stream';

        fs.readFile(filePath, (err, content) => {
          if (err) {
            // Try next path
            tryNextPath(index + 1);
          } else {
            // Found! Serve the file
            res.writeHead(200, { 'Content-Type': contentType });
            res.end(content, 'utf-8');
          }
        });
      }

      tryNextPath(0);
    });

    server.listen(port, () => {
      console.log(`Server running at http://localhost:${port}/`);
      resolve(server);
    });
  });
}

// CLI usage
if (require.main === module) {
  const dir = process.argv[2] || 'out';
  const port = parseInt(process.argv[3] || '8889', 10);

  createServer(dir, port);
}

module.exports = { createServer };
