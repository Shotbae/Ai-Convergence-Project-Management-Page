
/**
 * =========================================================
 * [신규 추가] 상단 메뉴 및 팝업창 연동 코드 (HTML 통합 버전)
 * =========================================================
 */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('⚙️ 출석부 관리')
    .addItem('📋 출석부 및 명단 관리', 'openAdminModal')
    .addSeparator()
    .addItem('🚨 결석자 체크', 'promptAbsenteeCheck')
    .addItem('✅ 최종 이수자 명단 생성 (전체 통합)', 'createFinalCompletionList')
    .addItem('📁 기수별 최종 이수자 명단 생성', 'createFinalCompletionListsByTerm')
    .addToUi();
}

function openAdminModal() {
  const htmlString = `
  <!DOCTYPE html>
  <html>
    <head>
      <base target="_top">
      <style>
        body { font-family: 'Malgun Gothic', sans-serif; padding: 20px; color: #333; }
        .form-group { margin-bottom: 20px; }
        label { display: block; font-size: 13px; font-weight: bold; margin-bottom: 8px; color: #000; }
        select { 
          width: 100%; padding: 8px; font-size: 14px; 
          border: 1px solid #757575; border-radius: 4px; background-color: white;
        }
        .divider { border-top: 1px solid #e0e0e0; margin: 20px 0; }
        .btn-container { display: flex; flex-direction: column; gap: 8px; }
        
        button {
          padding: 10px; font-size: 13px; font-weight: bold; cursor: pointer;
          border: 1px solid #dadce0; border-radius: 4px; background-color: #fff;
          color: #1a73e8; transition: background-color 0.2s;
        }
        button:hover { background-color: #f8f9fa; }
        .primary-btn { background-color: #1a73e8; color: white; border: none; }
        .primary-btn:hover { background-color: #1557b0; }
        
        #loading { font-size: 12px; color: #d93025; display: none; margin-top: 10px; text-align: center;}
      </style>
    </head>
    <body>
      
      <div class="form-group">
        <label>기수 선택 (결석자 명단은 선택 기수까지 집계)</label>
        <select id="termSelect" onchange="updateCourses()">
          <option value="">기수를 불러오는 중...</option>
        </select>
      </div>

      <div class="form-group">
        <label>강좌 선택 (강좌별 출석부용)</label>
        <select id="courseSelect">
          <option value="">기수를 먼저 선택하세요</option>
        </select>
      </div>
      
      <div class="divider"></div>

      <div class="btn-container">
        <button class="primary-btn" onclick="runTask('createSingle')">📄 강좌별 출석부 생성</button>
        <button onclick="runTask('createAll')">📑 전체 출석부 일괄 생성</button>
        <button onclick="runTask('dupList')">👥 중복 신청자 명단 생성</button>
        <button onclick="runTask('waitList')">⏳ 대기자 명단 생성</button>
        <button onclick="runTask('teacherList')">🏫 담임 배포 명단 생성</button>
        <button onclick="runTask('absenceList')">🚫 결석자 명단 생성 (선택 기수까지)</button>
        <button onclick="runTask('pdf')">🖨️ 통합 출석부 pdf 출력</button>
      </div>
      
      <div id="loading">작업을 실행 중입니다. 잠시만 기다려주세요...</div>

      <script>
        window.onload = function() {
          google.script.run.withSuccessHandler(function(terms) {
            const termSelect = document.getElementById('termSelect');
            termSelect.innerHTML = '<option value="">-- 기수 선택 --</option>';
            terms.forEach(t => { termSelect.innerHTML += '<option value="' + t + '">' + t + '</option>'; });
          }).getTermListFromSheets();
        };

        function updateCourses() {
          const term = document.getElementById('termSelect').value;
          const courseSelect = document.getElementById('courseSelect');
          courseSelect.innerHTML = '<option value="">불러오는 중...</option>';

          if(!term) {
            courseSelect.innerHTML = '<option value="">기수를 먼저 선택하세요</option>';
            return;
          }

          google.script.run.withSuccessHandler(function(courses) {
            courseSelect.innerHTML = '<option value="">-- 강좌 선택 (선택 안함) --</option>';
            courses.forEach(c => { courseSelect.innerHTML += '<option value="' + c + '">' + c + '</option>'; });
          }).getCourseListFromSheet(term);
        }

        function runTask(taskType) {
          const term = document.getElementById('termSelect').value;
          const course = document.getElementById('courseSelect').value;

          if(!term) {
            if(taskType === 'absenceList') alert('결석자 명단을 생성할 마지막 기수를 선택해주세요!');
            else alert('먼저 기수를 선택해주세요!');
            return;
          }
          if(taskType === 'createSingle' && !course) { alert('강좌별 출석부를 생성하려면 강좌를 선택해주세요!'); return; }

          document.querySelectorAll('button').forEach(b => b.disabled = true);
          document.getElementById('loading').style.display = 'block';

          google.script.run
            .withSuccessHandler(function() { google.script.host.close(); })
            .withFailureHandler(function(error) {
              alert('오류가 발생했습니다: ' + error.message);
              google.script.host.close();
            })
            .executeTaskFromModal(taskType, term, course);
        }
      </script>
    </body>
  </html>
  `;

  const html = HtmlService.createHtmlOutput(htmlString)
      .setWidth(400)
      .setHeight(600) // 세로 길이를 450에서 600으로 늘려 스크롤바를 없앴습니다!
      .setTitle('출석부 및 명단 관리');
  SpreadsheetApp.getUi().showModalDialog(html, '작업 설정');
}

// [팝업창 통신용] 1. 기수 목록 가져오기
function getTermListFromSheets() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let terms = [];
  ss.getSheets().forEach(sheet => {
    const name = sheet.getName();
    if (name.includes("신청현황원본")) {
      const term = name.replace("신청현황원본", "").trim();
      if (term) terms.push(term);
    }
  });
  return [...new Set(terms)].sort();
}

// [팝업창 통신용] 2. 선택한 기수의 강좌 목록 가져오기
function getCourseListFromSheet(term) {
  if (!term) return [];
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let termStr = String(term).trim();
  if (!termStr.includes("기")) termStr += "기";
  
  const dataSheet = ss.getSheetByName(termStr + "신청현황원본");
  if (!dataSheet) return [];

  const headers = dataSheet.getRange(1, 7, 1, dataSheet.getLastColumn() - 6).getValues()[0];
  return headers.filter(h => h && h.includes("_"));
}

// [팝업창 통신용] 3. 팝업창에서 넘어온 명령 실행기
function executeTaskFromModal(taskType, term, course) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const mainSheet = ss.getSheetByName("출석부생성");

  // 결석자 명단 생성은 선택한 기수를 '집계 마지막 기수'로 사용하며 기존 B3/B4는 건드리지 않음
  if (taskType === 'absenceList') {
    createAbsenteeList(term);
    return;
  }
  
  mainSheet.getRange("B3").clearDataValidations();
  mainSheet.getRange("B4").clearDataValidations();
  
  if (term) mainSheet.getRange("B3").setValue(term);
  if (course) mainSheet.getRange("B4").setValue(course);
  
  SpreadsheetApp.flush(); 

  if (taskType === 'createSingle') createAttendanceSheet(true);
  else if (taskType === 'createAll') createAllAttendanceSheets();
  else if (taskType === 'dupList') createDuplicateList();
  else if (taskType === 'waitList') createWaitingList();
  else if (taskType === 'teacherList') createTeacherList();
  else if (taskType === 'pdf') exportAttendancePDF();
}


