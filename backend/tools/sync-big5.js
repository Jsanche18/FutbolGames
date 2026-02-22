const http = require('http');
const { PrismaClient } = require('@prisma/client');

if (process.env.DIRECT_URL) {
  process.env.DATABASE_URL = process.env.DIRECT_URL;
}
const prisma = new PrismaClient();

const leagues = [
  { name: 'LaLiga', apiId: 140 },
  { name: 'Premier League', apiId: 39 },
  { name: 'Bundesliga', apiId: 78 },
  { name: 'Serie A', apiId: 135 },
  { name: 'Ligue 1', apiId: 61 },
];

const season = 2024;

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
        res.on('end', () => resolve({ status: res.statusCode, body }));
      },
    );
    req.on('error', reject);
    req.end();
  });
}

async function enqueueTeams() {
  for (const league of leagues) {
    console.log(`Encolando equipos ${league.name} (${league.apiId})...`);
    console.log(await post(`/sync/teams?leagueApiId=${league.apiId}&season=${season}`));
  }
}

async function waitForTeams() {
  const targetIds = leagues.map((l) => l.apiId);
  let attempts = 0;
  while (attempts < 15) {
    const count = await prisma.team.count({
      where: { leagueApiId: { in: targetIds } },
    });
    if (count > 0) {
      console.log(`Equipos disponibles: ${count}`);
      return true;
    }
    attempts += 1;
    console.log('Esperando equipos en DB...');
    await new Promise((r) => setTimeout(r, 20000));
  }
  return false;
}

async function enqueuePlayers() {
  const targetIds = leagues.map((l) => l.apiId);
  const teams = await prisma.team.findMany({
    where: { leagueApiId: { in: targetIds } },
    select: { apiId: true, name: true, leagueApiId: true },
  });
  console.log(`Encolando jugadores para ${teams.length} equipos...`);
  for (const team of teams) {
    await post(`/sync/players?teamApiId=${team.apiId}&season=${season}`);
  }
  console.log('Listo. Espera a que termine el procesamiento.');
}

async function run() {
  await enqueueTeams();
  const hasTeams = await waitForTeams();
  if (!hasTeams) {
    console.log('No se detectaron equipos aún. Reintenta en 2-3 minutos.');
    return;
  }
  await enqueuePlayers();
}

run()
  .catch((err) => {
    console.error(err.message);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
