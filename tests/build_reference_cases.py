"""Pin expected rule IDs/reasons/levels using only synthetic text and the reference."""
import importlib.util
import json
from pathlib import Path
import random
import sys
import types
import unicodedata

if unicodedata.unidata_version != '15.0.0':
    raise RuntimeError('Use Python Unicode 15.0.0 to regenerate reference expectations.')

ROOT = Path(__file__).resolve().parent
package = types.ModuleType('reference')
package.__path__ = [str(ROOT / 'reference')]
sys.modules['reference'] = package
spec = importlib.util.spec_from_file_location('reference.local_rules', ROOT / 'reference/local_rules.py')
rules = importlib.util.module_from_spec(spec)
spec.loader.exec_module(rules)
texts = [None, 0, '', '탐구 내용을 성실히 정리함.', 'AI 모델을 활용함.',
         '발표를 이끎.', '새로운 사실을 깨달음.', '결과를 정리했다.', '결과를 정리함.\n발표했다.',
         '영어 a A I B와 한자 漢字, 중국어 中文, 일본어 日本語 カタカナ ひらがな ﾊﾝｶｸ를 살펴봄.',
         '𠀀𰀀𠮷を 탐구함.', '👍유튜브 분석함.', 'İYoutube 분석함.', 'İ줌 사용함.',
         'TOEİC 점수를 기록함.', 'TOEıC 활용함.', 'İ' * 10 + '보여줌', 'İ' * 12 + '메타인지',
         'AI OpenAI AI-based AI\nAI  AI   AI 분석함.',
         '1 - 2, ²-³, 𝟙-𝟚 범위를 정함.', '가-나, - 시작함.', '1\ufeff-2 기록함.',
         '구글 구글 google GOOGLE 영상을 분석함.', '동일한 단어 특허와 특허가 반복됨.',
         '개인 점수의 계산 원리를 조사함.', '모의 고사 점수의 원리를 탐구함.',
         '학력 평가에 대해 알아봄.', '학력평가 1등급을 받음.',
         '대회 참가 기준을 조사함.', '대회에 참가함.', '대회에 수상함.',
         '인민대회당을 탐구함.', '인민대회당을 탐구하고 교외 대회에 참가함.',
         '책을 출판함.', '출판 산업을 조사함.', '책을 읽음.',
         '특허를 출원함.', '특허를 조사함.', '자격증을 취득함.', '자격증 취득을 희망함.',
         '자격증을 취득할 계획임.', '장학생과 장학금을 탐구함.',
         'TOEIC 성적을 기록함. TOEIC 활용함.', 'TOEIC와 TOEFL을 조사함.',
         '다음 과제를 진행함.', '한 다음에 정리함.', '다음에는 발표함.', '다음 검색을 활용함.',
         '도움을 줌. 줌 회의를 활용함.', '보여줌. 줌 회의함.',
         '메타인지와 메타버스 메타 분석을 탐구함.', '메타 기업을 탐구함.', '블로그 블로킹을 탐구함.',
         '풀코트 컬러링과 라인 표현을 연습함. 라인 메신저를 탐구함.',
         '풀코트 컬러링에서 라인 표현을 연습함.',
         "'나는 성장한다.'라는 문장을 분석함.", "'나는 성장한다.'와 '나는 발전한다.'를 분석함.",
         "'나는 성장한다.', '나는 발전한다.'와 같이 설명함.", "'나는 성장한다.'",
         "'나는 성장한다.' 다음 활동을 했다.", "'나는 성장한다... '라는 문장을 분석함.",
         "'첫째다. 둘째다.'라는 글을 분석함.", '“나는 성장한다.”라는 글을 분석함.',
         "a'나는 성장한다.'라는 글을 분석함.", "😀 '나는 성장한다.'라는 글을 분석함.",
         '공백  두칸   세칸을 살펴봄.', '탭\t문자와\u200b숨은\u00a0공백을 살펴봄.',
         '가\n나\r\n다\u001c끝함.', '수식 = 및 + 표현을 탐구함.',
         '한자 漢\u3099을 탐구함.', '장식【별★】을 탐구함.']

for word in rules.PROHIBITED_DB:
    texts.extend([word + ' 활용함.', word.upper() + ' 활용함.', '가' + word + '나 활용함.',
                  '👍 ' + word + ' 활용함.', word + ' 및 ' + word + ' 활용함.'])
for cp in range(0x110000):
    if rules._is_hidden_or_nonstandard_space(chr(cp)):
        texts.append('앞' + chr(cp) + '뒤를 살펴봄.')
for ch in rules.rule_exceptions.SYMBOL_ALLOWED | rules.rule_exceptions.SYMBOL_REVIEW | rules.rule_exceptions.SYMBOL_FORBIDDEN:
    texts.append('기호' + ch + '을 살펴봄.')
random.seed(20261104)
pool = ['구글', '다음', '줌', '특허', '자격증', '대회', '인민대회당', 'TOEIC', 'TOEİC',
        'AI', 'OpenAI', '漢字', '𠀀', '·', '~', '—', ' ', '  ', '\u200b', '\u00a0', '\ufeff',
        'İ', '👍', "'문장을 읽는다.'라는", '정리함.', '발표했다.', '1 - 2']
for _ in range(350):
    texts.append(' '.join(random.choices(pool, k=random.randint(1, 10))))

cases = []
seen = set()
for text in texts:
    key = json.dumps(text, ensure_ascii=True)
    if key in seen:
        continue
    seen.add(key)
    cases.append({'text': text, 'expected': [[r['rule_id'], r['오류사유'], r.get('검토수준')]
                                            for r in rules.check_local_rules(text)]})
(ROOT / 'reference_cases.json').write_text(json.dumps(cases, ensure_ascii=True, indent=2) + '\n', encoding='utf-8')
print('Pinned Python cases:', len(cases))
