import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { resolve } from 'node:path';
import ts from 'typescript';
import vm from 'node:vm';

type Timer = { callback: () => void; ms: number; cleared: boolean };
type RateLimitHelpers = {
  ucfWait(ms: number, signal: AbortSignal): Promise<void>;
  ucfRetryDelay(consecutive429: number): number;
};

// Authored by LLM, model unknown
async function loadHelpers() {
  const source = await readFile(resolve('userscript/rate-limit.ts'), 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None, strict: true },
  }).outputText;
  const timers: Timer[] = [];
  const sandbox = {
    AbortController,
    DOMException,
    Promise,
    Date,
    setTimeout(callback: () => void, ms = 0) {
      timers.push({ callback, ms, cleared: false });
      return timers.length - 1;
    },
    clearTimeout(id: number) {
      const timer = timers[id];
      if (timer) timer.cleared = true;
    },
  };
  vm.createContext(sandbox);
  vm.runInContext(output, sandbox);
  return { helpers: sandbox as unknown as RateLimitHelpers, timers };
}

// Edited by LLM, model GPT-6
test('ucfRetryDelay increases by five seconds per consecutive 429', async () => {
  const { helpers } = await loadHelpers();
  for (let attempt = 1; attempt <= 12; attempt++) {
    assert.equal(helpers.ucfRetryDelay(attempt), attempt * 5000);
  }
});

// Edited by LLM, model GPT-6
test('ucfRetryDelay caps each wait at sixty seconds', async () => {
  const { helpers } = await loadHelpers();
  assert.equal(helpers.ucfRetryDelay(13), 60000);
  assert.equal(helpers.ucfRetryDelay(100), 60000);
});

// Authored by LLM, model unknown
test('ucfWait rejects immediately without scheduling after prior abort', async () => {
  const { helpers, timers } = await loadHelpers();
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(helpers.ucfWait(10, controller.signal));
  assert.equal(timers.length, 0);
});

// Authored by LLM, model unknown
test('ucfWait clears its timer when aborted during a wait', async () => {
  const { helpers, timers } = await loadHelpers();
  const controller = new AbortController();
  const waiting = helpers.ucfWait(10, controller.signal);
  assert.equal(timers.length, 1);
  controller.abort();
  await assert.rejects(waiting);
  assert.equal(timers[0]?.cleared, true);
});

// Authored by LLM, model unknown
test('ucfWait segments waits that exceed the timer maximum', async () => {
  const { helpers, timers } = await loadHelpers();
  const controller = new AbortController();
  const waiting = helpers.ucfWait(2_147_483_648, controller.signal);
  assert.equal(timers[0]?.ms, 2_147_483_647);
  timers[0]?.callback();
  assert.equal(timers.length, 2);
  assert.equal(timers[1]?.ms, 1);
  timers[1]?.callback();
  await waiting;
});