/**
 * =========================================================
 * [공통 헬퍼 함수 모음] 
 * =========================================================
 */
function getActiveDataSheet(ss, mainSheet, showAlert = true) {
  const ui = SpreadsheetApp.getUi();
  let termValue = mainSheet.getRange("B3").getValue();
  
  if (!termValue) {
    if (showAlert) ui.alert("B3 셀에 기수(예: 1기)를 입력하거나 선택하세요.");
    return null;
  }
  
  let term = String(termValue).trim();
  if (!term.includes("기")) term += "기";
  
  const sheetName = term + "신청현황원본";
  const dataSheet = ss.getSheetByName(sheetName);
  
  if (!dataSheet) {
    if (showAlert) ui.alert(`[${sheetName}] 시트를 찾을 수 없습니다. 시트 이름을 확인하세요.`);
    return null;
  }
  return dataSheet;
}

// [원본 신청현황 보호] 실제 학생 행인지 확인합니다.
// 신청현황원본의 맨 아래 '계/합계' 행, 빈 행, 통계/보조 행이
// 강좌 신청값 1을 가지고 있어도 학생으로 오인되지 않도록 B열(학번)과 C열(이름)을 모두 확인합니다.
function isValidStudentSourceRow(row) {
  if (!Array.isArray(row) || row.length < 3) return false;

  const studentId = String(row[1] === null || row[1] === undefined ? "" : row[1]).trim();
  const studentName = String(row[2] === null || row[2] === undefined ? "" : row[2]).trim();

  return studentId !== "" && studentName !== "";
}

function sortStudents(a, b) {
  const t1 = new Date(a.time).getTime();
  const t2 = new Date(b.time).getTime();
  if (t1 !== t2) return t1 - t2;
  const hashA = (a.id * 997) % 1000;
  const hashB = (b.id * 997) % 1000;
  return hashA - hashB;
}

function getNormalizedName(name) {
  return String(name).replace(/[\d\s\(\)\[\]\-\_\,\.\&]+/g, "");
}

function getCourseInfoMap(ss) {
  const infoSheet = ss.getSheetByName("강좌기본정보");
  if (!infoSheet) return {};
  const data = infoSheet.getRange(2, 1, infoSheet.getLastRow() - 1, 5).getValues();
  let map = {};
  data.forEach(r => {
    const code = String(r[0]).trim();
    if (code) {
      const summary = String(r[1]).trim();
      map[code] = {
        summary: summary,
        pureSummary: getNormalizedName(summary),
        capacity: parseInt(r[4]) || 12
      };
    }
  });
  return map;
}

function getStudentDuplicates(row, headers, infoMap) {
  // 방어적 검증: 향후 이 함수를 다른 곳에서 직접 호출하더라도
  // 계/합계/빈 보조 행은 중복 신청자로 판정하지 않습니다.
  if (!isValidStudentSourceRow(row)) {
    return { appliedCourses: [], dupMap: {}, overallReason: "" };
  }

  let applied = [];
  headers.forEach((h, i) => {
    if(h && h.includes("_") && row[i] == 1){
      const hCode = h.split("_")[0];
      const hDates = h.split("_")[1].split("/")[0].split("&");
      const cName = h.split("_")[1].split("/")[1];
      const pureName = infoMap[hCode] ? infoMap[hCode].pureSummary : getNormalizedName(cName);
      applied.push({ cName, pureName, dates: hDates });
    }
  });

  let dateCounts = {};
  applied.forEach(app => { app.dates.forEach(d => { dateCounts[d] = (dateCounts[d] || 0) + 1; }); });
  
  let nameCounts = {};
  applied.forEach(app => { nameCounts[app.pureName] = (nameCounts[app.pureName] || 0) + 1; });

  let dupMap = {};
  let hasDateDup = false;
  let hasNameDup = false;

  applied.forEach(app => {
    let isDateDup = app.dates.some(d => dateCounts[d] > 1);
    let isNameDup = nameCounts[app.pureName] > 1;
    
    if (isDateDup) hasDateDup = true;
    if (isNameDup) hasNameDup = true;

    let reason = "";
    if (isDateDup && isNameDup) reason = "(일자/강좌중복)";
    else if (isDateDup) reason = "(일자중복)";
    else if (isNameDup) reason = "(강좌중복)";
    
    if (reason) dupMap[app.cName] = reason;
  });

  let overallReason = "";
  if (hasDateDup && hasNameDup) overallReason = "(일자/강좌중복)";
  else if (hasDateDup) overallReason = "(일자중복)";
  else if (hasNameDup) overallReason = "(강좌중복)";

  return {
    appliedCourses: applied.map(a => a.cName),
    dupMap: dupMap,
    overallReason: overallReason
  };
}


/**
 * =========================================================
 * 1. 출석부 개별 생성 함수 (동적 레이아웃 조절 및 템플릿 자동 인식)
 * =========================================================
 */
