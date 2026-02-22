const fs = require('fs');
const path = require('path');

function loadEnv() {
  const envPath = path.join(__dirname, '..', '.env');
  const raw = fs.readFileSync(envPath, 'utf8');
  const env = {};
  for (const line of raw.split(/\r?\n/)) {
    if (!line || line.trim().startsWith('#')) continue;
    const idx = line.indexOf('=');
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    env[key] = value;
  }
  return env;
}

function safeReportDatabaseUrl(dbUrl) {
  try {
    const url = new URL(dbUrl);
    const hasSsl = url.searchParams.has('sslmode');
    const schema = url.searchParams.get('schema');
    console.log(`HOST=${url.hostname}`);
    console.log(`PORT=${url.port || '5432'}`);
    console.log(`HAS_SSLMODE=${hasSsl}`);
    console.log(`SCHEMA=${schema || '(none)'}`);
  } catch (e) {
    console.error('DATABASE_URL inválida');
    process.exit(1);
  }
}

const env = loadEnv();
if (!env.DATABASE_URL) {
  console.error('DATABASE_URL no encontrado en .env');
  process.exit(1);
}
safeReportDatabaseUrl(env.DATABASE_URL);
