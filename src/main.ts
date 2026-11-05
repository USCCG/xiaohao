import './style.css';
import { isRecord, parseDataset } from './dataset';
import demo from '../fixtures/synthetic.json';
import type { Dataset, AnalysisResult, PairSummary, WorkerMessage } from './types';

const LOADING_MESSAGES = {
  dario: '正在蒸馏达里奥…',
  altman: '正在征收奥特曼的内存…',
  amex: '正在和运通客服扯皮…',
  citi: '正在奋战花旗渣IT…',
  chase: '正在被大通杀全家…',
  hukou: '正在出你户籍…',
  usccg: '正在搬运白金区帖子到小红书…',
  crap: '正在从一亩三分地搬运狗屎…',
  deepseek: '正在调戏蓝色大肥鱼…',
} as const;

const loadingMessageList = Object.values(LOADING_MESSAGES);
function loadingMessage(percent: number): string {
  const index = Math.min(loadingMessageList.length - 1,
    Math.max(0, Math.floor((Math.max(0, percent) / 101) * loadingMessageList.length)));
  return loadingMessageList[index];
}

const PROTOCOL = 'ucf-style-bridge-v1';
const REQUEST_EVENT = 'ucf-style-bridge-request';
const RESPONSE_EVENT = 'ucf-style-bridge-response';
// Edited by LLM, model GPT-6
const $ = <T extends Element>(selector: string) => {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`DOM element missing: ${selector}`);
  return element;
};
const bridgeStatus = $<HTMLParagraphElement>('#bridge-status');
console.info('[UCF Style] analyzer:start', { origin: window.location.origin });
const loadButton = $<HTMLButtonElement>('#bridge-load');
const demoButton = $<HTMLButtonElement>('#demo-load');
const fileInput = $<HTMLInputElement>('#file-input');
const analyzeButton = $<HTMLButtonElement>('#analyze');
const cancelButton = $<HTMLButtonElement>('#cancel');
const progressBar = $<HTMLProgressElement>('#progress');
const statusLabel = $<HTMLParagraphElement>('#status');
const datasetInfo = $<HTMLParagraphElement>('#dataset-info');
const resultsSection = $<HTMLElement>('#results');
const matrixContainer = $<HTMLDivElement>('#matrix-container');
const diagnosticsContainer = $<HTMLDivElement>('#diagnostics');
const metricSelect = $<HTMLSelectElement>('#metric-select');
const engineSelect = $<HTMLSelectElement>('#engine-select');
const engineNote = $<HTMLParagraphElement>('#engine-note');
let dataset: Dataset | null = null;
let currentResult: AnalysisResult | null = null;
let currentWorker: Worker | null = null;
let pendingBridgeId: string | null = null;
let bridgeTimeout: ReturnType<typeof setTimeout> | undefined;
let loadVersion = 0;

// Edited by LLM, model GPT-6
function setStatus(message: string) { statusLabel.textContent = message; }

// Authored by LLM, model GPT-6
function endBridgeRequest() {
  clearTimeout(bridgeTimeout);
  pendingBridgeId = null;
  loadButton.disabled = false;
}

// Authored by LLM, model GPT-6
function updateButtons() {
  let hasEmptyAccount = false;
  for (const user of dataset?.users ?? []) if (!user.posts.length) hasEmptyAccount = true;
  analyzeButton.disabled = !dataset || hasEmptyAccount || currentWorker !== null;
  cancelButton.disabled = currentWorker === null;
  engineSelect.disabled = currentWorker !== null;
}

// Authored by LLM, model DeepSeek V4.1 Flash Free
type Engine = 'typescript' | 'python';

// Authored by LLM, model DeepSeek V4.1 Flash Free
function selectedEngine(): Engine {
  return engineSelect.value === 'python' ? 'python' : 'typescript';
}

// Authored by LLM, model DeepSeek V4.1 Flash Free
function updateEngineNote() {
  engineNote.textContent = selectedEngine() === 'python'
    ? '默认引擎：首次加载本地 Pyodide + NumPy/SciPy/scikit-learn，约 34 MB；全部在 Web Worker 内运行，数据不上传。'
    : 'TypeScript 对照引擎：轻量，无需 Python 运行时。';
}

