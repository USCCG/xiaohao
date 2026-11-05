import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { WorkerMessage, WorkerRequest } from '../src/types';
import ts from 'typescript';
import { parseDataset, isRecord } from '../src/dataset.ts';

const demo = JSON.parse(readFileSync(resolve('fixtures/synthetic.json'), 'utf8'));
const source = readFileSync(resolve('src/main.ts'), 'utf8')
  .replace(/^import .*;\n/gm, '').replaceAll('import.meta.url', "'http://127.0.0.1:5173/src/main.ts'");
const collectorScript = readFileSync(resolve('dist/userscript/uscardforum-style.user.js'), 'utf8');
const script = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;

class Element {
  children: Element[] = [];
  style = {};
  handlers: Record<string, () => void | Promise<void>> = {};
  files?: Array<{ size: number; text: () => Promise<string> }>;
  disabled = false;
  hidden = false;
  value: string | number = 0;
  textContent = '';
  // Authored by LLM, model GPT-6
  append(...nodes: Element[]) { this.children.push(...nodes); }
  // Authored by LLM, model GPT-6
  replaceChildren(...nodes: Element[]) { this.children = nodes; }
  // Authored by LLM, model GPT-6
  addEventListener(name: string, callback: () => void | Promise<void>) { this.handlers[name] = callback; }
  // Authored by LLM, model GPT-6
  async click() { if (!this.disabled) await this.handlers.click?.(); }
}

// Edited by LLM, model GPT-6
function setup() {
  const elements = new Map<string, Element>();
  const workers: Worker[] = [];
  const timers: Array<(() => void) | null> = [];
  const messages: Array<Record<string, unknown>> = [];
  const window = { message: undefined as ((event: unknown) => void) | undefined, location: { origin: 'http://127.0.0.1:5173' },
    // Authored by LLM, model GPT-6
    addEventListener(name: string, callback: (event: unknown) => void) { assert.equal(name, 'message'); this.message = callback; },
    // Authored by LLM, model GPT-6
    postMessage(message: Record<string, unknown>) { messages.push(message); },
  };
  class Worker {
    terminated = false;
    request?: WorkerRequest;
    onmessage?: (event: { data: WorkerMessage }) => void;
    // Authored by LLM, model GPT-6
    constructor() { workers.push(this); }
    // Authored by LLM, model GPT-6
    terminate() { this.terminated = true; }
    // Authored by LLM, model GPT-6
    postMessage(message: WorkerRequest) { this.request = message; }
    // Authored by LLM, model GPT-6
    emit(message: WorkerMessage) { this.onmessage!({ data: message }); }
  }
  const domEvents = new EventTarget();
  const document = {
    baseURI: 'http://127.0.0.1:5173/',
    addEventListener: domEvents.addEventListener.bind(domEvents),
    dispatchEvent: domEvents.dispatchEvent.bind(domEvents),
    // Authored by LLM, model GPT-6
    querySelector(selector: string) {
      if (!elements.has(selector)) elements.set(selector, new Element());
      return elements.get(selector);
    },
    // Authored by LLM, model GPT-6
    createElement() { return new Element(); },
  };
  vm.runInNewContext(script, { window, document, CustomEvent, Worker, demo, parseDataset, isRecord, URL, crypto,
    // Authored by LLM, model GPT-6
    setTimeout(callback: () => void) { timers.push(callback); return timers.length - 1; },
    // Authored by LLM, model GPT-6
    clearTimeout(id: number | undefined) { if (id !== undefined) timers[id] = null; },
  });
  return { elements, workers, timers, messages, window, document,
    // Authored by LLM, model GPT-6
    attachCollector(readError = false) {
      // Distinct windows model the sandbox boundary; postMessage is deliberately unavailable.
      const isolatedWindow = { location: window.location,
        // Authored by LLM, model GPT-6
        addEventListener() {},
        // Authored by LLM, model GPT-6
        postMessage() { throw new Error('isolated postMessage unavailable'); },
      };
      vm.runInNewContext(collectorScript, { window: isolatedWindow, document, CustomEvent,
        // Authored by LLM, model GPT-6
        GM_getValue() { if (readError) throw new Error('storage unavailable'); return demo; },
      });
    },
    // Authored by LLM, model GPT-6
    get(id: string) { return elements.get(`#${id}`)!; },
    // Authored by LLM, model GPT-6
    async import(data: unknown) {
      const input = elements.get('#file-input')!;
      // Authored by LLM, model GPT-6
      input.files = [{ size: 100, text: async () => JSON.stringify(data) }];
      await input.handlers.change();
    },
  };
}

