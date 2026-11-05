# USCardForum writing-style similarity POC

A **client-only**, exploratory authorship-style comparison tool for 2-5 public Discourse accounts. A Tampermonkey userscript collects a small sample of public search results on `www.uscardforum.com`; a Vite/TypeScript page runs Python + scikit-learn in a Pyodide Web Worker and draws an interactive candidate-pair matrix. The matrix can switch between profile, combined, function-word, punctuation, Delta, topic-overlap, relative-consistency and background-lift metrics, with heatmap coloring. A lightweight TypeScript worker remains available for fallback and cross-checking. There is **no server**, no LLM call, no account-identity conclusion, and no data upload.

## Intended moderation use

This tool is for a forum operator's **human review** of publicly visible posts when the forum's rules prohibit alternate accounts. It links writing samples, not real-world identities. It must not be used to infer a legal name, employer, address, or other sensitive personal information; to access private messages or non-public data; to publish an accusation; or to trigger an automatic ban. IP logs are separate admin data handled by an external tool and are not ingested by this app.

## What this POC does

1. On `www.uscardforum.com`, use the Tampermonkey menu **"采集写作样本"**.
2. Enter 2-5 usernames, `likes` or `views`, and a per-author cap (default 200; hard cap 500).
3. Fetch `/search.json?q=%40USERNAME%20order%3Alikes&page=1` sequentially. Use only publicly visible results, deduplicate post IDs, and stop on empty/duplicate pages, budget exhaustion or permission errors. On 429, retry the same page with linear backoff: 5, 10, 15 seconds, capped at 60 seconds; reset after a successful page.
4. Store one versioned JSON dataset in this **same userscript's** GM storage and open `https://usccg.github.io/xiaohao/` (or the local dev URL).
5. On the static app, click **"读取油猴缓存"**, or import exported JSON. The default **Python + scikit-learn** engine runs in Pyodide/WASM; TypeScript remains available as a fallback. Press **"开始分析"**. A Web Worker produces an N x N character 2–3-gram frequency-profile cosine matrix, plus function-word, punctuation, Burrows Delta and per-author split-half diagnostics. The results view shows the candidate-pair matrix with a **metric selector** and heatmap coloring; the full pair table and per-author coverage remain below it.

> **Important data-quality limitation:** Discourse `/search.json` commonly supplies an HTML **blurb/snippet**, not the full post. This POC uses it as an **excerpt baseline**, explicitly marks `quality: "excerpt"`, and shows the limitation in the UI. `user_actions.json` likewise returns an excerpt. Do NOT silently call snippets complete articles. Follow-up Codex work can add an *optional*, separately capped, rate-limited full-text mode via `/posts/{id}.json` or topic-batched `/t/{topic_id}/posts.json`, verifying real endpoint behavior first. Do not fire off hundreds/thousands of requests by default.

## Start

Use Node.js 24 LTS (minimum 22.18). Application sources and tests are TypeScript, except the Python analysis adapter `src/analysis_python.py`; tests run against JavaScript emitted by `tsc`.

```sh
yarn install
yarn dev
```

The five Pyodide wheels used by the Python engine are vendored under `vendor/pyodide-wheels/` (about 21 MB). `predev`/`prebuild` run `tools/check-pyodide-wheels.mjs`, which verifies their local SHA-256 checksums before Vite copies them into the static output. The build and the running app do **not** download Pyodide assets from a CDN. The Pyodide core runtime itself comes from the installed npm package; for a fully air-gapped machine, prepare `node_modules`/the Yarn cache ahead of time.

For a forum-free demo, open the app, click **"载入合成示例"**, then **"开始分析"**. This uses only the bundled fictional fixture; it makes no forum request.

The dev command first compiles the userscript. Install `dist/userscript/uscardforum-style.user.js` in **Tampermonkey**. Open the forum, start collection using Tampermonkey's extension menu, and use the deployed app at https://usccg.github.io/xiaohao/ or the local app at http://127.0.0.1:5173/.

To compile only the installable userscript (no Vite required):

```sh
yarn build:userscript
```

Edit `userscript/uscardforum-style.user.ts`; `tsconfig.userscript.json` emits a standalone script with the Tampermonkey metadata header intact. Do not edit generated `.js` files. GM declarations live in `userscript/globals.d.ts` and share the analyzer's versioned types from `src/types.d.ts`.

To build the fully static app and userscript:

```sh
yarn build
yarn preview
```

