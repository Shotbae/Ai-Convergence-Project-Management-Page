# STEP 12.2 — Local Rules module
# Behavior-preserving extraction from STEP 12.1 core_engine.py.
import re
import unicodedata

from . import rule_exceptions


# ════════════════════════════════════════════════════════════════
LOCAL_RULESET_VERSION = "LOCAL-RULES-v2.2.6-cjk-foreign-text"

# Character detection only: Han is shared by Korean/Chinese/Japanese and is
# not a language classifier. Keep kana/half-width kana and supplementary Han.
# Combining kana voicing marks belong to the preceding detected character.
_CJK_FOREIGN_PATTERN = re.compile(
    r"[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff"
    r"\U00020000-\U0002ee5f\U0002f800-\U0002fa1f\U00030000-\U000323af"
    r"\u3041-\u3096\u309d-\u309f\u30a1-\u30fa\u30fc-\u30ff\u31f0-\u31ff\uff66-\uff9f]"
    r"[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff"
    r"\U00020000-\U0002ee5f\U0002f800-\U0002fa1f\U00030000-\U000323af"
    r"\u3041-\u3096\u3099-\u309a\u309d-\u309f\u30a1-\u30fa\u30fc-\u30ff\u31f0-\u31ff\uff66-\uff9f]*"
)

# ════════════════════════════════════════════════════════════════
# [트랙 A/B 공통] 기재 금지어 DB  ── 카테고리별 분류
# ════════════════════════════════════════════════════════════════
PROHIBITED_DB = {}          # { 단어(소문자): 카테고리 문자열 }
_CATEGORIES = {
    "사기업 명칭 (포털/검색엔진)": [
        "google", "구글", "naver", "네이버", "daum", "다음",
    ],
    "사기업 명칭 (교육/협업 플랫폼)": [
        "google classroom", "구글 클래스룸", "ebs 온라인클래스",
        "classting", "클래스팅", "padlet", "패들렛", "thinkerbell", "띵커벨",
        "allo", "알로", "careernet", "커리어넷", "워크넷",
        "majormap", "메이저맵", "holland", "홀랜드",
    ],
    "사기업 명칭 (SNS/메신저)": [
        "kakaotalk", "카카오톡", "카톡", "instagram", "인스타그램",
        "twitter", "트위터", "meta", "메타",
        "tiktok", "틱톡",
    ],
    "사기업 명칭 (영상/스트리밍)": [
        "youtube", "유튜브", "tving", "티빙", "watcha", "왓챠",
        "netflix", "넷플릭스", "wavve", "웨이브",
        "disneyplus", "디즈니+", "디즈니플러스", "google tv", "구글 티비",
        "youtuber", "유튜버",
    ],
    "사기업 명칭 (디자인/편집 도구)": [
        "miricanvas", "미리캔버스", "mangoboard", "망고보드", "canva", "캔바",
        "vllo", "블로", "premiere pro", "프리미어 프로",
        "파워디렉터", "키네마스터", "final cut pro", "파이널 컷 프로",
        "포토샵", "페인트샵 프로", "김프",
    ],
    "사기업 명칭 (메타버스/가상현실)": [
        "gather town", "개더타운", "zepeto", "제페토", "ifland", "이프랜드",
    ],
    "사기업 명칭 (기기/SW/AI)": [
        "pad", "아이패드", "galaxy tab", "갤럭시탭",
        "chrome book", "크롬북", "hwp", "ms워드",
        "챗gpt", "chatgpt",
    ],
    "사기업 명칭 (화상회의/통신)": [
        "zoom", "줌", "네이버웨일", "line", "라인",
    ],
    "사기업 명칭 (교통)": [
        "ktx", "케이티엑스", "srt", "에스알티",
    ],
    "국제기구/외부기관 명칭": [
        "un", "유엔", "eu", "유럽연합", "who", "세계 보건 기구",
        "wto", "세계무역기구", "oecd", "경제협력개발기구",
        "imf", "국제통화기금", "unesco", "유네스코",
        "iaea", "국제원자력기구", "nato", "북대서양조약기구",
    ],
    "심리검사 도구명": [
        "mbti",
    ],
    "기술 약어 (원문 표기 금지)": [
        "vr", "브이알", "ar", "에이알",
        "html", "에이치티엠엘", "css", "씨에스에스",
    ],
    "사기업 명칭 (구글 서비스)": [
        "google docs", "구글문서",
    ],
}
for _cat, _words in _CATEGORIES.items():
    for _w in _words:
        PROHIBITED_DB[_w] = _cat

# 하위 호환: 기존 PROHIBITED_WORDS 리스트 유지
PROHIBITED_WORDS = list(PROHIBITED_DB.keys())