// Authored by LLM, model GPT-6
test('demo starts worker, receives progress and renders numeric results', async () => {
  const app = setup();
  await app.get('demo-load').click();
  assert.match(app.get('dataset-info').textContent, /合成示例/);
  assert.equal(app.get('analyze').disabled, false);
  await app.get('analyze').click();
  const worker = app.workers[0];
  assert.equal(worker.request!.dataset.users.length, 3);
  assert.equal(app.get('analyze').disabled, true);
  worker.emit({ type: 'PROGRESS', percent: 42, detail: 'working' });
  assert.equal(app.get('progress').value, 42);
  worker.emit({ type: 'RESULT', result: { usernames: ['A', 'B'], matrix: [[1, 0.4], [0.4, 1]], diagnostics: [] } });
  assert.equal(worker.terminated, true);
  assert.equal(app.get('results').hidden, false);
  assert.equal(app.get('progress').value, 100);
  assert.equal(app.get('matrix-container').children[0].children[2].children[0].children[2].textContent, '0.400');
});

// Authored by LLM, model DeepSeek V4.1 Flash Free
test('python engine is opt-in and loads in a separate worker with progress', async () => {
  const app = setup();
  await app.get('demo-load').click();
  const engine = app.get('engine-select');
  engine.value = 'python';
  engine.handlers.change?.();
  assert.match(app.get('engine-note').textContent, /scikit/);
  await app.get('analyze').click();
  const worker = app.workers[0];
  const request = worker.request!;
  assert.equal(request.type, 'ANALYZE_PYTHON');
  if (request.type === 'ANALYZE_PYTHON') {
    assert.equal(request.pyodideIndexUrl, 'http://127.0.0.1:5173/assets/pyodide/');
  }
  assert.equal(engine.disabled, true);
  worker.emit({ type: 'PROGRESS', percent: 35, detail: '加载 scikit-learn' });
  assert.equal(app.get('progress').value, 35);
  assert.match(app.get('status').textContent, /scikit-learn/);
  worker.emit({ type: 'RESULT', result: { usernames: ['A', 'B'], matrix: [[1, 0.8], [0.8, 1]], diagnostics: [] } });
  assert.match(app.get('status').textContent, /Python\/scikit/);
  assert.equal(engine.disabled, false);
});

// Authored by LLM, model GPT-6
test('metric selector re-renders the pair matrix and formats lift values', async () => {
  const app = setup();
  await app.get('demo-load').click();
  await app.get('analyze').click();
  const worker = app.workers[0];
  worker.emit({
    type: 'RESULT',
    result: {
      usernames: ['A', 'B'],
      matrix: [[1, 0.9], [0.9, 1]],
      diagnostics: [
        { username: 'A', posts: 10, characters: 1000, splitHalf: 0.9 },
        { username: 'B', posts: 10, characters: 1000, splitHalf: 0.9 },
      ],
      pairs: [{
        left: 'A', right: 'B', profile: 0.9, relative: 1, backgroundLift: 0.2,
        functionWords: 0.8, punctuation: 0.7, deltaSimilarity: 0.4, style: 0.5,
        topicOverlap: 0.1, sharedTrigramOverlap: 0.2, stability: 0.9, combined: 0.85,
      }],
    },
  });
  const cell = () => app.get('matrix-container').children[0].children[2].children[0].children[2].textContent;
  assert.equal(cell(), '0.900');
  const select = app.get('metric-select');
  select.value = 'punctuation';
  select.handlers.change?.();
  assert.equal(cell(), '0.700');
  select.value = 'backgroundLift';
  select.handlers.change?.();
  assert.equal(cell(), '+0.200');
});