// Edited by LLM, model GPT-6
function loadDataset(payload: unknown, synthetic = false) {
  // Validate first so a failed import does not discard a working analysis.
  const parsed = parseDataset(payload);
  currentWorker?.terminate();
  currentWorker = null;
  endBridgeRequest();
  dataset = parsed;
  currentResult = null;
  matrixContainer.replaceChildren();
  diagnosticsContainer.replaceChildren();
  let excerpts = 0;
  let count = 0;
  const details: string[] = [];
  let hasEmptyAccount = false;
  for (const user of parsed.users) {
    details.push(`@${user.username}: ${user.posts.length} 条`);
    if (!user.posts.length) hasEmptyAccount = true;
    for (const post of user.posts) {
      count++;
      if (post.quality === 'excerpt') excerpts++;
    }
  }
  datasetInfo.textContent = `${synthetic ? '合成示例（非真实论坛数据） · ' : ''}${details.join('，')} · ${parsed.order} 排序 · 摘要 ${excerpts}/${count} 条 · 采集 ${parsed.capturedAt}`;
  updateButtons();
  resultsSection.hidden = true;
  progressBar.value = 0;
  setStatus(hasEmptyAccount ? '已载入部分结果；有账号尚无样本，请补齐后再比较。'
    : excerpts ? '数据已载入。搜索摘要不等于发言全文；点击开始分析。' : '数据已载入，点击开始分析。');
}

// Edited by LLM, model GPT-6
function createCell(tag: 'th' | 'td', text: string): HTMLTableCellElement {
  const cell = document.createElement(tag);
  cell.textContent = text;
  return cell;
}

// Authored by LLM, model GPT-6
type MetricKey = 'profile' | 'combined' | 'functionWords' | 'punctuation' | 'deltaSimilarity' | 'topicOverlap' | 'relative' | 'backgroundLift';

// Authored by LLM, model GPT-6
const METRICS: Array<{ key: MetricKey; label: string }> = [
  { key: 'profile', label: '风格 profile' },
  { key: 'combined', label: '综合排序' },
  { key: 'functionWords', label: '功能词' },
  { key: 'punctuation', label: '标点' },
  { key: 'deltaSimilarity', label: 'Burrows Delta' },
  { key: 'topicOverlap', label: '共同话题' },
  { key: 'relative', label: '相对一致性' },
  { key: 'backgroundLift', label: '组内提升' },
];

// Authored by LLM, model GPT-6
function selectedMetric(): MetricKey {
  const value = String(metricSelect.value || 'profile');
  return METRICS.some((metric) => metric.key === value) ? value as MetricKey : 'profile';
}

// Authored by LLM, model GPT-6
function findPair(result: AnalysisResult, left: number, right: number): PairSummary | null {
  const leftName = result.usernames[left];
  const rightName = result.usernames[right];
  for (const pair of result.pairs ?? []) {
    if ((pair.left === leftName && pair.right === rightName)
      || (pair.left === rightName && pair.right === leftName)) return pair;
  }
  return null;
}

// Authored by LLM, model GPT-6
function metricValue(result: AnalysisResult, pair: PairSummary | null, left: number, right: number, metric: MetricKey): number | null {
  if (pair) {
    const value = pair[metric];
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
  }
  // Older result objects only carry the profile matrix, not the pair rows.
  const value = result.matrix[left]?.[right];
  return metric === 'profile' && typeof value === 'number' && Number.isFinite(value) ? value : null;
}

// Authored by LLM, model GPT-6
function formatMetric(metric: MetricKey, value: number | null): string {
  if (value === null) return '—';
  const text = value.toFixed(3);
  return metric === 'backgroundLift' && value > 0 ? `+${text}` : text;
}

// Authored by LLM, model GPT-6
type MetricRange = { min: number; max: number; maxAbs: number };

