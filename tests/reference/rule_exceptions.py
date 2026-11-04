"""STEP 17.3 data-driven Local Rule exception/punctuation policy.

This module intentionally owns *lists and narrow patterns*, not detection logic.
Only false positives repeatedly confirmed in the 2nd/3rd-grade subject data and
3rd-grade activity data are added here. Ambiguous cases stay detectable.
"""

# ---------------------------------------------------------------------------
# 1) 금칙어/상호명 검출 제외 패턴
# ---------------------------------------------------------------------------
# Each regex must include the prohibited keyword itself. local_rules.py checks
# whether the exact keyword occurrence is covered by one of these matches.
FORBIDDEN_TERM_EXCEPTIONS = {
    "줌": (
        r"(?:보여|심어|길러|덮어|부여|말해|불러|넓혀)줌",
        r"(?:보여|심어|길러|넓혀|설명해|가르쳐|이끌어)\s+줌",
        r"(?:신뢰감|신뢰|인상|깊은\s+인상|감동|울림|도움|큰\s+도움|영향|안정감)(?:을|를)?\s+줌",
        r"(?:설명|언급|제시|유도)하여\s+줌",
    ),
    "다음": (
        r"다음\s+(?:시도|차시|목표|과제|활동|단계|세대|타구|동작|회차|주기|음표|기회|수업|과정|물음|연구|공격|단어|당첨|공정|주자)",
        r"다음(?:에|에는)(?=$|[\s,.!?;:'\"“”‘’()\[\]{}]|[은는이가을를도의로와과])",
        r"한\s+다음(?:에|에는)?",
    ),
    "메타": (
        r"메타버스",
        r"메타데이터",
        r"메타인지(?:적)?",
        r"메타\s*분석",
        r"메타\s*연구",
        r"메타물질",
    ),
    "블로": (
        r"블로그",
        r"블로킹",
    ),
    "알로": (
        r"알로스테릭",
    ),
}


# ---------------------------------------------------------------------------
# 1-B) 교육부 민감표현 내부 허용어 예외
# ---------------------------------------------------------------------------
# 장학사 확인으로 사용 가능하다고 확정된 전체 어휘만 좁게 제외한다.
# 부분 문자열 '대회' 일반 예외로 확장하지 않는다.
MOE_TERM_EXCEPTIONS = {
    "COMPETITION": (
        r"인민대회당",
    ),
}


# ---------------------------------------------------------------------------
# 2) 영어/외국어 검출 제외 목록
# ---------------------------------------------------------------------------
# Exact independent English token only.  "OpenAI" or "AI-based" is NOT exempt.
FOREIGN_TEXT_EXCEPTIONS = frozenset({
    "ai",
})


# ---------------------------------------------------------------------------
# 3) 기호 정책
# ---------------------------------------------------------------------------
# Explicitly safe basic punctuation. General Hangul/letters/numbers are not
# handled by this table; this is only for punctuation/symbol review.
SYMBOL_ALLOWED = frozenset({
    ".",  # U+002E FULL STOP
    ",",  # U+002C COMMA
    "(",  # U+0028 LEFT PARENTHESIS
    ")",  # U+0029 RIGHT PARENTHESIS
    "'",  # U+0027 APOSTROPHE
})

# Review-stage symbols: detectable, but not automatically treated as forbidden.
SYMBOL_REVIEW = frozenset({
    "·",  # U+00B7 MIDDLE DOT
    "ㆍ",  # U+318D HANGUL LETTER ARAEA
})

# Strongly disallowed / must be corrected in the teacher report.
# All unlisted Unicode punctuation/symbol characters are still REVIEW by default.
SYMBOL_FORBIDDEN = frozenset({
    # Tilde / wave variants
    "~", "～", "〜", "∼",

    # Asterisk / star / triangle / decorative marks
    "*", "＊", "★", "☆", "△", "▲", "▽", "▼", "◁", "▷", "◀", "▶", "※",

    # Arrows
    "→", "←", "↑", "↓", "⇒", "⇐", "⇔", "↔",

    # Angle / corner / book-title / square / curly brackets
    "<", ">", "＜", "＞", "〈", "〉", "《", "》", "≪", "≫", "«", "»",
    "「", "」", "『", "』", "【", "】", "〔", "〕", "〖", "〗", "〘", "〙", "〚", "〛",
    "[", "]", "［", "］", "{", "}", "｛", "｝",

    # Non-standard middle-dot / bullet variants
    "・", "･", "•", "●", "○", "◎", "◇", "◆", "□", "■", "◯",

    # Non-ASCII dash/minus lookalikes: ASCII '-' is context-sensitive below.
    "‐", "‑", "‒", "–", "—", "―", "−", "－",

    # Full-width / CJK lookalikes of basic period/comma
    "．", "，", "。", "、", "｡", "､",
})

# Context-sensitive punctuation policy owned by local_rules.py.
SYMBOL_CONTEXT_RULES = {
    "-": "ASCII_HYPHEN_NUMERIC_RANGE",
}