// Authored by LLM, model GPT-6
test('cancel terminates worker and ignores late replies; restart succeeds', async () => {
  const app = setup();
  await app.get('demo-load').click();
  await app.get('analyze').click();
  const old = app.workers[0];
  await app.get('cancel').click();
  old.emit({ type: 'PROGRESS', percent: 90, detail: 'stale' });
  assert.equal(old.terminated, true);
  assert.equal(app.get('progress').value, 0);
  assert.match(app.get('status').textContent, /已取消/);
  await app.get('analyze').click();
  assert.equal(app.workers.length, 2);
});

// Authored by LLM, model GPT-6
test('invalid import preserves data, partial import disables analysis, worker errors recover', async () => {
  const app = setup();
  await app.get('demo-load').click();
  const info = app.get('dataset-info').textContent;
  await app.import({});
  assert.match(app.get('status').textContent, /导入失败/);
  assert.equal(app.get('dataset-info').textContent, info);
  const partial = structuredClone(demo);
  partial.users[0].posts = [];
  await app.import(partial);
  assert.equal(app.get('analyze').disabled, true);
  assert.match(app.get('status').textContent, /尚无样本/);
  await app.get('demo-load').click();
  await app.get('analyze').click();
  app.workers[0].emit({ type: 'ERROR', message: 'insufficient text' });
  assert.equal(app.get('analyze').disabled, false);
  assert.equal(app.get('cancel').disabled, true);
  assert.match(app.get('status').textContent, /insufficient text/);
});

// Authored by LLM, model GPT-6
test('bridge ignores wrong IDs/origins and a demo load invalidates pending replies', async () => {
  const app = setup();
  await app.get('bridge-load').click();
  const reply = { protocol: 'ucf-style-bridge-v1', type: 'DATA', requestId: app.messages[0].requestId, dataset: demo };
  app.window.message!({ source: app.window, origin: 'https://evil.example', data: reply });
  assert.equal(app.get('bridge-load').disabled, true);
  app.window.message!({ source: app.window, origin: app.window.location.origin, data: { ...reply, requestId: 'wrong' } });
  assert.equal(app.get('bridge-load').disabled, true);
  app.window.message!({ source: app.window, origin: app.window.location.origin, data: reply });
  assert.equal(app.get('bridge-load').disabled, false);
  assert.equal(app.get('analyze').disabled, false);
  await app.get('bridge-load').click();
  const stale = app.timers.at(-1)!;
  await app.get('demo-load').click();
  stale();
  assert.match(app.get('dataset-info').textContent, /合成示例/);
  assert.doesNotMatch(app.get('status').textContent, /未收到/);
});

// Authored by LLM, model GPT-6
test('DOM bridge transfers cache across separate windows and shows readiness', async () => {
  const app = setup();
  app.attachCollector();
  assert.match(app.get('bridge-status').textContent, /已连接/);
  await app.get('bridge-load').click();
  assert.equal(app.get('bridge-load').disabled, false);
  assert.equal(app.get('analyze').disabled, false);
  assert.match(app.get('dataset-info').textContent, /摘要/);
});

// Authored by LLM, model GPT-6
test('late userscript startup replays a pending request without a stale timeout', async () => {
  const app = setup();
  await app.get('bridge-load').click();
  const timeout = app.timers.at(-1)!;
  app.attachCollector();
  assert.equal(app.get('bridge-load').disabled, false);
  assert.equal(app.get('analyze').disabled, false);
  timeout();
  assert.doesNotMatch(app.get('status').textContent, /未收到/);
});

// Authored by LLM, model GPT-6
test('GM storage errors are surfaced instead of reporting a silent bridge timeout', async () => {
  const app = setup();
  app.attachCollector(true);
  await app.get('bridge-load').click();
  assert.equal(app.get('bridge-load').disabled, false);
  assert.match(app.get('status').textContent, /storage unavailable/);
});
