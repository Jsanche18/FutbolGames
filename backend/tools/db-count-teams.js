const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { PrismaClient } = require('@prisma/client');

if (process.env.DIRECT_URL) {
  process.env.DATABASE_URL = process.env.DIRECT_URL;
}

const prisma = new PrismaClient();

async function run() {
  const count = await prisma.team.count();
  console.log('TEAM_COUNT', count);
}

run()
  .catch((err) => {
    console.error('ERROR', err.message);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
