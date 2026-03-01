const http = require('http');

const base = {
  host: 'localhost',
  port: 4000,
};

function request(method, path, body) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const req = http.request(
      {
        hostname: base.host,
        port: base.port,
        path,
        method,
        headers: payload
          ? {
              'Content-Type': 'application/json',
              'Content-Length': Buffer.byteLength(payload),
            }
          : undefined,
      },
      (res) => {
        let raw = '';
        res.on('data', (chunk) => (raw += chunk));
        res.on('end', () => {
          let data = raw;
          try {
            data = JSON.parse(raw);
          } catch {}
          resolve({ status: res.statusCode, data });
        });
      },
    );
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function run() {
  const checks = [
    ['GET', '/health/deps'],
    ['GET', '/sync/coverage'],
    ['GET', '/players/search?q=mbappe&season=2025&importantOnly=true'],
    ['GET', '/players/search?season=2025&importantOnly=true'],
    ['POST', '/games/sort/start', { stat: 'goals', count: 5, pool: 'important' }],
    ['POST', '/games/hangman/start', { pool: 'important' }],
    ['POST', '/games/market/start', { pool: 'important' }],
  ];

  let failed = 0;
  for (const [method, path, body] of checks) {
    try {
      const res = await request(method, path, body);
      const ok = Number(res.status) >= 200 && Number(res.status) < 300;
      if (!ok) failed += 1;
      console.log(
        JSON.stringify(
          {
            method,
            path,
            status: res.status,
            ok,
            preview:
              typeof res.data === 'string'
                ? res.data.slice(0, 160)
                : JSON.stringify(res.data).slice(0, 160),
          },
          null,
          2,
        ),
      );
    } catch (error) {
      failed += 1;
      console.log(
        JSON.stringify(
          {
            method,
            path,
            ok: false,
            error: error?.code || error?.message || String(error),
          },
          null,
          2,
        ),
      );
    }
  }

  if (failed > 0) {
    process.exit(1);
  }
}

run();
