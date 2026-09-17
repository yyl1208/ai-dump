// 本地调试壳服务器：node tools/serve.js [端口]
// 只用于 web 调试，发布产物在 dist/wx。加了 no-store，改完源码刷新即生效。
const http = require('http');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const PORT = Number(process.argv[2] || 8123);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

const server = http.createServer(function (req, res) {
  let rel = decodeURIComponent(req.url.split('?')[0]);
  if (rel === '/' || rel === '') rel = '/index.html';
  // 防目录穿越：解析后必须仍在项目根内
  const full = path.resolve(root, '.' + rel);
  if (full !== root && full.indexOf(root + path.sep) !== 0) {
    res.writeHead(403); res.end('forbidden'); return;
  }
  fs.readFile(full, function (err, buf) {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('404 ' + rel);
      return;
    }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(full).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-store, no-cache, must-revalidate'
    });
    res.end(buf);
  });
});

server.listen(PORT, '127.0.0.1', function () {
  console.log('调试壳已启动: http://127.0.0.1:' + PORT + '/');
  console.log('根目录: ' + root);
});

server.on('error', function (e) {
  console.error('启动失败:', e.message);
  process.exit(1);
});
