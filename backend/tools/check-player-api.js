const path = require('path');
const dotenv = require('dotenv');
const axios = require('axios');

dotenv.config({ path: path.join(__dirname, '..', '.env') });

async function run() {
  const client = axios.create({
    baseURL: process.env.API_FOOTBALL_BASE_URL,
    headers: { 'x-apisports-key': process.env.API_FOOTBALL_KEY },
    timeout: 15000,
  });

  const tests = [
    { search: 'Erling Haaland', season: 2025, page: 1 },
    { search: 'Erling Haaland', season: 2024, page: 1 },
    { search: 'Erling Haaland', page: 1 },
  ];

  for (const params of tests) {
    try {
      const { data } = await client.get('/players', { params });
      const count = Array.isArray(data?.response) ? data.response.length : 0;
      const first = data?.response?.[0];
      console.log('params:', JSON.stringify(params), 'results:', count);
      console.log(
        'first:',
        first
          ? JSON.stringify(
              {
                id: first?.player?.id,
                name: first?.player?.name,
                team: first?.statistics?.[0]?.team?.name,
                league: first?.statistics?.[0]?.league?.name,
                season: first?.statistics?.[0]?.league?.season,
              },
              null,
              2,
            )
          : '-',
      );
    } catch (error) {
      console.log('params:', JSON.stringify(params), 'error:', error?.response?.status || error?.code || error?.message);
      if (error?.response?.data) {
        console.log('body:', JSON.stringify(error.response.data));
      }
    }
  }

  const teamTests = ['Manchester City', 'Arsenal', 'Real Madrid', 'Barcelona', 'PSG', 'Inter Miami'];
  const resolvedTeamIds = [];
  for (const teamSearch of teamTests) {
    try {
      const { data } = await client.get('/teams', { params: { search: teamSearch } });
      const response = data?.response || [];
      console.log('team search:', teamSearch, 'results:', response.length);
      const first = response[0];
      if (first?.team?.id) resolvedTeamIds.push({ q: teamSearch, id: first.team.id, name: first.team.name });
      console.log(
        'team first:',
        first
          ? JSON.stringify(
              {
                id: first?.team?.id,
                name: first?.team?.name,
                country: first?.team?.country,
                league: first?.league?.name,
              },
              null,
              2,
            )
          : '-',
      );
    } catch (error) {
      console.log('team search:', teamSearch, 'error:', error?.response?.status || error?.code || error?.message);
    }
  }

  for (const team of resolvedTeamIds) {
    try {
      const { data } = await client.get('/players/squads', { params: { team: team.id } });
      const response = data?.response || [];
      const players = response?.[0]?.players || [];
      console.log('squad team:', team.q, `(${team.id})`, 'players:', players.length);
      if (players[0]) {
        console.log(
          'squad first:',
          JSON.stringify(
            { id: players[0].id, name: players[0].name, photo: players[0].photo },
            null,
            2,
          ),
        );
      }
    } catch (error) {
      console.log('squad team:', team.q, 'error:', error?.response?.status || error?.code || error?.message);
    }
  }
}

run().catch((e) => {
  console.error(e?.message || e);
  process.exit(1);
});