// Authored by LLM, model GPT-6
function metricRange(result: AnalysisResult, metric: MetricKey): MetricRange {
  const values: number[] = [];
  for (let left = 0; left < result.usernames.length; left += 1) {
    for (let right = left + 1; right < result.usernames.length; right += 1) {
      const value = metricValue(result, findPair(result, left, right), left, right, metric);
      if (value !== null) values.push(value);
    }
  }
  if (!values.length) return { min: 0, max: 1, maxAbs: 0.1 };
  const min = Math.min(...values);
  const max = Math.max(...values);
  const maxAbs = Math.max(...values.map((value) => metric === 'relative' ? Math.abs(value - 1) : Math.abs(value)));
  return { min, max, maxAbs };
}

// Authored by LLM, model GPT-6
function heatColor(metric: MetricKey, value: number | null, range: MetricRange): string | null {
  if (value === null) return null;
  if (metric === 'backgroundLift' || metric === 'relative') {
    const delta = metric === 'relative' ? value - 1 : value;
    if (Math.abs(delta) < 1e-9) return 'hsl(145 12% 94%)';
    const floor = metric === 'relative' ? 0.05 : 0.02;
    const intensity = Math.min(1, Math.abs(delta) / Math.max(range.maxAbs, floor));
    return `hsl(${delta > 0 ? 145 : 0} 60% ${96 - intensity * 28}%)`;
  }
  const span = range.max - range.min;
  const intensity = span > 1e-9 ? (value - range.min) / span : value;
  return `hsl(145 55% ${96 - Math.max(0, Math.min(1, intensity)) * 32}%)`;
}

// Authored by LLM, model GPT-6
function metricCaption(metric: MetricKey, authors: number): string {
  const label = METRICS.find((item) => item.key === metric)?.label ?? metric;
  if (metric === 'backgroundLift') {
    return authors < 3
      ? `账号对矩阵 · ${label} · 组内背景需要至少 3 个账号`
      : `账号对矩阵 · ${label} · 绿=高于组内背景，红=低于背景`;
  }
  if (metric === 'relative') return `账号对矩阵 · ${label} · 绿=高于自身拆半基线，红=低于基线`;
  if (metric === 'topicOverlap') return `账号对矩阵 · ${label} · 话题重合不是风格证据；颜色按当前范围归一化`;
  return `账号对矩阵 · ${label} · 颜色按当前矩阵范围归一化（单对时按绝对值；越深越相似）`;
}

// Authored by LLM, model GPT-6
function pairTitle(pair: PairSummary | null): string {
  if (!pair) return '没有候选对数据';
  const lift = pair.backgroundLift === null ? '—' : `${pair.backgroundLift > 0 ? '+' : ''}${pair.backgroundLift.toFixed(3)}`;
  const relative = pair.relative === null ? '—' : pair.relative.toFixed(3);
  const delta = pair.deltaSimilarity === null ? '—' : pair.deltaSimilarity.toFixed(3);
  const stability = pair.stability === null ? '—' : pair.stability.toFixed(3);
  return [
    `${pair.left} ~ ${pair.right}`,
    `综合排序：${pair.combined.toFixed(3)}`,
    `风格 profile：${pair.profile.toFixed(3)}`,
    `组内提升：${lift}`,
    `相对一致性：${relative}`,
    `功能词：${pair.functionWords.toFixed(3)}`,
    `标点：${pair.punctuation.toFixed(3)}`,
    `Delta：${delta}`,
    `共同话题：${pair.topicOverlap.toFixed(3)}`,
    `拆半稳定性：${stability}`,
  ].join('\n');
}

// Authored by LLM, model GPT-6
function renderMatrix(result: AnalysisResult, metric: MetricKey) {
  matrixContainer.replaceChildren();
  const table = document.createElement('table');
  const caption = document.createElement('caption');
  caption.textContent = metricCaption(metric, result.usernames.length);
  table.append(caption);
  const thead = document.createElement('thead');
  const heading = document.createElement('tr');
  heading.append(createCell('th', '账号'));
  for (const username of result.usernames) {
    const cell = createCell('th', username);
    cell.scope = 'col';
    heading.append(cell);
  }
  thead.append(heading);
  table.append(thead);
  const tbody = document.createElement('tbody');
  const range = metricRange(result, metric);
  for (let row = 0; row < result.usernames.length; row += 1) {
    const tr = document.createElement('tr');
    const label = createCell('th', result.usernames[row]);
    label.scope = 'row';
    tr.append(label);
    for (let column = 0; column < result.usernames.length; column += 1) {
      if (row === column) {
        const cell = createCell('td', '—');
        cell.title = '自比较不计入候选';
        cell.style.color = '#8a96a6';
        tr.append(cell);
        continue;
      }
      const pair = findPair(result, row, column);
      const value = metricValue(result, pair, row, column, metric);
      const cell = createCell('td', formatMetric(metric, value));
      cell.title = pairTitle(pair);
      const color = heatColor(metric, value, range);
      if (color) cell.style.backgroundColor = color;
      tr.append(cell);
    }
    tbody.append(tr);
  }
  table.append(tbody);
  matrixContainer.append(table);
}