function createAttendanceSheet(showAlert=true){
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const ui = SpreadsheetApp.getUi();

  const mainSheet = ss.getSheetByName("출석부생성");
  const dataSheet = getActiveDataSheet(ss, mainSheet, showAlert);
  if (!dataSheet) return "error";

  const lastRow = dataSheet.getLastRow();
  if (lastRow < 2) return "error";

  const templateSheet = ss.getSheetByName("출석부템플릿");
  const infoMap = getCourseInfoMap(ss);
  const courseText = mainSheet.getRange("B4").getValue();

  if(!courseText) return "error";

  const courseCode = courseText.split("_")[0];
  const headers = dataSheet.getRange(1, 1, 1, dataSheet.getLastColumn()).getValues()[0];
  const courseCol = headers.findIndex(h => h && h.split("_")[0] === courseCode);

  if(courseCol === -1) return "error";

  const capacity = infoMap[courseCode] ? infoMap[courseCode].capacity : 12;
  const summary = infoMap[courseCode] ? infoMap[courseCode].summary : "강좌";

  let termPrefix = String(mainSheet.getRange("B3").getValue()).trim();
  if (!termPrefix.includes("기")) termPrefix += "기";
  const sheetName = termPrefix + courseCode.split("-")[1] + summary;

  if(ss.getSheetByName(sheetName)) return "skipped";

  const sheet = templateSheet.copyTo(ss).setName(sheetName);
  sheet.showSheet(); 

  const data = dataSheet.getRange(2, 1, lastRow - 1, dataSheet.getLastColumn()).getValues();
  const studentData = data.filter(isValidStudentSourceRow);
  const infoParts = courseText.split("_")[1].split("/");
  const dateText = infoParts[0];
  const courseName = infoParts[1];
  const teacher = infoParts[2];
  const dates = dateText.split("&");
  
  const currentPureName = infoMap[courseCode] ? infoMap[courseCode].pureSummary : getNormalizedName(courseName);
  const headerDateInfo = headers.map(h => (h && h.includes("_")) ? h.split("_")[1].split("/")[0].split("&") : null);

  let students = [];
  studentData.forEach(row => {
    if(row[courseCol] == 1) {
      let appliedDates = [];
      let appliedPureNames = [];
      
      headers.forEach((h, idx) => {
        if(row[idx] == 1 && headerDateInfo[idx]) {
          headerDateInfo[idx].forEach(d => { if(dates.includes(d)) appliedDates.push(d); });
          const hCode = h.split("_")[0];
          const pureName = infoMap[hCode] ? infoMap[hCode].pureSummary : getNormalizedName(h.split("_")[1].split("/")[1]);
          appliedPureNames.push(pureName);
        }
      });
      
      const counts = {}; appliedDates.forEach(d => { counts[d] = (counts[d] || 0) + 1; });
      const sameNameCount = appliedPureNames.filter(n => n === currentPureName).length;
      
      students.push({
        id: row[1], 
        name: row[2], 
        time: row[5] ? row[5] : row[4], 
        duplicate: Object.values(counts).some(c => c > 1) || sameNameCount > 1
      });
    }
  });

  students.sort(sortStudents);

  const enrolled = students.slice(0, capacity).sort((a,b) => a.id - b.id);
  const waiting = students.slice(capacity, capacity + 4).sort((a,b) => a.id - b.id);
  const finalList = [...enrolled, ...waiting];

  sheet.getRange("B3").setValue(courseName);
  sheet.getRange("B4").setValue(dateText);
  sheet.getRange("B5").setValue(teacher);
  insertTeacherStamp(sheet, teacher);
  sheet.getRange("D7").setValue(dates[0]);
  sheet.getRange("E7").setValue(dates[1] || "");

  let values = [], bgColors = [];
  finalList.forEach((s, i) => {
    let name = (i >= enrolled.length) ? s.name + "(대기)" : s.name;
    if(s.duplicate) name += "(중복)";
    values.push([i+1, s.id, name, "", "", ""]);
    bgColors.push([null, null, s.duplicate ? "#fff59d" : null, null, null, null]);
  });

  // --- [수정된 부분] 동적 행/체크박스/레이아웃 조절 로직 ---

  const baseRows = 16; // 기본 양식으로 유지할 최소 행 수 (16명)

  // 1. 학생 데이터를 쓰기 전에 템플릿 원래 행 수를 먼저 계산
  //    (학생 데이터가 17행 이상 들어간 뒤 계산하면 초과 학생 행을 템플릿 행으로 오인할 수 있음)
  const lastRowOfTemplate = sheet.getLastRow();
  const aValues = sheet.getRange("A8:A" + (lastRowOfTemplate > 7 ? lastRowOfTemplate : 8)).getValues();
  let templateRows = 0;

  for(let i = 0; i < aValues.length; i++) {
    if(String(aValues[i][0]).trim() !== "") {
      templateRows++;
    } else {
      break;
    }
  }

  // 기존 16명 기본 양식은 그대로 유지
  if (templateRows < baseRows) templateRows = baseRows;

  const visibleRows = values.length > baseRows ? values.length : baseRows;
  const requiredLastRow = 7 + visibleRows;

  // 2. 실제 학생 수가 템플릿 행 수를 초과하면 필요한 행을 확보하고
  //    마지막 템플릿 행의 서식/테두리/체크박스를 그대로 복제
  if (sheet.getMaxRows() < requiredLastRow) {
    sheet.insertRowsAfter(sheet.getMaxRows(), requiredLastRow - sheet.getMaxRows());
  }

  if (visibleRows > templateRows) {
    const sourceRow = 7 + templateRows;
    const sourceRange = sheet.getRange(sourceRow, 1, 1, 6);
    const sourceHeight = sheet.getRowHeight(sourceRow);

    for(let row = sourceRow + 1; row <= requiredLastRow; row++) {
      sourceRange.copyTo(sheet.getRange(row, 1, 1, 6));
      sheet.setRowHeight(row, sourceHeight);
    }
  }

  // 실제 사용하는 행은 혹시 숨겨져 있더라도 다시 표시
  sheet.showRows(8, visibleRows);

  // 3. 학생 데이터 입력
  if(values.length > 0) {
    const range = sheet.getRange(8, 1, values.length, 6);
    range.setValues(values);
    range.setBackgrounds(bgColors);
  }

  // 4. 기본 16행은 화면에 남겨두되, 실제 학생 이후의 빈 행에서는 체크박스만 제거
  //    예: 학생 4명 -> 5~16번 행은 그대로 보이지만 D/E 체크박스는 없음
  if (values.length < visibleRows) {
    sheet.getRange(8 + values.length, 4, visibleRows - values.length, 2).removeCheckboxes();
  }

  // 템플릿이 기본 16행보다 더 긴 경우에는 사용하지 않는 초과 행을 기존처럼 숨김
  if (visibleRows < templateRows) {
    sheet.getRange(8 + visibleRows, 4, templateRows - visibleRows, 2).removeCheckboxes();
    sheet.hideRows(8 + visibleRows, templateRows - visibleRows);
  }

  // 5. 단기(1일) 강좌의 경우 2일 차 체크박스(E열) 일괄 제거
  if (dates.length == 1) {
    sheet.getRange(8, 5, visibleRows, 1).removeCheckboxes();
  }

  // 6. 17명 이상인 경우 가독성 유지하며 A4 한 장에 맞추기 위한 기존 리사이징 유지
  if (values.length > baseRows) {
    const dataRange = sheet.getRange(8, 1, values.length, 6);
    dataRange.setFontSize(9);                  // 폰트 크기 축소
    sheet.setRowHeights(8, values.length, 20); // 행 높이 축소
  }
  // -------------------------------------------------------

  if(showAlert) { SpreadsheetApp.flush(); ss.setActiveSheet(sheet); ui.alert("출석부 생성 완료"); }
  return "created";
}


/**
 * =========================================================
 * 2, 3, 4. 보조 함수 모음 
 * =========================================================
 */
function createAllAttendanceSheets(){
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const ui = SpreadsheetApp.getUi();
  const mainSheet = ss.getSheetByName("출석부생성");
  const dataSheet = getActiveDataSheet(ss, mainSheet, true);
  if (!dataSheet) return;

  const headers = dataSheet.getRange(1, 7, 1, dataSheet.getLastColumn() - 6).getValues()[0];
  const courseList = headers.filter(h => h && h.includes("_")).sort((a,b) => {
    return parseInt(a.split("_")[0].split("-")[1]) - parseInt(b.split("_")[0].split("-")[1]);
  });

  mainSheet.getRange("B4").clearDataValidations();

  let createdCount = 0, skippedCount = 0;
  courseList.forEach(course => {
    mainSheet.getRange("B4").setValue(course);
    const result = createAttendanceSheet(false); 
    if (result === "created") createdCount++; else if (result === "skipped") skippedCount++;
  });
  
  SpreadsheetApp.flush(); 

  ui.alert(`전체 출석부 작업 완료!\n- 신규: ${createdCount}개\n- 건너뜀: ${skippedCount}개`);
}