# ════════════════════════════════════════════════════════════════
# STEP 17.3 — Data-driven Local Calibration
# ════════════════════════════════════════════════════════════════
# 금칙어 자체는 삭제하지 않는다. 2·3학년 교과/창체 실데이터에서
# 명백한 정상 문맥으로 확인된 좁은 예외만 rule_exceptions에서 suppression한다.
# 그 외 문맥은 Recall-first로 계속 검출하여 교사가 확인한다.
_FALSE_POS_PATTERNS = {
    key: tuple(re.compile(pattern, re.IGNORECASE) for pattern in patterns)
    for key, patterns in rule_exceptions.FORBIDDEN_TERM_EXCEPTIONS.items()
}

# Confirmed nail-art false positive only. The named group identifies the
# individual occurrence; another LINE/라인 service in the same text stays visible.
_NAIL_LINE_EXPRESSION = re.compile(
    r"풀코트\s+컬러링[^.!?\n]{0,60}?(?P<term>라인)"
    r"(?=\s+표현(?:[을의에이은는과]|으로|\s|[,.]|$))"
)

_MOE_TERM_EXCEPTIONS = {
    key: tuple(re.compile(pattern, re.IGNORECASE) for pattern in patterns)
    for key, patterns in rule_exceptions.MOE_TERM_EXCEPTIONS.items()
}

# 영문 짧은 약어와 '라인'은 일반 단어 내부 부분매칭을 막는다.
_BOUNDARY_REQUIRED = {
    "un", "eu", "ar", "vr", "css", "line", "pad", "hwp", "srt",
    "meta", "zoom",
    "라인",
}

# 하위 호환용 공개 전역. STEP 17.3부터 실제 판정은 whitelist/review/forbidden
# 3단계 정책과 Unicode category를 사용한다.
_PROHIBITED_SYMBOLS = tuple(sorted(
    set(rule_exceptions.SYMBOL_REVIEW) | set(rule_exceptions.SYMBOL_FORBIDDEN)
))

