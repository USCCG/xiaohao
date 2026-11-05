"""Optional browser-side scikit-learn analysis engine.

This mirrors the TypeScript baseline closely, but uses scikit-learn's
CountVectorizer and cosine_similarity. It runs inside Pyodide in a Web Worker;
the dataset never leaves the browser.
"""

import json
import math
import re
import unicodedata
from collections import Counter

import numpy as np
from sklearn.feature_extraction.text import CountVectorizer
from sklearn.metrics.pairwise import cosine_similarity

# Authored by LLM, model DeepSeek V4.1 Flash Free
MIN_POST_CHARACTERS = 25
MIN_AUTHOR_CHARACTERS = 250
MIN_HALF_CHARACTERS = 200
CHAR_FEATURE_LIMIT = 500
FUNCTION_FEATURE_LIMIT = 200
PUNCTUATION_FEATURE_LIMIT = 60
MIN_FEATURE_AUTHORS = 2

CN_FUNCTION = set(
    "的了是在我你他她它们这那有和就都不也很吗吧啊呢么着过被把让给对从到与而但或及其之以于等个一上下里中大小多少好会能要想说看去来做得地又还再最更才"
)
EN_FUNCTION = set(
    "the a an and or but if of to in on at for with is are was were be been being "
    "it this that these those i you he she we they my your his her our their as by "
    "from not no do does did have has had will would can could should may might must "
    "about into over after before than then there here what which who whom whose when "
    "where why how all any both each few more most other some such only own same so "
    "too very just also"
)

URL_RE = re.compile(r"https?://\S+|www\.\S+", re.IGNORECASE)
EMOJI_RE = re.compile(r":[a-z0-9_+\-]+:", re.IGNORECASE)
TOPIC_BOILER_RE = re.compile(r"^\s*从\s*https?://\S+\s*继续讨论[：:]\s*")
QUOTE_PREFIX_RE = re.compile(r"^\s*[A-Za-z][A-Za-z0-9_.-]{1,31}\s*[:：]\s+")
FUNCTION_TOKEN_RE = re.compile(
    r"[A-Za-z]+(?:'[A-Za-z]+)?|[\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF]"
)
HAN_RANGES = (
    (0x3400, 0x4DBF),
    (0x4E00, 0x9FFF),
    (0xF900, 0xFAFF),
    (0x20000, 0x2FA1F),
)


# Authored by LLM, model DeepSeek V4.1 Flash Free
def is_han(char: str) -> bool:
    code = ord(char)
    return any(start <= code <= end for start, end in HAN_RANGES)


# Authored by LLM, model DeepSeek V4.1 Flash Free
def clean_text(text: str) -> str:
    value = unicodedata.normalize("NFC", text)
    value = TOPIC_BOILER_RE.sub("", value)
    value = URL_RE.sub(" ", value)
    value = EMOJI_RE.sub(" ", value)
    value = QUOTE_PREFIX_RE.sub("", value)
    return value.strip()


# Authored by LLM, model DeepSeek V4.1 Flash Free
def char_ngrams(text: str) -> list[str]:
    chars = list(clean_text(text))
    tokens: list[str] = []
    for size in (2, 3):
        for index in range(0, len(chars) - size + 1):
            gram = "".join(chars[index : index + size])
            if not any(char.isspace() for char in gram):
                tokens.append(gram)
    return tokens


# Authored by LLM, model DeepSeek V4.1 Flash Free
def function_tokens(text: str) -> list[str]:
    tokens: list[str] = []
    for token in FUNCTION_TOKEN_RE.findall(clean_text(text)):
        if token[0].isascii() and token[0].isalpha():
            lower = token.lower()
            if lower in EN_FUNCTION:
                tokens.append(lower)
        elif token in CN_FUNCTION:
            tokens.append(token)
    return tokens


