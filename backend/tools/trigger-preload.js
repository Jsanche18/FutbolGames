const http = require('http');

const season = Number(process.argv[2] || 2025);

const req = http.request(
  {
    hostname: 'localhost',
    port: 4000,
    path: `/sync/preload?season=${season}`,
    method: 'POST',
  },
  (res) => {
    let body = '';
    res.on('data', (chunk) => (body += chunk));
    res.on('end', () => {
      console.log('STATUS', res.statusCode);
      console.log(body || '(empty)');
    });
  },
);

req.on('error', (error) => {
  console.error('ERROR', error && (error.message || error.code || error.name || String(error)));
  process.exit(1);
});

req.end();
