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
      sort(spec) {
        const specs = (Array.isArray(spec) ? spec : [spec]).map(item => typeof item === 'number' ? {column: item, ascending: true} : item);
        const rows = this.cells().slice().sort((a, b) => {
          for (const item of specs) {
            const left = a[item.column - this.col].value, right = b[item.column - this.col].value;
            let cmp;
            if (typeof left === 'number' && typeof right === 'number') cmp = left - right;
            else if (typeof left === 'number') cmp = -1;
            else if (typeof right === 'number') cmp = 1;
            else cmp = String(left).localeCompare(String(right));
            if (cmp) return item.ascending === false ? -cmp : cmp;
          }
          return 0;
        });
        rows.forEach((cells, row) => cells.forEach((cell, col) => this.sheet.grid.set((this.row + row) + ',' + (this.col + col), cell)));
        return this;
      }
      createFilter() {
        if (env.failNextFilterCreation) { env.failNextFilterCreation = false; throw new Error('Filter creation failed'); }
        if (this.sheet.filter) throw new Error('A filter already exists');
        return this.sheet.filter = new Filter(this);
      }
      getValues() { return this.cells().map(row => row.map(c => c.value)); }
      getValue() {
        const cell = this.cells()[0][0];
        if (cell.formula === env.context.getCompletionByteFormula_()) {
          const text = this.sheet.cell(this.row, 7).value;
          return text === '' ? '' : env.context.GET_NEIS_BYTE(text);
        }
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
      getFrozenRows() { return this.frozenRows || 0; }
      setFrozenRows(count) { this.frozenRows = count; }
      moveRows(range, destination) {
        assert.equal(range.rows, 1); assert.equal(destination, 1);
        const source = range.getRow();
        this.grid = new Map([...this.grid].map(([key, cell]) => {
          const [row, col] = key.split(',').map(Number);
          const moved = row === source ? 1 : row < source ? row + 1 : row;
          return [moved + ',' + col, cell];
        }));
      }
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
    assert.equal(s.getRange('H2').getFormula(), e.context.getCompletionByteFormula_());
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

  test('Selected integrated lists include exactly the chosen terms and retain multiple records per student', () => {
    const e = environment();
    e.attendance('1기01강좌', [[1, 20101, '학생1', true, '']]);
    e.attendance('2기01강좌', [[1, 20101, '학생1', true, '']]);
    e.attendance('3기01강좌', [[1, 20103, '학생3', true, '']]);
    e.attendance('4기01강좌', [[1, 20104, '학생4', true, '']]);
    e.attendance('11기01강좌', [[1, 20111, '학생11', true, '']]);
    for (const terms of [['1기', '2기', '3기'], ['1기', '2기'], ['2기', '3기'], ['1기', '11기']]) {
      const result = e.context.executeCompletionTask('selectedIntegrated', terms);
      assert.equal(result.created.length, 1);
      const s = e.ss.getSheetByName(terms.join('+') + '_통합이수자명단');
      assert.ok(s);
      assert.equal(s.getLastRow(), terms.length + 1);
      assert.deepEqual(s.getRange(2, 4, terms.length, 1).getValues().map(row => row[0]), terms);
      assert.equal(s.getFilter().getRange().getLastColumn(), 9);
    }
    assert.deepEqual(e.ss.getSheetByName('1기+2기_통합이수자명단').getRange('B2:D3').getValues(),
      [[20101, '학생1', '1기'], [20101, '학생1', '2기']]);
    assert.equal(e.ss.getSheetByName('최종이수자명단'), null);
    assert.equal(e.ss.getSheetByName('4기_최종이수자명단'), null);
  });

  test('Newly added fourth, fifth and later terms appear automatically and only checked terms are integrated', () => {
    const e = environment();
    e.attendance('1기01강좌', [[1, 20101, '기존학생1', true, '']]);
    e.attendance('2기01강좌', [[1, 20102, '기존학생2', true, '']]);
    assert.deepEqual(normalize(e.context.getCompletionTermList()), ['1기', '2기']);
    for (const term of [10, 5, 4]) e.attendance(term + '기01강좌', [[1, 24000 + term, '추가학생' + term, true, '']]);
    assert.deepEqual(normalize(e.context.getCompletionTermList()), ['1기', '2기', '4기', '5기', '10기']);
    e.context.executeCompletionTask('selectedIntegrated', ['10기', '4기', '5기']);
    const s = e.ss.getSheetByName('4기+5기+10기_통합이수자명단');
    assert.deepEqual(s.getRange('B2:D4').getValues(), [
      [24004, '추가학생4', '4기'], [24005, '추가학생5', '5기'], [24010, '추가학생10', '10기']]);
    e.attendance('6기01강좌', [[1, 24006, '추가학생6', true, '']]);
    assert.ok(e.context.getCompletionTermList().includes('6기'));
    e.context.executeCompletionTask('selectedIntegrated', ['5기', '6기']);
    assert.deepEqual(e.ss.getSheetByName('5기+6기_통합이수자명단').getRange('D2:D3').getValues(), [['5기'], ['6기']]);
    assert.equal(e.ss.getSheetByName('최종이수자명단'), null);
  });

  test('Selected integrated requests reject empty, malformed, missing and overlong selections before changing sheets', () => {
    const e = environment();
    e.attendance('1기01강좌', [[1, 20101, '학생1', true, '']]);
    e.attendance('2기01강좌', [[1, 20102, '학생2', true, '']]);
    const beforeNames = e.ss.getSheets().map(s => s.getName());
    for (const selection of [undefined, [], '12', ['1기,2기'], [1, 2], ['1기', ''], ['1기', null], ['1기', '11기']]) {
      assert.throws(() => e.context.executeCompletionTask('selectedIntegrated', selection), /기수/);
      assert.deepEqual(e.ss.getSheets().map(s => s.getName()), beforeNames);
      assert.equal(e.lock.held, false);
    }
    assert.deepEqual(normalize(e.context.normalizeCompletionTerms_(['11기', ' 2기 ', '1기', '2기'])), ['1기', '2기', '11기']);
    const many = environment(), terms = Array.from({length: 20}, (_, i) => (100 + i) + '기');
    for (const term of terms) many.attendance(term + '01강좌', []);
    assert.throws(() => many.context.executeCompletionTask('selectedIntegrated', terms), /시트 이름이 너무/);
    assert.equal(many.ss.getSheets().length, terms.length);
    assert.equal(many.lock.held, false);
  });

  test('Reordered and duplicate choices reuse the same selected integrated list without changing handwritten data or filters', () => {
    const e = environment();
    e.attendance('1기01강좌', [[1, 20101, '학생1', true, '']]);
    e.attendance('2기01강좌', [[1, 20102, '학생2', true, '']]);
    e.context.executeCompletionTask('selectedIntegrated', ['2기', '1기']);
    const s = e.ss.getSheetByName('1기+2기_통합이수자명단');
    s.getRange('G2').setValue('수기 세특 보존'); s.getRange('H2').setValue('=99'); s.getRange('I2').setValue('기존 사유');
    const filter = s.getFilter(), criterion = {hidden: ['학생2']}; filter.setColumnFilterCriteria(3, criterion);
    const before = JSON.stringify([...s.grid]);
    const result = e.context.executeCompletionTask('selectedIntegrated', ['1기', '2기', '1기']);
    assert.deepEqual(normalize(result.skipped), ['1기+2기_통합이수자명단']);
    assert.equal(JSON.stringify([...s.grid]), before);
    assert.equal(s.getFilter(), filter);
    assert.equal(filter.getColumnFilterCriteria(3), criterion);
  });

  test('Selected integrated lists retain three-day completion, bytes, punctuation validation and batch support', () => {
    const e = environment();
    e.attendance('1기01강좌', [[1, 20101, '학생1', true, '']]);
    const three = e.add('2기01세차시강좌');
    three.getRange('E7:F7').setValues([['11/2', '3일차']]);
    three.getRange('A8:F9').setValues([[1, 20102, '학생2', true, true, true], [2, 20103, '미이수학생', true, true, false]]);
    e.context.executeCompletionTask('selectedIntegrated', ['2기', '1기']);
    const s = e.ss.getSheetByName('1기+2기_통합이수자명단');
    assert.deepEqual(s.getRange('B2:C3').getValues(), [[20101, '학생1'], [20102, '학생2']]);
    const text = '원리를 이해함 추가적으로 탐구함';
    s.getRange('G2').setValue(text); e.edit(s.getRange('G2'));
    assert.equal(s.getRange('I2').getValue(), '이해함: 문장부호 누락 의심(확인필요)\n탐구함: 문장 끝 온점 누락(확인필요)\n원리를: 문두 강좌명 불일치(확인필요)');
    assert.equal(s.getRange('H2').getValue(), Buffer.byteLength(text, 'utf8'));
    s.getRange('G3').setValue('아버지가 의사임');
    const backup = e.add('보관_1기+2기_통합이수자명단'); backup.getRange('G2').setValue('검사 제외 대상');
    e.context.revalidateAllSetc();
    assert.equal(s.getRange('I3').getValue(), '의사임: 문장 끝 온점 누락(확인필요)');
    assert.equal(backup.getRange('I2').getValue(), '');
    assert.deepEqual(normalize(e.context.getCompletionTermList()), ['1기', '2기']);
  });

  test('Selected integrated lists handle empty terms and a single choice independently from ordinary lists', () => {
    const e = environment();
    const one = e.attendance('1기01강좌', [[1, 20101, '학생1', false, '']]);
    e.attendance('2기01강좌', []);
    const empty = e.context.executeCompletionTask('selectedIntegrated', ['1기', '2기']);
    assert.deepEqual(normalize(empty.empty), ['1기+2기_통합이수자명단']);
    assert.equal(e.ss.getSheetByName('1기+2기_통합이수자명단'), null);
    one.getRange('D8').setValue(true);
    e.context.executeCompletionTask('selectedIntegrated', ['1기', '2기']);
    assert.equal(e.ss.getSheetByName('1기+2기_통합이수자명단').getLastRow(), 2);
    e.context.executeCompletionTask('selectedIntegrated', ['1기']);
    e.context.executeCompletionTask('selected', '1기');
    assert.ok(e.ss.getSheetByName('1기_통합이수자명단'));
    assert.ok(e.ss.getSheetByName('1기_최종이수자명단'));
  });

  test('Completion modal sends checked terms, blocks empty selection and restores controls after success or failure', () => {
    const e = environment();
    for (const term of [1, 4, 5, 10, 11]) e.attendance(term + '기01강좌', []);
    e.context.openCompletionModal();
    const element = () => ({children: [], value: '', disabled: false, hidden: false, textContent: '',
      appendChild(child) { this.children.push(child); }, add(option) { this.children.push(option); }});
    const nodes = Object.fromEntries(['mode', 'term', 'run', 'status', 'termGroup', 'termsGroup', 'termChecks'].map(id => [id, element()]));
    nodes.mode.value = 'selected'; nodes.run.disabled = true;
    const inputs = () => nodes.termChecks.children.flatMap(label => label.children).filter(child => child.type === 'checkbox');
    const requests = [], pending = [];
    const bridge = {withSuccessHandler(fn) { this.success = fn; return this; }, withFailureHandler(fn) { this.failure = fn; return this; },
      getCompletionTermList() { this.success(e.context.getCompletionTermList()); },
      executeCompletionTask(mode, selection) { requests.push({mode, selection}); pending.push({success: this.success, failure: this.failure}); }};
    const client = vm.createContext({document: {getElementById: id => nodes[id], createElement: element,
      querySelectorAll: selector => { assert.equal(selector, '#termChecks input:checked'); return inputs().filter(input => input.checked); }},
      Option: function (text, value) { this.text = text; this.value = value; }, google: {script: {run: bridge}}});
    const script = /<script>([\s\S]*?)<\/script>/.exec(e.modal.html)[1];
    vm.runInContext(script, client);
    assert.deepEqual(inputs().map(input => input.value), ['1기', '4기', '5기', '10기', '11기']);
    assert.equal(nodes.termsGroup.hidden, true);
    nodes.mode.value = 'selectedIntegrated'; client.toggleTerm();
    assert.equal(nodes.termGroup.hidden, true); assert.equal(nodes.termsGroup.hidden, false);
    client.run(); assert.equal(requests.length, 0); assert.match(nodes.status.textContent, /하나 이상 체크/);
    inputs()[0].checked = true; inputs()[1].checked = true;
    client.run();
    assert.deepEqual(normalize(requests[0]), {mode: 'selectedIntegrated', selection: ['1기', '4기']});
    assert.equal(nodes.mode.disabled, true); assert.equal(nodes.termsGroup.disabled, true);
    pending[0].failure({message: '일시적 오류'});
    assert.equal(nodes.mode.disabled, false); assert.equal(nodes.termsGroup.disabled, false);
    inputs()[0].checked = false; inputs()[2].checked = true;
    client.run();
    assert.deepEqual(normalize(requests[1]), {mode: 'selectedIntegrated', selection: ['4기', '5기']});
    pending[1].success({message: '완료'}); assert.equal(nodes.status.textContent, '완료');
    nodes.mode.value = 'selected'; nodes.term.value = '5기'; client.toggleTerm(); client.run();
    assert.deepEqual(normalize(requests[2]), {mode: 'selected', selection: '5기'});
    pending[2].success({message: '완료'}); assert.equal(nodes.run.disabled, false);
  });

  test('Edit renders only evidence red, preserves source, other styles and H formula; correction clears', () => {
    const e = environment(), s = e.add('최종이수자명단', 8);
    const text = '😀 유튜브 영상을 분석함.';
    s.getRange('G2').setValue(text); s.getRange('H2').setValue('=GET_NEIS_BYTE(G2)');
    e.edit(s.getRange('G2'));
    assert.equal(s.getRange('G2').getValue(), text);
    assert.equal(s.getRange('H2').getFormula(), e.context.getCompletionByteFormula_());
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

  test('Missing I1 marker recovers generated stale reasons after new data and partial-column sorting', () => {
    for (const action of ['edit', 'batch']) {
      const e = environment(), s = e.add('4기+5기_통합이수자명단');
      s.getRange('I1').setValue('오류 사유');
      // A~H의 새 행 순서와 I열에 남아 있는 이전 검사 결과를 재현한다.
      s.getRange('A2:H3').setValues([
        [1, 20102, '학생2', '5기', '강좌2', '교사', 'AI 모델을 활용함.', '=GET_NEIS_BYTE(G2)'],
        [2, 20101, '학생1', '4기', '강좌1', '교사', '유튜브 영상을 분석함.', '=GET_NEIS_BYTE(G3)']]);
      s.getRange('I2:I3').setValues([['유튜브: 사기업 명칭 (영상/스트리밍)'], ['특허: 지식재산권 관련 표현 확인 필요']]);
      const before = JSON.stringify(s.getRange('A2:G3').getValues());
      if (action === 'edit') e.edit(s.getRange('G2:G3'));
      else e.context.revalidateAllSetc();
      assert.equal(s.getRange('I2').getValue(), 'AI: 문두 강좌명 불일치(확인필요)', action);
      assert.equal(s.getRange('I3').getValue(), '유튜브: 사기업 명칭 (영상/스트리밍)\n유튜브: 문두 강좌명 불일치(확인필요)', action);
      assert.equal(s.getRange('I1').getNote(), e.context.SETC_COLUMN_MARKER_);
      assert.equal(JSON.stringify(s.getRange('A2:G3').getValues()), before);
      assert.equal(s.getRange('H2').getFormula(), e.context.getCompletionByteFormula_());
      assert.equal(e.toasts.length, 0);
    }
  });

  test('Unregistered I columns protect unknown notes, numeric values and formulas', () => {
    const cases = [
      {title: '오류 사유', values: ['유튜브: 사기업 명칭 (영상/스트리밍)', '교사가 적은 메모']},
      {title: '오류 사유', values: ['수행항: 어미 오류', 42]},
      {title: '오류 사유', values: ['수행항: 어미 오류', '=1+1']}
    ];
    for (const sample of cases) {
      const e = environment(), s = e.add('최종이수자명단');
      s.getRange('I1').setValue(sample.title); s.getRange('I2:I3').setValues(sample.values.map(value => [value]));
      s.getRange('G2').setValue('유튜브 영상을 분석함.');
      const before = JSON.stringify(s.getRange('G1:I3').getValues());
      assert.throws(() => e.context.ensureSetcColumn_(s), /I열|I1/);
      assert.equal(JSON.stringify(s.getRange('G1:I3').getValues()), before);
      assert.equal(s.getRange('I1').getNote(), '');
    }
  });

  test('Generated-result recognition accepts real checker explanations and pending statuses only', () => {
    const e = environment();
    for (const text of ['유튜브 영상을 살펴봄.', '특허 원리를 정리함.', '대회에서 수상함.', '실험을 수행했다.',
      'ㅁㄴ', '컨 텐 츠 제 작', 'Hello world를 활용함.', '숨은\u200b문자를 정리함.', '실험  결과를 정리함.',
      '값을 정리함~', '수행항', '원리를 이해함 추가적으로 적용함', '= 탐구함.']) {
      const output = e.context.formatSetcIssues_(e.context.checkSetcLocalRules(text));
      assert.ok(output, text);
      assert.equal(e.context.isSetcGeneratedResult_(output), true, output);
    }
    for (const status of ['', '재검증 필요', '수식 셀은 자동 검증 대상이 아닙니다.', '세특 내용을 문자열로 입력해주세요.']) {
      assert.equal(e.context.isSetcGeneratedResult_(status), true);
    }
    for (const unknown of [null, 10, '교사 메모', '표현: 알 수 없는 사유', ': 어미 오류', '어미 오류']) {
      assert.equal(e.context.isSetcGeneratedResult_(unknown), false);
    }
  });

  test('Formulas in an already managed I column remain protected', () => {
    const e = environment(), s = e.add('최종이수자명단');
    e.context.ensureSetcColumn_(s);
    s.getRange('G2').setValue('유튜브 영상을 분석함.'); s.getRange('I2').setValue('=1+1');
    e.edit(s.getRange('G2'));
    assert.equal(s.getRange('I2').getFormula(), '=1+1');
    assert.match(e.toasts.at(-1)[0], /I열.*수식/);
    assert.equal(s.getRange('G2').getValue(), '유튜브 영상을 분석함.');
  });

  test('Batch revalidation refreshes stale reasons when G values change independently', () => {
    const e = environment(), s = e.add('최종이수자명단');
    e.context.ensureSetcColumn_(s);
    s.getRange('G2:G3').setValues([['특허 원리를 정리함.'], ['유튜브 영상을 분석함.']]);
    e.edit(s.getRange('G2:G3'));
    // I1은 그대로 두고 A~H를 다시 정렬한 뒤 남는 사유를 현재 G값으로 갱신한다.
    s.getRange('G2:G3').setValues([['유튜브 영상을 분석함.'], ['특허 원리를 정리함.']]);
    e.context.revalidateAllSetc();
    assert.equal(s.getRange('I1').getNote(), e.context.SETC_COLUMN_MARKER_);
    assert.equal(s.getRange('I2').getValue(), '유튜브: 사기업 명칭 (영상/스트리밍)');
    assert.equal(s.getRange('I3').getValue(), '특허: 지식재산권 관련 표현 확인 필요');
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

  function filledCompletion(e, name = '4기+5기_통합이수자명단') {
    const s = e.add(name);
    e.context.writeCompletionList_(s, [
      [20103, '학생3', '4기', '강좌나', '교사다'],
      [20101, '학생1', '4기', '강좌가', '교사나'],
      [20104, '학생4', '5기', '강좌라', '교사가'],
      [20101, '학생1', '5기', '강좌다', '교사라']]);
    [3, 1, 4, 2].forEach((sequence, index) => {
      const row = index + 2, text = '기록' + sequence + '  유튜브 영상을 분석함.';
      s.getRange(row, 1).setValue(sequence);
      s.getRange(row, 7).setRichTextValue(new Rich(text,
        Array.from({length: text.length}, (_, i) => ({bold: i % 2 === 0, italic: i % 3 === 0, color: '#ff0000'})),
        Array.from({length: text.length}, (_, i) => i < 4 ? 'https://example.com/' + sequence : null)));
      s.getRange(row, 9).setRichTextValue(new Rich('유튜브: 사기업 명칭 (영상/스트리밍)'));
      s.getRange(row, 7).setNote('교사 메모 ' + sequence);
      s.getRange(row, 10).setValue('옆 열 자료 ' + sequence);
    });
    return s;
  }

  function recordSnapshot(s, start = 2) {
    return s.getRange(start, 1, s.getLastRow() - start + 1, 10).getValues().map((values, index) => {
      const row = start + index, g = s.getRange(row, 7), i = s.getRange(row, 9);
      return {key: JSON.stringify([values[1], values[3], values[4]]),
        values: [...values.slice(0, 7), ...values.slice(8)],
        styles: g.getRichTextValue().styles, links: g.getRichTextValue().links, note: g.getNote(),
        outputStyles: i.getRichTextValue() && i.getRichTextValue().styles};
    }).sort((a, b) => a.key.localeCompare(b.key));
  }

  test('One-time setup preserves existing text, styles, links, reasons and extra columns; upgrades only owned H formulas', () => {
    const e = environment(), s = filledCompletion(e);
    s.getRange('H2:H5').setValues([['=GET_NEIS_BYTE($G$2)'], ['=IF(G3="","",GET_NEIS_BYTE(G3))'], [123], ['=LEN(G5)']]);
    s.getRange('I1').setValue('검토 메모').setNote('내 제목 메모');
    const source = e.attendance('4기01강좌', [[1, 20101, '원본학생', true, false]]);
    const sourceBefore = JSON.stringify(source.getRange('A1:J9').getValues());
    const before = recordSnapshot(s), existingFilter = s.getFilter();
    const criterion = {hidden: ['교사가']}; existingFilter.setColumnFilterCriteria(6, criterion);
    e.props.set(e.context.SETC_CURSOR_KEY_, JSON.stringify({sheetId: s.id, row: 5}));
    e.context.prepareCompletionSheets();
    assert.deepEqual(recordSnapshot(s), before);
    assert.equal(s.getRange('H2').getFormula(), e.context.getCompletionByteFormula_());
    assert.equal(s.getRange('H3').getFormula(), e.context.getCompletionByteFormula_());
    assert.equal(s.getRange('H4').getValue(), 123);
    assert.equal(s.getRange('H5').getFormula(), '=LEN(G5)');
    assert.equal(s.getRange('I1').getValue(), '검토 메모');
    assert.equal(s.getRange('I1').getNote(), '내 제목 메모');
    assert.equal(s.getFrozenRows(), 1);
    assert.equal(s.getFilter(), existingFilter);
    assert.equal(s.getFilter().getColumnFilterCriteria(6), criterion);
    assert.equal(e.props.get(e.context.SETC_FIXED_COLUMNS_KEY_ + s.id), 'G7:H8:I9');
    assert.equal(e.props.has(e.context.SETC_CURSOR_KEY_), false);
    assert.equal(JSON.stringify(source.getRange('A1:J9').getValues()), sourceBefore);
    assert.match(e.alerts.at(-1), /1개 시트 처리/);
    assert.equal(e.lock.held, false);
  });

  test('Expanded whole-record sorting by sequence, student ID, course and teacher preserves all entered records and current-row bytes', () => {
    for (const column of [1, 2, 5, 6]) {
      const e = environment(), s = filledCompletion(e);
      s.getRange('I1').clearContent().setNote('');
      e.context.prepareCompletionSheets();
      s.getRange('I1').setValue('확인 사항').setNote('');
      const before = recordSnapshot(s);
      const originalOrder = s.getRange('A2:A5').getValues().flat();
      s.getRange('A2:J5').sort({column, ascending: true});
      assert.notDeepEqual(s.getRange('A2:A5').getValues().flat(), originalOrder);
      assert.deepEqual(recordSnapshot(s), before);
      for (let row = 2; row <= 5; row++) {
        assert.equal(s.getRange(row, 8).getValue(), Buffer.byteLength(s.getRange(row, 7).getValue(), 'utf8'));
      }
      const student = s.getRange('B3:F3').getValues();
      s.getRange('G3').setValue('아버지가 의사임');
      e.edit(s.getRange('G3'));
      assert.deepEqual(s.getRange('B3:F3').getValues(), student);
      assert.equal(s.getRange('I3').getValue(), '의사임: 문장 끝 온점 누락(확인필요)\n아버지가: 문두 강좌명 불일치(확인필요)');
      assert.equal(s.getRange('H3').getValue(), Buffer.byteLength('아버지가 의사임', 'utf8'));
      assert.equal(s.getRange('I1').getValue(), '확인 사항');
      assert.equal(e.toasts.length, 0);
    }
  });

  test('Setup restores a header sorted into the data without changing sorted student order, existing text or styles', () => {
    const e = environment(), s = filledCompletion(e);
    const before = recordSnapshot(s), header = s.getRange('A1:J1').getValues();
    s.getRange('A1:J5').sort(1);
    assert.equal(s.getRange('A5').getValue(), '순번');
    assert.deepEqual(s.getRange('A1:A4').getValues().flat(), [1, 2, 3, 4]);
    e.context.prepareCompletionSheets();
    assert.deepEqual(s.getRange('A1:J1').getValues(), header);
    assert.deepEqual(s.getRange('A2:A5').getValues().flat(), [1, 2, 3, 4]);
    assert.deepEqual(recordSnapshot(s), before);
    assert.match(e.alerts.at(-1), /제목 행 복원/);
    for (let row = 2; row <= 5; row++) {
      assert.equal(s.getRange(row, 8).getValue(), Buffer.byteLength(s.getRange(row, 7).getValue(), 'utf8'));
    }
  });

  test('Editing after accidental header sorting validates the relocated student rather than the old event row', () => {
    const e = environment(), s = filledCompletion(e);
    s.getRange('A1:J5').sort(1);
    const student = s.getRange('B3:F3').getValues();
    s.getRange('G3').setValue('아버지가 의사임');
    e.edit(s.getRange('G3'));
    assert.equal(s.getRange('A1').getValue(), '순번');
    assert.equal(s.getRange('G1').getValue(), '세특내용');
    assert.deepEqual(s.getRange('B4:F4').getValues(), student);
    assert.equal(s.getRange('G4').getValue(), '아버지가 의사임');
    assert.equal(s.getRange('I4').getValue(), '의사임: 문장 끝 온점 누락(확인필요)\n아버지가: 문두 강좌명 불일치(확인필요)');
    assert.equal(s.getRange('I1').getValue(), '오류 사유');
    assert.equal(s.getRange('I2').getValue(), '유튜브: 사기업 명칭 (영상/스트리밍)\n기록1: 문두 강좌명 불일치(확인필요)');
    assert.equal(e.toasts.length, 0);
  });

  test('Header restoration resets a saved validation row so earlier relocated records are also checked', () => {
    const e = environment(), s = filledCompletion(e);
    s.getRange('A1:J5').sort(1);
    s.getRange('I1:I4').setValue('재검증 필요');
    e.props.set(e.context.SETC_CURSOR_KEY_, JSON.stringify({sheetId: s.id, row: 4}));
    e.context.revalidateAllSetc();
    assert.equal(s.getRange('A1').getValue(), '순번');
    assert.deepEqual(s.getRange('I2:I5').getValues().map(row => row[0]), [1, 2, 3, 4].map(n =>
      '유튜브: 사기업 명칭 (영상/스트리밍)\n기록' + n + ': 문두 강좌명 불일치(확인필요)'));
    assert.equal(e.props.has(e.context.SETC_CURSOR_KEY_), false);
  });

  test('Existing generated results migrate without an I1 title or note; registered sheets ignore later caption changes', () => {
    for (const title of ['', '교사 확인']) {
      const e = environment(), s = filledCompletion(e);
      e.props.clear();
      s.getRange('I1').setValue(title).setNote('');
      const before = recordSnapshot(s);
      e.context.prepareCompletionSheets();
      assert.deepEqual(recordSnapshot(s), before);
      assert.equal(e.props.get(e.context.SETC_FIXED_COLUMNS_KEY_ + s.id), 'G7:H8:I9');
      s.getRange('I1').clearContent().setNote('');
      s.getRange('G2').setValue('실험을 정리함.');
      e.edit(s.getRange('G2'));
      assert.equal(s.getRange('I2').getValue(), '실험을: 문두 강좌명 불일치(확인필요)');
      assert.equal(e.toasts.length, 0);
    }
  });

  test('Duplicate headers stop before moving rows or overwriting any entered content', () => {
    const e = environment(), s = filledCompletion(e);
    s.getRange('A6:I6').setValues(s.getRange('A1:I1').getValues());
    const before = JSON.stringify(s.getRange('A1:J6').getValues());
    e.context.prepareCompletionSheets();
    assert.equal(JSON.stringify(s.getRange('A1:J6').getValues()), before);
    assert.match(e.alerts.at(-1), /처리 보류:[\s\S]*제목 행이 여러 개/);
  });

  test('A student in row one is checked as data and never replaced with a header or excluded by a new filter', () => {
    const e = environment(), s = e.add('최종이수자명단');
    s.getRange('A1:I1').setValues([[1, 20101, '학생', '1기', '강좌', '교사', '아버지가 의사임', '=GET_NEIS_BYTE(G1)', '재검증 필요']]);
    e.context.prepareCompletionSheets();
    assert.equal(s.getRange('I1').getValue(), '재검증 필요');
    assert.equal(s.getFilter(), null);
    assert.match(e.alerts.at(-1), /제목 행을 확인할 수 없어/);
    e.edit(s.getRange('G1'));
    assert.equal(s.getRange('B1').getValue(), 20101);
    assert.equal(s.getRange('G1').getValue(), '아버지가 의사임');
    assert.equal(s.getRange('I1').getValue(), '의사임: 문장 끝 온점 누락(확인필요)\n아버지가: 문두 강좌명 불일치(확인필요)');
    assert.equal(s.getRange('H1').getValue(), Buffer.byteLength('아버지가 의사임', 'utf8'));
  });

  test('Reported course-first examples restore one opening ASCII quote on editing and remain stable on repeated validation', () => {
    const e = environment(), s = e.add('4기+5기_통합이수자명단');
    const subjects = ['지식 전달 전문가로서의 교사', '스토리에 생명을 불어넣는 웹툰', '책에 가치를 더하는 사람',
      '수학교재개발자의 희망 진로와 로드맵', '언어의 온도', '나의 희망 진로', '인공지능을 활용한 간호사', '인공지능의 발전'];
    const inputs = subjects.map(subject => "AI와 언어' 수업에 참여하여 '" + subject + "'를 주제로 발표 자료를 제작함.");
    s.getRange(2, 5, inputs.length, 1).setValues(inputs.map(() => ['AI와 언어']));
    s.getRange(2, 7, inputs.length, 1).setValues(inputs.map(text => [text]));
    s.getRange(2, 8, inputs.length, 1).setValues(inputs.map((_, index) => ['=GET_NEIS_BYTE(G' + (index + 2) + ')']));
    e.edit(s.getRange(2, 7, inputs.length, 1));
    for (let index = 0; index < inputs.length; index++) {
      const row = index + 2, expected = "'" + inputs[index];
      assert.equal(s.getRange(row, 7).getValue(), expected);
      assert.equal(s.getRange(row, 8).getValue(), Buffer.byteLength(inputs[index], 'utf8') + 1);
      assert.ok(!s.getRange(row, 9).getValue().includes('문두 강좌명'));
      assert.equal(s.getRange(row, 7).getFormula(), '');
    }
    const once = JSON.stringify(s.getRange(2, 5, inputs.length, 5).getValues());
    e.edit(s.getRange(2, 7, inputs.length, 1));
    e.context.revalidateAllSetc();
    assert.equal(JSON.stringify(s.getRange(2, 5, inputs.length, 5).getValues()), once);
    assert.equal(e.toasts.length, 0);
  });

  test('Quote restoration and ASCII-space cleanup preserve line breaks, character styles, links and shifted evidence together', () => {
    const e = environment(), s = e.add('최종이수자명단');
    const input = "AI와 언어'  수업에 참여함.\r\n유튜브 영상을  분석함", expected = "'AI와 언어' 수업에 참여함.\r\n유튜브 영상을 분석함";
    const styles = Array.from({length: input.length}, (_, i) => ({bold: i < 6, italic: i >= input.indexOf('유튜브'), font: '교사 글꼴'}));
    const links = Array.from({length: input.length}, (_, i) => i < 6 ? 'https://example.com/course' : i >= input.indexOf('유튜브') && i < input.indexOf('유튜브') + 3 ? 'https://example.com/evidence' : null);
    s.getRange('E2').setValue('AI와 언어');
    s.getRange('G2').setRichTextValue(new Rich(input, styles, links));
    s.getRange('H2').setValue('=GET_NEIS_BYTE(G2)');
    e.edit(s.getRange('G2'));
    assert.equal(s.getRange('G2').getValue(), expected);
    assert.equal(s.getRange('H2').getValue(), Buffer.byteLength(expected, 'utf8'));
    assert.equal(s.getRange('I2').getValue(), '유튜브: 사기업 명칭 (영상/스트리밍)\n분석함: 문장 끝 온점 누락(확인필요)');
    const rich = s.getRange('G2').getRichTextValue();
    assert.equal(rich.styles[0].bold, true);
    assert.equal(rich.links[0], null, 'new quote must not gain an unrelated link');
    assert.ok(rich.links.slice(1, 7).every(url => url === 'https://example.com/course'));
    const evidence = expected.indexOf('유튜브');
    assert.ok(rich.links.slice(evidence, evidence + 3).every(url => url === 'https://example.com/evidence'));
    assert.equal(rich.styles[evidence].italic, true);
    assert.equal(rich.styles[evidence].font, '교사 글꼴');
    for (let i = 0; i < expected.length; i++) {
      const red = i >= evidence && i < evidence + 3 || i >= expected.indexOf('분석함');
      assert.equal(rich.styles[i].color, red ? '#ff0000' : '#000000');
    }
  });

  test('Batch validation uses each current course, restores exact prefixes and reviews uncertain openings without guessing', () => {
    for (const name of ['최종이수자명단', '2기_최종이수자명단', '2기+11기_통합이수자명단']) {
      const e = environment(), s = e.add(name);
      const records = [
        ['AI와 언어', "AI와 언어' 수업에 참여함."],
        ['자료[기초]+(실습)', "자료[기초]+(실습)' 수업에 참여함."],
        ['AI와 언어', 'AI와 언어 수업에 참여함.'],
        ['AI와 언어', "'다른 강좌' 수업에 참여함."],
        ['AI와 언어', "'AI와 언어' 수업에 참여함."],
        ['', "AI와 언어' 수업에 참여함."]];
      s.getRange(2, 5, records.length, 1).setValues(records.map(row => [row[0]]));
      s.getRange(2, 7, records.length, 1).setValues(records.map(row => [row[1]]));
      s.getRange('I2').setValue('이전 사유: 문두 강좌명 따옴표 확인(확인필요)');
      const backup = e.add('보관_' + name); backup.getRange('E2').setValue('AI와 언어'); backup.getRange('G2').setValue(records[0][1]);
      e.context.revalidateAllSetc();
      assert.equal(s.getRange('G2').getValue(), "'" + records[0][1]);
      assert.equal(s.getRange('G3').getValue(), "'" + records[1][1]);
      for (let index = 2; index < records.length; index++) assert.equal(s.getRange(index + 2, 7).getValue(), records[index][1]);
      assert.equal(s.getRange('I2').getValue(), '');
      assert.equal(s.getRange('I4').getValue(), 'AI와 언어: 문두 강좌명 따옴표 확인(확인필요)');
      assert.equal(s.getRange('I5').getValue(), "'다른 강좌': 문두 강좌명 불일치(확인필요)");
      assert.ok(s.getRange('G4').getRichTextValue().styles.slice(0, 6).every(style => style.color === '#ff0000'));
      assert.equal(backup.getRange('G2').getValue(), records[0][1]);
      assert.ok(!e.alerts.at(-1).includes('처리 실패'));
    }
  });

  test('Editing the course also refreshes the current row while teacher-only edits leave the record untouched', () => {
    const e = environment(), s = e.add('최종이수자명단');
    s.getRange('E2').setValue('다른 강좌'); s.getRange('G2').setValue("AI와 언어' 수업에 참여함.");
    e.edit(s.getRange('G2'));
    assert.equal(s.getRange('I2').getValue(), 'AI와: 문두 강좌명 불일치(확인필요)');
    s.getRange('E2').setValue('AI와 언어'); e.edit(s.getRange('E2'));
    assert.equal(s.getRange('G2').getValue(), "'AI와 언어' 수업에 참여함.");
    assert.equal(s.getRange('I2').getValue(), '');
    s.getRange('G2').setValue("AI와 언어' 수업에 참여함.");
    e.edit(s.getRange('F2'));
    assert.equal(s.getRange('G2').getValue(), "AI와 언어' 수업에 참여함.");
  });

  test('Restoration does not overwrite text when the course or content changes while validation is running', () => {
    for (const changedColumn of [5, 7]) {
      const e = environment(), s = e.add('최종이수자명단');
      s.getRange('E2').setValue('AI와 언어'); s.getRange('G2').setValue("AI와 언어' 수업에 참여함.");
      e.onRichRead = () => s.getRange(2, changedColumn).setValue(changedColumn === 5 ? '새 강좌' : '새 입력을 보존함.');
      e.edit(s.getRange('G2'));
      assert.equal(s.getRange('G2').getValue(), changedColumn === 5 ? "AI와 언어' 수업에 참여함." : '새 입력을 보존함.');
      assert.equal(s.getRange('I2').getValue(), '재검증 필요');
    }
  });

  test('Formula and I-column conflict protections apply before course quote restoration', () => {
    const e = environment(), s = e.add('최종이수자명단');
    s.getRange('E2').setValue('AI와 언어'); s.getRange('G2').setValue('=1+1');
    e.edit(s.getRange('G2'));
    assert.equal(s.getRange('G2').getFormula(), '=1+1');
    assert.equal(s.getRange('I2').getValue(), '수식 셀은 자동 검증 대상이 아닙니다.');
    const unregistered = e.add('5기_최종이수자명단');
    unregistered.getRange('E2').setValue('AI와 언어'); unregistered.getRange('G2').setValue("AI와 언어' 수업에 참여함.");
    unregistered.getRange('I2').setValue('교사 보관 자료');
    e.edit(unregistered.getRange('G2'));
    assert.equal(unregistered.getRange('G2').getValue(), "AI와 언어' 수업에 참여함.");
    assert.equal(unregistered.getRange('I2').getValue(), '교사 보관 자료');
    assert.match(e.toasts.at(-1)[0], /자동 검사 결과로 확인할 수 없는 자료/);
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
    e.context.revalidateAllSetc(); assert.ok(e.props.has(e.context.SETC_CURSOR_KEY_));
    e.context.revalidateAllSetc(); assert.equal(e.props.has(e.context.SETC_CURSOR_KEY_), false);
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
    assert.equal(s.getRange('H2').getFormula(), e.context.getCompletionByteFormula_());
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
    assert.equal(s.getRange('H2').getFormula(), e.context.getCompletionByteFormula_());
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
    for (const mode of ['selected', 'byTerm', 'integrated', 'selectedIntegrated']) {
      const e = environment();
      e.attendance('1기01강좌', [[1, 20101, '학생1', true, ''], [2, 20102, '학생2', true, '']]);
      e.context.executeCompletionTask(mode, mode === 'selected' ? '1기' : mode === 'selectedIntegrated' ? ['1기'] : '');
      const s = e.ss.getSheetByName(mode === 'integrated' ? '최종이수자명단'
        : mode === 'selectedIntegrated' ? '1기_통합이수자명단' : '1기_최종이수자명단');
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
    assert.equal(s.getRange('H2').getFormula(), e.context.getCompletionByteFormula_());
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

  test('Reported screenshot sentences render both missing punctuation reasons on edit and batch revalidation', () => {
    for (const action of ['edit', 'batch']) {
      const e = environment(), s = e.add('2기_최종이수자명단');
      e.context.ensureSetcColumn_(s);
      const first = '~함 판단함 그리고 ';
      const second = '창업하기를 판단함을 기록하고 최선을 다함 기기 사용에 앞장섬';
      s.getRange('G2:G3').setValues([[first], [second]]);
      s.getRange('H2:H3').setValues([['=GET_NEIS_BYTE(G2)'], ['=GET_NEIS_BYTE(G3)']]);
      s.getRange('I2').setValue('~: 금지기호 사용(수정필요)\n그리고: 어미 오류');
      if (action === 'edit') e.edit(s.getRange('G2:G3'));
      else e.context.revalidateAllSetc();
      assert.equal(s.getRange('I2').getValue(), '~: 금지기호 사용(수정필요)\n그리고: 어미 오류\n'
        + '판단함: 문장부호 누락 의심(확인필요)\n그리고: 문장 끝 온점 누락(확인필요)');
      assert.equal(s.getRange('I3').getValue(), '다함: 문장부호 누락 의심(확인필요)\n앞장섬: 문장 끝 온점 누락(확인필요)');
      assert.equal(s.getRange('G2').getValue(), first);
      assert.equal(s.getRange('G3').getValue(), second);
      assert.equal(s.getRange('H2').getValue(), Buffer.byteLength(first, 'utf8'));
      assert.equal(s.getRange('H3').getValue(), Buffer.byteLength(second, 'utf8'));
      const rich = s.getRange('G3').getRichTextValue();
      for (const word of ['다함', '앞장섬']) {
        assert.ok(rich.styles.slice(second.indexOf(word), second.indexOf(word) + word.length).every(style => style.color === '#ff0000'));
      }
      assert.ok(rich.styles.slice(second.indexOf('판단함을'), second.indexOf('판단함을') + 4).every(style => style.color === '#000000'));
      if (action === 'batch') assert.ok(e.alerts.at(-1).includes('온점 검사 포함 / ' + e.context.SETC_BUILD_ID_));
    }
  });

  test('On-sheet runtime status reports success and blocks batch writes when old rules override the checker', () => {
    const e = environment(), s = e.add('최종이수자명단');
    s.getRange('G2').setValue('이전 내용을 보존함');
    e.context.showSetcValidationStatus();
    assert.ok(e.alerts.at(-1).includes(e.context.SETC_BUILD_ID_));
    assert.match(e.alerts.at(-1), /문장 중간 누락 의심: 정상[\s\S]*문장 끝 온점 누락: 정상/);
    const before = JSON.stringify([...s.grid]);
    e.context.checkSetcLocalRules = text => e.context.checkSetcReferenceRules_(text);
    assert.equal(e.context.checkSetcRuntime_().ok, false);
    e.context.revalidateAllSetc();
    assert.match(e.alerts.at(-1), /온점 검사 확인에 실패/);
    assert.equal(JSON.stringify([...s.grid]), before);
    assert.equal(s.getFilter(), null);
  });

  test('Menu retains existing entry points and modal has four generation modes', () => {
    const e = environment(); e.context.onOpen(); e.context.openCompletionModal();
    const names = e.menus[0].items.map(i => i.fn);
    for (const name of ['openAdminModal', 'promptAbsenteeCheck', 'createFinalCompletionList', 'createFinalCompletionListsByTerm', 'openCompletionModal', 'revalidateAllSetc', 'showSetcValidationStatus', 'prepareCompletionSheets']) assert.ok(names.includes(name));
    for (const mode of ['selected', 'byTerm', 'integrated', 'selectedIntegrated']) assert.ok(e.modal.html.includes('value="' + mode + '"'));
    assert.ok(e.modal.html.includes('new Option'));
  });
};