function insertTeacherStamp(targetSheet, teacherName){
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const stampSheet = ss.getSheetByName("교사직인");
  if(!stampSheet) return;
  const data = stampSheet.getRange("A:B").getValues();
  for(let i=0; i<data.length; i++){
    if(data[i][0] === teacherName){
      stampSheet.getRange(i+1, 2).copyTo(targetSheet.getRange("E5"), {contentsOnly:true}); break;
    }
  }
}

function updateCourseDropdown(){ return; }


/**
 * =========================================================
 * [신규 기능] 결석자 명단 생성 / 과거 결석자 체크
 * =========================================================
 */
function getAttendanceTermFromSheetName(sheetName) {
  const match = String(sheetName).match(/^(\d+기)\d+/);
  return match ? match[1] : "";
}

function getCleanAttendanceStudentName(name) {
  return String(name).replace(/\(대기\)|\(중복\)/g, "").trim();
}

// 사용자가 선택한 기수까지의 출석부를 읽어 결석 이력을 통합합니다.
// 숨김 여부는 사용하지 않습니다. 예: 2기를 선택하면 1기~2기 출석부만 검사하고 3기 이후는 제외합니다.
// 규칙:
// 1) 이름에 (대기)가 있고 해당 강좌의 출석 체크가 하나도 없으면 단순 대기자로 보고 제외
// 2) 그 외 학생은 1일 강좌에서 D열 미체크, 2일 강좌에서 D/E 중 하나라도 미체크면 결석 이력으로 기록
// 3) 같은 기수에서 여러 강좌를 결석해도 결석자명단에는 학생당 1회만 기록하고, 결석 강좌명은 한 셀에 함께 표시
function createAbsenteeList(upToTerm) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const ui = SpreadsheetApp.getUi();

  let upperTermText = String(upToTerm || "").trim();
  if (!upperTermText) {
    ui.alert("결석자 명단을 생성할 마지막 기수를 선택해주세요.");
    return;
  }

  if (!upperTermText.includes("기")) upperTermText += "기";

  const upperTermNumber = parseInt(upperTermText.replace("기", ""));
  if (isNaN(upperTermNumber)) {
    ui.alert("기수 형식이 올바르지 않습니다. 예: 2기");
    return;
  }

  const attendanceRegex = /^(\d+)기\d+/;

  // 선택한 기수 이하의 출석부만 검사
  const targetSheets = ss.getSheets().filter(sheet => {
    const match = String(sheet.getName()).match(attendanceRegex);
    if (!match) return false;

    const sheetTermNumber = parseInt(match[1]);
    return !isNaN(sheetTermNumber) && sheetTermNumber <= upperTermNumber;
  });

  if (targetSheets.length === 0) {
    ui.alert(`[${upperTermText}]까지 검사할 출석부가 없습니다.`);
    return;
  }

  // key = 기수|학번|이름
  // 같은 학생이 같은 기수에서 여러 강좌를 결석한 경우 courses Set에 강좌명을 누적
  const absenteeMap = new Map();

  targetSheets.forEach(sheet => {
    const term = getAttendanceTermFromSheetName(sheet.getName());
    if (!term) return;

    const courseName = String(sheet.getRange("B3").getValue()).trim();
    const date2 = sheet.getRange("E7").getValue();
    const isTwoDays = (date2 !== "" && date2 !== null);

    const lastRow = sheet.getLastRow();
    if (lastRow < 8) return;

    const data = sheet.getRange(8, 1, lastRow - 7, 5).getValues();

    data.forEach(row => {
      const studentId = row[1];
      const rawName = row[2];

      if (!studentId || String(studentId).trim() === "") return;
      if (!rawName || String(rawName).trim() === "") return;

      const check1 = row[3] === true;
      const check2 = row[4] === true;
      const isWaiting = String(rawName).includes("(대기)");

      const noAttendanceAtAll = isTwoDays
        ? (!check1 && !check2)
        : !check1;

      // 이름에 (대기)가 있고 실제 출석이 한 번도 없으면 단순 대기자이므로 결석 제외
      if (isWaiting && noAttendanceAtAll) return;

      // 일반 학생의 결석 판정
      const isAbsent = isTwoDays
        ? (!check1 || !check2)
        : !check1;

      if (!isAbsent) return;

      const cleanName = getCleanAttendanceStudentName(rawName);
      const key = term + "|" + String(studentId).trim() + "|" + cleanName;

      if (!absenteeMap.has(key)) {
        absenteeMap.set(key, {
          term: term,
          studentId: studentId,
          name: cleanName,
          courses: new Set()
        });
      }

      if (courseName) {
        absenteeMap.get(key).courses.add(courseName);
      }
    });
  });

  const result = Array.from(absenteeMap.values()).map(item => {
    return [
      item.term,
      item.studentId,
      item.name,
      Array.from(item.courses).join(" / ")
    ];
  });

  result.sort((a, b) => {
    const termA = parseInt(String(a[0]).replace("기", "")) || 0;
    const termB = parseInt(String(b[0]).replace("기", "")) || 0;

    if (termA !== termB) return termA - termB;
    return Number(a[1]) - Number(b[1]);
  });

  const sheetName = "결석자명단";
  let resultSheet = ss.getSheetByName(sheetName);

  if (resultSheet) {
    resultSheet.clear();
  } else {
    resultSheet = ss.insertSheet(sheetName);
  }

  resultSheet.getRange("A1:D1")
    .setValues([["기수", "학번", "이름", "결석한 강좌"]])
    .setFontWeight("bold")
    .setBackground("#e0e0e0")
    .setHorizontalAlignment("center");

  if (result.length > 0) {
    const range = resultSheet.getRange(2, 1, result.length, 4);

    range.setValues(result)
      .setHorizontalAlignment("center")
      .setBorder(true, true, true, true, true, true);

    resultSheet.autoResizeColumns(1, 4);
  }

  ss.setActiveSheet(resultSheet);

  ui.alert(
    `결석자 명단 생성 완료!\n` +
    `- 집계 범위: 1기 ~ ${upperTermText}\n` +
    `- 확인한 출석부: ${targetSheets.length}개\n` +
    `- 결석 이력 학생: ${result.length}명`
  );
}

// 상단 메뉴의 '결석자 체크'에서 기수를 직접 입력받습니다.
function promptAbsenteeCheck() {
  const ui = SpreadsheetApp.getUi();
  const response = ui.prompt(
    "결석자 체크",
    "결석 이력을 확인할 기수를 입력하세요. (예: 3기)",
    ui.ButtonSet.OK_CANCEL
  );

  if (response.getSelectedButton() !== ui.Button.OK) return;

  let term = String(response.getResponseText()).trim();
  if (!term) {
    ui.alert("기수를 입력해주세요.");
    return;
  }
  if (!term.includes("기")) term += "기";

  checkAbsenteesInTerm(term);
}