# STEP 4 Local Rules v2 — 교육부 민감표현 2단계 검출
#
# 설계 원칙
# 1) 교육부 기재 제한과 직접 연결되는 핵심 표현은 넓게 REVIEW 후보로 검출한다.
# 2) 참가/수상/출원/등록/취득/성적 등 실제 사실 기재가 분명한 경우만
#    LIKELY_VIOLATION 수준의 더 강한 사유로 표시한다.
# 3) 같은 주제에서 고확신 패턴이 검출되면 REVIEW 행을 중복 생성하지 않는다.
# 4) 최종 위반 여부는 담당 교사가 판단한다.
_MOE_SENSITIVE_RULES = [
    {
        "topic": "LANG_TEST",
        "review_rule_id": "MOE-LANG-TEST-REVIEW",
        "review_reason": "공인어학시험 관련 표현 확인 필요",
        "sensitive_pattern": re.compile(
            r"(?i)(?:TOEIC|TOEFL|TEPS|HSK|JPT|JLPT|(?<![A-Za-z])DELF(?![A-Za-z])|DALF|TESTDAF|DSH|DSD|TORFL|DELE|"
            r"토익|토플|텝스|공인어학시험)"
        ),
        "high_rule_id": "MOE-LANG-TEST-HIGH",
        "high_reason": "공인어학시험 참여/성적 기재 의심",
        "high_pattern": re.compile(
            r"(?i)(?:"
            r"(?:TOEIC|TOEFL|TEPS|HSK|JPT|JLPT|(?<![A-Za-z])DELF(?![A-Za-z])|DALF|TESTDAF|DSH|DSD|TORFL|DELE|토익|토플|텝스)"
            r"[^.!?\n]{0,25}?(?:응시|참여|성적|점수|등급|수상|입상|[0-9]{2,4}\s*점)|"
            r"(?:응시|참여|성적|점수|등급|수상|입상)[^.!?\n]{0,25}?"
            r"(?:TOEIC|TOEFL|TEPS|HSK|JPT|JLPT|(?<![A-Za-z])DELF(?![A-Za-z])|DALF|TESTDAF|DSH|DSD|TORFL|DELE|토익|토플|텝스)|"
            r"공인어학시험[^.!?\n]{0,20}?(?:응시|참여|성적|점수|등급|수상|입상)"
            r")"
        ),
    },
    {
        "topic": "MOCK_EXAM",
        "review_rule_id": "MOE-MOCK-SCORE-REVIEW",
        "review_reason": "모의고사/전국연합 관련 표현 확인 필요",
        # Named exam expressions always remain candidates, including study,
        # quotation and plans. A generic '점수' alone is not this rule's trigger.
        "sensitive_pattern": re.compile(r"모의\s*고사|학력\s*평가|모의\s*수능|전국\s*연합"),
        "high_rule_id": "MOE-MOCK-SCORE-HIGH",
        "high_reason": "모의고사/전국연합 성적 기재 의심",
        "high_pattern": re.compile(
            r"(?:모의\s*고사|학력\s*평가|모의\s*수능|전국\s*연합)[^.!?\n]{0,35}?(?:원점수|점수|석차|석차등급|등급|백분위|[1-9]\s*등급)"
        ),
    },
    {
        "topic": "COMPETITION",
        "review_rule_id": "MOE-COMPETITION-REVIEW",
        "review_reason": "대회 관련 표현 확인 필요",
        # '대회전', '대회랑', '대회에', '교내대회' 등 '대회'가 포함되면 일단 REVIEW
        "sensitive_pattern": re.compile(r"대회"),
        "high_rule_id": "MOE-COMPETITION-HIGH",
        "high_reason": "대회 참여/수상 기재 의심",
        "high_pattern": re.compile(
            # 실제 행위를 서술하는 종결/연결 표현이 있을 때만 고확신으로 강화한다.
            # 예: '대회 참가 기준을 조사함'은 '참가' 뒤에 행위 종결이 없으므로 REVIEW 유지.
            r"(?:교내\s*|교외\s*)?대회[^.!?\n]{0,20}?(?:참가|참여|출전|수상|입상)(?:함|했|하여|하고|하였|함으로)|"
            r"(?:참가|참여|출전|수상|입상)(?:함|했|하여|하고|하였|함으로)[^.!?\n]{0,20}?(?:교내\s*|교외\s*)?대회"
        ),
    },
    {
        "topic": "BOOK_PUBLISH",
        "review_rule_id": "MOE-BOOK-PUBLISH-REVIEW",
        "review_reason": "도서 출간 관련 표현 확인 필요",
        # '책' 자체는 독서활동에서 너무 흔하므로 출간/출판 표현이 있을 때 REVIEW
        "sensitive_pattern": re.compile(r"출간|출판"),
        "high_rule_id": "MOE-BOOK-PUBLISH-HIGH",
        "high_reason": "도서 출간 사실 기재 의심",
        "high_pattern": re.compile(
            r"(?:자신의|본인의|직접\s*)?[^.!?\n]{0,8}?(?:도서|책)(?:을|를)?\s*(?:직접\s*)?(?:출간|출판)(?:함|했|하여|하고|하였|한)"
        ),
    },
    {
        "topic": "IP",
        "review_rule_id": "MOE-IP-REVIEW",
        "review_reason": "지식재산권 관련 표현 확인 필요",
        # 사용자가 요청한 방향: '특허' 등이 들어가면 실제 출원 여부와 무관하게 일단 REVIEW
        "sensitive_pattern": re.compile(r"특허|실용신안|상표권|디자인권|지식재산권"),
        "high_rule_id": "MOE-IP-HIGH",
        "high_reason": "지식재산권 출원/등록 기재 의심",
        "high_pattern": re.compile(
            r"(?:특허|실용신안|상표권|디자인권|지식재산권)(?:을|를)?\s*(?:직접\s*)?(?:출원|등록)(?:함|했|하여|하고|하였|한)"
        ),
    },
    {
        "topic": "SCHOLARSHIP",
        "review_rule_id": "MOE-SCHOLARSHIP-REVIEW",
        "review_reason": "장학생/장학금 관련 내용 확인 필요",
        "sensitive_pattern": re.compile(r"장학생|장학금"),
        "high_rule_id": None,
        "high_reason": None,
        "high_pattern": None,
    },
    {
        "topic": "CERTIFICATE",
        "review_rule_id": "MOE-CERTIFICATE-REVIEW",
        "review_reason": "자격증 관련 표현 확인 필요",
        "sensitive_pattern": re.compile(r"자격증"),
        "high_rule_id": "MOE-CERTIFICATE-HIGH",
        "high_reason": "자격증 취득 사실 기재 의심",
        "high_pattern": re.compile(
            r"자격증(?:을|를)?\s*(?:직접\s*)?(?:취득|합격)(?:함|했|하여|하고|하였|한)|"
            r"(?:취득|합격)(?:함|했|하여|하고|하였|한)[^.!?\n]{0,15}?자격증"
        ),
    },
]


