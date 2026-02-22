const http = require('http');

function post(path) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: 'localhost',
        port: 4000,
        path,
        method: 'POST',
      },
      (res) => {
        let body = '';
        res.on('data', (chunk) => (body += chunk));
        res.on('end', () => {
          resolve({ status: res.statusCode, body });
        });
      },
    );
    req.on('error', reject);
    req.end();
  });
}

async function run() {
  const season = 2024;
  console.log('Encolando ligas...');
  console.log(await post(`/sync/leagues?season=${season}`));

  console.log('Encolando equipos LaLiga (140)...');
  console.log(await post(`/sync/teams?leagueApiId=140&season=${season}`));

  console.log('Encolando jugadores Barcelona (529)...');
  console.log(await post(`/sync/players?teamApiId=529&season=${season}`));

  console.log('Listo. Espera 1-2 minutos y prueba Hangman/Sort.');
}

run().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