// Edited by LLM, model GPT-6
function renderResult(result: AnalysisResult) {
  currentResult = result;
  renderMatrix(result, selectedMetric());
  diagnosticsContainer.replaceChildren();
  const heading2 = document.createElement('h3');
  heading2.textContent = '样本量与拆半一致性';
  const detail = document.createElement('table');
  const headRow = document.createElement('tr');
  for (const label of ['账号', '帖子数', '字符数', '拆半一致性']) headRow.append(createCell('th', label));
  detail.append(headRow);
  for (const row of result.diagnostics) {
    const tr = document.createElement('tr');
    for (const value of [row.username, String(row.posts), String(row.characters), row.splitHalf === null ? '样本不足' : row.splitHalf.toFixed(3)]) {
      tr.append(createCell('td', value));
    }
    detail.append(tr);
  }
  diagnosticsContainer.append(heading2, detail);
  const candidateHeading = document.createElement('h3');
  candidateHeading.textContent = '候选账号对明细（全部指标）';
  const candidateNote = document.createElement('p');
  candidateNote.className = 'muted';
  candidateNote.textContent = '矩阵上方可切换指标；颜色只用于当前矩阵内比较。综合排序 = 风格 profile 60% + 功能词 20% + 标点 20%；组内提升 = 该对 profile 减去两名账号各自与其他账号的平均 profile；相对一致性 = profile ÷ 两侧较高的拆半一致性（越接近或超过 1 越值得复核）。Delta 是 Burrows Delta 的单调映射。这里只生成人工复核线索，不是小号或身份判断；IP 日志需另行核查，NAT、VPN 和共享网络会造成假阳性。';
  const candidates = document.createElement('table');
  const candidateHead = document.createElement('tr');
  for (const label of ['账号 A', '账号 B', '综合排序', '风格 profile', '组内提升', '相对一致性', '功能词', '标点', 'Delta', '共同话题', '稳定性']) {
    candidateHead.append(createCell('th', label));
  }
  candidates.append(candidateHead);
  for (const pair of result.pairs ?? []) {
    const row = document.createElement('tr');
    for (const value of [
      pair.left,
      pair.right,
      pair.combined.toFixed(3),
      pair.profile.toFixed(3),
      pair.backgroundLift === null ? '样本不足' : `${pair.backgroundLift >= 0 ? '+' : ''}${pair.backgroundLift.toFixed(3)}`,
      pair.relative === null ? '样本不足' : pair.relative.toFixed(3),
      pair.functionWords.toFixed(3),
      pair.punctuation.toFixed(3),
      pair.deltaSimilarity === null ? '样本不足' : pair.deltaSimilarity.toFixed(3),
      pair.topicOverlap.toFixed(3),
      pair.stability === null ? '样本不足' : pair.stability.toFixed(3),
    ]) row.append(createCell('td', value));
    candidates.append(row);
  }
  diagnosticsContainer.append(candidateHeading, candidateNote, candidates);
  if (result.style?.length) {
    const styleHeading = document.createElement('h3');
    styleHeading.textContent = '账号写作特征';
    const styleTable = document.createElement('table');
    const styleHead = document.createElement('tr');
    for (const label of ['账号', '帖子数', '平均字符', '中文比例', '拉丁字母', '数字', '空白', '标点', '问叹号', 'URL', '重复标点']) {
      styleHead.append(createCell('th', label));
    }
    styleTable.append(styleHead);
    for (const row of result.style) {
      const values = [row.username, String(row.posts), row.averageCharacters.toFixed(1), row.cjkRatio.toFixed(3),
        row.latinRatio.toFixed(3), row.digitRatio.toFixed(3), row.whitespaceRatio.toFixed(3),
        row.punctuationRatio.toFixed(3), row.questionExclamationRate.toFixed(3), row.urlRate.toFixed(3),
        row.repeatedPunctuationRate.toFixed(3)];
      const tr = document.createElement('tr');
      for (const value of values) tr.append(createCell('td', value));
      styleTable.append(tr);
    }
    diagnosticsContainer.append(styleHeading, styleTable);
  }
  resultsSection.hidden = false;
}

