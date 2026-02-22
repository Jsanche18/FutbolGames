const http = require('http');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const season = 2024;
const throttleMs = 7000;

const targets = [
  { name: 'Spain', code: 'ES', leagueNames: ['La Liga', 'LaLiga'] },
  { name: 'England', code: 'GB', leagueNames: ['Premier League'] },
  { name: 'Germany', code: 'DE', leagueNames: ['Bundesliga'] },
  { name: 'Italy', code: 'IT', leagueNames: ['Serie A'] },
  { name: 'France', code: 'FR', leagueNames: ['Ligue 1'] },
  { name: 'Brazil', code: 'BR', leagueNames: ['Serie A'] },
  { name: 'Argentina', code: 'AR', leagueNames: ['Liga Profesional Argentina', 'Primera Division'] },
  { name: 'Mexico', code: 'MX', leagueNames: ['Liga MX'] },
  { name: 'United States', code: 'US', leagueNames: ['Major League Soccer', 'MLS'] },
  { name: 'Saudi Arabia', code: 'SA', leagueNames: ['Pro League'] },
];

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function httpGet(path) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { hostname: 'localhost', port: 4000, path, method: 'GET' },
      (res) => {
        let body = '';
        res.on('data', (chunk) => (body += chunk));
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, body: JSON.parse(body) });
          } catch {
            resolve({ status: res.statusCode, body });
          }
        });
      },
    );
    req.on('error', reject);
    req.end();
  });
}

function httpPost(path) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { hostname: 'localhost', port: 4000, path, method: 'POST' },
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

async function getAllLeagues() {
  const res = await httpGet(`/leagues?season=${season}`);
  if (res.status !== 200) {
    throw new Error(`Error /leagues: ${res.status}`);
  }
  return res.body?.response || [];
}

function pickLeague(leagues, target) {
  const byCountry = leagues.filter((l) => {
    const code = l.country?.code || '';
    const name = (l.country?.name || '').toLowerCase();
    return code === target.code || name === target.name.toLowerCase();
  });
  for (const name of target.leagueNames) {
    const found = byCountry.find((l) => (l.league?.name || '').toLowerCase() === name.toLowerCase());
    if (found) return found;
  }
  for (const name of target.leagueNames) {
    const found = byCountry.find((l) => (l.league?.name || '').toLowerCase().includes(name.toLowerCase()));
    if (found) return found;
  }
  return null;
}

async function fetchTeams(leagueId) {
  const res = await httpGet(`/teams?leagueApiId=${leagueId}&season=${season}`);
  if (res.status !== 200) {
    console.log(`Error /teams league ${leagueId}: ${res.status}`);
    return [];
  }
  const response = res.body?.response || [];
  return response.map((item) => item.team?.id).filter(Boolean);
}

async function run() {
  console.log('Cargando ligas...');
  const leagues = await getAllLeagues();
  const selected = [];

  for (const target of targets) {
    const league = pickLeague(leagues, target);
    if (league) {
      selected.push({ country: target.name, leagueId: league.league.id, leagueName: league.league.name });
    } else {
      console.log(`No se encontró liga para ${target.name}`);
    }
  }

  console.log('Ligas seleccionadas:');
  selected.forEach((l) => console.log(`- ${l.country}: ${l.leagueName} (${l.leagueId})`));

  for (const league of selected) {
    console.log(`Encolando equipos ${league.leagueName}...`);
    await httpPost(`/sync/teams?leagueApiId=${league.leagueId}&season=${season}`);
    await sleep(throttleMs);
  }

  const allTeams = new Set();
  for (const league of selected) {
    console.log(`Leyendo equipos ${league.leagueName}...`);
    const teamIds = await fetchTeams(league.leagueId);
    teamIds.forEach((id) => allTeams.add(id));
    await sleep(throttleMs);
  }

  console.log(`Encolando jugadores para ${allTeams.size} equipos...`);
  for (const teamId of allTeams) {
    await httpPost(`/sync/players?teamApiId=${teamId}&season=${season}`);
    await sleep(throttleMs);
  }

  console.log('Sincronización top leagues completada.');
}

run().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
