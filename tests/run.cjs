const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const cp = require('node:child_process');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'aiconvpromanage.gs'), 'utf8');
const normalize = value => JSON.parse(JSON.stringify(value));
let passed = 0;
function test(name, run) { run(); passed++; console.log('PASS', name); }
const context = vm.createContext({});
vm.runInContext(source, context);

test('Pinned Python sources retain their original hashes', () => {
  const hashes = {'local_rules.py': 'c2ab5a8d29fc6c40ecdae0ebd324cde200d15f7f06633890c8aecb526a1c1594',
    'rule_exceptions.py': '17f558229c92073f037433a269a7daf6b3e779b83ecca959280ef0ad3fce1005'};
  for (const [file, expected] of Object.entries(hashes)) {
    assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(__dirname, 'reference', file))).digest('hex'), expected);
  }
});

test('Python reference rule IDs, reasons, review levels', () => {
  const cases = JSON.parse(fs.readFileSync(path.join(__dirname, 'reference_cases.json'), 'utf8'));
  const failures = [];
  for (const item of cases) {
    const reference = context.checkSetcReferenceRules_(item.text);
    const combined = context.checkSetcLocalRules(item.text);
    const actual = normalize(reference.map(i => [i.ruleId, i.reason, i.reviewLevel]));
    assert.deepEqual(normalize(combined.slice(0, reference.length)), normalize(reference));
    assert.ok(combined.slice(reference.length).every(i =>
      ['SETC-JAMO-SEQUENCE-REVIEW', 'SETC-SINGLE-EOJEOL-REVIEW'].includes(i.ruleId) && i.reviewLevel === 'REVIEW'));
    try { assert.deepEqual(actual, item.expected); }
    catch { failures.push({text: item.text, expected: item.expected, actual}); }
  }
  if (failures.length) throw new Error(JSON.stringify(failures.slice(0, 8), null, 2) + '\nMismatches: ' + failures.length);
  console.log('  Compared', cases.length, 'synthetic inputs');
});

test('Repeated occurrences, exceptions, UTF-16 spans and safe reasons', () => {
  const text = '😀 도움을 줌. 줌 회의를 활용함. 줌 회의함. 𠀀 漢字를 살펴봄.';
  const issues = context.checkSetcLocalRules(text);
  const zoom = issues.find(i => i.reason === '사기업 명칭 (화상회의/통신)');
  assert.equal(zoom.spans.length, 2);
  assert.equal(zoom.spans[0].start, text.indexOf('줌 회의'));
  assert.equal(zoom.spans[1].start, text.lastIndexOf('줌 회의'));
  for (const issue of issues) for (const span of issue.spans) {
    assert.ok(span.start >= 0 && span.end > span.start && span.end <= text.length);
    assert.equal(text.slice(span.start, span.end), span.label);
  }
  const long = context.checkSetcLocalRules('발표했다.'.repeat(5000));
  assert.equal(long.length, 5000);
  assert.equal(context.formatSetcIssues_(long), '발표했다: 어미 오류');
  const h = context.checkSetcLocalRules('앞\u200b뒤  끝함.');
  assert.ok(context.formatSetcIssues_(h).includes('ZERO WIDTH SPACE (U+200B)'));
  assert.ok(context.formatSetcIssues_(h).includes('연속 공백 2칸'));
});

test('All prior unrelated functions remain byte-equivalent after newline normalization', () => {
  const old = cp.execFileSync('git', ['-c', 'safe.directory=' + root.replaceAll('\\', '/'),
    'show', 'af58fe2:aiconvpromanage.gs'], {cwd: root, encoding: 'utf8'});
  const baseline = vm.createContext({});
  vm.runInContext(old, baseline);
  const changed = new Set(['onOpen', 'createFinalCompletionList', 'createFinalCompletionListsByTerm']);
  for (const name of Object.keys(baseline).filter(n => typeof baseline[n] === 'function' && !changed.has(n))) {
    assert.equal(context[name].toString().replaceAll('\r\n', '\n'), baseline[name].toString().replaceAll('\r\n', '\n'), name);
  }
});

require('./sheets.cjs')({source, test, assert, normalize});
require('./additional-rules.cjs')({context, test, assert, normalize});
console.log('Passed', passed, 'test groups');