# Authored by LLM, model DeepSeek V4.1 Flash Free
def punctuation_tokens(text: str) -> list[str]:
    value = URL_RE.sub(" ", unicodedata.normalize("NFC", text))
    tokens: list[str] = []
    index = 0
    while index < len(value):
        emoji = EMOJI_RE.match(value, index)
        if emoji:
            tokens.append(emoji.group(0).lower())
            index = emoji.end()
            continue
        char = value[index]
        if unicodedata.category(char)[0] in ("P", "S"):
            tokens.append(char.lower())
        index += 1
    return tokens


# Authored by LLM, model DeepSeek V4.1 Flash Free
def build_profile(texts: list[str], analyzer, limit: int, required: bool = False):
    try:
        vectorizer = CountVectorizer(
            analyzer=analyzer,
            min_df=MIN_FEATURE_AUTHORS,
            max_features=limit,
            lowercase=False,
            preprocessor=None,
            tokenizer=None,
            token_pattern=None,
            dtype=np.float64,
        )
        matrix = vectorizer.fit_transform(texts)
        features = list(vectorizer.get_feature_names_out())
    except ValueError:
        if required:
            raise ValueError("无法建立字符 profile：账号之间没有足够的共同字符片段。") from None
        return np.zeros((len(texts), 1), dtype=np.float64), []
    if not features and required:
        raise ValueError("无法建立字符 profile：账号之间没有足够的共同字符片段。")
    return matrix, features


# Authored by LLM, model DeepSeek V4.1 Flash Free
def relative_matrix(matrix, totals=None) -> np.ndarray:
    dense = np.asarray(matrix.todense(), dtype=np.float64)
    if totals is None:
        totals = dense.sum(axis=1, keepdims=True)
    else:
        totals = np.asarray(totals, dtype=np.float64).reshape(-1, 1)
    totals[totals == 0] = 1
    return dense / totals


# Authored by LLM, model DeepSeek V4.1 Flash Free
def cosine_matrix(matrix) -> list[list[float]]:
    values = cosine_similarity(matrix)
    np.fill_diagonal(values, 1.0)
    values = np.clip(values, 0.0, 1.0)
    return values.tolist()


# Authored by LLM, model DeepSeek V4.1 Flash Free
def delta_matrix(relative: np.ndarray) -> list[list[float]]:
    means = relative.mean(axis=0)
    deviations = relative.std(axis=0)
    deviations[deviations == 0] = 1.0
    normalized = (relative - means) / deviations
    count = relative.shape[0]
    values = np.eye(count, dtype=np.float64)
    for left in range(count):
        for right in range(left + 1, count):
            distance = float(np.mean(np.abs(normalized[left] - normalized[right])))
            similarity = 1.0 / (1.0 + distance) if math.isfinite(distance) else 0.0
            values[left, right] = values[right, left] = similarity
    return values.tolist()


# Authored by LLM, model DeepSeek V4.1 Flash Free
def split_half_cosine(texts: list[str], features: list[str]) -> float | None:
    if len(texts) < 2:
        return None
    halves: list[list[str]] = [[], []]
    for index, text in enumerate(texts):
        halves[index % 2].append(text)
    characters = [sum(len(clean_text(text)) for text in half) for half in halves]
    if any(count < MIN_HALF_CHARACTERS for count in characters):
        return None
    vectorizer = CountVectorizer(
        analyzer=char_ngrams,
        vocabulary=features,
        lowercase=False,
        preprocessor=None,
        tokenizer=None,
        token_pattern=None,
        dtype=np.float64,
    )
    matrix = vectorizer.transform(["\n".join(half) for half in halves])
    if matrix.nnz == 0 or matrix.getrow(0).nnz == 0 or matrix.getrow(1).nnz == 0:
        return None
    return float(cosine_similarity(matrix)[0, 1])


