#!/usr/bin/env node
// Authored by LLM, model DeepSeek V4.1 Flash Free
// Opt-in smoke test for the Pyodide + scikit-learn engine. It uses the local
// production assets, so run `yarn build` first. It never fetches packages: the
// wheels are vendored and checked by `yarn pyodide:check`.
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadPyodide } from 'pyodide';

const root = resolve(import.meta.dirname, '..');
const indexURL = process.env.PYODIDE_INDEX_URL
  ? `${process.env.PYODIDE_INDEX_URL.replace(/\/$/, '')}/`
  : `${resolve(root, 'dist', 'assets', 'pyodide')}/`;
const fixturePath = process.argv[2] ? resolve(process.argv[2]) : resolve(root, 'fixtures', 'synthetic.json');

if (!existsSync(indexURL)) {
  throw new Error(`找不到 Pyodide 资源：${indexURL}\n请先运行 yarn build（离线 wheel 已随仓库提供）。`);
}

let lastProgress = 0;
const pyodide = await loadPyodide({ indexURL });
await pyodide.loadPackage(['numpy', 'scipy', 'scikit-learn'], {
  messageCallback: (message) => console.info(`[python-engine] ${message}`),
});
await pyodide.runPythonAsync(readFileSync(resolve(root, 'src', 'analysis_python.py'), 'utf8'));

const dataset = JSON.parse(readFileSync(fixturePath, 'utf8'));
pyodide.globals.set('dataset_json', JSON.stringify(dataset));
pyodide.globals.set('progress_callback', (percent, detail) => {
  lastProgress = Math.max(lastProgress, Number(percent) || 0);
  console.info(`[python-engine] ${percent}% ${detail}`);
});
const resultJson = await pyodide.runPythonAsync('analyze_dataset(dataset_json, progress_callback)');
const result = JSON.parse(String(resultJson));

if (result.usernames.length !== dataset.users.length) throw new Error('账号数量不一致');
if (result.matrix.length !== result.usernames.length) throw new Error('矩阵尺寸不一致');
if (result.pairs.length !== (result.usernames.length * (result.usernames.length - 1)) / 2) {
  throw new Error('候选对数量不一致');
}
if (lastProgress !== 100) throw new Error(`进度未完成：${lastProgress}`);
for (const pair of result.pairs) {
  for (const key of ['profile', 'functionWords', 'punctuation', 'style', 'topicOverlap', 'combined']) {
    if (!Number.isFinite(pair[key])) throw new Error(`${pair.left} ~ ${pair.right} 的 ${key} 不是有限数值`);
  }
}

console.info(`[python-engine] OK: ${result.usernames.length} accounts, ${result.pairs.length} pairs`);
for (const pair of result.pairs) {
  console.info(
    `  ${pair.left} ~ ${pair.right}: combined=${pair.combined.toFixed(3)} profile=${pair.profile.toFixed(3)} delta=${pair.deltaSimilarity === null ? '—' : pair.deltaSimilarity.toFixed(3)}`,
  );
}
