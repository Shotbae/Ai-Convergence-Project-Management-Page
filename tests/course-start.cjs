module.exports = function ({context, test, assert, normalize}) {
  test('A missing opening ASCII quote is restored only for the current course at the absolute text start', () => {
    const cases = [
      ["AI와 언어' 수업에 참여함.", 'AI와 언어', "'AI와 언어' 수업에 참여함."],
      ["'AI와 언어' 수업에 참여함.", 'AI와 언어', "'AI와 언어' 수업에 참여함."],
      ["자료[기초]+(실습)' 수업에 참여함.", '자료[기초]+(실습)', "'자료[기초]+(실습)' 수업에 참여함."],
      ["AI와  언어'  수업\n결과를 정리함.", '  AI와 언어  ', "'AI와 언어' 수업\n결과를 정리함."],
      ["'사람의 AI' 활용'을 탐구함.", "'사람의 AI' 활용", "'사람의 AI' 활용'을 탐구함."],
      ["AI와 언어 수업에 참여함.", 'AI와 언어', 'AI와 언어 수업에 참여함.'],
      ["AI와 언어 심화' 수업에 참여함.", 'AI와 언어', "AI와 언어 심화' 수업에 참여함."],
      ["다른 강좌' 수업에 참여함.", 'AI와 언어', "다른 강좌' 수업에 참여함."],
      [" AI와 언어' 수업에 참여함.", 'AI와 언어', " AI와 언어' 수업에 참여함."],
      ["\nAI와 언어' 수업에 참여함.", 'AI와 언어', "\nAI와 언어' 수업에 참여함."],
      ["본문 중 AI와 언어'를 확인함.", 'AI와 언어', "본문 중 AI와 언어'를 확인함."],
      ["AI와 언어’를 탐구함.", 'AI와 언어', 'AI와 언어’를 탐구함.'],
      ["AI와 언어' 수업에 참여함.", '', "AI와 언어' 수업에 참여함."],
      ["AI와 언어' 수업에 참여함.", null, "AI와 언어' 수업에 참여함."]
    ];
    for (const [input, course, expected] of cases) {
      const result = context.normalizeSetcText_(input, course);
      assert.equal(result.text, expected, JSON.stringify({input, course}));
      assert.equal(context.normalizeSetcText_(result.text, course).text, expected, 'revalidation must not add another quote');
      for (const segment of result.segments) {
        assert.equal(result.text.slice(segment.targetStart, segment.targetStart + segment.sourceEnd - segment.sourceStart),
          input.slice(segment.sourceStart, segment.sourceEnd), 'styles and links must retain the same original characters');
      }
    }
  });

  test('Uncertain course openings are reviewed without guessing quotes or changing the course title', () => {
    const course = 'AI와 언어';
    for (const input of ["AI와 언어 수업에 참여함.", "'AI와 언어 수업에 참여함.", 'AI와 언어']) {
      const issues = normalize(context.checkSetcCourseStart_(input, course));
      assert.equal(issues[0].ruleId, 'SETC-COURSE-QUOTE-REVIEW');
      assert.equal(issues[0].reason, '문두 강좌명 따옴표 확인(확인필요)');
      assert.equal(issues[0].reviewLevel, 'REVIEW');
      assert.equal(input.slice(issues[0].spans[0].start, issues[0].spans[0].end), issues[0].spans[0].label);
    }
    for (const input of ["'다른 강좌' 수업에 참여함.", 'AI와 언어학을 탐구함.', " AI와 언어' 수업에 참여함."]) {
      const issues = context.checkSetcCourseStart_(input, course);
      assert.equal(issues[0].ruleId, 'SETC-COURSE-START-REVIEW');
      assert.equal(issues[0].reviewLevel, 'REVIEW');
    }
    for (const [text, name] of [["'AI와 언어' 수업에 참여함.", course], ['', course], [' \n', course], ['기록함.', ''], ['기록함.', 123]]) {
      assert.equal(context.checkSetcCourseStart_(text, name).length, 0);
    }
  });

  test('Course-prefix review positions are bounded UTF-16 evidence and remain outside the original single-text rules', () => {
    const input = '가'.repeat(99) + '😀' + '나'.repeat(49000);
    const issue = context.checkSetcCourseStart_(input, '다른 강좌')[0];
    assert.equal(issue.spans[0].end, 101);
    assert.equal(issue.spans[0].label, '가'.repeat(99) + '😀');
    const text = 'AI와 언어 수업에 참여함.';
    assert.ok(context.checkSetcLocalRules(text).every(i => !i.ruleId.startsWith('SETC-COURSE-')));
  });
};
