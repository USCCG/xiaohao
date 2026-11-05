import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { analyze } from '../.test-build/src/analysis.js';

// Authored by LLM, model DeepSeek V4.1 Flash Free
function fixed(value, digits = 3) {
  return typeof value === 'number' && Number.isFinite(value) ? value.toFixed(digits) : '—';
}

const files = process.argv.slice(2);
if (!files.length) {
  console.error('用法: node tools/analyze-json.mjs <dataset.json> [more.json ...]');
  console.error('先运行 yarn build:tests，或直接使用 yarn evaluate <dataset.json>。');
  process.exit(1);
}

let failed = false;
for (const file of files) {
  try {
    const dataset = JSON.parse(await readFile(resolve(file), 'utf8'));
    const result = analyze(dataset);
    console.log(`\n=== ${file}`);
    console.log(`账号: ${result.usernames.join(', ')}`);
    console.log('样本:');
    for (const row of result.diagnostics) {
      console.log(`  ${row.username}: posts=${row.posts} chars=${row.characters} splitHalf=${fixed(row.splitHalf)}`);
    }
    console.log('字符 profile 矩阵:');
    console.log(`  ${['', ...result.usernames].map((value) => value.padEnd(12)).join('')}`);
    for (const [index, row] of result.matrix.entries()) {
      console.log(`  ${[result.usernames[index], ...row.map((value) => fixed(value))].map((value) => value.padEnd(12)).join('')}`);
    }
    console.log('候选账号对（按综合排序）:');
    for (const pair of result.pairs ?? []) {
      const lift = typeof pair.backgroundLift === 'number' ? `${pair.backgroundLift >= 0 ? '+' : ''}${fixed(pair.backgroundLift)}` : '—';
      console.log(`  ${pair.left} ~ ${pair.right}: combined=${fixed(pair.combined)} profile=${fixed(pair.profile)} lift=${lift} relative=${fixed(pair.relative)} function=${fixed(pair.functionWords)} punctuation=${fixed(pair.punctuation)} delta=${fixed(pair.deltaSimilarity)} style=${fixed(pair.style)} topic=${fixed(pair.topicOverlap)} stability=${fixed(pair.stability)}`);
    }
  } catch (error) {
    failed = true;
    console.error(`\n=== ${file}\n失败: ${error instanceof Error ? error.message : String(error)}`);
  }
}
if (failed) process.exitCode = 1;
