import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

type FetchResponse = { ok: boolean; status: number; headers?: { get: (name: string) => string | null }; json: () => Promise<unknown> };
type RequestOptions = { signal?: AbortSignal; credentials?: string };
type FetchImpl = (url: string | URL, options: RequestOptions, call: number) => Promise<FetchResponse>;
type FakeElement = { tagName: string; style: Record<string, string>; children: FakeElement[]; disabled: boolean; textContent: string; append: (...children: FakeElement[]) => void; appendChild: (child: FakeElement) => FakeElement; addEventListener: (type: string, handler: () => void) => void; click: () => void; remove: () => void };
type CollectorDataset = { version?: number; users: Array<{ username: string; posts: Array<{ id: number; topicId?: number; createdAt?: string }> }> };
type BrowserOptions = { pauseLongWaits?: boolean; origin?: string; prompts?: string[]; fetchImpl?: FetchImpl };

const script = await readFile(resolve('dist/userscript/uscardforum-style.user.js'), 'utf8');

// Edited by LLM, model GPT-6
function makeBrowser({ pauseLongWaits = false, origin = 'https://www.uscardforum.com', prompts = [], fetchImpl = async () => ({ ok: true, status: 200, json: async () => ({ posts: [] }) }) }: BrowserOptions = {}) {
  let now = 0;
  let timerId = 0;
  const waitingTimers = new Map<number, () => void>();
  const logs: unknown[][] = [];
  const menus = new Map<string, () => void>();
  const values = new Map<string, CollectorDataset>();
  const alerts: string[] = [];
  const requests: Array<{ url: string; at: number; options: RequestOptions }> = [];
  const listeners = new Map<string, (event: unknown) => void>();
  const posted: Array<{ message: unknown; targetOrigin: string }> = [];
  const elements: FakeElement[] = [];
  // Authored by LLM, model unknown
  const makeElement = (tagName: string): FakeElement => {
    const handlers = new Map<string, () => void>();
    const element: FakeElement = {
      tagName,
      style: {},
      children: [],
      disabled: false,
      textContent: '',
      append(...children: FakeElement[]) { this.children.push(...children); },
      appendChild(child: FakeElement) { this.children.push(child); return child; },
      addEventListener(type: string, handler: () => void) { handlers.set(type, handler); },
      click() { handlers.get('click')?.(); },
      remove() {},
    };
    elements.push(element);
    return element;
  };
  class FakeDate extends Date {
    // Authored by LLM, model unknown
    static now() { return now; }
  }
  const window = {
    location: { origin },
    confirm: () => true,
    prompt: () => prompts.shift(),
    alert: (message: unknown) => alerts.push(String(message)),
    addEventListener: (type: string, handler: (event: unknown) => void) => listeners.set(type, handler),
    postMessage: (message: unknown, targetOrigin: string) => posted.push({ message, targetOrigin }),
  };
  const domEvents = new EventTarget();
  const context = {
    window,
    console: {
      // Authored by LLM, model GPT-6
      info: (...args: unknown[]) => logs.push(args),
      // Authored by LLM, model GPT-6
      warn: (...args: unknown[]) => logs.push(args),
      // Authored by LLM, model GPT-6
      error: (...args: unknown[]) => logs.push(args),
    },
    CustomEvent,
    DOMException,
    document: { body: makeElement('body'), createElement: makeElement, addEventListener: domEvents.addEventListener.bind(domEvents), dispatchEvent: domEvents.dispatchEvent.bind(domEvents) },
    DOMParser: class {
      // Authored by LLM, model unknown
      parseFromString(html: unknown) { return { body: { textContent: String(html).replace(/<[^>]*>/g, '') }, querySelectorAll: () => [] as FakeElement[] }; }
    },
    AbortController,
    URL,
    Blob,
    Date: FakeDate,
    // Edited by LLM, model GPT-6
    setTimeout: (callback: () => void, ms = 0) => {
      const id = ++timerId;
      if (pauseLongWaits && ms >= 5000) waitingTimers.set(id, callback);
      else { now += ms; callback(); }
      return id;
    },
    // Edited by LLM, model GPT-6
    clearTimeout: (id: number) => { waitingTimers.delete(id); },
    fetch: async (url: string | URL, options: RequestOptions = {}) => {
      requests.push({ url: String(url), at: now, options });
      const response = await fetchImpl(url, options, requests.length);
      return { ...response, headers: response.headers ?? { get: () => null } };
    },
    GM_registerMenuCommand: (name: string, handler: () => void) => menus.set(name, handler),
    GM_getValue: (key: string, fallback: unknown) => values.has(key) ? values.get(key) : fallback,
    GM_setValue: (key: string, value: unknown) => values.set(key, structuredClone(value) as CollectorDataset),
    GM_deleteValue: (key: string) => values.delete(key),
  };
  vm.runInNewContext(script, context, { filename: 'uscardforum-style.user.js' });
  return { window, menus, values, alerts, requests, listeners, posted, elements, document: context.document, waitingTimers, logs };
}

