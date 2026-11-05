// Reuse the analyzer's versioned data contract without adding runtime imports.
type CollectorDataset = import('../src/types').Dataset;
type CollectorPost = import('../src/types').PostSample;
type CollectorOrder = import('../src/types').SearchOrder;

// Authored by LLM, model GPT-6
declare function GM_registerMenuCommand(name: string, callback: () => void): void;
// Authored by LLM, model GPT-6
declare function GM_getValue<T>(key: string, fallback: T): T;
// Authored by LLM, model GPT-6
declare function GM_setValue(key: string, value: CollectorDataset): void;
// Authored by LLM, model GPT-6
declare function GM_deleteValue(key: string): void;