// 결석자명단의 '이전 기수' 결석 이력을 기준으로 대상 기수 출석부의 학번/이름(B:C)을 빨간색으로 표시합니다.
function checkAbsenteesInTerm(term) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const ui = SpreadsheetApp.getUi();
  const absenceSheet = ss.getSheetByName("결석자명단");

  if (!absenceSheet) {
    ui.alert("[결석자명단] 시트가 없습니다. 먼저 결석자 명단을 생성해주세요.");
    return;
  }

  let termText = String(term).trim();
  if (!termText.includes("기")) termText += "기";

  const targetTermNumber = parseInt(termText.replace("기", ""));
  if (isNaN(targetTermNumber)) {
    ui.alert("기수 형식이 올바르지 않습니다. 예: 3기");
    return;
  }

  const lastRow = absenceSheet.getLastRow();
  if (lastRow < 2) {
    ui.alert("결석자명단에 결석 이력이 없습니다.");
    return;
  }

  const absenceData = absenceSheet.getRange(2, 1, lastRow - 1, 3).getValues();
  const blockedKeys = new Set();

  absenceData.forEach(row => {
    const absenceTerm = String(row[0]).trim();
    const absenceTermNumber = parseInt(absenceTerm.replace("기", ""));
    const studentId = String(row[1]).trim();
    const studentName = getCleanAttendanceStudentName(row[2]);

    // '추후 프로그램 제외' 규칙에 맞춰 대상 기수보다 이전 기수의 결석 이력만 사용
    if (!isNaN(absenceTermNumber) && absenceTermNumber < targetTermNumber && studentId && studentName) {
      blockedKeys.add(studentId + "|" + studentName);
    }
  });

  if (blockedKeys.size === 0) {
    ui.alert(`[${termText}]보다 이전 기수의 결석 이력이 없습니다.`);
    return;
  }

  const escapedTerm = termText.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const targetRegex = new RegExp("^" + escapedTerm + "\\d+");
  const targetSheets = ss.getSheets().filter(sheet => targetRegex.test(sheet.getName()));

  if (targetSheets.length === 0) {
    ui.alert(`[${termText}] 출석부 시트를 찾을 수 없습니다.`);
    return;
  }

  let matchedRows = 0;
  const matchedStudents = new Set();
  const failedSheets = [];

  targetSheets.forEach(sheet => {
    const sheetLastRow = sheet.getLastRow();
    if (sheetLastRow < 8) return;

    const data = sheet.getRange(8, 2, sheetLastRow - 7, 2).getValues(); // B:C = 학번, 이름
    const rangesToMark = [];
    const studentKeysToMark = new Set();

    data.forEach((row, index) => {
      const studentId = String(row[0]).trim();
      const studentName = getCleanAttendanceStudentName(row[1]);
      if (!studentId || !studentName) return;

      const key = studentId + "|" + studentName;
      if (blockedKeys.has(key)) {
        const actualRow = 8 + index;
        rangesToMark.push(`B${actualRow}:C${actualRow}`);
        studentKeysToMark.add(key);
      }
    });

    if (rangesToMark.length > 0) {
      try {
        sheet.getRangeList(rangesToMark).setBackground("#ff0000");
        matchedRows += rangesToMark.length;
        studentKeysToMark.forEach(key => matchedStudents.add(key));
      } catch (e) {
        failedSheets.push(sheet.getName());
      }
    }
  });

  SpreadsheetApp.flush();

  let message = `결석자 체크 완료!\n- 대상 기수: ${termText}\n- 결석 이력 학생: ${matchedStudents.size}명\n- 표시된 출석부 행: ${matchedRows}건`;
  if (failedSheets.length > 0) {
    message += `\n- 잠금 권한으로 표시 실패: ${failedSheets.length}개 시트`;
  }
  ui.alert(message);
}


/**
 * =========================================================
 * 5. 중복 신청자 명단 생성 함수 
 * =========================================================
 */
function createDuplicateList(){
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const mainSheet = ss.getSheetByName("출석부생성");
  const dataSheet = getActiveDataSheet(ss, mainSheet, true);
  if (!dataSheet) return;

  const lastRow = dataSheet.getLastRow();
  if (lastRow < 2) return;

  const infoMap = getCourseInfoMap(ss);
  const headers = dataSheet.getRange(1, 1, 1, dataSheet.getLastColumn()).getValues()[0];
  const data = dataSheet.getRange(2, 1, lastRow - 1, dataSheet.getLastColumn()).getValues();
  const studentData = data.filter(isValidStudentSourceRow);

  let termPrefix = String(mainSheet.getRange("B3").getValue()).trim();
  if (!termPrefix.includes("기")) termPrefix += "기";
  const newSheetName = termPrefix + "_중복신청자명단";

  const old = ss.getSheetByName(newSheetName);
  if(old) ss.deleteSheet(old);
  const sheet = ss.insertSheet(newSheetName);

  let result = [];

  studentData.forEach(row => {
    const dupInfo = getStudentDuplicates(row, headers, infoMap);
    
    if (dupInfo.overallReason !== "") {
      let mappedCourses = dupInfo.appliedCourses.map(cName => {
        let reason = dupInfo.dupMap[cName];
        return reason ? cName + reason : cName; 
      });

      result.push([
        row[1], 
        row[2] + dupInfo.overallReason,
        mappedCourses[0]||"", 
        mappedCourses[1]||"", 
        mappedCourses[2]||""
      ]);
    }
  });

  result.sort((a,b) => a[0] - b[0]);
  sheet.getRange("A1:E1").setValues([["학번", "이름(사유)", "신청강좌1", "신청강좌2", "신청강좌3"]]).setFontWeight("bold").setBackground("#e0e0e0").setHorizontalAlignment("center");
  if(result.length > 0) {
    sheet.getRange(2, 1, result.length, 5).setValues(result).setHorizontalAlignment("center");
    sheet.autoResizeColumns(1, 5);
  }
  ss.setActiveSheet(sheet);
}


/**
 * =========================================================
 * 6. 대기자 명단 생성 함수 
 * =========================================================
 */