// Authored by LLM, model unknown
function post(id: number, username?: string, extra: Record<string, unknown> = {}) {
  return { id, username, blurb: `<p>This is public writing sample number ${id}, with enough text.</p>`, ...extra };
}

// Authored by LLM, model unknown
async function settle() {
  for (let index = 0; index < 2000; index += 1) await Promise.resolve();
}

// Authored by LLM, model unknown
test('rejects usernames that differ only by case before fetching', async () => {
  const browser = makeBrowser({ prompts: ['Alice alice', 'likes', '20'] });
  browser.menus.get('采集写作样本')!();
  await settle();
  assert.equal(browser.requests.length, 0);
  assert.match(browser.alerts[0], /不同/);
});

// Authored by LLM, model unknown
test('keeps only public matching posts and stops on a repeated page', async () => {
  const browser = makeBrowser({
    prompts: ['Alice Bob', 'likes', '20'],
    // Authored by LLM, model unknown
    fetchImpl: async (url) => {
      const page = new URL(url).searchParams.get('page');
      if (new URL(url).searchParams.get('q')!.startsWith('@Alice') && page === '1') return { ok: true, status: 200, json: async () => ({ posts: [post(1, undefined, { user: { username: 'ALICE' }, topic_id: -1, created_at: 'not-a-date' }), post(2, 'alice', { private: true }), post(3, undefined), post(4, 'Bob'), post(5, 'alice', { blurb: `<p>${'too long '.repeat(4000)}</p>` })] }) };
      if (new URL(url).searchParams.get('q')!.startsWith('@Alice')) return { ok: true, status: 200, json: async () => ({ posts: [post(1, 'alice')] }) };
      return { ok: true, status: 200, json: async () => ({ posts: [] }) };
    },
  });
  browser.menus.get('采集写作样本')!();
  await settle();
  const dataset = browser.values.get('ucf-style-dataset-v1')!;
  assert.deepEqual(JSON.parse(JSON.stringify(dataset.users.map((user) => [user.username, user.posts.map((row) => row.id)]))), [['Alice', [1]], ['Bob', []]]);
  assert.equal(dataset.users[0].posts[0].topicId, undefined);
  assert.equal(dataset.users[0].posts[0].createdAt, undefined);
  assert.equal(browser.requests.length, 3);
});

// Authored by LLM, model unknown
test('stops a user when the server explicitly reports no more pages', async () => {
  const browser = makeBrowser({
    prompts: ['Alice Bob', 'likes', '20'],
    // Authored by LLM, model unknown
    fetchImpl: async (url) => {
      if (new URL(url).searchParams.get('q')!.startsWith('@Alice')) {
        return { ok: true, status: 200, json: async () => ({ posts: [post(1, 'alice')], grouped_search_result: { more_posts: false } }) };
      }
      return { ok: true, status: 200, json: async () => ({ posts: [] }) };
    },
  });
  browser.menus.get('采集写作样本')!();
  await settle();
  assert.equal(browser.requests.length, 2);
});

// Authored by LLM, model unknown
test('preserves earlier results and does not retry after HTTP 403', async () => {
  const browser = makeBrowser({
    prompts: ['Alice Bob', 'views', '20'],
    // Authored by LLM, model unknown
    fetchImpl: async (_url, _options, call) => call === 1
      ? { ok: true, status: 200, json: async () => ({ posts: [post(1, 'alice')] }) }
      : { ok: false, status: 403, json: async () => ({}) },
  });
  browser.menus.get('采集写作样本')!();
  await settle();
  const dataset = browser.values.get('ucf-style-dataset-v1')!;
  assert.deepEqual(JSON.parse(JSON.stringify(dataset.users.map((user) => user.username))), ['Alice', 'Bob']);
  assert.deepEqual(JSON.parse(JSON.stringify(dataset.users[0].posts.map((row) => row.id))), [1]);
  assert.equal(browser.requests.length, 2);
  assert.equal(browser.requests[0].options.credentials, 'omit');
});