Dev and preview use fixed ports (5173 and 4173) and fail if occupied, because the GM bridge allows exact origins only.

The generated `dist/` is static and the included GitHub Actions workflow deploys it to https://usccg.github.io/xiaohao/ on pushes to `master` (or through **workflow_dispatch**). It also copies the compiled userscript to [`release.js`](https://usccg.github.io/xiaohao/release.js) for direct installation. **Before using another host**, edit the TypeScript userscript's `@match`, `APP_URL` and `APP_ORIGINS` to point at your own exact origin, then recompile. Do not use a wildcard such as `https://*.github.io/*` to relay a dataset.

Alternative: use the menu **"导出缓存 JSON"** and import the file on the app; this works even when the bridge is not configured.

## Updating the userscript and diagnosing cache reads

Run `yarn build:userscript` (or `yarn build`), then update the existing Tampermonkey installation with `dist/userscript/uscardforum-style.user.js` (version **0.2.1**). Rebuilding the file alone does not update the browser extension. Keep the existing script name/namespace so its GM cache remains associated with the same installation. Refresh both the forum tab and the analyzer tab after updating.

The analyzer displays **油猴桥接已连接** when the script responds. Use the same browser profile and the same installed userscript on the forum and analyzer page. If it reports **未收到油猴回复**, confirm in Tampermonkey's menu that this script runs on the current URL, and check the extension's site access and userscript execution permissions. Supported analyzer origins are `https://usccg.github.io`, `http://localhost:5173`, `http://127.0.0.1:5173`, and their `:4173` preview equivalents.

Open DevTools Console on **both pages**, enable Info/Warning/Error messages and filter **`[UCF Style]`**:

- `analyzer:start` but no `userscript:start` on the local page: check installation, script enablement, URL matching and extension permissions.
- `bridge:ready`, `bridge:request`, `cache:request`, `cache:reply`, `bridge:reply`: trace the handshake and cache transfer. `cache:reply` reports only cache presence/account count; it does not log sample text.
- `bridge:timeout` or `cache:error`: share the event name and error message for further diagnosis.
- `search:rate-limited` reports the wait duration and attempt number; `cache:checkpoint` and `collection:saved` show when samples were stored. `collection:cancel` marks a user stop.