# Authored by LLM, model DeepSeek V4.1 Flash Free
def style_features(posts: list[dict]) -> dict[str, float]:
    cleaned = [clean_text(post.get("text", "")) for post in posts]
    cleaned = [text for text in cleaned if text]
    text = "\n".join(cleaned)
    chars = list(text)
    total = max(len(chars), 1)
    punctuation = sum(1 for char in chars if unicodedata.category(char)[0] in ("P", "S"))
    cjk = sum(1 for char in chars if is_han(char))
    latin = sum(1 for char in chars if char.isascii() and char.isalpha())
    digits = sum(1 for char in chars if char.isdigit())
    whitespace = sum(1 for char in chars if char.isspace())
    question_exclamation = sum(1 for char in chars if char in "!?！？")
    urls = sum(len(re.findall(r"https?://|www\.", post.get("text", ""), re.IGNORECASE)) for post in posts)
    repeated_punctuation = len(re.findall(r"[!?！？。…]{2,}", text))
    return {
        "averageCharacters": sum(len(value) for value in cleaned) / len(cleaned) if cleaned else 0.0,
        "cjkRatio": cjk / total,
        "latinRatio": latin / total,
        "digitRatio": digits / total,
        "whitespaceRatio": whitespace / total,
        "punctuationRatio": punctuation / total,
        "questionExclamationRate": question_exclamation / total,
        "urlRate": urls / max(len(cleaned), 1),
        "repeatedPunctuationRate": repeated_punctuation / max(len(cleaned), 1),
    }


# Authored by LLM, model DeepSeek V4.1 Flash Free
def style_similarity(left: dict[str, float], right: dict[str, float]) -> float:
    keys = list(left)
    if not keys:
        return 0.0
    distance = 0.0
    for key in keys:
        a = left[key]
        b = right[key]
        scale = max(abs(a), abs(b), 0.0001)
        distance += min(1.0, abs(a - b) / scale)
    return max(0.0, min(1.0, 1.0 - distance / len(keys)))


# Authored by LLM, model DeepSeek V4.1 Flash Free
def trigram_set(texts: list[str]) -> set[str]:
    grams: set[str] = set()
    for text in texts:
        chars = list(clean_text(text))
        for index in range(0, len(chars) - 2):
            gram = "".join(chars[index : index + 3])
            if not any(char.isspace() for char in gram):
                grams.add(gram)
    return grams


# Authored by LLM, model DeepSeek V4.1 Flash Free
def trigram_overlap(left: list[str], right: list[str]) -> float:
    a = trigram_set(left)
    b = trigram_set(right)
    union = a | b
    return len(a & b) / len(union) if union else 0.0


# Authored by LLM, model DeepSeek V4.1 Flash Free
def topic_overlap(left: list[dict], right: list[dict]) -> float:
    a = {post["topicId"] for post in left if isinstance(post.get("topicId"), int)}
    b = {post["topicId"] for post in right if isinstance(post.get("topicId"), int)}
    union = a | b
    return len(a & b) / len(union) if union else 0.0


# Authored by LLM, model DeepSeek V4.1 Flash Free
def background_lift(matrix: list[list[float]], left: int, right: int) -> float | None:
    authors = len(matrix)
    if authors <= 2:
        return None
    left_sum = 0.0
    right_sum = 0.0
    for index in range(authors):
        if index in (left, right):
            continue
        left_sum += matrix[left][index]
        right_sum += matrix[right][index]
    background = (left_sum + right_sum) / (2 * (authors - 2))
    return matrix[left][right] - background