// Authored by LLM, model GPT-6
test('429 uses a 5-second first retry even when Retry-After is 300 seconds', async () => {
  const browser = makeBrowser({
    prompts: ['Alice Bob', 'likes', '20'],
    // Authored by LLM, model GPT-6
    fetchImpl: async (_url, _options, call) => {
      if (call === 1) return { ok: true, status: 200, json: async () => ({ posts: [post(1, 'alice')] }) };
      if (call === 2) return { ok: false, status: 429, headers: { get: () => '300' }, json: async () => ({}) };
      if (call === 3) return { ok: true, status: 200, json: async () => ({ posts: [post(2, 'alice')], grouped_search_result: { more_posts: false } }) };
      return { ok: true, status: 200, json: async () => ({ posts: [] }) };
    },
  });
  browser.menus.get('采集写作样本')!();
  await settle();
  const dataset = browser.values.get('ucf-style-dataset-v1')!;
  assert.deepEqual(JSON.parse(JSON.stringify(dataset.users[0].posts.map((row) => row.id))), [1, 2]);
  assert.equal(browser.requests.length, 4);
  assert.equal(browser.requests[1].url, browser.requests[2].url);
  assert.equal(browser.requests[2].at - browser.requests[1].at, 5000);
});

// Authored by LLM, model GPT-6
test('repeated 429 responses consume the shared 100-request budget', async () => {
  const browser = makeBrowser({ prompts: ['Alice Bob', 'likes', '20'],
    // Authored by LLM, model GPT-6
    fetchImpl: async () => ({ ok: false, status: 429, json: async () => ({ extras: { wait_seconds: 10 } }) }),
  });
  browser.menus.get('采集写作样本')!();
  await settle();
  assert.equal(browser.requests.length, 100);
  assert.equal(browser.values.get('ucf-style-dataset-v1')!.users.length, 2);
});

// Authored by LLM, model unknown
test('cancellation aborts the in-flight request and preserves partial data', async () => {
  const browser = makeBrowser({
    prompts: ['Alice Bob', 'likes', '20'],
    // Authored by LLM, model unknown
    fetchImpl: async (_url, options, call) => {
      if (call === 1) return { ok: true, status: 200, json: async () => ({ posts: [post(1, 'alice')] }) };
      return new Promise((_resolve, reject) => {
        // Authored by LLM, model unknown
        options.signal!.addEventListener('abort', () => reject(new Error('aborted')));
      });
    },
  });
  browser.menus.get('采集写作样本')!();
  await settle();
  assert.equal(browser.requests.length, 2);
  browser.elements.find((element) => element.textContent === '停止并保留已采集结果')!.click();
  await settle();
  const dataset = browser.values.get('ucf-style-dataset-v1')!;
  assert.deepEqual(JSON.parse(JSON.stringify(dataset.users[0].posts.map((row) => row.id))), [1]);
  assert.equal(browser.requests.length, 2);
});

// Authored by LLM, model unknown
test('uses serial requests at least two seconds apart and caps a user at 20 pages', async () => {
  const browser = makeBrowser({
    prompts: ['Alice Bob', 'likes', '20'],
    // Authored by LLM, model unknown
    fetchImpl: async (url) => {
      const page = Number(new URL(url).searchParams.get('page'));
      if (new URL(url).searchParams.get('q')!.startsWith('@Bob')) return { ok: true, status: 200, json: async () => ({ posts: [] }) };
      return { ok: true, status: 200, json: async () => ({ posts: [post(page, 'alice')] }) };
    },
  });
  browser.menus.get('采集写作样本')!();
  await settle();
  assert.equal(browser.requests.length, 21);
  for (let index = 1; index < browser.requests.length; index += 1) assert.ok(browser.requests[index].at - browser.requests[index - 1].at >= 2000);
});

// Authored by LLM, model unknown
test('never exceeds the global 100-request budget', async () => {
  const browser = makeBrowser({
    prompts: ['A B C D E', 'likes', '500'],
    // Authored by LLM, model unknown
    fetchImpl: async (url) => {
      const page = Number(new URL(url).searchParams.get('page'));
      const username = new URL(url).searchParams.get('q')!.match(/^@(\w+)/)![1].toLowerCase();
      return { ok: true, status: 200, json: async () => ({ posts: [post(page, username)] }) };
    },
  });
  browser.menus.get('采集写作样本')!();
  await settle();
  assert.equal(browser.requests.length, 100);
});

