const http = require('http');
const fs = require('fs');
const path = require('path');

let PORT = parseInt(process.env.PORT, 10) || 3000;
const ROOT = __dirname;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf'
};

const clients = new Set();
let debounceTimer = null;

// Watch files for changes
try {
  fs.watch(ROOT, { recursive: true }, (eventType, filename) => {
    if (filename && !filename.startsWith('.') && !filename.includes('node_modules')) {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        console.log(`[Reload] File changed: ${filename}`);
        for (const res of clients) {
          try {
            res.write('data: reload\n\n');
          } catch (e) {
            clients.delete(res);
          }
        }
      }, 100);
    }
  });
} catch (e) {
  console.warn('Watch warning:', e.message);
}

const server = http.createServer((req, res) => {
  if (req.url === '/_reload') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    });
    clients.add(res);
    req.on('close', () => clients.delete(res));
    return;
  }

  let reqPath = decodeURI(req.url.split('?')[0]);
  if (reqPath === '/') reqPath = '/index.html';

  const filePath = path.join(ROOT, reqPath);

  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('404 Not Found');
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    if (ext === '.html') {
      fs.readFile(filePath, 'utf8', (readErr, content) => {
        if (readErr) {
          res.writeHead(500);
          res.end('Internal Server Error');
          return;
        }
        const liveReloadScript = `
<!-- Live Reload -->
<script>
  (function() {
    let source = new EventSource('/_reload');
    source.onmessage = function(e) {
      if (e.data === 'reload') {
        console.log('[LiveReload] Refreshing page...');
        location.reload();
      }
    };
  })();
</script>
</body>`;
        const modifiedContent = content.includes('</body>')
          ? content.replace('</body>', liveReloadScript)
          : content + liveReloadScript;

        res.writeHead(200, { 'Content-Type': contentType });
        res.end(modifiedContent);
      });
    } else {
      res.writeHead(200, { 'Content-Type': contentType });
      fs.createReadStream(filePath).pipe(res);
    }
  });
});

function startServer(port) {
  server.removeAllListeners('error');
  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.log(`Port ${port} in use, trying ${port + 1}...`);
      startServer(port + 1);
    } else {
      console.error('Server error:', err);
    }
  });

  server.listen(port, () => {
    console.log(`\n========================================`);
    console.log(`LeMARI Dev Server running at:`);
    console.log(`http://localhost:${port}/`);
    console.log(`========================================\n`);
  });
}

startServer(PORT);
