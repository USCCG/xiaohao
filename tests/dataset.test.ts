import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parseDataset } from '../src/dataset.ts';
import type { Dataset } from '../src/types';

type InvalidDataset = Record<string, unknown> & { users: Array<{ username: string; posts: Array<Record<string, unknown>> }> };

const fixture = JSON.parse(await readFile(resolve('fixtures/synthetic.json'), 'utf8')) as Dataset;

// Authored by LLM, model GPT-6
test('accepts synthetic input and partial datasets with empty accounts', () => {
  assert.deepEqual(parseDataset(fixture), fixture);
  const partial = structuredClone(fixture);
  partial.users[1].posts = [];
  assert.deepEqual(parseDataset(partial), partial);
});

// Authored by LLM, model GPT-6
test('rejects unsupported metadata, duplicate authors, bad IDs and oversized payloads', () => {
  const mutations: Array<(dataset: InvalidDataset) => void> = [
    // Authored by LLM, model GPT-6
    d => { d.version = 2; },
    // Authored by LLM, model GPT-6
    d => { d.source = 'https://other.example'; },
    // Authored by LLM, model GPT-6
    d => { d.order = 'invalid'; },
    // Authored by LLM, model GPT-6
    d => { d.capturedAt = 'invalid'; },
    // Authored by LLM, model GPT-6
    d => { d.users.length = 1; },
    // Authored by LLM, model GPT-6
    d => { d.users[0].username = ' '; },
    // Authored by LLM, model GPT-6
    d => { d.users[1].username = d.users[0].username.toUpperCase(); },
    // Authored by LLM, model GPT-6
    d => { d.users[0].posts[0].id = 0; },
    // Authored by LLM, model GPT-6
    d => { d.users[0].posts[1].id = d.users[0].posts[0].id; },
    // Authored by LLM, model GPT-6
    d => { d.users[0].posts[0].quality = 'unknown'; },
    // Authored by LLM, model GPT-6
    d => { d.users[0].posts[0].text = 'x'.repeat(30001); },
    // Authored by LLM, model GPT-6
    d => { d.users[0].posts[0].topicId = -1; },
    // Authored by LLM, model GPT-6
    d => { d.users[0].posts = Array(501).fill(d.users[0].posts[0]); },
  ];
  for (const mutate of mutations) {
    const data = structuredClone(fixture) as unknown as InvalidDataset;
    mutate(data);
    // Authored by LLM, model GPT-6
    assert.throws(() => parseDataset(data));
  }
});
