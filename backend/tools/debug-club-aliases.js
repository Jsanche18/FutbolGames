const path = require('path');
const dotenv = require('dotenv');
const axios = require('axios');

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const tests = [
  ['PSG', 'Paris Saint Germain', 'Paris SG', 'Paris'],
  ['Al-Nassr', 'Al Nassr', 'Nassr'],
  ['Al-Ittihad', 'Al Ittihad', 'Ittihad'],
  ['Al-Hilal', 'Al Hilal', 'Hilal'],
  ['LA Galaxy', 'Los Angeles Galaxy', 'Galaxy', 'LA'],
];

async function run() {
  const client = axios.create({
    baseURL: process.env.API_FOOTBALL_BASE_URL,
    timeout: 15000,
    headers: { 'x-apisports-key': process.env.API_FOOTBALL_KEY },
  });

  for (const aliasSet of tests) {
    console.log(`\n===== ${aliasSet[0]} =====`);
    for (const term of aliasSet) {
      try {
        const { data } = await client.get('/teams', { params: { search: term } });
        const response = data?.response || [];
        const top = response.slice(0, 5).map((entry) => ({
          id: entry?.team?.id,
          name: entry?.team?.name,
          country: entry?.team?.country,
        }));
        console.log(term, '->', response.length, JSON.stringify(top));
      } catch (error) {
        console.log(term, '-> error', error?.response?.status || error?.code || error?.message);
      }
    }
  }
}

run().catch((e) => {
  console.error(e?.message || e);
  process.exit(1);
});
