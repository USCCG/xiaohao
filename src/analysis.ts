import similarity from 'wink-nlp/utilities/similarity.js';
import type { Dataset, AnalysisResult, PairSummary, StyleSummary } from './types';

type Bow = Record<string, number>;
type Counts = Map<string, number>;

// Classic authorship profiles need enough text to estimate stable feature rates.
// The old chunk-level BM25 baseline produced split-half scores near 0.05 because
// IDF emphasized rare n-grams that never repeat between an author's own halves.
const MIN_POST_CHARACTERS = 25;
const MIN_AUTHOR_CHARACTERS = 250;
const MIN_HALF_CHARACTERS = 200;
const CHAR_NGRAM_MIN = 2;
const CHAR_NGRAM_MAX = 3;
const CHAR_FEATURE_LIMIT = 500;
const FUNCTION_FEATURE_LIMIT = 200;
const PUNCTUATION_FEATURE_LIMIT = 60;
const MIN_FEATURE_AUTHORS = 2;

// Single Han characters keep the feature set independent of a word segmenter.
// They are function words / grammatical glue rather than topic vocabulary.
const CN_FUNCTION = new Set([...'的了是在我你他她它们这那有和就都不也很吗吧啊呢么着过被把让给对从到与而但或及其之以于等个一上下里中大小多少好会能要想说看去来做得地又还再最更才']);
const EN_FUNCTION = new Set('the a an and or but if of to in on at for with is are was were be been being it this that these those i you he she we they my your his her our their as by from not no do does did have has had will would can could should may might must about into over after before than then there here what which who whom whose when where why how all any both each few more most other some such only own same so too very just also'.split(' '));

