module.exports = function ({context, test, assert}) {
  test('The storage-only quote prefix produces two transmitted quotes for one logical quote and leaves byte/check inputs untouched', () => {
    for (const [logical, wire] of [
      ["'AI와 언어' 수업에 참여함.", "''AI와 언어' 수업에 참여함."],
      ["''원래 두 개' 수업에 참여함.", "'''원래 두 개' 수업에 참여함."],
      ['일반 본문', '일반 본문'], ['', ''], ["'", "''"]]) {
      assert.equal(context.getSetcStorageText_(logical), wire);
    }
    const logical = context.normalizeSetcText_("AI와 언어' 수업에 참여함.").text;
    const bytes = context.GET_NEIS_BYTE(logical);
    context.getSetcStorageText_(logical);
    assert.equal(context.GET_NEIS_BYTE(logical), bytes);
    assert.equal(context.GET_NEIS_BYTE(context.getSetcStorageText_(logical)), bytes + 1);
  });
  test('Opening quote restoration follows the course-introduction text shape for arbitrary titles without E-column metadata', () => {
    const cases = [
      ["AI와 언어' 수업에 참여함.", "'AI와 언어' 수업에 참여함."],
      ["AI와 언어 심화' 수업에서 탐구함.", "'AI와 언어 심화' 수업에서 탐구함."],
      ["자료[기초]+(실습)' 강좌를 이수함.", "'자료[기초]+(실습)' 강좌를 이수함."],
      ["과학 2.0'수업에 참여함.", "'과학 2.0'수업에 참여함."],
      ["다른 과목'\t강좌에서 탐구함.", "'다른 과목'\t강좌에서 탐구함."],
      ["AI와  언어'  수업\n결과를 정리함.", "'AI와 언어' 수업\n결과를 정리함."],
      ["가' 수업에 참여함.", "'가' 수업에 참여함."]
    ];
    for (const [input, expected] of cases) {
      const result = context.normalizeSetcText_(input);
      assert.equal(result.text, expected, input);
      assert.equal(context.normalizeSetcText_(result.text).text, expected, 'revalidation must not add another quote');
      for (const segment of result.segments) {
        assert.equal(result.text.slice(segment.targetStart, segment.targetStart + segment.sourceEnd - segment.sourceStart),
          input.slice(segment.sourceStart, segment.sourceEnd), 'remaining characters keep their style/link mapping');
      }
    }
  });

  test('Already quoted and uncertain openings remain unchanged without invented course-name warnings', () => {
    for (const input of ["'AI와 언어' 수업에 참여함.", "''AI와 언어' 수업에 참여함.",
      '"AI와 언어" 수업에 참여함.', '‘AI와 언어’ 수업에 참여함.',
      "AI와 언어 수업에 참여함.", "'AI와 언어 수업에 참여함.",
      "오늘 'AI와 언어' 수업에 참여함.", "본문 중 AI와 언어'를 확인함.",
      "AI와 언어' 활동에 참여함.", " AI와 언어' 수업에 참여함.",
      "\nAI와 언어' 수업에 참여함.", "AI와\n언어' 수업에 참여함.",
      'AI와 언어’를 탐구함.', '', ' \n']) {
      assert.equal(context.normalizeSetcText_(input).text, input, JSON.stringify(input));
    }
    assert.equal(typeof context.checkSetcCourseStart_, 'undefined');
    assert.equal(typeof context.getSetcCourseName_, 'undefined');
    for (const input of ['AI와 언어 수업에 참여함.', "'다른 강좌' 수업에 참여함."]) {
      assert.ok(context.checkSetcLocalRules(input).every(i => !i.reason.includes('문두 강좌명')));
    }
  });

  test('Quote restoration keeps long titles and Unicode text intact while uncertain long inputs remain bounded', () => {
    const input = '가'.repeat(40000) + "😀' 수업에 참여함.";
    const restored = context.normalizeSetcText_(input).text;
    assert.equal(restored, "'" + input);
    assert.equal(context.normalizeSetcText_(restored).text, restored);
    const uncertain = '가'.repeat(49000) + "' 설명함.";
    assert.equal(context.normalizeSetcText_(uncertain).text, uncertain);
  });
};
