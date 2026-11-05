/// <reference lib="webworker" />
import { loadPyodide } from 'pyodide';
import pythonSource from './analysis_python.py?raw';
import type { AnalysisResult, WorkerMessage, WorkerRequest } from './types';

// Authored by LLM, model DeepSeek V4.1 Flash Free
const send = (message: WorkerMessage) => self.postMessage(message);
// Authored by LLM, model DeepSeek V4.1 Flash Free
const progress = (percent: number, detail: string) => send({ type: 'PROGRESS', percent, detail });

type Runtime = Awaited<ReturnType<typeof loadPyodide>>;
let runtime: Promise<Runtime> | null = null;

// Authored by LLM, model DeepSeek V4.1 Flash Free
async function getRuntime(indexUrl: string): Promise<Runtime> {
  if (!runtime) {
    runtime = (async () => {
      progress(8, '启动 Python/WASM 运行时（首次需加载约 34 MB 静态资源）…');
      const pyodide = await loadPyodide({
        indexURL: indexUrl.endsWith('/') ? indexUrl : `${indexUrl}/`,
      });

      let loaded = 0;
      progress(25, '加载 NumPy / SciPy / scikit-learn…');
      await pyodide.loadPackage(['numpy', 'scipy', 'scikit-learn'], {
        messageCallback: (message) => {
          if (/^Loaded /i.test(message)) loaded += 1;
          progress(Math.min(52, 30 + loaded * 4), `Python 包：${message}`);
        },
        errorCallback: (message) => console.warn('[UCF Style] pyodide:package', message),
      });

      progress(55, 'scikit-learn 已就绪，初始化分析模块…');
      await pyodide.runPythonAsync(pythonSource);
      // The Python function expects a JS callback; keep the 60–99% range for
      // feature extraction and pair scoring, then let the worker send 100%.
      pyodide.globals.set('progress_callback', (percent: number, detail: string) => {
        const bounded = Math.max(0, Math.min(100, Number(percent) || 0));
        progress(60 + Math.round((bounded / 100) * 39), detail);
      });
      progress(60, 'Python 环境就绪');
      return pyodide;
    })().catch((error) => {
      runtime = null;
      throw error;
    });
  }
  return runtime;
}

// Authored by LLM, model DeepSeek V4.1 Flash Free
self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const request = event.data;
  if (request?.type !== 'ANALYZE_PYTHON') return;
  try {
    const pyodide = await getRuntime(request.pyodideIndexUrl);
    pyodide.globals.set('dataset_json', JSON.stringify(request.dataset));
    progress(62, 'Python 正在构建字符 profile…');
    const resultJson = await pyodide.runPythonAsync('analyze_dataset(dataset_json, progress_callback)');
    const result = JSON.parse(String(resultJson)) as AnalysisResult;
    progress(100, '完成');
    send({ type: 'RESULT', result });
  } catch (error) {
    send({ type: 'ERROR', message: error instanceof Error ? error.message : String(error) });
  }
};
