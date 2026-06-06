import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = 8080;

const MIME_TYPES = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

const server = http.createServer(async (req, res) => {
  const parsedUrl = new URL(req.url, `http://${req.headers.host}`);
  let pathname = parsedUrl.pathname;

  // 1. API Endpoints emulation
  if (pathname.startsWith('/api/')) {
    const apiName = pathname.substring(5).replace(/\.js$/, ''); // Remove '/api/' and '.js'
    const apiFilePath = path.join(__dirname, 'api', `${apiName}.js`);

    if (!fs.existsSync(apiFilePath)) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: `API endpoint /api/${apiName} not found` }));
      return;
    }

    // Read body buffer if POST request
    let bodyBuffer = '';
    req.on('data', chunk => {
      bodyBuffer += chunk;
    });

    req.on('end', async () => {
      try {
        // Parse JSON body if present
        let body = {};
        if (bodyBuffer) {
          try {
            body = JSON.parse(bodyBuffer);
          } catch (e) {
            body = bodyBuffer;
          }
        }

        // Mock Vercel Request Object
        const mockedReq = {
          method: req.method,
          url: req.url,
          headers: req.headers,
          query: Object.fromEntries(parsedUrl.searchParams),
          body: body
        };

        // Mock Vercel Response Object
        const responseHeaders = {};
        let statusCode = 200;

        const mockedRes = {
          status(code) {
            statusCode = code;
            return this;
          },
          setHeader(name, value) {
            responseHeaders[name] = value;
            return this;
          },
          json(data) {
            res.writeHead(statusCode, {
              'Content-Type': 'application/json',
              ...responseHeaders
            });
            res.end(JSON.stringify(data));
            return this;
          },
          end(data) {
            res.writeHead(statusCode, responseHeaders);
            res.end(data);
            return this;
          }
        };

        // Dynamically import API handler
        const module = await import(`./api/${apiName}.js?update=${Date.now()}`);
        if (typeof module.default === 'function') {
          await module.default(mockedReq, mockedRes);
        } else {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: `API endpoint /api/${apiName} does not export a default handler function` }));
        }
      } catch (error) {
        console.error(`Error executing API /api/${apiName}:`, error);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: `Internal API error: ${error.message}` }));
      }
    });
    return;
  }

  // 2. Static Files serving
  if (pathname === '/') {
    pathname = '/index.html';
  }

  const filePath = path.join(__dirname, pathname);
  const ext = path.extname(filePath).toLowerCase();

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/html' });
      res.end(`<h1>404 Not Found</h1><p>The file ${pathname} was not found on this server.</p>`);
      return;
    }

    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': contentType });
    
    const stream = fs.createReadStream(filePath);
    stream.pipe(res);
  });
});

server.listen(PORT, () => {
  console.log(`\x1b[32m✔ Antigravity Local Dev Server is active at:\x1b[0m http://localhost:${PORT}`);
  console.log(`Press Ctrl+C to stop the server.`);
});
