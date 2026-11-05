module.exports = function ({context, test, assert, normalize}) {
  const extras = text => normalize(context.checkSetcPunctuationRules_(text));
  const spans = (text, id) => (extras(text).find(i => i.ruleId === id) || {spans: []}).spans;
  const middle = text => spans(text, 'SETC-MISSING-SEPARATOR-REVIEW');
  const ending = text => spans(text, 'SETC-MISSING-FINAL-PERIOD-REVIEW');

  test('Runtime check validates both reported screenshot sentences with missing middle and final punctuation', () => {
    const report = normalize(context.checkSetcRuntime_());
    assert.equal(report.version, context.SETC_BUILD_ID_);
    assert.equal(report.ok, true);
    assert.equal(report.results.length, 2);
    assert.ok(report.results.every(result => result.middle && result.ending));
    const text = '창업하기를 판단함을 기록하고 최선을 다함 기기 사용에 앞장섬';
    assert.deepEqual(middle(text).map(s => s.label), ['다함']);
    assert.deepEqual(ending(text).map(s => s.label), ['앞장섬']);
  });

  test('Ending candidates before another word produce review; attached particles remain part of their word', () => {
    const cases = [
      ['그렇게 됨을 판단함 추가적으로 실험함.', ['판단함']],
      ['원리를 이해함 실험 결과를 분석함.', ['이해함']],
      ['구성원이 됨 추가적으로 협력함.', ['됨']],
      ['학습자임 이후 경험을 정리함.', ['학습자임']],
      ['새로운 지식을 익힘 후속 활동을 수행함.', ['익힘']],
      ['의미를 깨달음 추가적으로 적용함.', ['깨달음']],
      ['활동을 이끎 다음 과제를 수행함.', ['이끎']],
      ['원리를 이해했음 추가적으로 확인함.', ['이해했음']],
      ['지식을 습득하였음 후속 탐구를 진행함.', ['습득하였음']],
      ['실험을 진행함\n결과를 정리함.', ['진행함']]
    ];
    for (const [text, expected] of cases) {
      assert.deepEqual(middle(text).map(s => s.label), expected, text);
      const issue = extras(text).find(i => i.ruleId === 'SETC-MISSING-SEPARATOR-REVIEW');
      assert.equal(issue.reason, '문장부호 누락 의심(확인필요)');
      assert.equal(issue.reviewLevel, 'REVIEW');
    }
  });

  test('Particles, connective forms, existing punctuation, quotes and known nouns do not trigger separator review', () => {
    const cases = [
      '그렇게 됨을 판단함.', '실험을 수행함으로써 원리를 이해함.', '해결함에 의미를 둠.',
      '실천함 자체가 중요함.', '실천함 자체를 검토함.', '이해함 여부를 확인함.',
      '판단함 을 기준으로 삼음.', '책임 있는 태도를 보임.', '다음 활동을 계획함.',
      '포함 관계를 설명함.', '모임 활동에 참여함.', '봄 풍경을 관찰함.',
      '기름 성분을 분석함.', '직함 표시를 확인함.',
      '원리를 이해함. 실험함.', '원리를 이해함, 실험함.', '이해함: 탐구함.',
      '이해함 (실험 결과를 확인함).', '“판단함 추가적으로 실험함”이라는 표현을 수정함.',
      "'판단함 추가적으로 실험함'이라는 표현을 수정함.",
      '‘판단함 추가적으로 실험함’이라는 표현을 수정함.'
    ];
    for (const text of cases) assert.deepEqual(middle(text), [], text);
  });

  test('Final Hangul word without a period is reviewed alongside the original ending error', () => {
    for (const [text, label] of [
      ['아버지가 의사임', '의사임'], ['아버지가 의사이다', '의사이다'], ['실험을 수행항', '수행항'],
      ['실험 결과를 정리함  \r\n', '정리함'], ['“실험 결과를 정리함”', '정리함'], ['(실험 결과를 정리함)', '정리함']
    ]) {
      assert.equal(ending(text)[0].label, label, text);
      const issue = extras(text).find(i => i.ruleId === 'SETC-MISSING-FINAL-PERIOD-REVIEW');
      assert.equal(issue.reason, '문장 끝 온점 누락(확인필요)');
      assert.equal(issue.reviewLevel, 'REVIEW');
    }
    for (const text of ['', ' \n', '아버지가 의사임.', '아버지가 의사임.\r\n', '정리함?', '정리함!',
      '“정리함.”', '(정리함.)']) assert.deepEqual(ending(text), [], text);
    const reasons = context.checkSetcLocalRules('실험을 수행항').map(i => i.reason);
    assert.ok(reasons.includes('어미 오류'));
    assert.ok(reasons.includes('문장 끝 온점 누락(확인필요)'));
    // 중간의 오타를 종결 후보로 알아내는 기능은 아니다.
    assert.deepEqual(middle('실험을 수행항 추가적으로 분석함.'), []);
  });

  test('Punctuation review returns every repeated UTF-16 location and keeps normal words as bounded candidates', () => {
    const text = '😀 이해함 추가적으로 탐구함 이해함 추가적으로 정리함';
    assert.deepEqual(middle(text).map(s => [s.start, s.label]), [
      [text.indexOf('이해함'), '이해함'], [text.indexOf('탐구함'), '탐구함'], [text.lastIndexOf('이해함'), '이해함']]);
    for (const issue of extras(text)) for (const span of issue.spans) {
      assert.ok(span.start >= 0 && span.end > span.start && span.end <= text.length);
      assert.equal(text.slice(span.start, span.end), span.label);
    }
    assert.equal(ending(text)[0].start, text.indexOf('정리함'));
    const unclosed = '“'.repeat(49000) + '원리를 이해함 추가적으로 탐구함.';
    assert.deepEqual(middle(unclosed).map(s => s.label), ['이해함']);
    assert.deepEqual(extras('가'.repeat(49000) + '.'), []);
    // 문맥 분석이 없어, 명사형이 문장 중간에 쓰인 일부 정상 표현도 REVIEW 후보가 될 수 있다.
    assert.equal(middle('꾸준함 유지 활동을 수행함.')[0].label, '꾸준함');
  });
};