The bridge uses DOM events with JSON-string payloads and request IDs, plus a readiness probe and replay of a pending request if the userscript starts late. It retains the older `postMessage` path for compatibility. Only explicitly allowed analyzer origins install the cache responder; the readiness probe does not fetch samples. String payloads avoid the extension/page object-sharing issue documented for [CustomEvent](https://developer.mozilla.org/en-US/docs/Web/API/CustomEvent). These changes address the reported no-reply path; the user's actual Tampermonkey runtime still needs retesting after installation.

## Sampling and HTTP budgets

- 2-5 usernames; public posts only; no private-message endpoint, auth manipulation, or Cloudflare/challenge bypass.
- Default 200 posts/author; cap 500; 20 search pages/author and 100 search requests **total** per run. Actual count may be lower than requested due to site-side pagination/result limits.
- Search requests use `credentials: "omit"`: anonymous access prevents logged-in-only material from entering the sample. A forum that requires authentication for search may return 403; the collector stops without falling back to authenticated requests.
- Requests are strictly serial, at least ~2 seconds apart, including between accounts. On consecutive 429 responses, wait 5, 10, 15 seconds and so on, capped at 60 seconds per wait. A successful page resets the counter. Per the user’s preference, `Retry-After` and `extras.wait_seconds` do not control this delay. Waits are immediately cancellable. Retry the same page and count every attempt against the 100-request total. Stop and preserve partial data on 403, network failure, cancellation or budget exhaustion.
- Selecting `order:likes` or `order:views` causes sampling bias, and `views` is typically topic-level popularity, not per-post readership. Ideally follow up with a separate `order:latest` run and a topic-stratified sample.
- Each completed page is checkpointed to GM storage, including before any later rate-limit wait; opening the analyzer during collection can read the partial sample. An interrupted run retains all requested usernames, including empty accounts, so its JSON remains importable. The app explains missing samples and disables comparison until all accounts have data. This is partial-result preservation, not resumable collection.
- Don't crawl repeatedly. The cache persists locally until cleared by the user.

## Data format

```ts
interface Dataset {
  version: 1;
  source: 'https://www.uscardforum.com';
  capturedAt: string;
  order: 'likes' | 'views';
  users: Array<{
    username: string;
    posts: Array<{
      id: number;
      topicId?: number;
      createdAt?: string;
      text: string;
      quality: 'excerpt' | 'full';
    }>;
  }>;
}
```

Only author-supplied text is sent to the worker. HTML is parsed as **text**, never rendered as untrusted `innerHTML`. Keep punctuation, case and spacing; strip quote/code/onebox content when possible. Search blurbs are not guaranteed to preserve the original formatting.

## ML scope (baseline, not identity verification)

- **Traditional stylometry, not LLM inference.** `wink-nlp/utilities/similarity` supplies cosine similarity; the character n-gram, function-word and punctuation profiles are small deterministic adapters because our features are Unicode character sequences and Chinese text has no whitespace token boundaries. No trained model, classifier, embedding, LLM, or probabilistic identity score is used.
- The main profile uses the relative frequencies of the most common **character 2-gram and 3-gram** features shared by at least two accounts (500 features). Unigrams are omitted because they are dominated by common Chinese characters and compress every pair toward the same high score. URLs, emoji shortcodes and ASCII quote prefixes are removed before counting; punctuation and casing are otherwise preserved.
- Posts shorter than 25 Unicode code points after cleaning are ignored; each account needs at least 250 usable code points. Split-half diagnostics alternate posts (odd/even), require at least 200 characters per half, and never split a post. One post therefore reports insufficient split-half data. This is deterministic and is not topic/time stratification.
- The stored matrix is the cosine similarity of the character-profile vectors. Its diagonal is 1 by definition, but the UI displays the diagonal as **—** because self-comparison is not candidate evidence; report **split-half consistency** separately to avoid a misleading diagonal.
- The candidate list adds two topic-independent views (function-word rates and punctuation/emoji rates), Burrows's Delta on z-scored character profiles, structural-style similarity, topic-ID Jaccard overlap and shared character-trigram overlap. **Background lift** is the pair's profile minus the mean profile of each account against the other accounts in the same run; it shows whether the pair stands out from the run's general similarity level. The displayed combined sort is `0.60 × character profile + 0.20 × function words + 0.20 × punctuation`; it is a transparent review heuristic, not a calibrated probability.
- **Relative consistency** is `profile ÷ the higher split-half consistency of the two accounts`. Using the higher baseline is deliberately conservative: an unstable account must not make an unrelated pair look relatively similar. Values near or above 1 mean the pair is as similar as the more stable author is to their own other half.
- N-gram scores capture **topic and vocabulary as well as style**. Without controlled background authors, this is a descriptive text-similarity matrix; it does **not** estimate P(same real person). Do not label high scores as an identity match.
- The old chunk-level BM25 baseline was removed after measurement: its own split-half consistency was about 0.05 because IDF emphasized rare character n-grams that do not repeat between halves. Tuning BM25 would not fix that mismatch; frequency profiles and Delta are the standard tools for authorship comparison.
- Longer-term improvement: topic/period-matched negative controls; time-split reliability; punctuation-only and function-word features; author-disjoint holdout evaluation. Treat any calibrated value as model-specific, not proof of account ownership.

## Optional Python + scikit-learn engine (experimental)

The UI exposes an **分析引擎** selector. Python + scikit-learn is the default analysis path; TypeScript remains available as a lightweight fallback and comparison implementation.

- `src/analysis-python.worker.ts` loads Pyodide 314.0.7 (CPython 3.14) inside a dedicated Web Worker, then loads NumPy 2.4.6, SciPy 1.18.0 and scikit-learn 1.8.0. The main thread only receives progress, result and error messages; **Cancel** terminates the worker and releases the runtime. This keeps the page responsive while the WASM runtime loads and initializes.
- `src/analysis_python.py` uses scikit-learn's `CountVectorizer` with a character 2–3-gram analyzer (`min_df=2`, `max_features=500`) and `cosine_similarity`, plus function-word and punctuation profiles, z-scored Burrows Delta, split-half consistency and the same candidate metrics as the TypeScript engine. It is a second implementation for cross-checking, not a new identity score.
- Pyodide core files from the installed npm package and the five vendored wheels are copied by Vite into `dist/assets/pyodide` (about 34 MB uncompressed). `tools/check-pyodide-wheels.mjs` verifies the local wheel checksums before dev/build; no Pyodide asset is fetched from the network. The running app loads everything from the **same origin**. The dataset stays in the worker and is never sent to a package host or analysis service.
- First use typically takes several seconds and loads tens of MB from the same-origin static assets. The progress bar reports runtime startup, package loading, profile construction, Delta/split-half work and pair scoring. Subsequent runs in the same worker reuse the runtime; canceling or reloading the page discards it.
- On the two supplied real datasets, the Python engine reproduced the same top pairs and nearly identical scores: `deah12 ~ aws` combined 0.923 / profile 0.914, and `atf ~ 哈耶克` combined 0.917 / profile 0.873. The TypeScript engine reports 0.919 / 0.914 and 0.918 / 0.874 respectively. Small differences come from feature tie-breaking and library conventions; neither implementation is a probability or proof.
- Not included: spaCy, Stanza, HanLP, `jieba`, embeddings, LLM calls or remote inference. Those remain offline follow-up options. `yarn test:python` is an opt-in smoke test that loads the locally built Pyodide assets and the synthetic fixture; run `yarn build` first.

## Optional traditional-NLP tooling

The current browser POC now optionally bundles scikit-learn through Pyodide. If the analysis moves to an offline local script, these are useful additional checks:

- **R `stylo`** — the closest standard implementation of Burrows Delta, Cosine Delta, Zeta, rolling Delta, PCA and clustering. It is the best external cross-check for the custom TypeScript Delta, not a source of identity proof.
- **Python `scikit-learn`** — the optional browser engine already uses `CountVectorizer` and `cosine_similarity`. An offline evaluation can add character `TfidfVectorizer` (`analyzer="char"`, `ngram_range=(2, 4)`) and logistic regression/SVM with **author-disjoint** group cross-validation and probability calibration. Only meaningful with enough labeled same/different-author pairs.
- **`spaCy`, `Stanza`, `HanLP`, `pkuseg`, `jieba`** — tokenization, part-of-speech/dependency features, and function-word or POS n-grams. Character n-grams do not need Chinese word segmentation, but these tools help build a syntax/function-word view. `jieba` is lightweight; HanLP/LTP are heavier.
- **`OpenCC`** — normalize Simplified/Traditional Chinese before counting features; the supplied samples mix scripts.
- **`langdetect` or `lingua`** — split Chinese/English or mixed-language posts before comparing style.
- **`textdistance` / `rapidfuzz`** — near-duplicate and string-similarity checks (for example copied posts). They are not authorship evidence by themselves.
- Avoid treating raw LLM/embedding “same author” scores as proof: they mix topic and style, are not calibrated, and are hard to audit. Use them only as an auxiliary, validated feature.

## IP evidence (separate external tool, out of scope)

IP comparison is handled by a separate authorized tool and is **not** part of this repository. Do not add IP fields to the dataset, analyzer, frontend or exported JSON. The text scores here must remain independent of that tool; any moderation decision still requires human review and must not be automated.

## Codex follow-up tasks (priority order)

1. **Verify against actual logged-in USCardForum API responses** (shape, pagination, `blurb` length, 429 behavior). We cannot validate site's logged-in payload from this environment. Save redacted fixtures for tests. Preserve the hard HTTP budget.
2. Run the included Node tests with installed dependencies, then validate the real Worker and Tampermonkey bridge in Chrome/Firefox. Verify the Python worker’s first load, progress, cancel and switch-back behavior, plus the TypeScript fallback. The DOM/Worker and HTTP boundaries in offline tests are fakes, not browser or API compatibility evidence.
3. Improve sampling: mix `likes`, `views`, `latest` or stratify by topic/time; allow dates in export. Explain sampling bias.
4. Add **opt-in** full-text enrichment with strict explicit request limit (e.g. <=30 additional requests/author) or topic-batched calls. Stop when rate limited. Never fetch one POST per result by default.
5. The current function-word and punctuation views are descriptive only. Validate them against same-topic negative controls and a larger set of known same/different-author pairs before using any threshold.
6. Add background author distributions and author-disjoint validation **before** reporting any probability or threshold. Provide uncertainty and data quantity diagnostics.
7. Do not add IP-log ingestion, matching or display to this repository. Keep IP comparison in the separate authorized tool; this codebase only produces independent text-similarity evidence.
8. Optional: run tests on Chrome and Firefox Tampermonkey, including GitHub Pages with a restrictive origin allowlist. Avoid service workers/network backends. Maintain dependency lockfile.

## Acceptance checks

- No server component, no cookies/passwords/API keys exposed to a remote app, no upload to third parties.
- 2-5 accounts, <=500 posts/author, <=100 search requests total, minimum 2 seconds between requests.
- A 429 waits and retries the same page; cancellation interrupts both requests and waits. A 403 or exhausted budget stops the run, preserving checkpoints; duplicate pages end that account’s pagination.
- App can load from the GM bridge or imported JSON, and never renders server HTML directly.
- Running analysis and canceling it never blocks the UI; the progress bar updates; the matrix is symmetric, the diagonal is shown as not applicable, and changing the metric re-renders the heatmap without recomputing.
- The default Python engine loads the vendored Pyodide and scikit-learn assets from the same origin in its own Web Worker, reports progress, and can be cancelled or replaced by switching back to the TypeScript engine. The TypeScript engine requires no Python runtime.
- Result labels describe **similarity** and **data coverage**, not real-world identity.

## Checks and current validation status

```sh
yarn test
yarn typecheck
yarn build
yarn pyodide:check   # offline wheel verification; also run by predev/prebuild
node --check dist/userscript/uscardforum-style.user.js
yarn test:python   # optional; requires the build assets above
```

Dependencies are installed with Yarn 1.22.22; retain the existing `yarn.lock`. The current validation run passed all 31 tests and `yarn typecheck`. The tests exercise dataset validation, UI lifecycle, the new profile analysis, metric-selector matrix re-rendering, Python engine selection, split-window DOM bridge/late startup, storage errors, retry delays, wait cancellation, checkpoints and request budgets; UI/HTTP boundaries use fakes.

A local evaluation on the two supplied real datasets ranked the two user-identified same-person pairs first in each dataset on combined score, profile cosine, background lift and relative consistency. This is a **two-pair sanity check, not validation**; the labels were supplied by the user, the samples are search excerpts, and no threshold or probability is supported. The raw result files are kept out of version control because they contain real public posts.

The Python engine was smoke-tested against the synthetic fixture and both supplied real datasets using the locally built Pyodide assets. It reproduced the same leading pairs with nearly identical scores. `yarn pyodide:check` verified all five vendored wheel hashes, and the build log shows no download step. A Node-based browser-like simulation of the built Python worker also returned a complete result; actual Chrome/Firefox execution, Tampermonkey integration and the live forum API remain unverified in this environment.

## POC implementation choices

- Keep the Worker architecture and winkNLP's [cosine API](https://winkjs.org/wink-nlp/similarity.html). `src/analysis.ts` contains the default computation and `src/analysis.worker.ts` only handles messages; this permits testing the same computation without moving ML to the browser's main thread. The optional `src/analysis-python.worker.ts` keeps Pyodide and scikit-learn loading off the main thread for the same reason. The old BM25 baseline was replaced after its split-half consistency measured about 0.05; see the ML scope section for the measured rationale. Tuning BM25 was rejected because its IDF objective rewards rare terms that are unstable across an author's own halves, whereas authorship profiles need common, repeatable character patterns.
- All application code is TypeScript except `src/analysis_python.py`, the optional scientific-computing adapter. It exists as an independent scikit-learn implementation for cross-checking, not as a required dependency; it remains opt-in to avoid a large first load for users who only need the TypeScript baseline. `yarn test` compiles the userscript and tests before running the emitted `.test-build/tests/*.test.js`; the collector tests read the generated installable script. `yarn typecheck` checks app, userscript and tests. Separate compiler configs keep browser/GM and Node globals apart. Vite runs before userscript emission during a full build, so its output cleanup cannot delete the installable file.
- Use the platform Node test runner instead of introducing another test runner dependency. A small VM harness exercises the single installable userscript without adding a bundling step or a second collector implementation.
- Keep v1 JSON and GM storage: forum and analyzer are different origins, so the reference manager’s origin-local IndexedDB would not itself provide the cache bridge. Apply its abortable waiting and partial-saving pattern instead. User-requested linear backoff supersedes both stop-on-429 and server-specified waiting; preserve the serial request/page budgets.
- For this POC use native console levels and structured fields with a common prefix; no logging dependency or raw-text logging is needed.
- Retain page checkpoints; defer resumable checkpoints, full-text enrichment, background-author calibration and any identity probability. The POC establishes a small descriptive baseline; none of these deferred features is necessary to inspect that workflow.
- Source comments record LLM edits. Some delegated collector/test functions use `model unknown` because that worker did not report a reliable model identifier. No Git commit or history rewrite was performed; Git metadata is unavailable in this workspace. The rationale above records the current contract, without adding a separate decision log.
