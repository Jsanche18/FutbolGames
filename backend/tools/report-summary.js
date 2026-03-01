const fs = require('fs');
const path = require('path');

const reportPath = path.join(__dirname, 'important-api-report.json');
const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));

console.log('baseURL:', report.baseURL);
console.log('total:', report.total);
console.log('found:', report.found);
console.log('missing:', report.missing);

const first = (report.rows || []).slice(0, 5);
for (const row of first) {
  console.log(
    `${row.name} | found=${row.found} | score=${row.score} | team=${row.resolvedTeam || '-'} | error=${row.error || '-'}`,
  );
}

const missing = (report.rows || []).filter((row) => !row.found);
console.log('--- missing players ---');
for (const row of missing) {
  console.log(`${row.name} | club=${row.club} | error=${row.error || '-'} | teamResolved=${row.resolvedTeam || '-'}`);
}
