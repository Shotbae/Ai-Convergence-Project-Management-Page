const vm = require('node:vm');

module.exports = function ({source, test, assert, normalize}) {
  class StyleBuilder {
    constructor() { this.style = {}; }
    setForegroundColor(color) { this.style.color = color; return this; }
    build() { return {...this.style}; }
  }
  class Rich {
    constructor(text, styles) { this.text = text; this.styles = styles || Array.from({length: text.length}, () => ({bold: true})); }
    copy() { return new RichBuilder(this.text, this.styles); }
    getText() { return this.text; }
  }
  class RichBuilder {
    constructor(text = '', styles) { this.text = text; this.styles = styles ? styles.map(s => ({...s})) : []; }
    setText(text) { this.text = text; this.styles = Array.from({length: text.length}, () => ({})); return this; }
    setTextStyle(...args) {
      const [start, end, style] = args.length === 1 ? [0, this.text.length, args[0]] : args;
      if (start < 0 || end > this.text.length || start >= end) throw new Error('Invalid rich text offsets');
      for (let i = start; i < end; i++) this.styles[i] = {...this.styles[i], ...style};
      return this;
    }
    build() { return new Rich(this.text, this.styles.map(s => ({...s}))); }
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
      getValues() { return this.cells().map(row => row.map(c => c.value)); }
      getValue() { return this.cells()[0][0].value; }
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

  test('Menu retains existing entry points and modal has three generation modes', () => {
    const e = environment(); e.context.onOpen(); e.context.openCompletionModal();
    const names = e.menus[0].items.map(i => i.fn);
    for (const name of ['openAdminModal', 'promptAbsenteeCheck', 'createFinalCompletionList', 'createFinalCompletionListsByTerm', 'openCompletionModal', 'revalidateAllSetc']) assert.ok(names.includes(name));
    for (const mode of ['selected', 'byTerm', 'integrated']) assert.ok(e.modal.html.includes('value="' + mode + '"'));
    assert.ok(e.modal.html.includes('new Option'));
  });
};
