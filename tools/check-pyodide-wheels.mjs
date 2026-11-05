#!/usr/bin/env node
// Authored by LLM, model DeepSeek V4.1 Flash Free
// Verify the vendored Pyodide wheels without touching the network.
// The build config reads these files directly; run this before dev/build so a
// missing or corrupted wheel fails with a clear message.
import { createHash } from 'node:crypto';
import { access, readFile, stat } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pyodideDir = join(root, 'node_modules', 'pyodide');
const wheelsDir = join(root, 'vendor', 'pyodide-wheels');
const requiredPackages = ['numpy', 'scipy', 'scikit-learn', 'joblib', 'threadpoolctl'];

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function sha256(path) {
  const data = await readFile(path);
  return createHash('sha256').update(data).digest('hex');
}

const lock = JSON.parse(await readFile(join(pyodideDir, 'pyodide-lock.json'), 'utf8'));
for (const name of requiredPackages) {
  const entry = lock.packages[name];
  if (!entry) throw new Error(`Pyodide lockfile 缺少包：${name}`);
  const path = join(wheelsDir, entry.file_name);
  if (!(await exists(path))) {
    throw new Error(`缺少离线 wheel：${path}\n请从已准备好的离线包恢复 vendor/pyodide-wheels/。`);
  }
  const saved = await sha256(path);
  if (saved !== entry.sha256) {
    throw new Error(`离线 wheel 校验失败：${path}\n期望 ${entry.sha256}\n实际 ${saved}`);
  }
  const size = (await stat(path)).size;
  console.info(`[pyodide] verified ${entry.name} ${entry.version} (${(size / 1_048_576).toFixed(1)} MB)`);
}
console.info(`[pyodide] offline wheels ready: ${wheelsDir}`);
