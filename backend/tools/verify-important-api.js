const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
const axios = require('axios');

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const hasKey = Boolean(process.env.API_FOOTBALL_KEY);
const hasBase = Boolean(process.env.API_FOOTBALL_BASE_URL);

if (!hasKey || !hasBase) {
  console.log(JSON.stringify({ ok: false, error: 'Missing API_FOOTBALL_KEY or API_FOOTBALL_BASE_URL' }, null, 2));
  process.exit(1);
}

const catalogPath = path.join(__dirname, '..', 'src', 'common', 'important-players.catalog.ts');
const source = fs.readFileSync(catalogPath, 'utf8');
const matches = [...source.matchAll(/\{ name: '([^']+)', club: '([^']+)', marketValueM: ([0-9.]+) \}/g)];
const seeds = matches.map((m) => ({ name: m[1], club: m[2], marketValueM: Number(m[3]) }));

function normalize(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\./g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function scoreCandidate(candidate, seed) {
  const p = candidate?.player || {};
  const s = candidate?.statistics?.[0] || {};
  const playerName = normalize([p.firstname, p.lastname].filter(Boolean).join(' ') || p.name);
  const teamName = normalize(s?.team?.name || '');
  const seedName = normalize(seed.name);
  const seedClub = normalize(seed.club);
  const seedTokens = seedName.split(' ').filter(Boolean);
  const seedLast = seedTokens[seedTokens.length - 1] || seedName;
  const playerTokens = playerName.split(' ').filter(Boolean);
  const playerLast = playerTokens[playerTokens.length - 1] || playerName;
  let score = 0;
  if (playerName === seedName) score += 4;
  if (playerName.includes(seedName) || seedName.includes(playerName)) score += 2;
  if (seedLast && playerLast === seedLast) score += 2;
  if (seedTokens.length === 1 && playerName.includes(seedTokens[0])) score += 2;
  if (teamName === seedClub) score += 3;
  if (teamName.includes(seedClub) || seedClub.includes(teamName)) score += 1;
  return score;
}

function scoreTeam(teamName, club) {
  const t = normalize(teamName);
  const c = normalize(club);
  let score = 0;
  if (t === c) score += 4;
  else if (t.includes(c) || c.includes(t)) score += 2;
  if (t.includes(' women') || t.endsWith(' w')) score -= 5;
  const youth = ['u17', 'u18', 'u19', 'u20', 'u21', 'u23', ' ii', ' iii', ' b'];
  if (youth.some((token) => t.includes(token))) score -= 4;
  return score;
}

function getClubResolutionConfig(club) {
  const key = normalize(club);
  const map = {
    'fc barcelona': { terms: ['Barcelona', 'FC Barcelona'], country: 'Spain' },
    'real madrid': { terms: ['Real Madrid'], country: 'Spain' },
    'athletic club': { terms: ['Athletic Club', 'Ath Bilbao'], country: 'Spain' },
    'real sociedad': { terms: ['Real Sociedad'], country: 'Spain' },
    'bayern munich': { terms: ['Bayern Munich', 'Bayern'], country: 'Germany' },
    'borussia dortmund': { terms: ['Borussia Dortmund', 'Dortmund'], country: 'Germany' },
    'bayer leverkusen': { terms: ['Bayer Leverkusen', 'Leverkusen'], country: 'Germany' },
    inter: { terms: ['Inter', 'Inter Milan'], country: 'Italy' },
    'ac milan': { terms: ['AC Milan', 'Milan'], country: 'Italy' },
    juventus: { terms: ['Juventus'], country: 'Italy' },
    napoli: { terms: ['Napoli'], country: 'Italy' },
    roma: { terms: ['Roma'], country: 'Italy' },
    bologna: { terms: ['Bologna'], country: 'Italy' },
    psg: { terms: ['Paris Saint Germain', 'PSG', 'Paris'], country: 'France' },
    marseille: { terms: ['Marseille'], country: 'France' },
    lille: { terms: ['Lille'], country: 'France' },
    lyon: { terms: ['Lyon'], country: 'France' },
    'sporting cp': { terms: ['Sporting CP', 'Sporting'], country: 'Portugal' },
    'fc porto': { terms: ['FC Porto', 'Porto'], country: 'Portugal' },
    benfica: { terms: ['Benfica'], country: 'Portugal' },
    'al-nassr': { terms: ['Nassr', 'Al Nassr', 'Al-Nassr'], country: 'Saudi-Arabia' },
    'al-ittihad': { terms: ['Ittihad', 'Al Ittihad', 'Al-Ittihad'], country: 'Saudi-Arabia' },
    'al-hilal': { terms: ['Hilal', 'Al Hilal', 'Al-Hilal'], country: 'Saudi-Arabia' },
    'inter miami': { terms: ['Inter Miami', 'Inter Miami CF'], country: 'USA' },
    'la galaxy': { terms: ['Los Angeles Galaxy', 'LA Galaxy', 'Galaxy'], country: 'USA' },
    'toronto fc': { terms: ['Toronto FC', 'Toronto'], country: 'Canada' },
  };
  return map[key] || { terms: [club] };
}

async function run() {
  const baseURL = process.env.API_FOOTBALL_BASE_URL;
  const client = axios.create({
    baseURL,
    timeout: 15000,
    headers: { 'x-apisports-key': process.env.API_FOOTBALL_KEY },
  });

  const season = Number(process.env.DEFAULT_SEASON || 2025);
  const rows = [];
  for (const seed of seeds) {
    try {
      const config = getClubResolutionConfig(seed.club);
      const teams = [];
      for (const term of config.terms) {
        const teamsData = await client.get('/teams', { params: { search: term } });
        teams.push(...(teamsData?.data?.response || []));
      }
      const selectedTeam = teams
        .map((entry) => ({
          id: entry?.team?.id,
          name: entry?.team?.name || '',
          country: entry?.team?.country || entry?.country?.name || '',
        }))
        .filter((team) => team.id)
        .sort((a, b) => {
          const expectedCountry = normalize(config.country || '');
          const aCountry = normalize(a.country || '');
          const bCountry = normalize(b.country || '');
          const aCountryScore = expectedCountry && aCountry === expectedCountry ? 2 : 0;
          const bCountryScore = expectedCountry && bCountry === expectedCountry ? 2 : 0;
          return bCountryScore - aCountryScore || scoreTeam(b.name, seed.club) - scoreTeam(a.name, seed.club);
        })[0];
      if (!selectedTeam?.id) {
        rows.push({
          name: seed.name,
          club: seed.club,
          marketValueM: seed.marketValueM,
          found: false,
          score: -1,
          apiId: null,
          resolvedName: null,
          resolvedTeam: null,
          photoUrl: null,
          error: 'team_not_found',
        });
        continue;
      }

      let response = [];
      let page = 1;
      let totalPages = 1;
      while (page <= totalPages) {
        const { data } = await client.get('/players', { params: { team: selectedTeam.id, season, page } });
        response.push(...(data?.response || []));
        totalPages = Number(data?.paging?.total || 1);
        page += 1;
      }
      if (response.length === 0) {
        const squadData = await client.get('/players/squads', { params: { team: selectedTeam.id } });
        const squadPlayers = squadData?.data?.response?.[0]?.players || [];
        response = squadPlayers.map((player) => ({
          player: { id: player?.id, name: player?.name, firstname: undefined, lastname: undefined, photo: player?.photo },
          statistics: [{ team: { id: selectedTeam.id, name: selectedTeam.name } }],
        }));
      }
      let best = null;
      let bestScore = -1;
      for (const candidate of response) {
        const s = scoreCandidate(candidate, seed);
        if (s > bestScore) {
          best = candidate;
          bestScore = s;
        }
      }
      const found = bestScore >= 1;
      rows.push({
        name: seed.name,
        club: seed.club,
        marketValueM: seed.marketValueM,
        found,
        score: bestScore,
        apiId: found ? best?.player?.id : null,
        resolvedName: found ? ([best?.player?.firstname, best?.player?.lastname].filter(Boolean).join(' ') || best?.player?.name) : null,
        resolvedTeam: found ? best?.statistics?.[0]?.team?.name || selectedTeam.name || null : selectedTeam.name || null,
        photoUrl: found ? best?.player?.photo || null : null,
      });
    } catch (error) {
      rows.push({
        name: seed.name,
        club: seed.club,
        marketValueM: seed.marketValueM,
        found: false,
        score: -1,
        apiId: null,
        resolvedName: null,
        resolvedTeam: null,
        photoUrl: null,
        error:
          error?.response?.status ||
          error?.code ||
          error?.message ||
          (typeof error?.toString === 'function' ? error.toString() : 'request failed'),
      });
    }
  }

  const foundCount = rows.filter((r) => r.found).length;
  const missing = rows.filter((r) => !r.found);
  const report = {
    ok: true,
    baseURL,
    total: rows.length,
    found: foundCount,
    missing: missing.length,
    missingPlayers: missing.map((m) => ({ name: m.name, club: m.club, reason: m.error || 'no strong match' })),
    rows,
  };
  console.log(JSON.stringify(report, null, 2));
}

run().catch((error) => {
  console.error(JSON.stringify({ ok: false, error: error?.message || String(error) }, null, 2));
  process.exit(1);
});
