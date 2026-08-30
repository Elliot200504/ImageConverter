#!/usr/bin/env node

// Small web server so I can drag and drop images instead of typing commands.
// It serves the page in public/ and has one endpoint that converts an image.
// Only Node built in stuff here, the converting happens in converter.js.

const http = require('http');
const fs = require('fs');
const path = require('path');
const { FORMATS, resolveFormat, convert } = require('./converter');

const MAX_UPLOAD = 64 * 1024 * 1024;

const PUBLIC_DIR = path.join(__dirname, 'public');

const STATIC_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

function parseArgs(argv) {
  const opts = {
    port: Number(process.env.PORT) || 3000,
    host: '127.0.0.1',
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];

    if (arg === '-p' || arg === '--port') {
      opts.port = Number(argv[++i]);
    } else if (arg === '--host') {
      opts.host = argv[++i];
    } else if (arg === '--help') {
      console.log([
        'Local image converter server',
        '',
        '  node server.js [--port 3000] [--host 127.0.0.1]',
        '',
        'Only your own computer can reach it by default.',
        'Use --host 0.0.0.0 if you want other devices on the wifi to reach it.',
      ].join('\n'));
      process.exit(0);
    } else {
      console.error('Unknown option: ' + arg);
      process.exit(1);
    }
  }

  if (!Number.isInteger(opts.port) || opts.port < 1 || opts.port > 65535) {
    console.error('Error: --port must be a whole number between 1 and 65535');
    process.exit(1);
  }

  return opts;
}

function sendJson(res, status, body) {
  const text = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(text),
  });
  res.end(text);
}

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;

    req.on('data', (chunk) => {
      size += chunk.length;

      if (size > limit) {
        const err = new Error('Image is bigger than the ' + (limit / 1024 / 1024) + ' MB limit');
        err.status = 413;
        reject(err);
        req.destroy();
        return;
      }

      chunks.push(chunk);
    });

    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function serveStatic(req, res, urlPath) {
  const relative = urlPath === '/' ? 'index.html' : decodeURIComponent(urlPath).replace(/^\/+/, '');
  const file = path.join(PUBLIC_DIR, relative);

  if (!file.startsWith(PUBLIC_DIR + path.sep) && file !== PUBLIC_DIR) {
    sendJson(res, 403, { error: 'Forbidden' });
    return;
  }

  fs.readFile(file, (err, data) => {
    if (err) {
      sendJson(res, 404, { error: 'Not found' });
      return;
    }

    const type = STATIC_TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream';
    res.writeHead(200, {
      'Content-Type': type,
      'Content-Length': data.length,
      'Cache-Control': 'no-cache',
    });
    res.end(data);
  });
}

async function handleConvert(req, res, url) {
  const q = url.searchParams;

  const format = resolveFormat(q.get('to'));
  if (!format) {
    sendJson(res, 400, { error: 'Unknown target format. Pick one of: ' + Object.keys(FORMATS).join(', ') });
    return;
  }

  const body = await readBody(req, MAX_UPLOAD);
  if (body.length === 0) {
    sendJson(res, 400, { error: 'No image data received' });
    return;
  }

  const result = await convert(body, {
    to: format,
    quality: q.get('quality') || 80,
    width: q.get('width') || null,
    height: q.get('height') || null,
    fit: q.get('fit') || 'inside',
    flatten: q.get('flatten') || null,
    animation: q.get('animation') !== 'false',
  });

  let base = (q.get('name') || 'image').replace(/\.[^.]*$/, '').replace(/[^\w.\- ]+/g, '_');
  if (!base) base = 'image';
  const filename = base + FORMATS[format].ext;

  res.writeHead(200, {
    'Content-Type': FORMATS[format].mime,
    'Content-Length': result.data.length,
    'Content-Disposition': 'attachment; filename="' + filename + '"',
    'X-Image-Width': String(result.width),
    'X-Image-Height': String(result.height),
    'X-Image-Pages': String(result.pages),
    'X-Source-Format': String(result.sourceFormat || ''),
    'X-Output-Name': filename,
  });
  res.end(result.data);
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://' + (req.headers.host || 'localhost'));

  if (url.pathname === '/api/convert') {
    if (req.method !== 'POST') {
      sendJson(res, 405, { error: 'Use POST' });
      return;
    }

    handleConvert(req, res, url).catch((err) => {
      if (res.headersSent) {
        res.end();
        return;
      }
      sendJson(res, err.status || 422, { error: err.message });
    });
    return;
  }

  if (url.pathname === '/api/formats') {
    sendJson(res, 200, { formats: Object.keys(FORMATS), maxUploadBytes: MAX_UPLOAD });
    return;
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    sendJson(res, 405, { error: 'Method not allowed' });
    return;
  }

  serveStatic(req, res, url.pathname);
});

const opts = parseArgs(process.argv.slice(2));

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error('Error: port ' + opts.port + ' is already taken. Try: node server.js --port ' + (opts.port + 1));
  } else {
    console.error('Server error: ' + err.message);
  }
  process.exit(1);
});

server.listen(opts.port, opts.host, () => {
  const shown = opts.host === '0.0.0.0' ? 'localhost' : opts.host;
  console.log('Image converter running at http://' + shown + ':' + opts.port);
  console.log('Press Ctrl+C to stop.');
});
