const https = require('https');

const req = https.get('https://github.com', (res) => {
  console.log('STATUS', res.statusCode);
  res.resume();
});

req.on('error', (err) => {
  console.error('ERROR', err.message);
});