def _moe_match_is_exception(topic, match, text):
    """True only when every sensitive keyword inside this match is an approved whole-term exception."""
    patterns = _MOE_TERM_EXCEPTIONS.get(topic, ())
    if not patterns:
        return False
    if topic != "COMPETITION":
        return any(p.search(text, match.start(), match.end()) for p in patterns)

    # Competition patterns can span surrounding activity language.  Exclude the
    # match only when each embedded '대회' occurrence belongs to an approved
    # whole term such as '인민대회당'.  A later real '교외 대회' still detects.
    keyword_positions = [
        m.start() for m in re.finditer("대회", text[match.start():match.end()])
    ]
    if not keyword_positions:
        return False
    exception_spans = []
    for pattern in patterns:
        for exc in pattern.finditer(text):
            exception_spans.append((exc.start(), exc.end()))
    for relative in keyword_positions:
        absolute = match.start() + relative
        if not any(st <= absolute and absolute + 2 <= en for st, en in exception_spans):
            return False
    return True


def _first_moe_nonexception_match(rule, pattern, text):
    if pattern is None:
        return None
    for match in pattern.finditer(text):
        if _moe_match_is_exception(rule.get("topic"), match, text):
            continue
        return match
    return None


def _check_moe_sensitive_rules(text):
    """
    교육부 민감표현을 REVIEW / LIKELY_VIOLATION 두 단계로 판별한다.

    반환: (results, covered_spans)
    - 같은 topic에서 high_pattern이 맞으면 REVIEW는 추가하지 않는다.
    - covered_spans는 영어표기 검사 등에서 같은 표현을 중복 보고하지 않기 위해 사용한다.
    """
    results = []
    covered_spans = []

    for rule in _MOE_SENSITIVE_RULES:
        high_match = _first_moe_nonexception_match(
            rule, rule.get("high_pattern"), text
        )

        if high_match:
            covered_spans.append((high_match.start(), high_match.end()))
            results.append({
                "rule_id": rule["high_rule_id"],
                "검토수준": "LIKELY_VIOLATION",
                "오류사유": rule["high_reason"],
                "오류내용": _extract_match_context(text, high_match, chars=35),
            })
            continue

        review_match = _first_moe_nonexception_match(
            rule, rule["sensitive_pattern"], text
        )
        if not review_match:
            continue

        covered_spans.append((review_match.start(), review_match.end()))
        results.append({
            "rule_id": rule["review_rule_id"],
            "검토수준": "REVIEW",
            "오류사유": rule["review_reason"],
            "오류내용": _extract_match_context(text, review_match, chars=35),
        })

    return results, covered_spans


def _occurrence_covered_by_exception(word_lower, start, end, text_orig):
    """해당 금칙어 *출현 위치*가 확정 예외 패턴 내부인지 판정한다."""
    patterns = _FALSE_POS_PATTERNS.get(word_lower, ())
    if not patterns:
        return False
    for pattern in patterns:
        for match in pattern.finditer(text_orig):
            if match.start() <= start and end <= match.end():
                return True
    return False


def _is_false_positive(word_lower, text_lower, text_orig):
    """금지어의 모든 출현이 확정 정상문맥/부분문자열인지 판정한다."""
    return next(_valid_name_matches(word_lower, text_lower, text_orig), None) is None


def _valid_name_matches(word_lower, text_lower, text_orig):
    """Preserve approved exceptions/boundaries and keep actual match positions."""
    for match in re.finditer(re.escape(word_lower), text_lower):
        if word_lower == "라인" and any(
            candidate.span('term') == match.span()
            for candidate in _NAIL_LINE_EXPRESSION.finditer(text_orig)
        ):
            continue
        if _occurrence_covered_by_exception(
            word_lower, match.start(), match.end(), text_orig
        ):
            continue

        # 짧은 키워드 → 단어 경계 검사 (앞뒤가 한글·영문이면 부분 매칭 → 오탐)
        if word_lower in _BOUNDARY_REQUIRED:
            before = text_lower[match.start() - 1] if match.start() > 0 else " "
            after = text_lower[match.end()] if match.end() < len(text_lower) else " "
            if re.match(r'[a-z가-힣]', before) or re.match(r'[a-z가-힣]', after):
                continue

        yield match


# ════════════════════════════════════════════════════════════════
# 문맥 추출 헬퍼
# ════════════════════════════════════════════════════════════════
def _extract_context(text, keyword, chars=35):
    """키워드 주변 앞뒤 문맥을 잘라서 【키워드】로 감싸 반환"""
    idx = text.lower().find(keyword.lower())
    if idx == -1:
        return f"【{keyword}】"
    start = max(0, idx - chars)
    end = min(len(text), idx + len(keyword) + chars)
    prefix = "..." if start > 0 else ""
    suffix = "..." if end < len(text) else ""
    before = text[start:idx]
    matched = text[idx:idx + len(keyword)]
    after = text[idx + len(keyword):end]
    return f"{prefix}{before}【{matched}】{after}{suffix}"


