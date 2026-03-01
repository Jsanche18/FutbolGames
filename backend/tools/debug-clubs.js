const path = require('path');
const dotenv = require('dotenv');
const axios = require('axios');

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const clubs = [
  'Liverpool',
  'Manchester City',
  'Real Madrid',
  'FC Barcelona',
  'Bayer Leverkusen',
  'Inter',
  'Napoli',
  'Roma',
  'PSG',
  'Marseille',
  'Al-Nassr',
  'Al-Ittihad',
  'Al-Hilal',
  'Inter Miami',
  'LA Galaxy',
];

async function run() {
  const client = axios.create({
    baseURL: process.env.API_FOOTBALL_BASE_URL,
    timeout: 15000,
    headers: { 'x-apisports-key': process.env.API_FOOTBALL_KEY },
  });

  for (const club of clubs) {
    const { data } = await client.get('/teams', { params: { search: club } });
    const response = data?.response || [];
    console.log(`\n=== ${club} (${response.length}) ===`);
    response.slice(0, 12).forEach((entry) => {
      const t = entry?.team || {};
      const l = entry?.league || {};
      console.log(
        `${t.id}\t${t.name}\t${t.country || '-'}\tleague=${l.id || '-'} ${l.name || ''}`,
      );
    });
  }
}

run().catch((e) => {
  console.error(e?.message || e);
  process.exit(1);
});