# Authored by LLM, model DeepSeek V4.1 Flash Free
def analyze_dataset(dataset_json: str, progress_callback=None) -> str:
    data = json.loads(dataset_json)
    users = data.get("users", [])
    if data.get("version") != 1 or not (2 <= len(users) <= 5):
        raise ValueError("需要包含 2–5 个账号的 version=1 数据集。")

    def progress(percent: int, detail: str) -> None:
        # JS null arrives in Python as JsNull, which is not callable.
        if callable(progress_callback):
            progress_callback(percent, detail)

    progress(6, "整理有效文本")
    usernames: list[str] = []
    author_texts: list[list[str]] = []
    for user in users:
        username = user.get("username", "")
        usable = [
            clean_text(post.get("text", ""))
            for post in user.get("posts", [])
        ]
        usable = [text for text in usable if len(text) >= MIN_POST_CHARACTERS]
        characters = sum(len(text) for text in usable)
        if characters < MIN_AUTHOR_CHARACTERS:
            raise ValueError(
                f"@{username} 的有效文本不足：仅计入清洗后至少 {MIN_POST_CHARACTERS} 字的帖子，"
                f"合计至少需要 {MIN_AUTHOR_CHARACTERS} 字。"
            )
        usernames.append(username)
        author_texts.append(usable)

    progress(20, "构建字符 2–3-gram profile")
    author_documents = ["\n".join(texts) for texts in author_texts]
    char_matrix, char_features = build_profile(author_documents, char_ngrams, CHAR_FEATURE_LIMIT, required=True)
    char_totals = [sum(1 for _ in char_ngrams(document)) for document in author_documents]
    char_relative = relative_matrix(char_matrix, char_totals)
    profile_matrix = cosine_matrix(char_matrix)

    progress(35, "构建功能词与标点 profile")
    function_matrix, _ = build_profile(author_documents, function_tokens, FUNCTION_FEATURE_LIMIT)
    punctuation_matrix, _ = build_profile(author_documents, punctuation_tokens, PUNCTUATION_FEATURE_LIMIT)
    function_values = cosine_matrix(function_matrix)
    punctuation_values = cosine_matrix(punctuation_matrix)

    progress(55, "计算 Delta 与拆半一致性")
    delta_values = delta_matrix(char_relative) if len(usernames) >= 3 else None
    split_half = [split_half_cosine(texts, char_features) for texts in author_texts]

    progress(75, "计算账号写作特征")
    diagnostics = [
        {
            "username": username,
            "posts": len(author_texts[index]),
            "characters": sum(len(text) for text in author_texts[index]),
            "splitHalf": split_half[index],
        }
        for index, username in enumerate(usernames)
    ]
    style_vectors = [style_features(user.get("posts", [])) for user in users]
    style = [
        {"username": username, "posts": len(users[index].get("posts", [])), **style_vectors[index]}
        for index, username in enumerate(usernames)
    ]

    progress(90, "生成候选账号对")
    pairs = []
    for left in range(len(usernames)):
        for right in range(left + 1, len(usernames)):
            profile = profile_matrix[left][right]
            left_stability = split_half[left]
            right_stability = split_half[right]
            stability = (
                min(left_stability, right_stability)
                if left_stability is not None and right_stability is not None
                else None
            )
            baseline = (
                max(left_stability, right_stability)
                if left_stability is not None and right_stability is not None
                else None
            )
            relative = profile / baseline if baseline is not None and baseline >= 0.5 else None
            function_words = function_values[left][right]
            punctuation = punctuation_values[left][right]
            pairs.append(
                {
                    "left": usernames[left],
                    "right": usernames[right],
                    "profile": profile,
                    "relative": relative,
                    "backgroundLift": background_lift(profile_matrix, left, right),
                    "functionWords": function_words,
                    "punctuation": punctuation,
                    "deltaSimilarity": delta_values[left][right] if delta_values else None,
                    "style": style_similarity(style_vectors[left], style_vectors[right]),
                    "topicOverlap": topic_overlap(users[left].get("posts", []), users[right].get("posts", [])),
                    "sharedTrigramOverlap": trigram_overlap(
                        [post.get("text", "") for post in users[left].get("posts", [])],
                        [post.get("text", "") for post in users[right].get("posts", [])],
                    ),
                    "stability": stability,
                    "combined": 0.6 * profile + 0.2 * function_words + 0.2 * punctuation,
                }
            )
    pairs.sort(key=lambda pair: pair["combined"], reverse=True)
    progress(100, "完成")
    return json.dumps(
        {
            "usernames": usernames,
            "matrix": profile_matrix,
            "diagnostics": diagnostics,
            "style": style,
            "pairs": pairs,
        },
        ensure_ascii=False,
    )
