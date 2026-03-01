const fs = require('fs');
const path = require('path');

const target = process.argv[2];
if (!target) {
  console.error('usage: node read-file.js <path>');
  process.exit(1);
}

const resolved = path.resolve(process.cwd(), target);
try {
  const content = fs.readFileSync(resolved, 'utf8');
  process.stdout.write(content);
} catch (error) {
  console.error(error && (error.message || error.code || String(error)));
  process.exit(1);
}
