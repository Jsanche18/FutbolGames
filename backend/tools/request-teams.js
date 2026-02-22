const http = require('http');

const url = '/teams?leagueApiId=140&season=2024';

http.get(`http://localhost:4000${url}`, (res) => {
  let body = '';
  res.on('data', (chunk) => (body += chunk));
  res.on('end', () => {
    console.log('STATUS', res.statusCode);
    console.log(body.slice(0, 1000));
  });
}).on('error', (err) => {
  console.error('ERROR', err.message);
});
