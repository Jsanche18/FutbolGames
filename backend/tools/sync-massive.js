const http = require('http');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
if (!process.env.API_FOOTBALL_KEY) {
  console.error('API_FOOTBALL_KEY no definido en .env');
  process.exit(1);
}

const season = 2024;
const countries = [
  { name: 'Spain', code: 'ES', leagues: ['la liga', 'laliga', 'primera'] },
  { name: 'France', code: 'FR', leagues: ['ligue 1'] },
  { name: 'Germany', code: 'DE', leagues: ['bundesliga'] },
  { name: 'Italy', code: 'IT', leagues: ['serie a'] },
  { name: 'England', code: 'GB', leagues: ['premier league'] },
  { name: 'Brazil', code: 'BR', leagues: ['serie a'] },
  { name: 'Argentina', code: 'AR', leagues: ['liga profesional', 'primera'] },
  { name: 'Mexico', code: 'MX', leagues: ['liga mx'] },
  { name: 'United States', code: 'US', leagues: ['major league', 'mls'] },
  { name: 'Saudi Arabia', code: 'SA', leagues: ['pro league'] },
];

function httpGet(path) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: 'localhost',
        port: 4000,
        path,
        method: 'GET',
      },
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

async function fetchAllLeagues() {
  const res = await httpGet(`/leagues?season=${season}`);
  if (res.status !== 200) {
    console.log(`Fallo leagues season ${season}:`, res.status);
    return [];
  }
  return res.body?.response || [];
}

function filterLeaguesByCountry(allLeagues, country) {
  return allLeagues.filter((item) => {
    const code = item.country?.code || '';
    const name = item.country?.name || '';
    if (!(code === country.code || name.toLowerCase() === country.name.toLowerCase())) {
      return false;
    }
    const leagueName = (item.league?.name || '').toLowerCase();
    return country.leagues.some((needle) => leagueName.includes(needle));
  });
}

async function enqueueTeams(leagueIds) {
  for (const id of leagueIds) {
    await httpPost(`/sync/teams?leagueApiId=${id}&season=${season}`);
  }
}

async function fetchTeamsForLeague(leagueId) {
  const res = await httpGet(`/teams?leagueApiId=${leagueId}&season=${season}`);
  if (res.status !== 200) {
    console.log(`Fallo teams league ${leagueId}:`, res.status);
    return [];
  }
  const response = res.body?.response || [];
  return response.map((item) => item.team?.id).filter(Boolean);
}

async function enqueuePlayersForTeams(teamIds) {
  console.log(`Encolando jugadores para ${teamIds.length} equipos...`);
  for (const teamId of teamIds) {
    await httpPost(`/sync/players?teamApiId=${teamId}&season=${season}`);
  }
}

async function run() {
  const allLeagues = await fetchAllLeagues();
  if (allLeagues.length === 0) {
    console.log('No hay ligas. Revisa API_FOOTBALL_KEY y el backend.');
    return;
  }
  const allLeagueIds = new Set();
  for (const country of countries) {
    console.log(`Cargando ligas ${country.name} (${country.code})...`);
    const filtered = filterLeaguesByCountry(allLeagues, country);
    filtered.forEach((item) => {
      const id = item.league?.id;
      if (id) allLeagueIds.add(id);
    });
    if (filtered.length > 0) {
      console.log(
        `Seleccionadas ${filtered.length} ligas: ${filtered.map((l) => l.league?.name).join(', ')}`,
      );
    }
  }

  const leagueIds = Array.from(allLeagueIds);
  console.log(`Total ligas encontradas: ${leagueIds.length}`);
  if (leagueIds.length === 0) {
    console.log('No hay ligas en esos países. Revisa filtros.');
    return;
  }
  await enqueueTeams(leagueIds);
  const teamSet = new Set();
  for (const leagueId of leagueIds) {
    const teams = await fetchTeamsForLeague(leagueId);
    teams.forEach((id) => teamSet.add(id));
  }
  await enqueuePlayersForTeams(Array.from(teamSet));
  console.log('Encolado masivo terminado. Se procesará en segundo plano.');
}

run()
  .catch((err) => {
    console.error(err.message);
  });
