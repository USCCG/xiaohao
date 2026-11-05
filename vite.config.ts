import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import { viteStaticCopy } from 'vite-plugin-static-copy';

const pyodideDir = dirname(fileURLToPath(import.meta.resolve('pyodide')));
const wheelsDir = join(process.cwd(), 'vendor', 'pyodide-wheels');
const pyodidePackages = new Set(['numpy', 'scipy', 'scikit-learn', 'joblib', 'threadpoolctl']);
const pyodideLock = JSON.parse(readFileSync(join(pyodideDir, 'pyodide-lock.json'), 'utf8'));
const wheelFiles = [...pyodidePackages].map((name) => {
  const entry = pyodideLock.packages[name];
  if (!entry) throw new Error(`Pyodide lockfile 缺少包：${name}`);
  const path = join(wheelsDir, entry.file_name);
  if (!existsSync(path)) {
    throw new Error(`缺少离线 Pyodide wheel：${path}\n请从离线包恢复 vendor/pyodide-wheels/，或运行 yarn pyodide:check 检查。`);
  }
  return path;
});
const coreFiles = ['pyodide.mjs', 'pyodide.asm.mjs', 'pyodide.asm.wasm', 'python_stdlib.zip']
  .map((name) => join(pyodideDir, name));

export default defineConfig({
  base: './',
  optimizeDeps: { exclude: ['pyodide'] },
  worker: { format: 'es' },
  plugins: [
    viteStaticCopy({
      targets: [
        { src: coreFiles, dest: 'assets/pyodide' },
        { src: wheelFiles, dest: 'assets/pyodide' },
        {
          src: join(pyodideDir, 'pyodide-lock.json'),
          dest: 'assets/pyodide',
          // Keep the lockfile small and make it match the locally copied wheels.
          transform: (content) => {
            const lock = JSON.parse(content.toString());
            lock.packages = Object.fromEntries(
              Object.entries(lock.packages).filter(([name]) => pyodidePackages.has(name)),
            );
            return JSON.stringify(lock);
          },
        },
      ],
    }),
  ],
});