def _extract_match_context(text, match, chars=35):
    """정규식 match 주변 문맥을 잘라 검출 구간을 【】로 감싸 반환."""
    start = max(0, match.start() - chars)
    end = min(len(text), match.end() + chars)
    prefix = "..." if start > 0 else ""
    suffix = "..." if end < len(text) else ""
    return (
        f"{prefix}{text[start:match.start()]}"
        f"【{text[match.start():match.end()]}】"
        f"{text[match.end():end]}{suffix}"
    )



# ════════════════════════════════════════════════════════════════
# STEP 13.1 — 공백/숨은 문자 결정적 검사
# ════════════════════════════════════════════════════════════════
# Local은 눈에 보이지 않거나 육안으로 놓치기 쉬운 문자 결함을 항상 검사한다.
# - ASCII 일반 공백(U+0020)이 2개 이상 연속된 경우
# - Unicode format character(Cf)
# - 일반 공백이 아닌 Unicode separator(Zs/Zl/Zp)
# - 탭/수직탭/폼피드
# 표준 한 칸 공백과 일반 줄바꿈(\n/\r)은 허용한다.
_HIDDEN_CHAR_DISPLAY_NAMES = {
    "\u200b": "ZERO WIDTH SPACE",
    "\u200c": "ZERO WIDTH NON-JOINER",
    "\u200d": "ZERO WIDTH JOINER",
    "\u2060": "WORD JOINER",
    "\ufeff": "ZERO WIDTH NO-BREAK SPACE/BOM",
    "\u00a0": "NO-BREAK SPACE",
    "\u202f": "NARROW NO-BREAK SPACE",
    "\u2007": "FIGURE SPACE",
    "\u00ad": "SOFT HYPHEN",
    "\t": "TAB",
    "\v": "VERTICAL TAB",
    "\f": "FORM FEED",
}


def _is_hidden_or_nonstandard_space(ch):
    """학생부 원문에서 검토할 숨은 문자/비표준 공백인지 판정한다."""
    if ch in {"\t", "\v", "\f"}:
        return True
    category = unicodedata.category(ch)
    if category == "Cf":
        return True
    if category in {"Zs", "Zl", "Zp"} and ch != " ":
        return True
    return False


def _hidden_char_label(ch):
    code = f"U+{ord(ch):04X}"
    name = _HIDDEN_CHAR_DISPLAY_NAMES.get(ch) or unicodedata.name(ch, "UNKNOWN CHARACTER")
    return f"{name} ({code})"


def _render_hidden_chars_for_context(value):
    """문맥 속 다른 숨은 문자도 교사가 볼 수 있는 설명 문자열로 바꾼다."""
    parts = []
    for ch in str(value or ""):
        if _is_hidden_or_nonstandard_space(ch):
            parts.append(f"<{_hidden_char_label(ch)}>")
        else:
            parts.append(ch)
    return "".join(parts)


def _marked_context(text, start, end, marker_text, chars=28):
    text = str(text or "")
    ws = max(0, start - chars)
    we = min(len(text), end + chars)
    prefix = "..." if ws > 0 else ""
    suffix = "..." if we < len(text) else ""
    before = _render_hidden_chars_for_context(text[ws:start])
    after = _render_hidden_chars_for_context(text[end:we])
    return f"{prefix}{before}【{marker_text}】{after}{suffix}"


def _extract_consecutive_space_contexts(text, chars=28):
    """ASCII 연속 공백을 위치별로 모두 표시한다."""
    contexts = []
    for match in re.finditer(r" {2,}", str(text or "")):
        count = match.end() - match.start()
        contexts.append(
            _marked_context(
                text,
                match.start(),
                match.end(),
                f"연속 공백 {count}칸",
                chars=chars,
            )
        )
    return contexts


def _extract_hidden_char_contexts(text, chars=28):
    """숨은 문자/비표준 공백의 모든 위치를 사람이 읽을 수 있게 표시한다."""
    contexts = []
    text = str(text or "")
    for index, ch in enumerate(text):
        if not _is_hidden_or_nonstandard_space(ch):
            continue
        contexts.append(
            _marked_context(
                text,
                index,
                index + 1,
                _hidden_char_label(ch),
                chars=chars,
            )
        )
    return contexts


