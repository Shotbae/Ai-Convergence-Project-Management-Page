module.exports = function ({context, test, assert, normalize}) {
  const extras = text => normalize(context.checkSetcAdditionalRules_(text));
  const spans = (text, id) => (extras(text).find(i => i.ruleId === id) || {spans: []}).spans;
  const jamo = text => spans(text, 'SETC-JAMO-SEQUENCE-REVIEW');
  const single = text => spans(text, 'SETC-SINGLE-EOJEOL-REVIEW');

  test('Two independent jamo trigger review, one jamo and normal syllables do not', () => {
    for (const text of ['ㄱㄴ', 'ㅏㅓ', 'ㄱㅏ', 'ㅋㅋ', 'ㅜㅜ', 'ㄲㅘ', '본문ㅁㄴㅇㄹ을 확인함.']) {
      assert.equal(jamo(text).length, 1, text);
      assert.equal(extras(text)[0].reason, '자모 연속 표기 오타 가능성(확인필요)');
      assert.equal(extras(text)[0].reviewLevel, 'REVIEW');
    }
    for (const text of ['', 'ㄱ', 'ㅏ', 'ㄲ', 'ㅘ', 'ㄱ ㄴ', '가나다', '가나']) assert.equal(jamo(text).length, 0, text);
    assert.equal(jamo('ㄱㄴ 순서와 ㅏㅓ의 발음을 비교함.').length, 2);
    const text = '😀 ㅁㄴ을 확인하고 ㅏㅓ를 비교함.';
    assert.deepEqual(jamo(text).map(s => [s.start, s.end, s.label]), [
      [text.indexOf('ㅁㄴ'), text.indexOf('ㅁㄴ') + 2, 'ㅁㄴ'],
      [text.indexOf('ㅏㅓ'), text.indexOf('ㅏㅓ') + 2, 'ㅏㅓ']]);
  });

  test('Three single-syllable eojeol trigger review including correctly written examples', () => {
    for (const text of ['컨 텐 츠', '한 번 더', '두 달 전', '세 달 뒤', '좀 더 큰']) {
      assert.deepEqual(single(text), [{start: 0, end: text.length, label: text}], text);
      const issue = extras(text).find(i => i.ruleId === 'SETC-SINGLE-EOJEOL-REVIEW');
      assert.equal(issue.reason, '한 글자 어절 연속 사용(확인필요)');
      assert.equal(issue.reviewLevel, 'REVIEW');
    }
    const text = '내용을 컨 텐 츠 제 작 에 반영함.';
    const phrase = '컨 텐 츠 제 작 에';
    assert.deepEqual(single(text), [{start: text.indexOf(phrase), end: text.indexOf(phrase) + phrase.length, label: phrase}]);
    for (const text of ['컨 텐', '한 번', '세특 내용을 검토함.', '내용컨 텐 츠', '컨 텐 츠제작', 'A 텐 츠', '1 2 3', 'ㄱ ㄴ ㄷ']) {
      assert.equal(single(text).length, 0, text);
    }
  });

  test('Single-syllable groups respect punctuation, line breaks, whitespace and repeated positions', () => {
    for (const text of ['한 번 더.', '(한 번 더)', '“한 번 더”']) {
      assert.equal(single(text).length, 1, text);
      assert.equal(single(text)[0].label, '한 번 더');
    }
    for (const text of ['한 번. 더', '한 번, 더', '한 번\n더', '한 번\r\n더', '한 번\u2028더']) {
      assert.equal(single(text).length, 0, text);
    }
    const text = '😀 한  번\t더. 두\u00a0달 전';
    assert.deepEqual(single(text).map(s => [s.start, s.label]), [[3, '한  번\t더'], [text.indexOf('두'), '두\u00a0달 전']]);
    const mixed = context.checkSetcLocalRules('한  번 더 특허를 조사함. ㅁㄴ');
    const reasons = mixed.map(i => i.reason);
    for (const reason of ['연속 공백 사용', '지식재산권 관련 표현 확인 필요',
      '자모 연속 표기 오타 가능성(확인필요)', '한 글자 어절 연속 사용(확인필요)']) assert.ok(reasons.includes(reason));
  });
};
