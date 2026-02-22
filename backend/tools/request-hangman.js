const http = require('http');

const data = JSON.stringify({});

const req = http.request(
  {
    hostname: 'localhost',
    port: 4000,
    path: '/games/hangman/start',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(data),
    },
  },
  (res) => {
    let body = '';
    res.on('data', (chunk) => (body += chunk));
    res.on('end', () => {
      console.log('STATUS', res.statusCode);
      console.log(body);
    });
  },
);

req.on('error', (err) => {
  console.error('ERROR', err.message);
});

req.write(data);
req.end();
