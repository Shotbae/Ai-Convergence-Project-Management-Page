module.exports = function ({context, test, assert, normalize}) {
  test('ASCII space runs collapse to one while line breaks and special whitespace remain exact', () => {
    const cases = [
      ['', ''], ['가 나', '가 나'], ['가  나   다', '가 나 다'], ['   ', ' '],
      ['  앞  내용  ', ' 앞 내용 '], ['앞  \n  뒤', '앞 \n 뒤'],
      ['앞  \r\n  뒤\r  다음', '앞 \r\n 뒤\r 다음'],
      ['가\t\t나\u00a0\u00a0다\u3000\u3000라', '가\t\t나\u00a0\u00a0다\u3000\u3000라'],
      ['가  \t  나', '가 \t 나'], ['😀  한  번   더 ㅁㄴ', '😀 한 번 더 ㅁㄴ']
    ];
    for (const [input, expected] of cases) {
      const result = normalize(context.normalizeSetcSpaces_(input));
      assert.equal(result.text, expected, JSON.stringify(input));
      assert.equal(context.normalizeSetcSpaces_(result.text).text, expected, 'idempotent');
      assert.equal(result.segments.map(s => input.slice(s.sourceStart, s.sourceEnd)).join(''), expected);
      let end = 0;
      for (const s of result.segments) {
        assert.equal(s.targetStart, end);
        end += s.sourceEnd - s.sourceStart;
      }
    }
  });
};