def _extract_symbol_contexts(text, symbols, chars=25):
    """가까운 특수기호들을 한 문맥으로 묶고, 검출 기호만 【】로 표시한다.

    예: <최종 보고서>로 제출함★ -> 같은 문맥을 3번 반복하지 않고
        【<】최종 보고서【>】로 제출함【★】 형태로 한 번만 반환한다.
    """
    text = str(text or "")
    symbol_set = set(symbols or ())
    positions = [i for i, ch in enumerate(text) if ch in symbol_set]
    if not positions:
        return []

    # 연속 기호(예: !!)는 하나의 강조 구간으로 묶는다.
    spans = []
    span_start = prev = positions[0]
    for pos in positions[1:]:
        if pos == prev + 1:
            prev = pos
            continue
        spans.append((span_start, prev + 1))
        span_start = prev = pos
    spans.append((span_start, prev + 1))

    # 각 강조 구간 주변 window가 겹치면 하나의 문맥으로 합친다.
    windows = []
    for st, en in spans:
        ws = max(0, st - chars)
        we = min(len(text), en + chars)
        if windows and ws <= windows[-1][1]:
            windows[-1] = (windows[-1][0], max(windows[-1][1], we))
        else:
            windows.append((ws, we))

    contexts = []
    for ws, we in windows:
        relevant = [(st, en) for st, en in spans if st < we and en > ws]
        cursor = ws
        parts = []
        for st, en in relevant:
            st = max(st, ws)
            en = min(en, we)
            if st > cursor:
                parts.append(text[cursor:st])
            parts.append(f"【{text[st:en]}】")
            cursor = en
        if cursor < we:
            parts.append(text[cursor:we])
        prefix = "..." if ws > 0 else ""
        suffix = "..." if we < len(text) else ""
        contexts.append(prefix + "".join(parts) + suffix)
    return contexts



# ════════════════════════════════════════════════════════════════
# STEP 17.3 — 특수기호 3단계 판정
# ════════════════════════════════════════════════════════════════
def _nearest_nonspace(text, index, step):
    pos = index + step
    while 0 <= pos < len(text) and text[pos].isspace():
        pos += step
    return text[pos] if 0 <= pos < len(text) else ""


def _is_allowed_ascii_hyphen(text, index):
    """ASCII '-'는 숫자-숫자 범위/기간 표기에서만 자동 허용한다."""
    before = _nearest_nonspace(text, index, -1)
    after = _nearest_nonspace(text, index, 1)
    return bool(before and after and before.isdigit() and after.isdigit())


def _symbol_level(text, index):
    ch = text[index]
    if ch in rule_exceptions.SYMBOL_ALLOWED:
        return "ALLOW"
    if ch in rule_exceptions.SYMBOL_FORBIDDEN:
        return "FORBIDDEN"
    if ch in rule_exceptions.SYMBOL_CONTEXT_RULES:
        rule = rule_exceptions.SYMBOL_CONTEXT_RULES[ch]
        if rule == "ASCII_HYPHEN_NUMERIC_RANGE":
            return "ALLOW" if _is_allowed_ascii_hyphen(text, index) else "REVIEW"
        return "REVIEW"
    if ch in rule_exceptions.SYMBOL_REVIEW:
        return "REVIEW"

    # Unknown punctuation/symbols are never silently allowed.
    category = unicodedata.category(ch)
    if category.startswith("P") or category.startswith("S"):
        return "REVIEW"
    return None


def _classify_symbol_positions(text):
    review_positions = []
    forbidden_positions = []
    for index, _ in enumerate(str(text or "")):
        level = _symbol_level(text, index)
        if level == "REVIEW":
            review_positions.append(index)
        elif level == "FORBIDDEN":
            forbidden_positions.append(index)
    return review_positions, forbidden_positions


def _extract_symbol_contexts_at_positions(text, positions, chars=25):
    """정확한 검출 위치만 【】로 표시하고 가까운 문맥은 한 번으로 합친다."""
    text = str(text or "")
    positions = sorted(set(int(pos) for pos in positions if 0 <= int(pos) < len(text)))
    if not positions:
        return []

    spans = []
    span_start = prev = positions[0]
    for pos in positions[1:]:
        if pos == prev + 1:
            prev = pos
            continue
        spans.append((span_start, prev + 1))
        span_start = prev = pos
    spans.append((span_start, prev + 1))

    windows = []
    for st, en in spans:
        ws = max(0, st - chars)
        we = min(len(text), en + chars)
        if windows and ws <= windows[-1][1]:
            windows[-1] = (windows[-1][0], max(windows[-1][1], we))
        else:
            windows.append((ws, we))

    contexts = []
    for ws, we in windows:
        relevant = [(st, en) for st, en in spans if st < we and en > ws]
        cursor = ws
        parts = []
        for st, en in relevant:
            st = max(st, ws)
            en = min(en, we)
            if st > cursor:
                parts.append(text[cursor:st])
            parts.append(f"【{text[st:en]}】")
            cursor = en
        if cursor < we:
            parts.append(text[cursor:we])
        prefix = "..." if ws > 0 else ""
        suffix = "..." if we < len(text) else ""
        contexts.append(prefix + "".join(parts) + suffix)
    return contexts


