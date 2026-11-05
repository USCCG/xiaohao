const UCF_MAX_TIMEOUT_MS = 2_147_483_647;
const UCF_RETRY_STEP_MS = 5_000;
const UCF_MAX_RETRY_DELAY_MS = 60_000;

// Authored by LLM, model unknown
function ucfWait(ms: number, signal: AbortSignal): Promise<void> {
  const requestedDelay = Number.isFinite(ms) && ms > 0 ? ms : 0;

  return new Promise<void>((resolve, reject) => {
    let remaining = requestedDelay;
    let timer: number | undefined;
    let settled = false;

    // Authored by LLM, model unknown
    function cleanup() {
      if (timer !== undefined) {
        clearTimeout(timer);
        timer = undefined;
      }
      signal.removeEventListener('abort', abort);
    }

    // Authored by LLM, model unknown
    function abort() {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new DOMException('The wait was aborted.', 'AbortError'));
    }

    // Authored by LLM, model unknown
    function schedule() {
      if (signal.aborted) {
        abort();
        return;
      }
      if (remaining <= 0) {
        settled = true;
        cleanup();
        resolve();
        return;
      }
      const delay = Math.min(remaining, UCF_MAX_TIMEOUT_MS);
      remaining -= delay;
      timer = setTimeout(() => {
        timer = undefined;
        schedule();
      }, delay);
    }

    if (signal.aborted) {
      abort();
      return;
    }
    signal.addEventListener('abort', abort, { once: true });
    schedule();
  });
}

// Edited by LLM, model GPT-6
function ucfRetryDelay(consecutive429: number): number {
  return Math.min(consecutive429 * UCF_RETRY_STEP_MS, UCF_MAX_RETRY_DELAY_MS);
}
