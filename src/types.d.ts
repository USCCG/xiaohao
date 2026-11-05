export type SearchOrder = 'likes' | 'views';
export type TextQuality = 'excerpt' | 'full';

export interface PostSample {
  id: number;
  topicId?: number;
  createdAt?: string;
  text: string;
  quality: TextQuality;
}

export interface UserSample {
  username: string;
  posts: PostSample[];
}

export interface Dataset {
  version: 1;
  source: 'https://www.uscardforum.com';
  capturedAt: string;
  order: SearchOrder;
  users: UserSample[];
}

export interface AnalysisResult {
  usernames: string[];
  matrix: number[][];
  diagnostics: Array<{ username: string; posts: number; characters: number; splitHalf: number | null }>;
  style?: Array<StyleSummary>;
  pairs?: Array<PairSummary>;
}

export interface StyleSummary {
  username: string;
  posts: number;
  averageCharacters: number;
  cjkRatio: number;
  latinRatio: number;
  digitRatio: number;
  whitespaceRatio: number;
  punctuationRatio: number;
  questionExclamationRate: number;
  urlRate: number;
  repeatedPunctuationRate: number;
}

export interface PairSummary {
  left: string;
  right: string;
  profile: number;
  relative: number | null;
  backgroundLift: number | null;
  functionWords: number;
  punctuation: number;
  deltaSimilarity: number | null;
  style: number;
  topicOverlap: number;
  sharedTrigramOverlap: number;
  stability: number | null;
  combined: number;
}

export type WorkerRequest =
  | { type: 'ANALYZE'; dataset: Dataset }
  | { type: 'ANALYZE_PYTHON'; dataset: Dataset; pyodideIndexUrl: string };
export type WorkerMessage =
  | { type: 'PROGRESS'; percent: number; detail: string }
  | { type: 'RESULT'; result: AnalysisResult }
  | { type: 'ERROR'; message: string };