function createWaitingList(){
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const mainSheet = ss.getSheetByName("출석부생성");
  const dataSheet = getActiveDataSheet(ss, mainSheet, true);
  if (!dataSheet) return;

  const lastRow = dataSheet.getLastRow();
  if (lastRow < 2) return;

  const infoMap = getCourseInfoMap(ss);
  const headers = dataSheet.getRange(1, 1, 1, dataSheet.getLastColumn()).getValues()[0];
  const data = dataSheet.getRange(2, 1, lastRow - 1, dataSheet.getLastColumn()).getValues();
  const studentData = data.filter(isValidStudentSourceRow);

  let termPrefix = String(mainSheet.getRange("B3").getValue()).trim();
  if (!termPrefix.includes("기")) termPrefix += "기";
  const newSheetName = termPrefix + "_대기자명단";

  const old = ss.getSheetByName(newSheetName);
  if(old) ss.deleteSheet(old);
  const sheet = ss.insertSheet(newSheetName);

  let map = {};

  headers.forEach((h, idx) => {
    if(h && h.includes("_")){
      const code = h.split("_")[0];
      const name = h.split("_")[1].split("/")[1];
      let list = [];

      studentData.forEach(row => { if(row[idx] == 1) list.push({id:row[1], name:row[2], time: row[5] ? row[5] : row[4]}); });
      list.sort(sortStudents);

      const cap = infoMap[code] ? infoMap[code].capacity : 12;
      const wait = list.slice(cap, cap + 4);

      wait.forEach(s => {
        if(!map[s.id]) map[s.id] = {name: s.name, courses: []};
        map[s.id].courses.push(name);
      });
    }
  });

  let result = [];
  Object.keys(map).forEach(id => {
    result.push([parseInt(id), map[id].name, map[id].courses[0]||"", map[id].courses[1]||"", map[id].courses[2]||""]);
  });

  result.sort((a,b) => a[0] - b[0]);
  sheet.getRange("A1:E1").setValues([["학번", "이름", "대기강좌1", "대기강좌2", "대기강좌3"]]).setFontWeight("bold").setBackground("#e0e0e0").setHorizontalAlignment("center");
  if(result.length > 0) sheet.getRange(2, 1, result.length, 5).setValues(result).setHorizontalAlignment("center");
  ss.setActiveSheet(sheet);
}


/**
 * =========================================================
 * 7. 담임배포명단 생성 함수 
 * =========================================================
 */
function createTeacherList(){
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const mainSheet = ss.getSheetByName("출석부생성");
  const dataSheet = getActiveDataSheet(ss, mainSheet, true);
  if (!dataSheet) return;

  const lastRow = dataSheet.getLastRow();
  if (lastRow < 2) return;

  const infoMap = getCourseInfoMap(ss);
  const headers = dataSheet.getRange(1, 1, 1, dataSheet.getLastColumn()).getValues()[0];
  const data = dataSheet.getRange(2, 1, lastRow - 1, dataSheet.getLastColumn()).getValues();
  const studentData = data.filter(isValidStudentSourceRow);

  let termPrefix = String(mainSheet.getRange("B3").getValue()).trim();
  if (!termPrefix.includes("기")) termPrefix += "기";
  const newSheetName = termPrefix + "_담임배포명단";

  const old = ss.getSheetByName(newSheetName);
  if(old) ss.deleteSheet(old);
  const sheet = ss.insertSheet(newSheetName);
  
  sheet.getRange("A1:E1").setValues([["학번","이름","신청강좌1","신청강좌2","신청강좌3"]])
       .setFontWeight("bold").setBackground("#e0e0e0").setHorizontalAlignment("center");

  let acceptedMap = {};
  let waitingMap = {};
  let globalDupMap = {}; 

  studentData.forEach(row => {
    const studentId = row[1];
    globalDupMap[studentId] = getStudentDuplicates(row, headers, infoMap).dupMap;
  });

  headers.forEach((h, idx) => {
    if(h && h.includes("_")){
      const courseCode = h.split("_")[0];
      const courseName = h.split("_")[1].split("/")[1];

      let students = [];
      studentData.forEach(row => {
        if(row[idx] == 1) students.push({ id: row[1], time: row[5] ? row[5] : row[4] });
      });

      students.sort(sortStudents);
      const cap = infoMap[courseCode] ? infoMap[courseCode].capacity : 12;
      
      students.slice(0, cap).forEach(s => {
        if(!acceptedMap[s.id]) acceptedMap[s.id] = [];
        acceptedMap[s.id].push(courseName);
      });
      students.slice(cap, cap + 4).forEach(s => {
        if(!waitingMap[s.id]) waitingMap[s.id] = [];
        waitingMap[s.id].push(courseName);
      });
    }
  });

  let resultValues = [];
  let bgColors = [];

  studentData.forEach(row => {
    let courses = [];
    let isWaitList = [];
    let isDupList = []; 
    
    const studentId = row[1];
    const studentName = row[2];
    const myDupMap = globalDupMap[studentId] || {};
    
    headers.forEach((h, idx) => {
      if(h && h.includes("_") && row[idx] == 1){
        let cName = h.split("_")[1].split("/")[1];
        let isAcc = (acceptedMap[studentId] && acceptedMap[studentId].includes(cName));
        let isWait = (waitingMap[studentId] && waitingMap[studentId].includes(cName));

        if(isAcc || isWait) {
          let reason = myDupMap[cName] || "";
          let displayCourse = cName;
          
          if (isWait) displayCourse += "(대기)";
          if (reason) displayCourse += reason; 

          courses.push(displayCourse);
          isWaitList.push(isWait);
          isDupList.push(reason !== ""); 
        }
      }
    });

    if (courses.length > 0) {
      resultValues.push([studentId, studentName, courses[0]||"", courses[1]||"", courses[2]||""]);

      let rowBgs = [null, null, null, null, null];
      let hasAnyDup = isDupList.includes(true);
      let hasAnyWait = isWaitList.includes(true);

      if (hasAnyDup) {
        rowBgs[0] = rowBgs[1] = "#ff0000";
      } else if (hasAnyWait) {
        rowBgs[0] = rowBgs[1] = "#fff59d";
      }

      for(let j = 0; j < 3; j++) {
        if (isDupList[j]) {
          rowBgs[j+2] = "#ff0000"; 
        } else if (isWaitList[j]) {
          rowBgs[j+2] = "#fff59d"; 
        } else {
          rowBgs[j+2] = null; 
        }
      }
      bgColors.push(rowBgs);
    }
  });

  if(resultValues.length > 0){
    const combined = resultValues.map((val, i) => ({val, bg: bgColors[i]}));
    combined.sort((a,b) => a.val[0] - b.val[0]);
    
    const sortedValues = combined.map(c => c.val);
    const sortedBgs = combined.map(c => c.bg);

    const range = sheet.getRange(2, 1, sortedValues.length, 5);
    range.setValues(sortedValues);
    range.setBackgrounds(sortedBgs); 
    
    const fontColors = sortedBgs.map(row => row.map(bg => bg === "#ff0000" ? "#ffffff" : "#000000"));
    range.setFontColors(fontColors);
    
    range.setHorizontalAlignment("center").setBorder(true, true, true, true, true, true);
    sheet.autoResizeColumns(1, 5);
  }
  ss.setActiveSheet(sheet);
}


/**
 * =========================================================
 * 8. 선택한 기수의 출석부만 통합 PDF 출력 
 * =========================================================
 */
