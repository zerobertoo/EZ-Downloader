'use strict';

const { spawn } = require('child_process');

function spawnProcess(bin, args, { onStdout, onStderr, timeoutMs } = {}) {
  let resolvePromise, rejectPromise;
  const promise = new Promise((res, rej) => {
    resolvePromise = res;
    rejectPromise = rej;
  });

  const proc = spawn(bin, args, { stdio: ['pipe', 'pipe', 'pipe'] });
  let stdout = '';
  let stderr = '';
  let settled = false;

  const settle = (fn, value) => {
    if (settled) return;
    settled = true;
    fn(value);
  };

  let timeoutId;
  if (timeoutMs) {
    timeoutId = setTimeout(() => {
      proc.kill();
      settle(rejectPromise, new Error(`Tempo limite excedido (${timeoutMs / 1000}s)`));
    }, timeoutMs);
  }

  proc.stdout.on('data', (data) => {
    const str = data.toString();
    stdout += str;
    onStdout?.(str);
  });

  proc.stderr.on('data', (data) => {
    const str = data.toString();
    stderr += str;
    onStderr?.(str);
  });

  proc.on('close', (code) => {
    clearTimeout(timeoutId);
    settle(resolvePromise, { code, stdout, stderr });
  });

  proc.on('error', (err) => {
    clearTimeout(timeoutId);
    settle(rejectPromise, err);
  });

  return { proc, promise };
}

module.exports = { spawnProcess };