// Edited by LLM, model GPT-6
function stopAnalysis() {
  currentWorker?.terminate();
  currentWorker = null;
  progressBar.value = 0;
  updateButtons();
  setStatus('已取消，可重新开始分析。');
}

// Edited by LLM, model GPT-6
function startAnalysis() {
  if (!dataset || currentWorker || analyzeButton.disabled) return;
  const engine = selectedEngine();
  resultsSection.hidden = true;
  progressBar.value = 0;
  setStatus(loadingMessage(0));
  try {
    const worker = engine === 'python'
      ? new Worker(new URL('./analysis-python.worker.ts', import.meta.url), { type: 'module' })
      : new Worker(new URL('./analysis.worker.ts', import.meta.url), { type: 'module' });
    currentWorker = worker;
    updateButtons();
    // Edited by LLM, model GPT-6
    worker.onmessage = (event: MessageEvent<WorkerMessage>) => {
      if (worker !== currentWorker) return;
      const message = event.data;
      if (message.type === 'PROGRESS') {
        progressBar.value = message.percent;
        setStatus(`${loadingMessage(message.percent)} ${message.detail}`);
        return;
      }
      worker.terminate();
      currentWorker = null;
      updateButtons();
      if (message.type === 'RESULT') {
        renderResult(message.result);
        progressBar.value = 100;
        setStatus(engine === 'python'
          ? '完成（Python/scikit 实验引擎）。仅反映样本文本的相似度，不是作者身份判断。'
          : '完成。仅反映样本文本的相似度，不是作者身份判断。');
      } else {
        setStatus(`分析失败：${message.message}${engine === 'python' ? '。可切回 TypeScript 引擎。' : ''}`);
      }
    };
    // Edited by LLM, model GPT-6
    worker.onerror = (event) => {
      event.preventDefault();
      if (currentWorker !== worker) return;
      stopAnalysis();
      setStatus(engine === 'python'
        ? 'Python Worker 无法运行，请检查浏览器控制台或 Pyodide 资源；可切回 TypeScript 引擎。'
        : 'Worker 无法运行，请检查浏览器控制台、依赖或构建输出。');
    };
    if (engine === 'python') {
      const pyodideIndexUrl = new URL('assets/pyodide/', document.baseURI).href;
      worker.postMessage({ type: 'ANALYZE_PYTHON', dataset, pyodideIndexUrl });
    } else {
      worker.postMessage({ type: 'ANALYZE', dataset });
    }
  } catch (error) {
    stopAnalysis();
    setStatus(`无法启动分析：${error instanceof Error ? error.message : String(error)}`);
  }
}

// Authored by LLM, model GPT-6
function sendBridgeRequest(type: 'HELLO' | 'REQUEST_DATA', requestId?: string) {
  document.dispatchEvent(new CustomEvent(REQUEST_EVENT, {
    detail: JSON.stringify({ protocol: PROTOCOL, type, requestId }),
  }));
}

