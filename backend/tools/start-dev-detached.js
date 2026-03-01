const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const projectRoot = path.join(__dirname, '..');
const logPath = path.join(projectRoot, 'backend-dev.log');
const out = fs.openSync(logPath, 'a');

let command = 'npm';
let args = ['run', 'start:dev'];
if (process.platform === 'win32') {
  command = 'npm.cmd';
}

const child = spawn(command, args, {
  cwd: projectRoot,
  detached: true,
  shell: false,
  stdio: ['ignore', out, out],
  windowsHide: true,
});

child.unref();
console.log(JSON.stringify({ ok: true, pid: child.pid, logPath }, null, 2));
