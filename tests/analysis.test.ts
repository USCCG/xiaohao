import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { analyze } from '../src/analysis.ts';
import type { Dataset } from '../src/types';

const fixture = JSON.parse(await readFile(resolve('fixtures/synthetic.json'), 'utf8')) as Dataset;

// Authored by LLM, model GPT-6
test('synthetic data produces a symmetric finite matrix, diagnostics and monotonic progress', () => {
  const updates: Array<{ percent: number; detail: string }> = [];
  // Authored by LLM, model GPT-6
  const result = analyze(fixture, (percent, detail) => updates.push({ percent, detail }));
  assert.equal(result.matrix.length, 3);
  for (let i = 0; i < 3; i++) {
    assert.equal(result.matrix[i][i], 1);
    for (let j = 0; j < 3; j++) {
      assert.ok(Number.isFinite(result.matrix[i][j]));
      assert.ok(result.matrix[i][j] >= 0 && result.matrix[i][j] <= 1);
      assert.equal(result.matrix[i][j], result.matrix[j][i]);
    }
    assert.ok(result.diagnostics[i].posts >= 2);
    assert.ok(result.diagnostics[i].characters > 250);
    const splitHalf = result.diagnostics[i].splitHalf;
    assert.ok(splitHalf !== null && splitHalf >= 0 && splitHalf <= 1);
  }
  assert.equal(result.pairs?.length, 3);
  for (const pair of result.pairs ?? []) {
    assert.ok(pair.profile >= 0 && pair.profile <= 1);
    assert.ok(pair.functionWords >= 0 && pair.functionWords <= 1);
    assert.ok(pair.punctuation >= 0 && pair.punctuation <= 1);
    assert.ok(pair.combined >= 0 && pair.combined <= 1);
    assert.ok(pair.relative === null || pair.relative >= 0);
    assert.ok(pair.backgroundLift !== null && Number.isFinite(pair.backgroundLift));
    assert.ok(pair.deltaSimilarity === null || (pair.deltaSimilarity >= 0 && pair.deltaSimilarity <= 1));
  }
  assert.ok(updates.length > 3);
  assert.equal(updates.at(-1)?.percent, 100);
  for (let i = 1; i < updates.length; i++) assert.ok(updates[i].percent >= updates[i - 1].percent);
});

// Authored by LLM, model GPT-6
test('identical samples score higher than unrelated controls', () => {
  const data = structuredClone(fixture);
  data.users[1].posts = structuredClone(data.users[0].posts);
  const result = analyze(data);
  assert.ok(result.matrix[0][1] > 0.999);
  assert.ok(result.matrix[0][1] > result.matrix[0][2] + 0.1);
});

// Authored by LLM, model GPT-6
test('insufficient text fails clearly; one post has no split-half estimate', () => {
  const data = structuredClone(fixture);
  data.users[0].posts = [{ id: 1, text: 'short', quality: 'excerpt' }];
  // Authored by LLM, model GPT-6
  assert.throws(() => analyze(data), /250/);
  data.users[0].posts[0].text = '这是完全虚构的测试文本，不涉及真实论坛的任何用户。'.repeat(12);
  const result = analyze(data);
  assert.equal(result.diagnostics[0].posts, 1);
  assert.equal(result.diagnostics[0].splitHalf, null);
});