// Authored by LLM, model GPT-6
function receiveBridgeMessage(msg: unknown) {
  if (!isRecord(msg) || msg.protocol !== PROTOCOL) return;
  if (msg.type === 'READY') {
    bridgeStatus.textContent = `油猴桥接已连接 · 版本 ${typeof msg.version === 'string' ? msg.version : '未知'}`;
    console.info('[UCF Style] bridge:ready', { version: msg.version });
    // A userscript may start after the user clicked; replay only that pending request.
    if (pendingBridgeId) sendBridgeRequest('REQUEST_DATA', pendingBridgeId);
    return;
  }
  if (!pendingBridgeId || msg.requestId !== pendingBridgeId || (msg.type !== 'DATA' && msg.type !== 'ERROR')) return;
  console.info('[UCF Style] bridge:reply', { requestId: pendingBridgeId, type: msg.type });
  endBridgeRequest();
  bridgeStatus.textContent = '油猴桥接已连接';
  if (msg.type === 'ERROR') {
    setStatus(`油猴缓存读取失败：${typeof msg.message === 'string' ? msg.message : '未知错误'}`);
    console.error('[UCF Style] bridge:storage-error', { message: msg.message });
    return;
  }
  if (msg.dataset === null) {
    setStatus('油猴脚本暂无缓存。请先在 USCardForum 采集；论坛与本页须使用同一份脚本、同一浏览器配置。');
    return;
  }
  try { loadDataset(msg.dataset); }
  catch (error) { setStatus(`载入失败：${error instanceof Error ? error.message : String(error)}`); }
}

// Authored by LLM, model GPT-6
document.addEventListener(RESPONSE_EVENT, (event) => {
  const detail: unknown = (event as CustomEvent<unknown>).detail;
  if (typeof detail !== 'string') return;
  try { receiveBridgeMessage(JSON.parse(detail)); }
  catch { console.warn('[UCF Style] bridge:invalid-response'); }
});

// Edited by LLM, model GPT-6
window.addEventListener('message', (event: MessageEvent) => {
  if (event.source !== window || event.origin !== window.location.origin) return;
  receiveBridgeMessage(event.data);
});

// Edited by LLM, model GPT-6
loadButton.addEventListener('click', () => {
  loadVersion++;
  endBridgeRequest();
  const requestId = crypto.randomUUID();
  pendingBridgeId = requestId;
  loadButton.disabled = true;
  setStatus('正在请求油猴缓存…');
  console.info('[UCF Style] bridge:request', { requestId, origin: window.location.origin });
  // Arm before dispatch: DOM replies can be synchronous.
  // Edited by LLM, model GPT-6
  bridgeTimeout = setTimeout(() => {
    if (pendingBridgeId !== requestId) return;
    endBridgeRequest();
    bridgeStatus.textContent = '未检测到可用的油猴桥接';
    setStatus('未收到油猴回复。请在当前本地页的油猴菜单确认此脚本正在运行，更新脚本后刷新论坛和本页；也可导入 JSON。');
    console.warn('[UCF Style] bridge:timeout', { requestId, origin: window.location.origin,
      hint: 'Confirm the same userscript is enabled on this exact URL; inspect extension site access and userscript execution permission.' });
  }, 5000);
  sendBridgeRequest('REQUEST_DATA', requestId);
  // Older installed scripts only implement window.postMessage.
  if (pendingBridgeId === requestId) window.postMessage({ protocol: PROTOCOL, type: 'REQUEST_DATA', requestId }, window.location.origin);
});

// Authored by LLM, model GPT-6
demoButton.addEventListener('click', () => {
  loadVersion++;
  loadDataset(demo, true);
});

// Edited by LLM, model GPT-6
fileInput.addEventListener('change', async () => {
  const file = fileInput.files?.[0];
  if (!file) return;
  const version = ++loadVersion;
  endBridgeRequest();
  try {
    if (file.size > 20_000_000) throw new Error('JSON 文件最大 20 MB。');
    const text = await file.text();
    if (version !== loadVersion) return;
    loadDataset(JSON.parse(text));
  } catch (error) {
    if (version === loadVersion) setStatus(`导入失败：${error instanceof Error ? error.message : String(error)}`);
  } finally {
    if (version === loadVersion) fileInput.value = '';
  }
});
// Authored by LLM, model GPT-6
metricSelect.addEventListener('change', () => {
  if (currentResult) renderMatrix(currentResult, selectedMetric());
});

// Authored by LLM, model DeepSeek V4.1 Flash Free
engineSelect.addEventListener('change', updateEngineNote);
updateEngineNote();

analyzeButton.addEventListener('click', startAnalysis);
cancelButton.addEventListener('click', stopAnalysis);

// Probe readiness without reading any cached data until the user clicks.
sendBridgeRequest('HELLO');
