const fs = require('fs');
const net = require('net');

function loadEnv() {
  const path = require('path').join(__dirname, '..', '.env');
  const raw = fs.readFileSync(path, 'utf8');
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

function parseHostPort(databaseUrl) {
  try {
    const url = new URL(databaseUrl);
    return { host: url.hostname, port: Number(url.port || 5432) };
  } catch (err) {
    return null;
  }
}

const env = loadEnv();
const dbUrl = env.DATABASE_URL;
if (!dbUrl) {
  console.error('DATABASE_URL no encontrado en .env');
  process.exit(1);
}
const target = parseHostPort(dbUrl);
if (!target) {
  console.error('DATABASE_URL inválida');
  process.exit(1);
}

const socket = net.connect({ host: target.host, port: target.port, timeout: 5000 });
socket.on('connect', () => {
  console.log(`OK: TCP conectado a ${target.host}:${target.port}`);
  socket.end();
});
socket.on('timeout', () => {
  console.error(`TIMEOUT: No responde ${target.host}:${target.port}`);
  socket.destroy();
  process.exit(1);
});
socket.on('error', (err) => {
  console.error(`ERROR: ${err.message}`);
  process.exit(1);
});