function exportAttendancePDF() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const ui = SpreadsheetApp.getUi();
  const mainSheet = ss.getSheetByName("출석부생성");
  
  let termValue = mainSheet ? mainSheet.getRange("B3").getValue() : "";
  if (!termValue) {
    ui.alert("B3 셀에 기수(예: 1기)가 입력되어 있지 않습니다.");
    return;
  }
  
  let term = String(termValue).trim();
  if (!term.includes("기")) term += "기";

  // 1. 제외할 정확한 시트명과 키워드 설정
  const excludeKeywords = ["원본", "명단"]; 
  const excludeExactNames = ["출석부생성", "강좌기본정보", "출석부템플릿", "교사직인"]; 
  
  // 2. 정규식 패턴: 선택한 기수(예: "3기") 바로 뒤에 숫자(\d)가 최소 1개 이상 이어지는 형태
  const regex = new RegExp('^' + term + '\\d+'); 
  const allSheets = ss.getSheets();
  
  // 3. 세 가지 조건을 모두 확인하여 교집합만 걸러내기
  const targetSheets = allSheets.filter(sheet => {
    const name = sheet.getName();
    
    // 조건 A: 정확히 일치하는 제외 대상인가?
    const isExcludedByName = excludeExactNames.includes(name);
    // 조건 B: 제외 키워드가 포함되어 있는가?
    const isExcludedByKeyword = excludeKeywords.some(keyword => name.includes(keyword));
    // 조건 C: '기수+숫자' 패턴으로 시작하는가?
    const isTargetTerm = regex.test(name);

    // 결과: 제외 대상이 아니면서(!), 패턴에 일치하는 시트만 통과 (true 반환)
    return !isExcludedByName && !isExcludedByKeyword && isTargetTerm;
  });

  if (targetSheets.length === 0) {
    ui.alert(`PDF로 변환할 [${term}] 출석부 시트를 찾을 수 없습니다.\n시트 이름이 '${term}' + 숫자 패턴(예: 3기01)으로 시작하는지 확인해주세요.`);
    return;
  }

  ss.toast(`[${term}] 출석부들을 모아 임시 파일을 생성하고 있습니다...`, "작업 진행 중 ⏳", 5);

  const tempSsName = "임시_출석부_통합_" + new Date().getTime();
  const tempSs = SpreadsheetApp.create(tempSsName);
  const tempSsId = tempSs.getId();

  targetSheets.forEach(sheet => {
    const copiedSheet = sheet.copyTo(tempSs);
    copiedSheet.setName(sheet.getName()); 
    
    if (copiedSheet.isSheetHidden()) {
      copiedSheet.showSheet(); 
    }
  });

  const defaultSheet = tempSs.getSheets()[0];
  tempSs.deleteSheet(defaultSheet);

  SpreadsheetApp.flush();

  ss.toast("PDF로 변환하여 구글 드라이브에 저장 중입니다...", "거의 다 되었습니다! 🚀", 10);

  const pdfName = term + "_전체출석부_완료본.pdf";
  const url = "https://docs.google.com/spreadsheets/d/" + tempSsId + "/export"
            + "?format=pdf"
            + "&size=A4"
            + "&portrait=true"
            + "&fitw=true"
            + "&sheetnames=false"
            + "&printtitle=false"
            + "&pagenumbers=false"
            + "&gridlines=false";

  try {
    const token = ScriptApp.getOAuthToken();
    const response = UrlFetchApp.fetch(url, {
      headers: { 'Authorization': 'Bearer ' + token }
    });

    const blob = response.getBlob().setName(pdfName);
    DriveApp.createFile(blob);
    DriveApp.getFileById(tempSsId).setTrashed(true);

    ui.alert(`✅ 통합 PDF 생성 완료!\n\n파일명: ${pdfName}\n\n구글 드라이브 최상단에 저장되었으며, 생성에 사용된 임시 시트는 안전하게 삭제되었습니다.`);
    
  } catch (e) {
    DriveApp.getFileById(tempSsId).setTrashed(true);
    ui.alert("PDF 생성 중 오류가 발생했습니다.\n" + e.message);
  }
}


/**
 * =========================================================
 * [신규 기능] 9. 최종 이수자 명단 생성 (모든 기수 통합)
 * =========================================================
 */
function createFinalCompletionList() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const ui = SpreadsheetApp.getUi();
  
  // 1. 특정 기수(B3)에 얽매이지 않고 모든 출석부 시트 찾기
  // 정규식 패턴: 시작이 '숫자+기+숫자' 인 모든 시트를 대상으로 함 (예: 1기01, 2기11, 3기05 등 전부 포함)
  const regex = /^\d+기\d+/;
  const allSheets = ss.getSheets();
  
  const targetSheets = allSheets.filter(sheet => regex.test(sheet.getName()));

  if (targetSheets.length === 0) {
    ui.alert(`출석부 시트를 찾을 수 없습니다. (숫자+기+숫자 형태의 시트명 필요)`);
    return;
  }

  // 2. 이수자 데이터 수집
  let completedStudents = [];

  targetSheets.forEach(sheet => {
    const term = getAttendanceTermFromSheetName(sheet.getName());
    const courseName = sheet.getRange("B3").getValue();
    const teacher = sheet.getRange("B5").getValue();
    const date1 = sheet.getRange("D7").getValue();
    const date2 = sheet.getRange("E7").getValue();
    const isTwoDays = (date2 !== ""); // 2일차 날짜가 있으면 2일짜리 수업
    
    const lastRow = sheet.getLastRow();
    if(lastRow < 8) return; // 학생 데이터가 없으면 패스

    // A열(순번)부터 E열(2일차 출석)까지 가져오기
    const data = sheet.getRange(8, 1, lastRow - 7, 5).getValues();
    
    data.forEach(row => {
      const studentId = row[1];
      let studentName = row[2];
      
      if (!studentId || String(studentId).trim() === "") return;

      // 이름 옆에 붙은 (대기), (중복) 텍스트 깔끔하게 제거
      studentName = String(studentName).replace(/\(대기\)|\(중복\)/g, "").trim();

      const check1 = row[3] === true; // D열 1일차 출석
      const check2 = row[4] === true; // E열 2일차 출석

      let isCompleted = false;
      if (isTwoDays) {
        if (check1 && check2) isCompleted = true; // 2일 수업은 둘 다 체크되어야 이수
      } else {
        if (check1) isCompleted = true;           // 1일 수업은 하나만 체크되어도 이수
      }

      if (isCompleted) {
        completedStudents.push([studentId, studentName, term, courseName, teacher]);
      }
    });
  });

  // 학번을 기준으로 오름차순 정렬
  completedStudents.sort((a, b) => a[0] - b[0]);

  // 3. "최종이수자명단" 시트 생성 및 초기화
  const sheetName = "최종이수자명단";
  let finalSheet = ss.getSheetByName(sheetName);
  if (finalSheet) {
    finalSheet.clear(); // 이미 시트가 있으면 내용만 싹 지우기
  } else {
    finalSheet = ss.insertSheet(sheetName);
  }

  // 4. 헤더 작성 및 서식 지정
  const headers = [["순번", "학번", "이름", "기수", "강좌명", "담당교사", "세특내용", "세특 바이트수"]];
  finalSheet.getRange("A1:H1").setValues(headers)
            .setFontWeight("bold")
            .setBackground("#e0e0e0")
            .setHorizontalAlignment("center");

  // 5. 데이터 채우기 및 H열에 바이트 수 계산 수식(자동) 넣기
  if (completedStudents.length > 0) {
    let outputData = [];
    let formulaData = [];

    completedStudents.forEach((student, index) => {
      outputData.push([
        index + 1,
        student[0], // 학번
        student[1], // 이름
        student[2], // 기수
        student[3], // 강좌명
        student[4], // 담당교사
        ""          // 세특내용
      ]);

      // H열 바이트 수 계산 / G열이 세특내용
      formulaData.push([`=IF(G${index + 2}="","",GET_NEIS_BYTE(G${index + 2}))`]);
    });

    // A~G열 데이터 쓰기
    finalSheet.getRange(2, 1, outputData.length, 7).setValues(outputData);
    
    // H열 수식 쓰기
    finalSheet.getRange(2, 8, formulaData.length, 1).setFormulas(formulaData);

    // 서식
    finalSheet.getRange(2, 1, outputData.length, 6).setHorizontalAlignment("center");
    finalSheet.getRange(2, 8, outputData.length, 1).setHorizontalAlignment("center");
    finalSheet.getRange(1, 1, outputData.length + 1, 8)
              .setBorder(true, true, true, true, true, true);
    
    // 열 너비
    finalSheet.autoResizeColumns(1, 6);
    finalSheet.setColumnWidth(7, 400); // 세특내용
    finalSheet.setColumnWidth(8, 100); // 세특 바이트수
  }

  ss.setActiveSheet(finalSheet);
  ui.alert(`🎉 최종 이수자 명단 생성 완료!\n총 ${completedStudents.length}건의 이수 내역이 취합되었습니다.`);
}


