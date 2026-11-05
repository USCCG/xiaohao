import type { Dataset } from './types';

// Authored by LLM, model GPT-6
export function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

// Authored by LLM, model GPT-6
function positiveId(value: unknown): boolean {
  return Number.isSafeInteger(value) && Number(value) > 0;
}

// Edited by LLM, model GPT-6
export function parseDataset(payload: unknown): Dataset {
  if (!isRecord(payload) || payload.version !== 1 || payload.source !== 'https://www.uscardforum.com' || !Array.isArray(payload.users)) {
    throw new Error('数据不是支持的 Discourse version=1 格式。');
  }
  if (payload.order !== 'likes' && payload.order !== 'views') throw new Error('排序必须是 likes 或 views。');
  if (typeof payload.capturedAt !== 'string' || !Number.isFinite(Date.parse(payload.capturedAt))) {
    throw new Error('采集时间无效。');
  }
  if (payload.users.length < 2 || payload.users.length > 5) throw new Error('必须提供 2–5 个账号。');
  const usernames = new Set<string>();
  for (const entry of payload.users) {
    if (!isRecord(entry) || typeof entry.username !== 'string'
      || !/^[\p{L}\p{N}_.-]{1,40}$/u.test(entry.username) || !Array.isArray(entry.posts)) {
      throw new Error('users 数据结构或用户名不正确。');
    }
    if (usernames.has(entry.username.toLowerCase())) throw new Error('用户名重复。');
    usernames.add(entry.username.toLowerCase());
    if (entry.posts.length > 500) throw new Error('每账号最多接受 500 条帖子。');
    const ids = new Set<number>();
    for (const post of entry.posts) {
      if (!isRecord(post) || !positiveId(post.id) || typeof post.text !== 'string' || post.text.length > 30_000
        || (post.quality !== 'excerpt' && post.quality !== 'full')
        || (post.topicId !== undefined && !positiveId(post.topicId))
        || (post.createdAt !== undefined && (typeof post.createdAt !== 'string' || !Number.isFinite(Date.parse(post.createdAt))))) {
        throw new Error(`账号 @${entry.username} 包含非法或超长帖子。`);
      }
      if (ids.has(post.id as number)) throw new Error(`账号 @${entry.username} 包含重复帖子。`);
      ids.add(post.id as number);
    }
  }
  return payload as unknown as Dataset;
}
