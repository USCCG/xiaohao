// ==UserScript==
// @name         USCardForum Writing Sample Bridge (POC)
// @namespace    local.uscardforum.style.poc
// @version      0.2.1
// @description  Small, rate-limited public-post sample collector + local-only analyzer bridge.
// @match        https://www.uscardforum.com/*
// @match        https://uscardforum.com/*
// @match        http://localhost:5173/*
// @match        http://127.0.0.1:5173/*
// @match        http://localhost:4173/*
// @match        http://127.0.0.1:4173/*
// @run-at       document-start
// @noframes
// @grant        GM_registerMenuCommand
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// ==/UserScript==

// Edit this TypeScript source; install the tsc output in dist/userscript/.

// Edited by LLM, model GPT-6
(() => {
  'use strict';

  const STORE_KEY = 'ucf-style-dataset-v1';
  const PROTOCOL = 'ucf-style-bridge-v1';
  const REQUEST_EVENT = 'ucf-style-bridge-request';
  const RESPONSE_EVENT = 'ucf-style-bridge-response';
  console.info('[UCF Style] userscript:start', { version: '0.2.1', origin: window.location.origin });
  const FORUM_ORIGIN = 'https://www.uscardforum.com';
  const APP_URL = 'http://127.0.0.1:5173/';
  const APP_ORIGINS = new Set(['http://localhost:5173', 'http://127.0.0.1:5173', 'http://localhost:4173', 'http://127.0.0.1:4173']);
  const HARD_MAX_USERS = 5;
  const HARD_MAX_POSTS = 500;
  const MAX_PAGES_PER_USER = 20;
  const MAX_REQUESTS_TOTAL = 100;
  const MIN_REQUEST_INTERVAL_MS = 2000;

  // Authored by LLM, model GPT-6
  function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }

  function onAnalyzerPage() {
    return APP_ORIGINS.has(window.location.origin);
  }

  // Edited by LLM, model GPT-6
  function initBridge() {
    // JSON strings cross extension/page worlds without exposing GM APIs to the page.
    // Authored by LLM, model GPT-6
    const sendDOM = (message: Record<string, unknown>) => document.dispatchEvent(new CustomEvent(RESPONSE_EVENT, {
      detail: JSON.stringify({ protocol: PROTOCOL, ...message }),
    }));
    // Authored by LLM, model GPT-6
    function respond(message: unknown, send: (reply: Record<string, unknown>) => void) {
      if (!isRecord(message) || message.protocol !== PROTOCOL) return;
      if (message.type === 'HELLO') {
        send({ protocol: PROTOCOL, type: 'READY', version: '0.2.1' });
        return;
      }
      if (message.type !== 'REQUEST_DATA' || typeof message.requestId !== 'string'
        || !message.requestId || message.requestId.length > 80) return;
      const requestId = message.requestId;
      console.info('[UCF Style] cache:request', { requestId });
      try {
        const dataset = GM_getValue<CollectorDataset | null>(STORE_KEY, null);
        console.info('[UCF Style] cache:reply', { requestId, hasCache: dataset !== null, accounts: dataset?.users?.length ?? 0 });
        send({ protocol: PROTOCOL, type: 'DATA', requestId, dataset });
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        console.error('[UCF Style] cache:error', { requestId, error: detail });
        send({ protocol: PROTOCOL, type: 'ERROR', requestId, message: detail });
      }
    }
    // Authored by LLM, model GPT-6
    document.addEventListener(REQUEST_EVENT, (event) => {
      const detail: unknown = (event as CustomEvent<unknown>).detail;
      if (typeof detail !== 'string') return;
      try { respond(JSON.parse(detail), sendDOM); }
      catch { console.warn('[UCF Style] bridge:invalid-request'); }
    });
    // Keep compatibility with an already-open older analyzer page.
    // Edited by LLM, model GPT-6
    window.addEventListener('message', (event) => {
      if (event.source !== window || event.origin !== window.location.origin) return;
      // Authored by LLM, model GPT-6
      respond(event.data, (reply) => window.postMessage(reply, window.location.origin));
    });
    console.info('[UCF Style] bridge:ready', { origin: window.location.origin });
    sendDOM({ type: 'READY', version: '0.2.1' });
  }

  if (onAnalyzerPage()) {
    initBridge();
    return;
  }
  if (window.location.origin !== FORUM_ORIGIN && window.location.origin !== 'https://uscardforum.com') return;

  let running = false;
  let controller: AbortController | null = null;
  let stopRequested = false;
  let requestCount = 0;
  let lastRequestAt = 0;


  // Edited by LLM, model GPT-6
  function textFromHtml(html: string) {
    const doc = new DOMParser().parseFromString(String(html), 'text/html');
    doc.querySelectorAll('blockquote, pre, code, aside.quote, .quote, .onebox, script, style').forEach((node) => node.remove());
    return (doc.body.textContent || '').replace(/[\t\r]+/g, ' ').trim();
  }

  // Edited by LLM, model GPT-6
  function normalizeUsernames(input: string) {
    const users = [];
    const seen = new Set();
    for (const rawName of input.split(/[,，\s]+/u)) {
      const username = rawName.trim().replace(/^@/, '');
      const key = username.toLowerCase();
      if (username && !seen.has(key)) {
        seen.add(key);
        users.push(username);
      }
    }
    if (users.length < 2 || users.length > HARD_MAX_USERS) {
      throw new Error('需要 2–5 个不同的用户名。');
    }
    if (users.some((x) => !/^[\p{L}\p{N}_.-]{1,40}$/u.test(x))) {
      throw new Error('用户名包含不支持的字符。请使用实际 Discourse @username。');
    }
    return users;
  }

  // Edited by LLM, model GPT-6
  function createPanel() {
    const root = document.createElement('div');
    root.style.cssText = 'position:fixed;z-index:2147483647;right:20px;bottom:20px;width:min(420px,90vw);background:#fff;color:#1a2738;border:1px solid #cfd7e0;border-radius:10px;padding:14px;font:13px/1.5 system-ui;box-shadow:0 8px 24px #0003;';
    const title = document.createElement('strong');
    title.textContent = '公开帖子采集（本地）';
    title.style.display = 'block';
    const status = document.createElement('div');
    status.textContent = '准备中';
    status.style.cssText = 'white-space:pre-wrap;max-height:130px;overflow:auto;margin:8px 0;';
    const progress = document.createElement('progress');
    progress.max = 100;
    progress.value = 0;
    progress.style.width = '100%';
    const actions = document.createElement('div');
    actions.style.cssText = 'display:flex;gap:10px;margin-top:10px;';
    const stop = document.createElement('button');
    stop.textContent = '停止并保留已采集结果';
    stop.addEventListener('click', () => {
      console.info('[UCF Style] collection:cancel', { requests: requestCount });
      stopRequested = true;
      controller?.abort();
      status.textContent = '正在停止；已采集数据会保存。';
    });
    const close = document.createElement('button');
    close.textContent = '关闭';
    close.disabled = true;
    close.addEventListener('click', () => root.remove());
    const open = document.createElement('a');
    open.href = APP_URL;
    open.textContent = '打开本地分析页';
    open.target = '_blank';
    open.rel = 'noopener';
    open.style.cssText = 'display:block;margin-top:10px;color:#2456a4;';
    actions.append(stop, close);
    root.append(title, status, progress, actions, open);
    document.body.append(root);
    return { status, progress, stop, close };
  }

  // Edited by LLM, model GPT-6
  function isPublicSearchPost(post: Record<string, unknown>) {
    return post.hidden !== true
      && post.private !== true
      && post.is_private !== true
      && post.user_deleted !== true
      && post.deleted_at == null
      && post.hidden_reason_id == null
      && (!isRecord(post.topic) || post.topic.private !== true)
      && (!isRecord(post.topic) || post.topic.archetype !== 'private_message');
  }

  // Edited by LLM, model GPT-6
  function parsePost(post: unknown, username: string): CollectorPost | null {
    if (!isRecord(post)) return null;
    if (!isPublicSearchPost(post)) return null;
    const id = Number(post.id);
    if (!Number.isSafeInteger(id) || id <= 0) return null;
    // Search query filtering is not enough: only retain a result with a matching explicit author.
    const author = typeof post.username === 'string' ? post.username : (isRecord(post.user) ? post.user.username : undefined);
    if (typeof author !== 'string' || author.toLowerCase() !== username.toLowerCase()) return null;
    const full = typeof post.cooked === 'string' && post.cooked.length > 0;
    const source = full ? post.cooked : post.blurb;
    if (typeof source !== 'string') return null;
    const text = textFromHtml(source);
    if (Array.from(text).length < 25 || text.length > 30000) return null;
    const topicId = Number(post.topic_id);
    const createdAt = typeof post.created_at === 'string' && Number.isFinite(Date.parse(post.created_at)) ? post.created_at : undefined;
    return {
      id,
      topicId: Number.isSafeInteger(topicId) && topicId > 0 ? topicId : undefined,
      createdAt,
      text,
      quality: full ? 'full' : 'excerpt',
    };
  }

  // Edited by LLM, model GPT-6
  async function fetchSearch(username: string, order: CollectorOrder, page: number, status: HTMLElement) {
    const signal = controller?.signal;
    if (!signal) throw new Error('采集尚未启动。');
    const url = new URL('/search.json', window.location.origin);
    url.searchParams.set('q', `@${username} order:${order}`);
    url.searchParams.set('page', String(page));
    // A successful page returns; the next page starts a fresh linear backoff.
    let consecutive429 = 0;
    while (true) {
      signal.throwIfAborted();
      if (requestCount >= MAX_REQUESTS_TOTAL) throw new Error('已达到总请求预算（含重试）。');
      const elapsed = Date.now() - lastRequestAt;
      if (elapsed < MIN_REQUEST_INTERVAL_MS) await ucfWait(MIN_REQUEST_INTERVAL_MS - elapsed, signal);
      signal.throwIfAborted();
      requestCount += 1;
      lastRequestAt = Date.now();
      const response = await fetch(url, {
        // Anonymous search keeps logged-in-only content out of a public sample.
        method: 'GET', credentials: 'omit', headers: { Accept: 'application/json' }, signal,
      });
      signal.throwIfAborted();
      console.info('[UCF Style] search:response', { page, request: requestCount, status: response.status });
      if (response.status === 429) {
        if (requestCount >= MAX_REQUESTS_TOTAL) throw new Error('HTTP 429；已达到总请求预算（含重试）。');
        // User-selected policy: ignore server wait hints and use 5s linear steps, capped at 60s.
        consecutive429 += 1;
        const waitMs = ucfRetryDelay(consecutive429);
        const seconds = Math.ceil(waitMs / 1000);
        status.textContent = `遇到 HTTP 429，等待 ${seconds} 秒后重试第 ${page} 页。可随时停止。\n已请求 ${requestCount}/${MAX_REQUESTS_TOTAL}`;
        console.warn('[UCF Style] search:rate-limited', { page, waitMs, consecutive429, request: requestCount });
        await ucfWait(waitMs, signal);
        status.textContent = `等待结束，正在重试第 ${page} 页…`;
        continue;
      }
      if (!response.ok) throw new Error(`搜索 HTTP ${response.status}，已停止。`);
      const payload: unknown = await response.json();
      signal.throwIfAborted();
      if (!isRecord(payload) || !Array.isArray(payload.posts)) throw new Error('搜索响应结构发生变化。');
      const grouped = isRecord(payload.grouped_search_result) ? payload.grouped_search_result : undefined;
      if (grouped?.error) throw new Error(`论坛搜索失败：${String(grouped.error)}`);
      return { posts: payload.posts as unknown[], grouped_search_result: grouped };
    }
  }

  // Edited by LLM, model GPT-6
  function saveJson() {
    const dataset = GM_getValue<CollectorDataset | null>(STORE_KEY, null);
    if (!dataset) {
      window.alert('还没有已采集数据。');
      return;
    }
    const blob = new Blob([JSON.stringify(dataset, null, 2)], { type: 'application/json' });
    const href = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = href;
    anchor.download = `uscardforum-samples-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(href), 5000);
  }

  // Edited by LLM, model GPT-6
  async function start() {
    if (running) return;
    const previous = GM_getValue<CollectorDataset | null>(STORE_KEY, null);
    if (previous && !window.confirm('开始新一轮采集会替换旧缓存。建议先在油猴菜单中导出 JSON。继续？')) return;
    const input = window.prompt('输入 2–5 个实际 @username，用逗号或空格分隔', '');
    if (input === null) return;
    let users;
    try { users = normalizeUsernames(input); }
    catch (error) { window.alert((error instanceof Error ? error.message : String(error))); return; }
    const selection = window.prompt('按 likes 或 views 排序（不是 order= 参数）', 'likes');
    if (selection === null) return;
    const order = selection.trim().toLowerCase();
    if (order !== 'likes' && order !== 'views') { window.alert('只允许 likes 或 views'); return; }
    const rawLimit = window.prompt('每个用户最多采集多少条搜索结果？（上限 500，默认 200）', '200');
    if (rawLimit === null) return;
    const perUser = Number(rawLimit);
    if (!Number.isInteger(perUser) || perUser < 20 || perUser > HARD_MAX_POSTS) {
      window.alert('数量必须在 20–500 之间。');
      return;
    }

    const panel = createPanel();
    const dataset: CollectorDataset = {
      version: 1,
      source: FORUM_ORIGIN,
      capturedAt: new Date().toISOString(),
      order,
      users: users.map((username) => ({ username, posts: [] })),
    };
    running = true;
    controller = new AbortController();
    console.info('[UCF Style] collection:start', { accounts: users.length, order, perUser });
    stopRequested = false;
    requestCount = 0;
    lastRequestAt = 0;
    try {
      GM_setValue(STORE_KEY, dataset);
      for (let userIndex = 0; userIndex < users.length && !stopRequested; userIndex += 1) {
        const username = users[userIndex];
        const sample = dataset.users[userIndex];
        const seen = new Set();
        for (let page = 1; page <= MAX_PAGES_PER_USER && sample.posts.length < perUser && !stopRequested; page += 1) {
          panel.status.textContent = `@${username}：${sample.posts.length}/${perUser} 条\n第 ${page} 页 · 已请求 ${requestCount}/${MAX_REQUESTS_TOTAL}`;
          const payload = await fetchSearch(username, order, page, panel.status);
          let newIds = 0;
          for (const post of payload.posts) {
            const id = Number(isRecord(post) ? post.id : undefined);
            if (!Number.isSafeInteger(id) || seen.has(id)) continue;
            seen.add(id);
            newIds += 1;
            const row = parsePost(post, username);
            if (row && sample.posts.length < perUser) sample.posts.push(row);
          }
          GM_setValue(STORE_KEY, dataset);
          console.info('[UCF Style] cache:checkpoint', { account: userIndex + 1, posts: sample.posts.length });
          // Also break on repeated pages; avoid an endless loop on site-side search caps.
          if (payload.posts.length === 0 || newIds === 0) break;
          // Honor the explicit server pagination end when it is present; absent/unknown values remain compatible with older payloads.
          if (payload.grouped_search_result?.more_posts === false) break;
          panel.progress.value = Math.min(99, Math.round(100 * (userIndex + sample.posts.length / perUser) / users.length));
        }
      }
      panel.status.textContent = `采集结束。请求 ${requestCount} 次；${dataset.users.map((u) => '@' + u.username + ': ' + u.posts.length).join('，')}。\n仅保存可访问的公开搜索结果摘要。`;
    } catch (error) {
      console.warn('[UCF Style] collection:stopped', { requests: requestCount, cancelled: stopRequested, error: error instanceof Error ? error.message : String(error) });
      panel.status.textContent = `已停止：${(error instanceof Error ? error.message : String(error))}。\n部分结果会保存。请求次数：${requestCount}`;
    } finally {
      running = false;
      controller = null;
      panel.stop.disabled = true;
      panel.close.disabled = false;
      panel.progress.value = 100;
      try {
        GM_setValue(STORE_KEY, dataset);
        console.info('[UCF Style] collection:saved', { accounts: dataset.users.length, requests: requestCount, cancelled: stopRequested });
      } catch (error) {
        console.error('[UCF Style] cache:save-error', error);
        panel.status.textContent += '\n缓存保存失败，请检查浏览器控制台。';
      }
    }
  }

  GM_registerMenuCommand('采集写作样本', () => { void start(); });
  GM_registerMenuCommand('导出缓存 JSON', saveJson);
  GM_registerMenuCommand('清除本地采样缓存', () => {
    if (window.confirm('确定删除此脚本保存的采样数据吗？')) GM_deleteValue(STORE_KEY);
  });
})();
