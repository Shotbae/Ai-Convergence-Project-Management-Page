const vm = require('node:vm');

module.exports = function ({source, test, assert, normalize}) {
  class StyleBuilder {
    constructor() { this.style = {}; }
    setForegroundColor(color) { this.style.color = color; return this; }
    build() { return {...this.style}; }
  }
  class Rich {
    constructor(text, styles, links, start = 0) {
      this.text = text; this.styles = styles || Array.from({length: text.length}, () => ({bold: true}));
      this.links = links || Array(text.length).fill(null); this.start = start;
    }
    copy() { return new RichBuilder(this.text, this.styles, this.links); }
    getText() { return this.text; }
    getStartIndex() { return this.start; }
    getEndIndex() { return this.start + this.text.length; }
    getTextStyle() { return {...this.styles[0]}; }
    getLinkUrl(start = 0, end = this.text.length) {
      const links = [...new Set(this.links.slice(start, end))];
      return links.length === 1 ? links[0] : null;
    }
    getRuns() {
      const runs = [];
      for (let start = 0; start < this.text.length;) {
        let end = start + 1;
        while (end < this.text.length && JSON.stringify(this.styles[start]) === JSON.stringify(this.styles[end])) end++;
        runs.push(new Rich(this.text.slice(start, end), this.styles.slice(start, end), this.links.slice(start, end), this.start + start));
        start = end;
      }
      return runs;
    }
  }
  class RichBuilder {
    constructor(text = '', styles, links) { this.text = text; this.styles = styles ? styles.map(s => ({...s})) : []; this.links = links ? links.slice() : Array(text.length).fill(null); }
    setText(text) { this.text = text; this.styles = Array.from({length: text.length}, () => ({})); this.links = Array(text.length).fill(null); return this; }
    setLinkUrl(start, end, url) { for (let i = start; i < end; i++) this.links[i] = url; return this; }
    setTextStyle(...args) {
      const [start, end, style] = args.length === 1 ? [0, this.text.length, args[0]] : args;
      if (start < 0 || end > this.text.length || start >= end) throw new Error('Invalid rich text offsets');
      for (let i = start; i < end; i++) this.styles[i] = {...this.styles[i], ...style};
      return this;
    }
    build() { return new Rich(this.text, this.styles.map(s => ({...s})), this.links.slice()); }
  }
  function environment() {
    const env = {alerts: [], toasts: [], menus: [], props: new Map(), sheets: [], nextId: 1, clock: 0, clockStep: 0};
    class Range {
      constructor(sheet, row, col, rows = 1, cols = 1) {
        if (rows < 1 || cols < 1 || row < 1 || col < 1 || row + rows - 1 > sheet.maxRows || col + cols - 1 > sheet.maxCols) throw new Error('Invalid range');
        Object.assign(this, {sheet, row, col, rows, cols});
      }
      cells() { return Array.from({length: this.rows}, (_, r) => Array.from({length: this.cols}, (_, c) => this.sheet.cell(this.row + r, this.col + c))); }
      getSheet() { return this.sheet; }
      getRow() { return this.row; }
      getColumn() { return this.col; }
      getLastRow() { return this.row + this.rows - 1; }
      getLastColumn() { return this.col + this.cols - 1; }
      createFilter() {
        if (env.failNextFilterCreation) { env.failNextFilterCreation = false; throw new Error('Filter creation failed'); }
        if (this.sheet.filter) throw new Error('A filter already exists');
        return this.sheet.filter = new Filter(this);
      }
      getValues() { return this.cells().map(row => row.map(c => c.value)); }
      getValue() {
        const cell = this.cells()[0][0];
        const byteFormula = /^=GET_NEIS_BYTE\(G(\d+)\)$/.exec(cell.formula);
        const conditionalByteFormula = /^=IF\(G(\d+)="","",GET_NEIS_BYTE\(G\1\)\)$/.exec(cell.formula);
        const match = byteFormula || conditionalByteFormula;
        if (match) {
          const text = this.sheet.cell(+match[1], 7).value;
          return conditionalByteFormula && text === '' ? '' : env.context.GET_NEIS_BYTE(text);
        }
        return cell.value;
      }
      getFormulas() { return this.cells().map(row => row.map(c => c.formula)); }
      getFormula() { return this.cells()[0][0].formula; }
      getNote() { return this.cells()[0][0].note; }
      setNote(value) { this.cells().flat().forEach(c => { c.note = value; }); return this; }
      setValues(values) {
        assert.equal(values.length, this.rows);
        values.forEach((row, r) => { assert.equal(row.length, this.cols); row.forEach((v, c) => {
          const cell = this.sheet.cell(this.row + r, this.col + c);
          cell.value = v; cell.formula = typeof v === 'string' && v.startsWith('=') ? v : ''; cell.rich = null;
        }); });
        return this;
      }
      setValue(value) { return this.setValues(Array.from({length: this.rows}, () => Array(this.cols).fill(value))); }
      setFormulas(values) { this.setValues(values); return this; }
      getRichTextValue() {
        const cell = this.cells()[0][0];
        const result = typeof cell.value === 'string' && cell.value ? cell.rich || new Rich(cell.value) : null;
        if (env.onRichRead) { const fn = env.onRichRead; env.onRichRead = null; fn(); }
        return result;
      }
      setRichTextValue(rich) { this.cells().flat().forEach(c => { c.value = rich.text; c.formula = ''; c.rich = rich; }); return this; }
      clearContent() { return this.setValue(''); }
      setFontColor(color) { this.cells().flat().forEach(c => { c.color = color; }); return this; }
      setFontWeight() { return this; }
      setBackground() { return this; }
      setHorizontalAlignment() { return this; }
      setBorder() { return this; }
      setWrap() { return this; }
    }
    class Filter {
      constructor(range) { this.range = range; this.criteria = new Map(); }
      getRange() { return this.range; }
      getColumnFilterCriteria(col) { return this.criteria.get(col) || null; }
      setColumnFilterCriteria(col, value) { this.criteria.set(col, value); return this; }
      remove() { this.range.sheet.filter = null; }
    }
    class Sheet {
      constructor(name, maxCols = 26) { Object.assign(this, {name, id: env.nextId++, maxCols, maxRows: 1000, grid: new Map(), widths: {}}); }
      cell(row, col) {
        const key = row + ',' + col;
        if (!this.grid.has(key)) this.grid.set(key, {value: '', formula: '', note: '', rich: null});
        return this.grid.get(key);
      }
      getName() { return this.name; }
      getSheetId() { return this.id; }
      getMaxColumns() { return this.maxCols; }
      getMaxRows() { return this.maxRows; }
      getFilter() { return this.filter || null; }
      insertColumnsAfter(_, count) { this.maxCols += count; }
      insertRowsAfter(_, count) { this.maxRows += count; }
      getRange(...args) {
        if (typeof args[0] !== 'string') return new Range(this, ...args);
        const parse = value => {
          const m = /^([A-Z]+)(\d+)$/.exec(value);
          if (!m) throw new Error('Unknown A1 range ' + value);
          return {row: +m[2], col: [...m[1]].reduce((a, c) => a * 26 + c.charCodeAt(0) - 64, 0)};
        };
        const parts = args[0].split(':'), start = parse(parts[0]), end = parse(parts[1] || parts[0]);
        return new Range(this, start.row, start.col, end.row - start.row + 1, end.col - start.col + 1);
      }
      getLastRow() { return Math.max(0, ...[...this.grid].filter(([, c]) => c.value !== '' || c.formula).map(([key]) => +key.split(',')[0])); }
      setColumnWidth(col, value) { this.widths[col] = value; return this; }
      autoResizeColumns() { return this; }
    }
    env.add = (name, cols) => { assert.ok(!env.sheets.some(s => s.name === name)); const s = new Sheet(name, cols); env.sheets.push(s); return s; };
    env.ss = {
      getSheets: () => env.sheets,
      getSheetByName: name => env.sheets.find(s => s.name === name) || null,
      insertSheet: name => env.add(name),
      setActiveSheet: s => { env.active = s; },
      toast: (...args) => env.toasts.push(args)
    };
    env.lock = {held: false, available: true, tryLock() { if (this.held || !this.available) return false; this.held = true; return true; }, releaseLock() { this.held = false; }};
    const ui = {alert: text => env.alerts.push(text), showModalDialog: (html, title) => { env.modal = {html: html.text, title}; },
      createMenu: name => {
        const menu = {name, items: [], addItem(label, fn) { this.items.push({label, fn}); return this; }, addSeparator() { return this; }, addToUi() { env.menus.push(this); }};
        return menu;
      }};
    env.context = vm.createContext({
      SpreadsheetApp: {getActiveSpreadsheet: () => env.ss, getUi: () => ui, newTextStyle: () => new StyleBuilder(), newRichTextValue: () => new RichBuilder()},
      LockService: {getDocumentLock: () => env.lock},
      PropertiesService: {getDocumentProperties: () => ({getProperty: key => env.props.get(key) || null,
        setProperty: (key, value) => env.props.set(key, value), deleteProperty: key => env.props.delete(key)})},
      HtmlService: {createHtmlOutput: text => ({text, setWidth() { return this; }, setHeight() { return this; }})},
      Date: class extends Date { static now() { env.clock += env.clockStep; return env.clock; } }
    });
    vm.runInContext(source, env.context);
    env.edit = range => env.context.onEdit({range, source: env.ss});
    env.attendance = (name, rows, twoDays = false) => {
      const s = env.add(name);
      s.getRange('B3').setValue(name + '강좌'); s.getRange('B5').setValue('담당교사');
      s.getRange('E7').setValue(twoDays ? '11/04' : '');
      if (rows.length) s.getRange(8, 1, rows.length, 5).setValues(rows);
      return s;
    };
    return env;
  }

  test('Selected term only, numeric term list, input validation and unchanged control cells', () => {
    const e = environment();
    const main = e.add('출석부생성'); main.getRange('B3:B4').setValues([['원래 기수'], ['원래 강좌']]);
    e.attendance('11기01강좌', [[1, 20101, '학생1', true, '']]);
    e.attendance('1기01강좌', [[1, 20102, '학생2', true, ''], [2, 20103, '학생3', false, '']]);
    e.attendance('10기01강좌', []);
    e.attendance('2기01강좌', []);
    e.add('1기신청현황원본');
    assert.deepEqual(normalize(e.context.getCompletionTermList()), ['1기', '2기', '10기', '11기']);
    assert.throws(() => e.context.executeCompletionTask('selected', ''), /기수/);
    assert.throws(() => e.context.executeCompletionTask('invalid', '1기'), /방식/);
    const result = e.context.executeCompletionTask('selected', '1기');
    assert.equal(result.created.length, 1);
    assert.ok(e.ss.getSheetByName('1기_최종이수자명단'));
    assert.equal(e.ss.getSheetByName('11기_최종이수자명단'), null);
    assert.deepEqual(main.getRange('B3:B4').getValues(), [['원래 기수'], ['원래 강좌']]);
    assert.equal(e.lock.held, false);
  });

  test('One/two day completion, waiting labels, sorting, header and byte formula', () => {
    const e = environment();
    e.attendance('1기01강좌', [[1, 20103, '학생3(대기)(중복)', true, false], [2, 20101, '학생1', true, false]]);
    e.attendance('1기02강좌', [[1, 20102, '학생2', true, true], [2, 20104, '학생4', true, false]], true);
    e.context.createFinalCompletionListsByTerm('1기');
    const s = e.ss.getSheetByName('1기_최종이수자명단');
    assert.deepEqual(s.getRange('B2:C4').getValues(), [[20101, '학생1'], [20102, '학생2'], [20103, '학생3']]);
    assert.equal(s.getRange('H2').getFormula(), '=IF(G2="","",GET_NEIS_BYTE(G2))');
    assert.equal(s.getRange('I1').getValue(), '오류 사유');
    assert.equal(s.getRange('I1').getNote(), '세특 자동 검증 결과입니다. 빨간 표현과 오류 사유를 확인하고 교사가 판단해주세요.');
    assert.equal(s.getRange('G2').getValue(), '');
  });

  test('Three-day completion requires every boolean check in all generation modes and terms', () => {
    const e = environment();
    const rows = Array.from({length: 8}, (_, mask) => [mask + 1, 21000 + mask, '학생' + mask,
      !!(mask & 4), !!(mask & 2), !!(mask & 1)]);
    rows.push([9, 21008, '빈칸', true, true, ''], [10, 21009, '문자', true, true, 'TRUE'],
      [11, 21010, '숫자', true, true, 1]);
    const s2 = e.add('2기01세차시강좌');
    s2.getRange('B3:B5').setValues([['세차시강좌'], ['11/1&11/2&11/7'], ['담당교사']]);
    s2.getRange('D7:F7').setValues([['11/1', '11/2', '11/7']]);
    s2.getRange(8, 1, rows.length, 6).setValues(rows);
    const s11 = e.add('11기02다른강좌');
    s11.getRange('B3').setValue('다른강좌');
    s11.getRange('E7:F7').setValues([['12/1', '3일차']]);
    s11.getRange('A8:F9').setValues([[1, 21101, '다른학생', true, true, true], [2, 21102, '결석학생', true, true, false]]);
    const before = JSON.stringify(s2.getRange('A1:F20').getValues());
    e.context.executeCompletionTask('selected', '2기');
    assert.deepEqual(e.ss.getSheetByName('2기_최종이수자명단').getRange('B2:D2').getValues(), [[21007, '학생7', '2기']]);
    assert.equal(e.ss.getSheetByName('2기_최종이수자명단').getLastRow(), 2);
    assert.equal(e.ss.getSheetByName('11기_최종이수자명단'), null);
    e.context.executeCompletionTask('byTerm', '');
    assert.deepEqual(e.ss.getSheetByName('11기_최종이수자명단').getRange('B2:D2').getValues(), [[21101, '다른학생', '11기']]);
    e.context.executeCompletionTask('integrated', '');
    assert.deepEqual(e.ss.getSheetByName('최종이수자명단').getRange('B2:D3').getValues(),
      [[21007, '학생7', '2기'], [21101, '다른학생', '11기']]);
    assert.equal(JSON.stringify(s2.getRange('A1:F20').getValues()), before, 'attendance source is read-only');
  });

  test('Legacy one/two-day attendance ignores notes and unused third-column checks', () => {
    const e = environment();
    const one = e.attendance('1기01하루', [[1, 20101, '하루학생', true, false], [2, 20102, '하루결석', false, true]]);
    one.getRange('F7:F9').setValues([['비고'], [false], [true]]);
    const two = e.attendance('1기02이틀', [[1, 20103, '이틀학생', true, true], [2, 20104, '이틀결석', true, false]], true);
    two.getRange('F7:F9').setValues([['서명'], [false], [true]]);
    e.context.executeCompletionTask('selected', '1기');
    assert.deepEqual(e.ss.getSheetByName('1기_최종이수자명단').getRange('B2:C3').getValues(),
      [[20101, '하루학생'], [20103, '이틀학생']]);
    e.context.createAbsenteeList('1기');
    assert.deepEqual(e.ss.getSheetByName('결석자명단').getRange('B2:C3').getValues(),
      [[20102, '하루결석'], [20104, '이틀결석']]);
  });

  test('Three-day headers accept dates and labels; a missing second header stops before changing output', () => {
    const e = environment(), s = e.attendance('4기01강좌', [[1, 20101, '학생', true, true]], true);
    const thirdHeaders = [new Date('2026-11-05T00:00:00Z'), '11/5', '2026-11-05', '26.11.5.', '11.5.',
      '11월 5일', '2026년 11월 5일', '11/5 (목)', '11/5(목요일)', '3일차', '3일차\n11/5', '3차시: 11/5'];
    for (const header of thirdHeaders) {
      s.getRange('F7').setValue(header);
      assert.equal(e.context.getAttendanceDayCount_(s), 3, String(header));
    }
    for (const header of ['', '비고', '서명', '확인', '비고(11/5)', '내부 메모', true, 123]) {
      s.getRange('F7').setValue(header);
      assert.equal(e.context.getAttendanceDayCount_(s), 2, String(header));
    }
    s.getRange('F7').setValue('3일차');
    s.getRange('E7').clearContent();
    const oldAbsence = e.add('결석자명단');
    oldAbsence.getRange('A1').setValue('기존 자료');
    assert.throws(() => e.context.executeCompletionTask('selected', '4기'), /2일차\(E7\).*비어/);
    assert.equal(e.ss.getSheetByName('4기_최종이수자명단'), null);
    assert.throws(() => e.context.createAbsenteeList('4기'), /2일차\(E7\).*비어/);
    assert.equal(oldAbsence.getRange('A1').getValue(), '기존 자료');
    assert.equal(e.lock.held, false);
  });

  test('Three-day absences agree with completion and count a waiting student attending only the third day', () => {
    const e = environment(), s = e.add('2기01강좌');
    s.getRange('B3').setValue('세차시강좌');
    s.getRange('D7:F7').setValues([['11/1', '11/2', '11/7']]);
    const rows = [
      [1, 22001, '전일출석', true, true, true],
      [2, 22002, '셋째날결석', true, true, false],
      [3, 22003, '둘째날결석', true, false, true],
      [4, 22004, '첫째날결석', false, true, true],
      [5, 22005, '전일결석', false, false, false],
      [6, 22006, '미참여대기(대기)', false, false, false],
      [7, 22007, '셋째날만출석(대기)', false, false, true],
      [8, 22008, '전일출석대기(대기)(중복)', true, true, true],
      [9, 22009, '셋째날결석대기(대기)', true, true, false]
    ];
    s.getRange(8, 1, rows.length, 6).setValues(rows);
    e.attendance('3기01미래강좌', [[1, 23001, '다음기수학생', false, '']]);
    e.context.executeCompletionTask('selected', '2기');
    assert.deepEqual(e.ss.getSheetByName('2기_최종이수자명단').getRange('B2:C3').getValues(),
      [[22001, '전일출석'], [22008, '전일출석대기']]);
    e.context.createAbsenteeList('2기');
    assert.deepEqual(e.ss.getSheetByName('결석자명단').getRange('A2:D7').getValues(), [
      ['2기', 22002, '셋째날결석', '세차시강좌'], ['2기', 22003, '둘째날결석', '세차시강좌'],
      ['2기', 22004, '첫째날결석', '세차시강좌'], ['2기', 22005, '전일결석', '세차시강좌'],
      ['2기', 22007, '셋째날만출석', '세차시강좌'], ['2기', 22009, '셋째날결석대기', '세차시강좌']
    ]);
    assert.equal(e.ss.getSheetByName('결석자명단').getLastRow(), 7);
  });

  test('Existing term and integrated lists retain handwritten text, formulas and rows', () => {
    const e = environment();
    e.attendance('1기01강좌', [[1, 20101, '학생', true, false]]);
    const s = e.add('1기_최종이수자명단'); s.getRange('G2').setValue('수기 세특'); s.getRange('H2').setValue('=99');
    const before = JSON.stringify([...s.grid]);
    assert.equal(e.context.executeCompletionTask('selected', '1기').skipped.length, 1);
    assert.equal(JSON.stringify([...s.grid]), before);
    const all = e.add('최종이수자명단'); all.getRange('G2').setValue('통합 수기 세특');
    const beforeAll = JSON.stringify([...all.grid]);
    assert.equal(e.context.createFinalCompletionList().skipped.length, 1);
    assert.equal(JSON.stringify([...all.grid]), beforeAll);
  });

  test('All-term and integrated modes preserve each completion record and skip empty terms', () => {
    const e = environment();
    e.attendance('1기01강좌', [[1, 20101, '학생', true, false]]);
    e.attendance('2기01강좌', [[1, 20101, '학생', true, false]]);
    e.attendance('3기01강좌', [[1, 20102, '학생2', false, false]]);
    const byTerm = e.context.createFinalCompletionListsByTerm();
    assert.equal(byTerm.created.length, 2); assert.equal(byTerm.empty.length, 1);
    const result = e.context.createFinalCompletionList();
    assert.equal(result.created.length, 1);
    const s = e.ss.getSheetByName('최종이수자명단');
    assert.deepEqual(s.getRange('B2:D3').getValues(), [[20101, '학생', '1기'], [20101, '학생', '2기']]);
  });

  test('Edit renders only evidence red, preserves source, other styles and H formula; correction clears', () => {
    const e = environment(), s = e.add('최종이수자명단', 8);
    const text = '😀 유튜브 영상을 분석함.';
    s.getRange('G2').setValue(text); s.getRange('H2').setValue('=GET_NEIS_BYTE(G2)');
    e.edit(s.getRange('G2'));
    assert.equal(s.getRange('G2').getValue(), text);
    assert.equal(s.getRange('H2').getFormula(), '=GET_NEIS_BYTE(G2)');
    assert.equal(s.getRange('I2').getValue(), '😀: 특수기호 사용(확인필요)\n유튜브: 사기업 명칭 (영상/스트리밍)'.split('\n').reverse().join('\n'));
    const rich = s.getRange('G2').getRichTextValue();
    assert.equal(rich.styles[text.indexOf('유튜브')].color, '#ff0000');
    assert.equal(rich.styles[text.indexOf('영상을')].color, '#000000');
    assert.equal(rich.styles[0].bold, true);
    s.getRange('G2').setValue('AI 모델을 활용함.'); e.edit(s.getRange('G2'));
    assert.equal(s.getRange('I2').getValue(), '');
    assert.ok(s.getRange('G2').getRichTextValue().styles.every(x => x.color === '#000000'));
    s.getRange('G2').clearContent(); e.edit(s.getRange('G2')); assert.equal(s.getRange('I2').getValue(), '');
    assert.equal(s.maxCols, 9);
  });

  test('Multi-cell paste examines G intersections only and no record similarity is added', () => {
    const e = environment(), s = e.add('1기_최종이수자명단');
    s.getRange('G2:G4').setValues([['특허의 원리를 조사함.'], ['실험 결과를 발표함~'], ['특허의 원리를 조사함.']]);
    s.getRange('H2:H4').setFormulas([['=1'], ['=2'], ['=3']]);
    e.edit(s.getRange('F2:I4'));
    assert.match(s.getRange('I2').getValue(), /지식재산권 관련 표현 확인 필요/);
    assert.match(s.getRange('I3').getValue(), /금지기호 사용\(수정필요\)/);
    assert.equal(s.getRange('I2').getValue(), s.getRange('I4').getValue());
    assert.ok(!s.getRange('I4').getValue().includes('유사도'));
    assert.deepEqual(s.getRange('H2:H4').getFormulas(), [['=1'], ['=2'], ['=3']]);
    const before = s.getRange('I2').getValue();
    e.edit(s.getRange('H2')); assert.equal(s.getRange('I2').getValue(), before);
    const other = e.add('1기_최종이수자명단_backup'); other.getRange('G2').setValue('특허');
    e.edit(other.getRange('G2')); assert.equal(other.getRange('I2').getValue(), '');
  });

  test('Existing I content/formulas are rejected and G formulas remain formulas', () => {
    const e = environment(), s = e.add('최종이수자명단');
    s.getRange('I2').setValue('교사가 작성한 자료'); s.getRange('G2').setValue('유튜브 영상을 분석함.');
    e.edit(s.getRange('G2'));
    assert.equal(s.getRange('I2').getValue(), '교사가 작성한 자료'); assert.ok(e.toasts.length);
    s.getRange('I2').clearContent(); s.getRange('I1').setValue('=1');
    assert.throws(() => e.context.ensureSetcColumn_(s), /수식/);
    s.getRange('I1').clearContent(); s.getRange('G2').setValue('=1+1');
    e.edit(s.getRange('G2')); assert.equal(s.getRange('G2').getFormula(), '=1+1');
    assert.match(s.getRange('I2').getValue(), /수식 셀/);
  });

  test('Formula-looking reason is written as literal rich text; stale edit is not overwritten', () => {
    const e = environment(), s = e.add('최종이수자명단');
    s.getRange('G2').setRichTextValue(new Rich('= 탐구함.'));
    e.edit(s.getRange('G2')); assert.equal(s.getRange('I2').getFormula(), ''); assert.match(s.getRange('I2').getValue(), /^=:/);
    s.getRange('G2').setValue('유튜브 영상을 분석함.');
    e.onRichRead = () => s.getRange('G2').setValue('새 입력을 정리함.');
    e.edit(s.getRange('G2')); assert.equal(s.getRange('G2').getValue(), '새 입력을 정리함.');
    assert.equal(s.getRange('I2').getValue(), '재검증 필요');
    e.lock.available = false; e.edit(s.getRange('G2')); assert.ok(e.toasts.some(t => t[0].includes('다른 작업')));
  });

  test('Large paste marks remainder pending and batch validation resumes across sheets', () => {
    const e = environment(), s = e.add('1기_최종이수자명단'), s2 = e.add('2기_최종이수자명단');
    s.getRange(2, 7, 205, 1).setValues(Array.from({length: 205}, () => ['정리함.']));
    s2.getRange(2, 7, 20, 1).setValues(Array.from({length: 20}, () => ['특허를 조사함.']));
    e.edit(s.getRange(2, 7, 205, 1));
    assert.equal(s.getRange('I206').getValue(), '재검증 필요'); assert.ok(e.toasts.length);
    e.context.revalidateAllSetc(); assert.ok(e.props.size);
    e.context.revalidateAllSetc(); assert.equal(e.props.size, 0);
    assert.equal(s.getRange('I206').getValue(), ''); assert.match(s2.getRange('I21').getValue(), /지식재산권/);
    assert.equal(e.lock.held, false);
  });

  test('Execution budget leaves an explicit pending result and whole-column edits stop at used rows', () => {
    const e = environment(), s = e.add('최종이수자명단');
    s.getRange('G2:G4').setValues([['정리함.'], ['정리함.'], ['정리함.']]);
    e.clockStep = 12000;
    e.edit(s.getRange('G2:G4'));
    assert.equal(s.getRange('I2').getValue(), '');
    assert.equal(s.getRange('I3').getValue(), '재검증 필요');
    assert.ok(e.toasts.length);
    e.clockStep = 0;
    e.context.revalidateAllSetc();
    s.getRange('G2:G4').clearContent();
    e.edit(s.getRange(1, 7, 1000, 1));
    assert.equal(s.getRange('I1000').getValue(), '');
    assert.equal(s.getLastRow(), 1);
  });

  test('Additional review rules render G evidence and I reasons, then clear after correction', () => {
    const e = environment(), s = e.add('최종이수자명단');
    const text = '컨 텐 츠 제작 중 ㅁㄴ 오류를 점검함.';
    s.getRange('G2').setValue(text); s.getRange('H2').setValue('=GET_NEIS_BYTE(G2)');
    e.edit(s.getRange('G2'));
    assert.equal(s.getRange('G2').getValue(), text);
    assert.equal(s.getRange('I2').getValue(), 'ㅁㄴ: 자모 연속 표기 오타 가능성(확인필요)\n컨 텐 츠: 한 글자 어절 연속 사용(확인필요)');
    let rich = s.getRange('G2').getRichTextValue();
    for (const phrase of ['컨 텐 츠', 'ㅁㄴ']) {
      const start = text.indexOf(phrase);
      assert.ok(rich.styles.slice(start, start + phrase.length).every(style => style.color === '#ff0000'));
    }
    assert.equal(rich.styles[text.indexOf('제작')].color, '#000000');
    assert.equal(s.getRange('H2').getFormula(), '=GET_NEIS_BYTE(G2)');
    s.getRange('G2').setValue('콘텐츠 제작 과정을 점검함.'); e.edit(s.getRange('G2'));
    assert.equal(s.getRange('I2').getValue(), '');
    rich = s.getRange('G2').getRichTextValue();
    assert.ok(rich.styles.every(style => style.color === '#000000'));
    s.getRange('G3').setValue('한 번 더 검토함.');
    e.context.revalidateAllSetc();
    assert.equal(s.getRange('G3').getValue(), '한 번 더 검토함.');
    assert.equal(s.getRange('I3').getValue(), '한 번 더: 한 글자 어절 연속 사용(확인필요)');
  });

  test('Reported five-space sentence becomes 26 bytes with only the ending reason on edit and revalidation', () => {
    for (const name of ['최종이수자명단', '1기_최종이수자명단']) {
      for (const action of ['edit', 'batch']) {
        const e = environment(), s = e.add(name);
        e.context.ensureSetcColumn_(s);
        s.getRange('G2').setValue('아버지가     법관이다.');
        s.getRange('H2').setValue('=GET_NEIS_BYTE(G2)');
        s.getRange('I2').setValue('연속 공백 5칸: 연속 공백 사용\n법관이다: 어미 오류');
        assert.equal(s.getRange('H2').getValue(), 30);
        if (action === 'edit') e.edit(s.getRange('G2'));
        else e.context.revalidateAllSetc();
        assert.equal(s.getRange('G2').getValue(), '아버지가 법관이다.', name + ' / ' + action);
        assert.equal(s.getRange('H2').getValue(), 26);
        assert.equal(s.getRange('I2').getValue(), '법관이다: 어미 오류');
        const rich = s.getRange('G2').getRichTextValue();
        assert.ok(rich.styles.slice(0, 5).every(style => style.color === '#000000'));
        assert.ok(rich.styles.slice(5, 9).every(style => style.color === '#ff0000'));
        assert.equal(rich.styles[9].color, '#000000');
      }
    }
  });

  test('Edit collapses ASCII spaces before checking, recalculates bytes and keeps line breaks', () => {
    const e = environment(), s = e.add('최종이수자명단');
    const input = '유튜브  영상을 정리함.\n특허   원리를 탐구함.';
    const expected = '유튜브 영상을 정리함.\n특허 원리를 탐구함.';
    s.getRange('G2').setValue(input);
    const formula = '=IF(G2="","",GET_NEIS_BYTE(G2))';
    s.getRange('H2').setValue(formula);
    const beforeBytes = s.getRange('H2').getValue();
    e.edit(s.getRange('G2'));
    assert.equal(s.getRange('G2').getValue(), expected);
    assert.equal(s.getRange('H2').getFormula(), formula);
    assert.equal(s.getRange('H2').getValue(), Buffer.byteLength(expected, 'utf8'));
    assert.equal(beforeBytes - s.getRange('H2').getValue(), 3);
    assert.equal(s.getRange('I2').getValue(), '유튜브: 사기업 명칭 (영상/스트리밍)\n특허: 지식재산권 관련 표현 확인 필요');
    const rich = s.getRange('G2').getRichTextValue();
    for (const phrase of ['유튜브', '특허']) {
      const start = expected.indexOf(phrase);
      assert.ok(rich.styles.slice(start, start + phrase.length).every(style => style.color === '#ff0000'));
    }
  });

  test('Space cleanup remaps mixed styles and distinct links without changing remaining characters', () => {
    const e = environment(), s = e.add('1기_최종이수자명단');
    const input = '😀  앞  링크  뒤를 정리함.', expected = '😀 앞 링크 뒤를 정리함.';
    const builder = new RichBuilder().setText(input).setTextStyle({bold: true, fontFamily: 'TestFont'});
    const first = input.indexOf('앞'), second = input.indexOf('링크'), italic = input.indexOf('뒤를');
    builder.setLinkUrl(first, first + 1, 'https://example.com/first');
    builder.setLinkUrl(second, second + 2, 'https://example.com/second');
    builder.setTextStyle(italic, italic + 2, {italic: true});
    s.getRange('G2').setRichTextValue(builder.build());
    e.edit(s.getRange('G2'));
    const rich = s.getRange('G2').getRichTextValue();
    assert.equal(rich.getText(), expected);
    assert.equal(rich.getLinkUrl(expected.indexOf('앞'), expected.indexOf('앞') + 1), 'https://example.com/first');
    assert.equal(rich.getLinkUrl(expected.indexOf('링크'), expected.indexOf('링크') + 2), 'https://example.com/second');
    assert.equal(rich.getLinkUrl(2, 3), null);
    assert.equal(rich.styles[expected.indexOf('뒤를')].italic, true);
    assert.ok(rich.styles.every(style => style.bold && style.fontFamily === 'TestFont'));
    assert.equal(rich.styles[0].color, '#ff0000');
    assert.equal(rich.styles[expected.indexOf('앞')].color, '#000000');
  });

  test('Batch revalidation cleans existing text and refreshes reasons while preserving non-ASCII whitespace', () => {
    const e = environment(), s = e.add('최종이수자명단');
    e.context.ensureSetcColumn_(s);
    const input = '한  번   더 검토함.\r\n둘째  문장을 정리함.';
    const expected = '한 번 더 검토함.\r\n둘째 문장을 정리함.';
    const special = '숨은\t\t공백\u00a0\u00a0검토함.';
    s.getRange('G2:G5').setValues([[input], [special], ['="내용  결과"'], ['   ']]);
    s.getRange('H2').setValue('=GET_NEIS_BYTE(G2)');
    s.getRange('H5').setValue('=GET_NEIS_BYTE(G5)');
    s.getRange('I2').setValue('연속 공백 사용');
    e.context.revalidateAllSetc();
    assert.equal(s.getRange('G2').getValue(), expected);
    assert.equal(s.getRange('H2').getValue(), Buffer.byteLength(expected, 'utf8'));
    assert.equal(s.getRange('I2').getValue(), '한 번 더: 한 글자 어절 연속 사용(확인필요)');
    assert.equal(s.getRange('G3').getValue(), special);
    assert.match(s.getRange('I3').getValue(), /숨은 문자·비표준 공백 사용/);
    assert.equal(s.getRange('G4').getFormula(), '="내용  결과"');
    assert.match(s.getRange('I4').getValue(), /수식 셀/);
    assert.equal(s.getRange('G5').getValue(), ' ');
    assert.equal(s.getRange('H5').getValue(), 1);
    assert.equal(s.getRange('I5').getValue(), '');
  });

  test('Cleanup does not overwrite a newer user edit', () => {
    const e = environment(), s = e.add('최종이수자명단');
    s.getRange('G2').setValue('기존  내용을 정리함.');
    e.onRichRead = () => s.getRange('G2').setValue('새로   입력한 내용을 보존함.');
    e.edit(s.getRange('G2'));
    assert.equal(s.getRange('G2').getValue(), '새로   입력한 내용을 보존함.');
    assert.equal(s.getRange('I2').getValue(), '재검증 필요');
  });

  test('Every generation mode filters the full A:I header and all student rows', () => {
    for (const mode of ['selected', 'byTerm', 'integrated']) {
      const e = environment();
      e.attendance('1기01강좌', [[1, 20101, '학생1', true, ''], [2, 20102, '학생2', true, '']]);
      e.context.executeCompletionTask(mode, mode === 'selected' ? '1기' : '');
      const s = e.ss.getSheetByName(mode === 'integrated' ? '최종이수자명단' : '1기_최종이수자명단');
      const range = s.getFilter().getRange();
      assert.deepEqual([range.getRow(), range.getColumn(), range.getLastRow(), range.getLastColumn()], [1, 1, 3, 9]);
      assert.ok(s.getRange('A1:I1').getValues()[0].every(Boolean));
    }
  });

  test('Editing renders both punctuation reasons from normalized text and clears them after correction', () => {
    const e = environment(), s = e.add('1기_최종이수자명단');
    const input = '그렇게  됨을 판단함 추가적으로 분석함', expected = '그렇게 됨을 판단함 추가적으로 분석함';
    s.getRange('G2').setValue(input);
    s.getRange('H2').setValue('=GET_NEIS_BYTE(G2)');
    e.edit(s.getRange('G2'));
    assert.equal(s.getRange('G2').getValue(), expected, 'only spaces are automatically changed');
    assert.equal(s.getRange('H2').getValue(), Buffer.byteLength(expected, 'utf8'));
    assert.equal(s.getRange('I2').getValue(),
      '판단함: 문장부호 누락 의심(확인필요)\n분석함: 문장 끝 온점 누락(확인필요)');
    const rich = s.getRange('G2').getRichTextValue();
    for (let i = 0; i < expected.length; i++) {
      const flagged = ['판단함', '분석함'].some(word => i >= expected.indexOf(word) && i < expected.indexOf(word) + word.length);
      assert.equal(rich.styles[i].color, flagged ? '#ff0000' : '#000000');
      assert.equal(rich.styles[i].bold, true);
    }
    const corrected = '그렇게 됨을 판단함. 추가적으로 분석함.';
    s.getRange('G2').setValue(corrected);
    e.edit(s.getRange('G2'));
    assert.equal(s.getRange('I2').getValue(), '');
    assert.ok(s.getRange('G2').getRichTextValue().styles.every(style => style.color === '#000000'));
    assert.equal(s.getRange('H2').getValue(), Buffer.byteLength(corrected, 'utf8'));
    s.getRange('G3').setValue('실험을 수행항');
    e.edit(s.getRange('G3'));
    assert.equal(s.getRange('I3').getValue(), '수행항: 어미 오류\n수행항: 문장 끝 온점 누락(확인필요)');
  });

  test('Batch revalidation adds missing filters and punctuation checks to existing completion records', () => {
    const e = environment(), s = e.add('최종이수자명단');
    s.getRange('G2:G3').setValues([['아버지가 의사임'], ['실험 결과를 정리함.']]);
    s.getRange('H2').setValue('=GET_NEIS_BYTE(G2)');
    e.context.revalidateAllSetc();
    assert.equal(s.getRange('G2').getValue(), '아버지가 의사임');
    assert.equal(s.getRange('I2').getValue(), '의사임: 문장 끝 온점 누락(확인필요)');
    assert.equal(s.getRange('I3').getValue(), '');
    const range = s.getFilter().getRange();
    assert.deepEqual([range.getRow(), range.getColumn(), range.getLastRow(), range.getLastColumn()], [1, 1, 3, 9]);
    assert.equal(s.getRange('H2').getFormula(), '=GET_NEIS_BYTE(G2)');
  });

  test('Extending an A1 filter preserves column criteria, existing wider ranges and row values', () => {
    const e = environment(), s = e.add('최종이수자명단');
    s.getRange('G2:G4').setValues([['첫째 기록'], ['둘째 기록'], ['셋째 기록']]);
    const criterionC = {hidden: ['학생2']}, criterionH = {min: 20};
    const original = s.getRange('A1:H2').createFilter();
    original.setColumnFilterCriteria(3, criterionC).setColumnFilterCriteria(8, criterionH);
    const before = JSON.stringify(s.getRange('A1:I4').getValues());
    assert.equal(e.context.ensureCompletionFilter_(s), '');
    const updated = s.getFilter();
    assert.notEqual(updated, original);
    assert.equal(updated.getRange().getLastRow(), 4);
    assert.equal(updated.getRange().getLastColumn(), 9);
    assert.equal(updated.getColumnFilterCriteria(3), criterionC);
    assert.equal(updated.getColumnFilterCriteria(8), criterionH);
    assert.equal(JSON.stringify(s.getRange('A1:I4').getValues()), before);
    e.context.ensureCompletionFilter_(s);
    assert.equal(s.getFilter(), updated, 'covered filter is not recreated');
    const wider = e.add('2기_최종이수자명단');
    wider.getRange('G2').setValue('수기 내용');
    const wideFilter = wider.getRange('A1:J100').createFilter();
    wideFilter.setColumnFilterCriteria(10, criterionC);
    e.context.ensureCompletionFilter_(wider);
    assert.equal(wider.getFilter(), wideFilter);
    assert.equal(wider.getFilter().getColumnFilterCriteria(10), criterionC);
  });

  test('Unrelated existing filter is retained and reported while punctuation validation still runs', () => {
    const e = environment(), s = e.add('1기_최종이수자명단');
    s.getRange('G2').setValue('내용을 정리함');
    const existing = s.getRange('B4:D10').createFilter();
    const criterion = {hidden: ['값']}; existing.setColumnFilterCriteria(2, criterion);
    e.context.revalidateAllSetc();
    assert.equal(s.getFilter(), existing);
    assert.equal(existing.getColumnFilterCriteria(2), criterion);
    assert.match(e.alerts.at(-1), /필터 확인:[\s\S]*A1에서 시작하지 않아/);
    assert.equal(s.getRange('I2').getValue(), '정리함: 문장 끝 온점 누락(확인필요)');
  });

  test('Failed filter expansion restores the previous range and criteria', () => {
    const e = environment(), s = e.add('최종이수자명단');
    s.getRange('G3').setValue('수기 내용');
    const criterion = {hidden: ['값']};
    s.getRange('A1:H2').createFilter().setColumnFilterCriteria(2, criterion);
    e.failNextFilterCreation = true;
    assert.throws(() => e.context.ensureCompletionFilter_(s), /Filter creation failed/);
    const restored = s.getFilter();
    assert.equal(restored.getRange().getLastColumn(), 8);
    assert.equal(restored.getRange().getLastRow(), 2);
    assert.equal(restored.getColumnFilterCriteria(2), criterion);
    assert.equal(s.getRange('G3').getValue(), '수기 내용');
  });

  test('Menu retains existing entry points and modal has three generation modes', () => {
    const e = environment(); e.context.onOpen(); e.context.openCompletionModal();
    const names = e.menus[0].items.map(i => i.fn);
    for (const name of ['openAdminModal', 'promptAbsenteeCheck', 'createFinalCompletionList', 'createFinalCompletionListsByTerm', 'openCompletionModal', 'revalidateAllSetc']) assert.ok(names.includes(name));
    for (const mode of ['selected', 'byTerm', 'integrated']) assert.ok(e.modal.html.includes('value="' + mode + '"'));
    assert.ok(e.modal.html.includes('new Option'));
  });
};