const URL_RE = /https?:\/\/\S+|www\.\S+/giu;
const EMOJI_RE = /:[a-z0-9_+\-]+:/giu;
const TOPIC_BOILER_RE = /^\s*从\s*https?:\/\/\S+\s*继续讨论[：:]\s*/u;
// ASCII quote prefixes such as "GongBao: ..." are usually quoted text, not the
// author's own sentence. Leave Han prefixes alone: "最近在加的: ..." is authored.
const QUOTE_PREFIX_RE = /^\s*[A-Za-z][A-Za-z0-9_.-]{1,31}\s*[:：]\s+/u;
const FUNCTION_TOKEN_RE = /[A-Za-z]+(?:'[A-Za-z]+)?|[\p{Script=Han}]/gu;
const PUNCTUATION_RE = /:[a-z0-9_+\-]+:|[\p{P}\p{S}]/gu;

// Authored by LLM, model DeepSeek V4.1 Flash Free
function cleanText(text: string): string {
  let value = text.normalize('NFC');
  value = value.replace(TOPIC_BOILER_RE, '');
  value = value.replace(URL_RE, ' ');
  value = value.replace(EMOJI_RE, ' ');
  value = value.replace(QUOTE_PREFIX_RE, '');
  return value.trim();
}

// Authored by LLM, model DeepSeek V4.1 Flash Free
function characterLength(text: string): number {
  return Array.from(text).length;
}

// Authored by LLM, model DeepSeek V4.1 Flash Free
function charNgrams(text: string): string[] {
  const chars = Array.from(cleanText(text));
  const tokens: string[] = [];
  for (let n = CHAR_NGRAM_MIN; n <= CHAR_NGRAM_MAX; n += 1) {
    for (let i = 0; i + n <= chars.length; i += 1) {
      let gram = '';
      let usable = true;
      for (let offset = 0; offset < n; offset += 1) {
        const char = chars[i + offset];
        if (/\s/u.test(char)) {
          usable = false;
          break;
        }
        gram += char;
      }
      if (usable) tokens.push(gram);
    }
  }
  return tokens;
}

// Authored by LLM, model DeepSeek V4.1 Flash Free
function countCharNgrams(texts: string[]): Counts {
  const counts: Counts = new Map();
  for (const text of texts) {
    for (const gram of charNgrams(text)) counts.set(gram, (counts.get(gram) ?? 0) + 1);
  }
  return counts;
}

// Authored by LLM, model DeepSeek V4.1 Flash Free
function functionTokens(text: string): string[] {
  const tokens: string[] = [];
  for (const match of cleanText(text).matchAll(FUNCTION_TOKEN_RE)) {
    const token = match[0];
    if (/^[A-Za-z]/u.test(token)) {
      const lower = token.toLowerCase();
      if (EN_FUNCTION.has(lower)) tokens.push(lower);
    } else if (CN_FUNCTION.has(token)) {
      tokens.push(token);
    }
  }
  return tokens;
}

// Authored by LLM, model DeepSeek V4.1 Flash Free
function countFunctionTokens(texts: string[]): Counts {
  const counts: Counts = new Map();
  for (const text of texts) {
    for (const token of functionTokens(text)) counts.set(token, (counts.get(token) ?? 0) + 1);
  }
  return counts;
}

// Authored by LLM, model DeepSeek V4.1 Flash Free
function punctuationTokens(text: string): string[] {
  // URLs contribute many identical punctuation marks; remove them first.
  const withoutUrls = text.normalize('NFC').replace(URL_RE, ' ');
  const tokens: string[] = [];
  for (const match of withoutUrls.matchAll(PUNCTUATION_RE)) tokens.push(match[0].toLowerCase());
  return tokens;
}

// Authored by LLM, model DeepSeek V4.1 Flash Free
function countPunctuationTokens(texts: string[]): Counts {
  const counts: Counts = new Map();
  for (const text of texts) {
    for (const token of punctuationTokens(text)) counts.set(token, (counts.get(token) ?? 0) + 1);
  }
  return counts;
}

// Authored by LLM, model DeepSeek V4.1 Flash Free
function selectFeatures(profiles: Counts[], limit: number, minAuthors: number): string[] {
  const totals = new Map<string, number>();
  const authors = new Map<string, number>();
  for (const profile of profiles) {
    for (const [feature, count] of profile) {
      totals.set(feature, (totals.get(feature) ?? 0) + count);
      authors.set(feature, (authors.get(feature) ?? 0) + 1);
    }
  }
  return [...totals.entries()]
    .filter(([feature]) => (authors.get(feature) ?? 0) >= minAuthors)
    .sort((left, right) => right[1] - left[1])
    .slice(0, limit)
    .map(([feature]) => feature);
}

// Authored by LLM, model DeepSeek V4.1 Flash Free
function relativeVectors(profiles: Counts[], features: string[]): number[][] {
  return profiles.map((profile) => {
    let total = 0;
    for (const count of profile.values()) total += count;
    return features.map((feature) => (profile.get(feature) ?? 0) / Math.max(total, 1));
  });
}

// Authored by LLM, model DeepSeek V4.1 Flash Free
function bowFromVector(features: string[], vector: number[]): Bow {
  const bow: Bow = Object.create(null) as Bow;
  for (const [index, feature] of features.entries()) bow[feature] = vector[index];
  return bow;
}

// Authored by LLM, model DeepSeek V4.1 Flash Free
function safeCosine(left: Bow, right: Bow): number {
  const value = similarity.bow.cosine(left, right);
  return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
}

// Authored by LLM, model DeepSeek V4.1 Flash Free
function cosineMatrix(features: string[], vectors: number[][]): number[][] {
  const matrix: number[][] = vectors.map((_, row) => vectors.map((_, column) => (row === column ? 1 : 0)));
  // winkNLP returns 1 for two empty bag-of-words vectors; that is not evidence
  // that two authors share a style, so leave the off-diagonal at zero.
  if (!features.length) return matrix;
  const bows = vectors.map((vector) => bowFromVector(features, vector));
  for (let left = 0; left < bows.length; left += 1) {
    for (let right = left + 1; right < bows.length; right += 1) {
      matrix[left][right] = matrix[right][left] = safeCosine(bows[left], bows[right]);
    }
  }
  return matrix;
}

// Authored by LLM, model DeepSeek V4.1 Flash Free
function zScore(vectors: number[][]): number[][] {
  const dimensions = vectors[0]?.length ?? 0;
  const means = new Array<number>(dimensions).fill(0);
  const deviations = new Array<number>(dimensions).fill(0);
  for (const vector of vectors) {
    for (let index = 0; index < dimensions; index += 1) means[index] += vector[index] / vectors.length;
  }
  for (const vector of vectors) {
    for (let index = 0; index < dimensions; index += 1) {
      deviations[index] += (vector[index] - means[index]) ** 2 / vectors.length;
    }
  }
  for (let index = 0; index < dimensions; index += 1) deviations[index] = Math.sqrt(deviations[index]) || 1;
  return vectors.map((vector) => vector.map((value, index) => (value - means[index]) / deviations[index]));
}

// Authored by LLM, model DeepSeek V4.1 Flash Free
function deltaMatrix(vectors: number[][]): number[][] {
  // Burrows's Delta: z-score each profile, then take mean absolute distance.
  const normalized = zScore(vectors);
  const matrix: number[][] = vectors.map((_, row) => vectors.map((_, column) => (row === column ? 1 : 0)));
  for (let left = 0; left < normalized.length; left += 1) {
    for (let right = left + 1; right < normalized.length; right += 1) {
      let distance = 0;
      for (let index = 0; index < normalized[left].length; index += 1) {
        distance += Math.abs(normalized[left][index] - normalized[right][index]);
      }
      distance /= Math.max(normalized[left].length, 1);
      // Monotonic transform keeps the UI comparable with cosine values.
      const value = 1 / (1 + distance);
      matrix[left][right] = matrix[right][left] = Number.isFinite(value) ? value : 0;
    }
  }
  return matrix;
}

// Authored by LLM, model DeepSeek V4.1 Flash Free
function splitHalfCosine(texts: string[], features: string[]): number | null {
  if (texts.length < 2) return null;
  const halves: string[][] = [[], []];
  for (const [index, text] of texts.entries()) halves[index % 2].push(text);
  const characters = halves.map((half) => half.reduce((sum, text) => sum + characterLength(text), 0));
  if (characters.some((count) => count < MIN_HALF_CHARACTERS)) return null;
  const vectors = relativeVectors(halves.map(countCharNgrams), features);
  return safeCosine(bowFromVector(features, vectors[0]), bowFromVector(features, vectors[1]));
}

type StyleVector = Omit<StyleSummary, 'username' | 'posts'>;

// Authored by LLM, model DeepSeek V4.1 Flash Free
function styleFeatures(posts: Dataset['users'][number]['posts']): StyleVector {
  const cleaned = posts.map((post) => cleanText(post.text)).filter(Boolean);
  const text = cleaned.join('\n');
  const chars = Array.from(text);
  const total = Math.max(chars.length, 1);
  const punctuation = chars.filter((char) => /[\p{P}\p{S}]/u.test(char)).length;
  const cjk = chars.filter((char) => /[\p{Script=Han}]/u.test(char)).length;
  const latin = chars.filter((char) => /[A-Za-z]/u.test(char)).length;
  const digits = chars.filter((char) => /\d/u.test(char)).length;
  const whitespace = chars.filter((char) => /\s/u.test(char)).length;
  const questionExclamation = chars.filter((char) => /[!?！？]/u.test(char)).length;
  const urls = posts.reduce((sum, post) => sum + (post.text.match(/https?:\/\/|www\./giu) ?? []).length, 0);
  const repeatedPunctuation = (text.match(/[!?！？。…]{2,}/gu) ?? []).length;
  return {
    averageCharacters: cleaned.length ? cleaned.reduce((sum, value) => sum + characterLength(value), 0) / cleaned.length : 0,
    cjkRatio: cjk / total,
    latinRatio: latin / total,
    digitRatio: digits / total,
    whitespaceRatio: whitespace / total,
    punctuationRatio: punctuation / total,
    questionExclamationRate: questionExclamation / total,
    urlRate: urls / Math.max(cleaned.length, 1),
    repeatedPunctuationRate: repeatedPunctuation / Math.max(cleaned.length, 1),
  };
}

// Authored by LLM, model DeepSeek V4.1 Flash Free
function styleSimilarity(left: StyleVector, right: StyleVector): number {
  const keys = Object.keys(left) as Array<keyof StyleVector>;
  if (!keys.length) return 0;
  const distance = keys.reduce((sum, key) => {
    const a = left[key];
    const b = right[key];
    const scale = Math.max(Math.abs(a), Math.abs(b), 0.0001);
    return sum + Math.min(1, Math.abs(a - b) / scale);
  }, 0) / keys.length;
  return Math.max(0, Math.min(1, 1 - distance));
}

// Authored by LLM, model DeepSeek V4.1 Flash Free
function trigramSet(texts: string[]): Set<string> {
  const grams = new Set<string>();
  for (const text of texts) {
    const chars = Array.from(cleanText(text).normalize('NFC'));
    for (let index = 0; index + 3 <= chars.length; index += 1) {
      const gram = chars.slice(index, index + 3).join('');
      if (!/\s/u.test(gram)) grams.add(gram);
    }
  }
  return grams;
}

// Authored by LLM, model DeepSeek V4.1 Flash Free
function trigramOverlap(left: string[], right: string[]): number {
  const a = trigramSet(left);
  const b = trigramSet(right);
  if (!a.size && !b.size) return 0;
  let shared = 0;
  for (const gram of a) if (b.has(gram)) shared += 1;
  return shared / new Set([...a, ...b]).size;
}

// Authored by LLM, model DeepSeek V4.1 Flash Free
function topicOverlap(left: Dataset['users'][number]['posts'], right: Dataset['users'][number]['posts']): number {
  const a = new Set(left.map((post) => post.topicId).filter((id): id is number => Number.isSafeInteger(id)));
  const b = new Set(right.map((post) => post.topicId).filter((id): id is number => Number.isSafeInteger(id)));
  if (!a.size && !b.size) return 0;
  let shared = 0;
  for (const id of a) if (b.has(id)) shared += 1;
  return shared / new Set([...a, ...b]).size;
}

// Authored by LLM, model DeepSeek V4.1 Flash Free
function backgroundLift(matrix: number[][], left: number, right: number): number | null {
  const authors = matrix.length;
  if (authors <= 2) return null;
  let leftSum = 0;
  let rightSum = 0;
  for (let index = 0; index < authors; index += 1) {
    if (index === left || index === right) continue;
    leftSum += matrix[left][index];
    rightSum += matrix[right][index];
  }
  const background = (leftSum + rightSum) / (2 * (authors - 2));
  return matrix[left][right] - background;
}

// Authored by LLM, model DeepSeek V4.1 Flash Free
const ignoreProgress = (_percent: number, _detail: string): void => {};

// Edited by LLM, model DeepSeek V4.1 Flash Free
export function analyze(dataset: Dataset, progress = ignoreProgress): AnalysisResult {
  if (dataset.version !== 1 || dataset.users.length < 2 || dataset.users.length > 5) {
    throw new Error('需要包含 2–5 个账号的 version=1 数据集。');
  }

  const usernames: string[] = [];
  const authorTexts: string[][] = [];
  for (const user of dataset.users) {
    const usable = user.posts
      .map((post) => cleanText(post.text))
      .filter((text) => characterLength(text) >= MIN_POST_CHARACTERS);
    const characters = usable.reduce((sum, text) => sum + characterLength(text), 0);
    if (characters < MIN_AUTHOR_CHARACTERS) {
      throw new Error(`@${user.username} 的有效文本不足：仅计入清洗后至少 ${MIN_POST_CHARACTERS} 字的帖子，合计至少需要 ${MIN_AUTHOR_CHARACTERS} 字。`);
    }
    usernames.push(user.username);
    authorTexts.push(usable);
  }
  progress(6, `整理 ${usernames.length} 个账号的有效文本`);

  const charProfiles = authorTexts.map(countCharNgrams);
  const charFeatures = selectFeatures(charProfiles, CHAR_FEATURE_LIMIT, Math.min(MIN_FEATURE_AUTHORS, usernames.length));
  if (!charFeatures.length) throw new Error('无法建立字符 profile：账号之间没有足够的共同字符片段。');
  const charVectors = relativeVectors(charProfiles, charFeatures);
  progress(25, `字符 profile：${charFeatures.length} 个特征`);

  const functionProfiles = authorTexts.map(countFunctionTokens);
  const functionFeatures = selectFeatures(functionProfiles, FUNCTION_FEATURE_LIMIT, Math.min(MIN_FEATURE_AUTHORS, usernames.length));
  const functionVectors = relativeVectors(functionProfiles, functionFeatures);

  const punctuationProfiles = authorTexts.map(countPunctuationTokens);
  const punctuationFeatures = selectFeatures(punctuationProfiles, PUNCTUATION_FEATURE_LIMIT, Math.min(MIN_FEATURE_AUTHORS, usernames.length));
  const punctuationVectors = relativeVectors(punctuationProfiles, punctuationFeatures);
  progress(45, '建立功能词与标点 profile');

  const profileMatrix = cosineMatrix(charFeatures, charVectors);
  const functionMatrix = cosineMatrix(functionFeatures, functionVectors);
  const punctuationMatrix = cosineMatrix(punctuationFeatures, punctuationVectors);
  const deltaScores = usernames.length >= 3 ? deltaMatrix(charVectors) : null;

  const splitHalf = authorTexts.map((texts) => splitHalfCosine(texts, charFeatures));
  const diagnostics = usernames.map((username, index) => ({
    username,
    posts: authorTexts[index].length,
    characters: authorTexts[index].reduce((sum, text) => sum + characterLength(text), 0),
    splitHalf: splitHalf[index],
  }));
  progress(65, '计算账号内拆半一致性');

  const styleVectors = dataset.users.map((user) => styleFeatures(user.posts));
  const style: StyleSummary[] = usernames.map((username, index) => ({
    username,
    posts: dataset.users[index].posts.length,
    ...styleVectors[index],
  }));

  const pairs: PairSummary[] = [];
  for (let left = 0; left < usernames.length; left += 1) {
    for (let right = left + 1; right < usernames.length; right += 1) {
      const profile = profileMatrix[left][right];
      const leftStability = splitHalf[left];
      const rightStability = splitHalf[right];
      const stability = leftStability !== null && rightStability !== null ? Math.min(leftStability, rightStability) : null;
      // Compare the pair with the more stable author, not the noisier one: a
      // low split-half baseline must not make an unrelated pair look "relative".
      const baseline = leftStability !== null && rightStability !== null ? Math.max(leftStability, rightStability) : null;
      const relative = baseline !== null && baseline >= 0.5 ? profile / baseline : null;
      const functionWords = functionMatrix[left][right];
      const punctuation = punctuationMatrix[left][right];
      pairs.push({
        left: usernames[left],
        right: usernames[right],
        profile,
        relative,
        backgroundLift: backgroundLift(profileMatrix, left, right),
        functionWords,
        punctuation,
        deltaSimilarity: deltaScores ? deltaScores[left][right] : null,
        style: styleSimilarity(styleVectors[left], styleVectors[right]),
        topicOverlap: topicOverlap(dataset.users[left].posts, dataset.users[right].posts),
        sharedTrigramOverlap: trigramOverlap(dataset.users[left].posts.map((post) => post.text), dataset.users[right].posts.map((post) => post.text)),
        stability,
        combined: 0.6 * profile + 0.2 * functionWords + 0.2 * punctuation,
      });
    }
  }
  pairs.sort((left, right) => right.combined - left.combined);
  progress(100, '完成');
  return { usernames, matrix: profileMatrix, diagnostics, style, pairs };
}