# ════════════════════════════════════════════════════════════════
# 로컬 규칙 검사 — 오류별 개별 dict 반환
# ════════════════════════════════════════════════════════════════
_INLINE_QUOTE_PATTERNS = tuple(
    re.compile(re.escape(opening) + r"(?P<body>[^" + re.escape(opening + closing)
               + r"\r\n]*)" + re.escape(closing))
    for opening, closing in (("'", "'"), ('"', '"'), ('‘', '’'), ('“', '”'))
)
_INLINE_QUOTE_PARTICLE = re.compile(
    r"(?:이라고|이라는|이라며|이란|라고|라는|라며|란|으로|에서|에게|처럼|보다|[을를의와과은는이가에로])"
)


def _inline_quoted_ending_periods(text):
    """Only a closed, single-sentence quotation continued by narrative.

    Keep ellipses, unclosed quotations and standalone quoted sentences under
    the existing ending rule. A comma-separated quote list can share the final
    quote's particle, as in 'example.', 'another example.'와 같이 설명함.
    This returns punctuation positions, never modifies the source or exempts
    the quotation from any other Local/AI check.
    """
    quotes = {}
    for pattern in _INLINE_QUOTE_PATTERNS:
        for match in pattern.finditer(text):
            # An apostrophe inside an English word is not an opening quote.
            if match.start() and text[match.start()-1].isascii() and text[match.start()-1].isalnum():
                continue
            quotes[match.start()] = match
    continued = {}
    # Resolve right-to-left, so each following quote in a comma list is visited
    # once instead of rescanning a long list for every earlier quotation.
    for start, match in sorted(quotes.items(), reverse=True):
        tail = match.end()
        valid = bool(_INLINE_QUOTE_PARTICLE.match(text, tail))
        if not valid:
            while tail < len(text) and text[tail].isspace():
                tail += 1
            if tail < len(text) and text[tail] == ',':
                tail += 1
                while tail < len(text) and text[tail].isspace():
                    tail += 1
                valid = continued.get(tail, False)
        continued[start] = valid
    periods = set()
    for start, match in quotes.items():
        body = match.group('body').rstrip()
        if (continued[start] and body.endswith('.') and body.count('.') == 1
                and '…' not in body and '⋯' not in body):
            periods.add(match.start('body') + len(body) - 1)
    return periods