/**
 * =========================================================
 * 10. 최종 이수자 명단 기수별 생성 (기존 전체 통합 기능과 별도)
 * =========================================================
 * - 실제 출석부 시트명에서 기수 추출: 1기01..., 2기02...
 * - 생성 시트명: 1기_최종이수자명단, 2기_최종이수자명단, ...
 * - 기존 생성 시트는 덮어쓰지 않아 수기로 기록한 세특내용을 보호
 * - 1일 강좌: D 체크, 2일 강좌: D/E 모두 체크인 학생만 수집
 */
function createFinalCompletionListsByTerm() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const ui = SpreadsheetApp.getUi();
  const attendanceRegex = /^\d+기\d+/;
  const attendanceSheets = ss.getSheets().filter(sheet => attendanceRegex.test(sheet.getName()));

  if (attendanceSheets.length === 0) {
    ui.alert('기수별 최종 이수자 명단을 만들 출석부가 없습니다.');
    return;
  }

  // 출석부만 대상으로 기수별 이수 내역을 분류합니다.
  const studentsByTerm = new Map();
  attendanceSheets.forEach(sheet => {
    const term = getAttendanceTermFromSheetName(sheet.getName());
    if (!term) return;
    if (!studentsByTerm.has(term)) studentsByTerm.set(term, []);

    const courseName = sheet.getRange('B3').getValue();
    const teacher = sheet.getRange('B5').getValue();
    const date2 = sheet.getRange('E7').getValue();
    const isTwoDays = (date2 !== '');
    const lastRow = sheet.getLastRow();
    if (lastRow < 8) return;

    const data = sheet.getRange(8, 1, lastRow - 7, 5).getValues();
    data.forEach(row => {
      const studentId = row[1];
      if (!studentId || String(studentId).trim() === '') return;

      const check1 = row[3] === true;
      const check2 = row[4] === true;
      const isCompleted = isTwoDays ? (check1 && check2) : check1;
      if (!isCompleted) return;

      const studentName = String(row[2]).replace(/\(대기\)|\(중복\)/g, '').trim();
      studentsByTerm.get(term).push([studentId, studentName, term, courseName, teacher]);
    });
  });

  const terms = Array.from(studentsByTerm.keys()).sort((a, b) => parseInt(a, 10) - parseInt(b, 10));
  const created = [];
  const skipped = [];
  const empty = [];
  let lastCreatedSheet = null;

  terms.forEach(term => {
    const completedStudents = studentsByTerm.get(term);
    if (completedStudents.length === 0) {
      empty.push(term);
      return;
    }

    const newSheetName = `${term}_최종이수자명단`;

    // 기존 세특내용이 사라지는 것을 막기 위해 이미 있는 기수별 시트는 수정하지 않습니다.
    if (ss.getSheetByName(newSheetName)) {
      skipped.push(term);
      return;
    }

    completedStudents.sort((a, b) => a[0] - b[0]);
    const resultSheet = ss.insertSheet(newSheetName);
    const headers = [['순번', '학번', '이름', '기수', '강좌명', '담당교사', '세특내용', '세특 바이트수']];

    resultSheet.getRange('A1:H1').setValues(headers)
      .setFontWeight('bold')
      .setBackground('#e0e0e0')
      .setHorizontalAlignment('center');

    const outputData = completedStudents.map((student, i) => [i + 1, ...student, '']);
    const formulaData = completedStudents.map((_, i) => [
      `=IF(G${i + 2}="","",GET_NEIS_BYTE(G${i + 2}))`
    ]);

    resultSheet.getRange(2, 1, outputData.length, 7).setValues(outputData);
    resultSheet.getRange(2, 8, formulaData.length, 1).setFormulas(formulaData);
    resultSheet.getRange(2, 1, outputData.length, 6).setHorizontalAlignment('center');
    resultSheet.getRange(2, 8, outputData.length, 1).setHorizontalAlignment('center');
    resultSheet.getRange(1, 1, outputData.length + 1, 8)
      .setBorder(true, true, true, true, true, true);

    resultSheet.autoResizeColumns(1, 6);
    resultSheet.setColumnWidth(7, 400);
    resultSheet.setColumnWidth(8, 100);

    created.push(`${term}(${completedStudents.length}건)`);
    lastCreatedSheet = resultSheet;
  });

  if (lastCreatedSheet) ss.setActiveSheet(lastCreatedSheet);

  const message = [
    '기수별 최종 이수자 명단 생성 완료!',
    `- 신규 생성: ${created.length}개 기수${created.length ? ' / ' + created.join(', ') : ''}`,
    `- 기존 시트 유지(덮어쓰기 방지): ${skipped.length}개 기수${skipped.length ? ' / ' + skipped.join(', ') : ''}`,
    `- 이수자 0명(미생성): ${empty.length}개 기수${empty.length ? ' / ' + empty.join(', ') : ''}`
  ];

  ui.alert(message.join('\n'));
}


/**
 * =========================================================
 * [커스텀 함수] 나이스(NEIS) 기준 바이트 수 계산 함수
 * 구글 시트 셀에서 =GET_NEIS_BYTE("텍스트") 형태로 직접 사용됩니다.
 * 영문/숫자/기호/띄어쓰기: 1바이트, 한글/한자/특수기호: 3바이트
 * =========================================================
 * @customfunction
 */
function GET_NEIS_BYTE(text) {
  if (!text) return 0;
  let byteCount = 0;
  for (let i = 0; i < text.length; i++) {
    const charCode = text.charCodeAt(i);
    // ASCII 영역(영어, 숫자, 일반 기호, 공백)은 1바이트 처리, 그 외(한글 등)는 3바이트 처리
    if (charCode <= 0x007F) {
      byteCount += 1;
    } else {
      byteCount += 3;
    }
  }
  return byteCount;
}
