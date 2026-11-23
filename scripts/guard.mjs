// Runs a command, the unit tests' node --test, and kills it and every process under it once one of them holds more
// memory than TEST_MEMORY_MB (default 2048) or the whole has run longer than TEST_TIME_S (default 300 seconds).
// node --test runs each test file in a child process, which neither its own --max-old-space-size nor NODE_OPTIONS
// bounds where the memory grows outside the V8 heap, and a loop that never yields outlasts --test-timeout: watched from
// here, either fails the run in seconds instead of taking the machine's memory.
//
//   node scripts/guard.mjs node --test …
import { execFileSync, spawn } from 'node:child_process';

const [command, ...args] = process.argv.slice(2);
if (!command) {
  console.error('usage: node scripts/guard.mjs <command> [args…]');
  process.exit(2);
}
const limitMB = Number(process.env.TEST_MEMORY_MB ?? 2048);
const limitSeconds = Number(process.env.TEST_TIME_S ?? 300);
const watched = process.platform !== 'win32';

// Its own process group, so that it and everything it starts are killed together.
const child = spawn(command, args, { stdio: 'inherit', detached: watched });

function killAll() {
  try {
    if (watched) process.kill(-child.pid, 'SIGKILL');
    else child.kill('SIGKILL');
  } catch {
    // Gone already.
  }
}

/** The resident memory of each process under the child, the child too, in kilobytes. */
function residentTree() {
  const rows = execFileSync('ps', ['-A', '-o', 'pid=,ppid=,rss='], { encoding: 'utf8' })
    .trim()
    .split('\n')
    .map(line => line.trim().split(/\s+/).map(Number));
  const under = new Set([child.pid]);
  for (let grown = true; grown;) {
    grown = false;
    for (const [pid, ppid] of rows)
      if (under.has(ppid) && !under.has(pid)) {
        under.add(pid);
        grown = true;
      }
  }
  return rows.filter(([pid]) => under.has(pid)).map(([pid, , rss]) => ({ pid, rss }));
}

let stopped = '';
const started = Date.now();
const timer = setInterval(() => {
  if ((Date.now() - started) / 1000 > limitSeconds) {
    stopped = `ran past ${limitSeconds} s (TEST_TIME_S)`;
  } else if (watched) {
    let tree;
    try {
      tree = residentTree();
    } catch {
      return;
    }
    const over = tree.find(({ rss }) => rss / 1024 > limitMB);
    if (over)
      stopped = `process ${over.pid} held ${Math.round(over.rss / 1024)} MB, past ${limitMB} MB (TEST_MEMORY_MB)`;
  }
  if (!stopped) return;
  clearInterval(timer);
  console.error(`\nguard: ${stopped}; killed it and every process under it.`);
  killAll();
}, 250);

for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP'])
  process.on(signal, () => {
    killAll();
    process.exit(1);
  });

child.on('exit', (code, signal) => {
  clearInterval(timer);
  // A test file's process the guard killed leaves its group behind it otherwise.
  killAll();
  process.exit(stopped || signal ? 1 : (code ?? 1));
});