def check_local_rules(text):
    """
    반환: list of dict  ─  각 dict = { "rule_id", "오류사유", "오류내용", ... }
    오류가 없으면 빈 리스트.
    """
    results = []
    if not isinstance(text, str) or text == "":
        return results

    text_lower = text.lower()

    # ── 1) 금지어 검사 (카테고리별 오류사유) ──────────────────
    seen_words = set()
    name_covered_spans = []
    for word, category in PROHIBITED_DB.items():
        if word in text_lower and word not in seen_words:
            matches = list(_valid_name_matches(word, text_lower, text))
            if not matches:
                continue
            seen_words.add(word)
            name_covered_spans.extend(match.span() for match in matches)
            context = _extract_match_context(text, matches[0], chars=35)
            results.append({
                "rule_id": "LOCAL-NAME",
                "오류사유": category,
                "오류내용": context,
            })

    # ── 1-B) 교육부 민감표현: 넓게 REVIEW, 명확한 사실은 LIKELY_VIOLATION ──
    moe_results, moe_covered_spans = _check_moe_sensitive_rules(text)
    results.extend(moe_results)

    # ── 2) 영어/외국어 표기 검사 ─────────────────────────────
    #     금지어로 이미 잡힌 영단어 제외 / 인접 단어는 하나의 구(phrase)로 묶음.
    #     STEP 17.3: 검증된 exact token 예외는 grouping 전에 제거한다.
    #     따라서 AI는 제외되지만 OpenAI / AI-based의 나머지 영문은 계속 검출된다.
    _raw_eng_tokens = list(re.finditer(r'[a-zA-Z]+(?:-[a-zA-Z]+)*', text))
    _raw_eng_tokens.extend(_CJK_FOREIGN_PATTERN.finditer(text))
    _raw_eng_tokens.sort(key=lambda token: token.start())
    _eng_tokens = [
        token for token in _raw_eng_tokens
        if token.group(0).lower() not in rule_exceptions.FOREIGN_TEXT_EXCEPTIONS
        and not any(left <= token.start() and token.end() <= right
                    for left, right in name_covered_spans + moe_covered_spans)
    ]
    eng_phrases = []
    ei = 0
    while ei < len(_eng_tokens):
        start = _eng_tokens[ei].start()
        end   = _eng_tokens[ei].end()
        ej = ei + 1
        while ej < len(_eng_tokens):
            gap = text[end:_eng_tokens[ej].start()]
            if gap.strip() == '' and len(gap) <= 2:   # 공백 1~2칸 → 같은 구
                end = _eng_tokens[ej].end()
                ej += 1
            else:
                break
        phrase = text[start:end]
        eng_phrases.append((phrase, start, end))
        ei = ej

    if eng_phrases:
        contexts = []
        for phrase, st, en in eng_phrases:
            cs = max(0, st - 25)
            ce = min(len(text), en + 25)
            pfx = "..." if cs > 0 else ""
            sfx = "..." if ce < len(text) else ""
            contexts.append(f"{pfx}{text[cs:st]}【{phrase}】{text[en:ce]}{sfx}")
        results.append({
            "rule_id": "LOCAL-FOREIGN-TEXT",
            "오류사유": "영어/외국어 표기",
            "오류내용": " ── ".join(contexts),
        })

    # ── 3) 연속 공백 검사 ────────────────────────────────────
    consecutive_space_contexts = _extract_consecutive_space_contexts(text, chars=28)
    if consecutive_space_contexts:
        results.append({
            "rule_id": "LOCAL-CONSECUTIVE-SPACES",
            "오류사유": "연속 공백 사용",
            "오류내용": " ── ".join(consecutive_space_contexts),
        })

    # ── 4) 숨은 문자·비표준 공백 검사 ─────────────────────────
    hidden_char_contexts = _extract_hidden_char_contexts(text, chars=28)
    if hidden_char_contexts:
        results.append({
            "rule_id": "LOCAL-HIDDEN-CHAR",
            "오류사유": "숨은 문자·비표준 공백 사용",
            "오류내용": " ── ".join(hidden_char_contexts),
        })

    # ── 5) 특수기호 검사 ─────────────────────────────────────
    # STEP 17.3 3단계 정책
    # - 명시 허용 + 숫자 범위의 ASCII '-' : PASS
    # - 명시 금지                           : 금지기호 사용(수정필요)
    # - 그 밖의 Unicode punctuation/symbol : 특수기호 사용(확인필요)
    # - U+318D 아래아는 문자(Lo)이지만 명시 REVIEW로 관리한다.
    review_positions, forbidden_positions = _classify_symbol_positions(text)
    if review_positions:
        contexts = _extract_symbol_contexts_at_positions(text, review_positions, chars=25)
        results.append({
            "rule_id": "LOCAL-SPECIAL-SYMBOL",
            "오류사유": "특수기호 사용(확인필요)",
            "오류내용": " ── ".join(contexts),
        })
    if forbidden_positions:
        contexts = _extract_symbol_contexts_at_positions(text, forbidden_positions, chars=25)
        results.append({
            "rule_id": "LOCAL-FORBIDDEN-SYMBOL",
            "오류사유": "금지기호 사용(수정필요)",
            "오류내용": " ── ".join(contexts),
        })

    # ── 6) 종결어미 검사 ─────────────────────────────────────
    #     허용 받침: ㅁ(16), ㄻ(10)  ← "이끎" 등 명사형 어미 허용
    ALLOWED_JONGSEONG = {16, 10}
    quoted_periods = _inline_quoted_ending_periods(text)
    sentence_start = 0
    for sentence in text.split('.'):
        period = sentence_start + len(sentence)
        sentence_start = period + 1
        if period in quoted_periods:
            continue
        s = sentence.strip()
        if not s:
            continue
        last_char = s[-1]
        if '가' <= last_char <= '힣':
            jongseong_idx = (ord(last_char) - 44032) % 28
            if jongseong_idx not in ALLOWED_JONGSEONG:
                # 틀린 종결 부분(마지막 어절)을 【】로 감싸기
                last_sp = s.rfind(' ')
                if last_sp >= 0 and len(s) - last_sp <= 12:
                    before = s[max(0, last_sp - 20):last_sp + 1]
                    wrong  = s[last_sp + 1:]
                else:
                    before = s[max(0, len(s) - 20):max(0, len(s) - 6)]
                    wrong  = s[-min(len(s), 6):]
                pfx = "..." if len(s) > len(before) + len(wrong) else ""
                results.append({
                    "rule_id": "LOCAL-ENDING",
                    "오류사유": "어미 오류",
                    "오류내용": f"{pfx}{before}【{wrong}】.",
                })

    return results
