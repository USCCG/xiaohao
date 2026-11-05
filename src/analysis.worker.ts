/// <reference lib="webworker" />
import { analyze } from './analysis';
import type { WorkerMessage, WorkerRequest } from './types';

// Authored by LLM, model GPT-6
const send = (message: WorkerMessage) => self.postMessage(message);
// Authored by LLM, model GPT-6
const progress = (percent: number, detail: string) => send({ type: 'PROGRESS', percent, detail });

// Edited by LLM, model GPT-6
self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  if (event.data?.type !== 'ANALYZE') return;
  try {
    send({ type: 'RESULT', result: analyze(event.data.dataset, progress) });
  } catch (error) {
    send({ type: 'ERROR', message: error instanceof Error ? error.message : String(error) });
  }
};