// Authored by LLM, model unknown
test('serves the cached dataset only through the exact analyzer-origin bridge', () => {
  const browser = makeBrowser({ origin: 'http://127.0.0.1:5173' });
  const dataset = { version: 1, users: [] };
  browser.values.set('ucf-style-dataset-v1', dataset);
  browser.listeners.get('message')!({ source: browser.window, origin: 'http://localhost:5173', data: { protocol: 'ucf-style-bridge-v1', type: 'REQUEST_DATA', requestId: 'wrong-origin' } });
  assert.equal(browser.posted.length, 0);
  browser.listeners.get('message')!({ source: browser.window, origin: 'http://127.0.0.1:5173', data: { protocol: 'ucf-style-bridge-v1', type: 'REQUEST_DATA', requestId: 'request-1' } });
  assert.deepEqual(JSON.parse(JSON.stringify(browser.posted)), [{ message: { protocol: 'ucf-style-bridge-v1', type: 'DATA', requestId: 'request-1', dataset }, targetOrigin: 'http://127.0.0.1:5173' }]);
  const preview = makeBrowser({ origin: 'http://127.0.0.1:4173' });
  preview.values.set('ucf-style-dataset-v1', dataset);
  preview.listeners.get('message')!({ source: preview.window, origin: 'http://127.0.0.1:4173', data: { protocol: 'ucf-style-bridge-v1', type: 'REQUEST_DATA', requestId: 'preview-request' } });
  assert.equal(preview.posted[0].targetOrigin, 'http://127.0.0.1:4173');
});

// Authored by LLM, model GPT-6
test('cancel during 429 wait clears the timer and preserves the last page checkpoint', async () => {
  const browser = makeBrowser({ pauseLongWaits: true, prompts: ['Alice Bob', 'likes', '20'],
    // Authored by LLM, model GPT-6
    fetchImpl: async (_url, _options, call) => call === 1
      ? { ok: true, status: 200, json: async () => ({ posts: [post(1, 'alice')] }) }
      : { ok: false, status: 429, json: async () => ({ extras: { wait_seconds: 15 } }) },
  });
  browser.menus.get('采集写作样本')!();
  await settle();
  assert.equal(browser.requests.length, 2);
  assert.equal(browser.waitingTimers.size, 1);
  assert.equal(browser.values.get('ucf-style-dataset-v1')!.users[0].posts.length, 1);
  browser.elements.find((element) => element.textContent === '停止并保留已采集结果')!.click();
  await settle();
  assert.equal(browser.waitingTimers.size, 0);
  assert.equal(browser.requests.length, 2);
  assert.equal(browser.values.get('ucf-style-dataset-v1')!.users[0].posts[0].id, 1);
  const logs = JSON.stringify(browser.logs);
  assert.match(logs, /search:rate-limited/);
  assert.match(logs, /collection:cancel/);
  assert.doesNotMatch(logs, /This is public writing sample/);
});

// Authored by LLM, model GPT-6
test('DOM cache bridge rejects malformed requests and is absent on unlisted origins', () => {
  const browser = makeBrowser({ origin: 'http://127.0.0.1:5173' });
  const replies: unknown[] = [];
  // Authored by LLM, model GPT-6
  browser.document.addEventListener('ucf-style-bridge-response', event => replies.push((event as CustomEvent).detail));
  browser.document.dispatchEvent(new CustomEvent('ucf-style-bridge-request', { detail: '{bad json' }));
  browser.document.dispatchEvent(new CustomEvent('ucf-style-bridge-request', { detail: JSON.stringify({ protocol: 'wrong', type: 'REQUEST_DATA', requestId: 'x' }) }));
  assert.equal(replies.length, 0);
  const other = makeBrowser({ origin: 'https://unlisted.example' });
  // Authored by LLM, model GPT-6
  other.document.addEventListener('ucf-style-bridge-response', event => replies.push((event as CustomEvent).detail));
  other.document.dispatchEvent(new CustomEvent('ucf-style-bridge-request', { detail: JSON.stringify({ protocol: 'ucf-style-bridge-v1', type: 'REQUEST_DATA', requestId: 'x' }) }));
  assert.equal(replies.length, 0);
});
