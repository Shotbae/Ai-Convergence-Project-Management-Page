
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
    .addItem('📁 최종 이수자 명단 생성 (방식·기수 선택)', 'openCompletionModal')
    .addItem('✅ 최종 이수자 명단 생성 (전체 통합)', 'createFinalCompletionList')
    .addItem('📁 기수별 최종 이수자 명단 생성', 'createFinalCompletionListsByTerm')
    .addSeparator()
    .addItem('🔎 세특 전체 재검증 (이어서 처리)', 'revalidateAllSetc')
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
  const result = generateCompletionLists_("integrated", "");
  SpreadsheetApp.getUi().alert(result.message);
  return result;
}

// 기존 함수명 유지: 인수가 없으면 전체 기수별, 기수가 있으면 해당 기수만 생성합니다.
function createFinalCompletionListsByTerm(term) {
  const result = generateCompletionLists_(term ? "selected" : "byTerm", term);
  SpreadsheetApp.getUi().alert(result.message);
  return result;
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

/** 이수자 명단 생성: 기존 출석부/신청자 관리와 독립된 설정 화면 */
function openCompletionModal() {
  const html = HtmlService.createHtmlOutput(`<!DOCTYPE html><html><head><base target="_top">
    <style>body{font-family:'Malgun Gothic',sans-serif;padding:20px;color:#333}label{display:block;margin:16px 0 6px}
    select,button{width:100%;padding:10px;box-sizing:border-box}button{margin-top:20px;cursor:pointer}
    #status{white-space:pre-wrap;margin-top:16px;font-size:13px}</style></head><body>
    <label for="mode">생성 방식</label><select id="mode" onchange="toggleTerm()">
    <option value="selected">선택 기수 명단 생성</option><option value="byTerm">전체 기수별 명단 생성</option>
    <option value="integrated">전체 통합 명단 생성</option></select>
    <label for="term">기수</label><select id="term"><option value="">불러오는 중...</option></select>
    <p style="font-size:12px">기존 명단은 유지됩니다. 전체 통합은 모든 기수의 이수 내역을 한 시트에 모읍니다.</p>
    <button id="run" onclick="run()" disabled>명단 생성</button><div id="status" role="status" aria-live="polite"></div>
    <script>
    const mode=document.getElementById('mode'),term=document.getElementById('term'),button=document.getElementById('run'),status=document.getElementById('status');
    function toggleTerm(){term.disabled=mode.value!=='selected';}
    google.script.run.withSuccessHandler(function(terms){
      term.textContent='';term.add(new Option('-- 기수 선택 --',''));
      terms.forEach(function(t){term.add(new Option(t,t));});button.disabled=false;
      if(!terms.length)status.textContent='생성할 출석부가 없습니다.';
    }).withFailureHandler(function(e){status.textContent=e.message;}).getCompletionTermList();
    function run(){
      if(mode.value==='selected'&&!term.value){status.textContent='기수를 선택해주세요.';return;}
      mode.disabled=true;term.disabled=true;button.disabled=true;status.textContent='명단을 생성하고 있습니다...';
      function unlock(){mode.disabled=false;toggleTerm();button.disabled=false;}
      google.script.run.withSuccessHandler(function(result){status.textContent=result.message;unlock();})
        .withFailureHandler(function(e){status.textContent='생성 실패: '+e.message;unlock();})
        .executeCompletionTask(mode.value,term.value);
    }
    </script></body></html>`).setWidth(430).setHeight(470);
  SpreadsheetApp.getUi().showModalDialog(html, '최종 이수자 명단 생성');
}

function getCompletionTermList() {
  return [...new Set(SpreadsheetApp.getActiveSpreadsheet().getSheets()
    .map(s => getAttendanceTermFromSheetName(s.getName())).filter(Boolean))]
    .sort((a, b) => parseInt(a, 10) - parseInt(b, 10));
}

function executeCompletionTask(mode, term) {
  return generateCompletionLists_(mode, term);
}

function generateCompletionLists_(mode, term) {
  if (!['selected', 'byTerm', 'integrated'].includes(mode)) throw new Error('올바른 생성 방식을 선택해주세요.');
  const termText = String(term || '').trim();
  if (mode === 'selected' && !/^[0-9]+기$/.test(termText)) throw new Error('생성할 기수를 선택해주세요.');
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const lock = LockService.getDocumentLock();
  if (!lock || !lock.tryLock(10000)) throw new Error('다른 작업이 진행 중입니다. 잠시 후 다시 실행해주세요.');
  try {
    const sheets = ss.getSheets().filter(s => {
      const t = getAttendanceTermFromSheetName(s.getName());
      return t && (mode !== 'selected' || t === termText);
    });
    if (!sheets.length) return {created: [], skipped: [], empty: [], message: '생성할 출석부가 없습니다.'};
    // 기존 통합 명단도 수기로 작성한 G열을 보호하기 위해 그대로 유지합니다.
    if (mode === 'integrated' && ss.getSheetByName('최종이수자명단')) {
      return {created: [], skipped: ['최종이수자명단'], empty: [], message: '기존 최종이수자명단을 유지했습니다. 세특 전체 재검증 메뉴로 검증할 수 있습니다.'};
    }
    const groups = new Map();
    sheets.forEach(sheet => {
      const key = mode === 'integrated' ? '최종이수자명단' : getAttendanceTermFromSheetName(sheet.getName()) + '_최종이수자명단';
      if (!groups.has(key)) groups.set(key, []);
      if (ss.getSheetByName(key)) return;
      const course = sheet.getRange('B3').getValue();
      const teacher = sheet.getRange('B5').getValue();
      const twoDays = sheet.getRange('E7').getValue() !== '';
      const last = sheet.getLastRow();
      if (last < 8) return;
      sheet.getRange(8, 1, last - 7, 5).getValues().forEach(row => {
        if (!row[1] || String(row[1]).trim() === '') return;
        if (!(row[3] === true && (!twoDays || row[4] === true))) return;
        groups.get(key).push([row[1], getCleanAttendanceStudentName(row[2]),
          getAttendanceTermFromSheetName(sheet.getName()), course, teacher]);
      });
    });
    const result = {created: [], skipped: [], empty: []};
    let lastCreated = null;
    [...groups.keys()].sort((a, b) => parseInt(a, 10) - parseInt(b, 10)).forEach(name => {
      if (ss.getSheetByName(name)) { result.skipped.push(name); return; }
      const students = groups.get(name);
      if (!students.length) { result.empty.push(name); return; }
      students.sort((a, b) => a[0] - b[0]);
      const sheet = ss.insertSheet(name);
      writeCompletionList_(sheet, students);
      lastCreated = sheet;
      result.created.push(name + '(' + students.length + '건)');
    });
    if (lastCreated) ss.setActiveSheet(lastCreated);
    result.message = ['이수자 명단 생성 완료!',
      '신규 생성: ' + (result.created.join(', ') || '없음'),
      '기존 명단 유지: ' + (result.skipped.join(', ') || '없음'),
      '이수자 0명: ' + (result.empty.join(', ') || '없음')].join('\n');
    return result;
  } finally { lock.releaseLock(); }
}

function writeCompletionList_(sheet, students) {
  if (sheet.getMaxColumns() < 9) sheet.insertColumnsAfter(sheet.getMaxColumns(), 9 - sheet.getMaxColumns());
  if (sheet.getMaxRows() < students.length + 1) sheet.insertRowsAfter(sheet.getMaxRows(), students.length + 1 - sheet.getMaxRows());
  sheet.getRange('A1:I1').setValues([['순번', '학번', '이름', '기수', '강좌명', '담당교사', '세특내용', '세특 바이트수', '오류 사유']])
    .setFontWeight('bold').setBackground('#e0e0e0').setHorizontalAlignment('center');
  sheet.getRange(2, 1, students.length, 7).setValues(students.map((s, i) => [i + 1, ...s, '']));
  sheet.getRange(2, 8, students.length, 1).setFormulas(students.map((_, i) => [`=IF(G${i + 2}="","",GET_NEIS_BYTE(G${i + 2}))`]));
  sheet.getRange(2, 1, students.length, 6).setHorizontalAlignment('center');
  sheet.getRange(2, 8, students.length, 1).setHorizontalAlignment('center');
  sheet.getRange(1, 1, students.length + 1, 9).setBorder(true, true, true, true, true, true);
  sheet.autoResizeColumns(1, 6);
  sheet.setColumnWidth(7, 400);
  sheet.setColumnWidth(8, 100);
  ensureSetcColumn_(sheet);
}

var SETC_COLUMN_MARKER_ = '세특 자동 검증 결과입니다. 빨간 표현과 오류 사유를 확인하고 교사가 판단해주세요.';
var SETC_CURSOR_KEY_ = 'SETC_REVALIDATE_CURSOR_V1';

function isCompletionSheet_(sheet) {
  return sheet.getName() === '최종이수자명단' || /^[0-9]+기_최종이수자명단$/.test(sheet.getName());
}

function ensureSetcColumn_(sheet) {
  if (sheet.getMaxColumns() < 9) sheet.insertColumnsAfter(sheet.getMaxColumns(), 9 - sheet.getMaxColumns());
  const header = sheet.getRange('I1');
  const title = header.getValue();
  if (header.getFormula()) throw new Error('I열에 기존 수식이 있어 오류 사유 열을 만들 수 없습니다.');
  if (title === '오류 사유' && header.getNote() === SETC_COLUMN_MARKER_) return;
  const last = Math.max(1, sheet.getLastRow());
  const values = sheet.getRange(1, 9, last, 1).getValues();
  const formulas = sheet.getRange(1, 9, last, 1).getFormulas();
  if ((title !== '' && title !== '오류 사유') || formulas.some(r => r[0]) || values.slice(1).some(r => r[0] !== '')) {
    throw new Error('[' + sheet.getName() + '] I열에 기존 자료가 있습니다. 자료를 옮긴 뒤 재검증해주세요.');
  }
  header.setValue('오류 사유').setNote(SETC_COLUMN_MARKER_).setFontWeight('bold').setBackground('#e0e0e0');
  sheet.setColumnWidth(9, 450);
  sheet.getRange(1, 9, sheet.getMaxRows(), 1).setWrap(true);
}

// 사용자 편집 후 실행됩니다. 스크립트의 RichText 쓰기는 onEdit를 다시 호출하지 않습니다.
function onEdit(e) {
  if (!e || !e.range) return;
  const range = e.range, sheet = range.getSheet();
  if (!isCompletionSheet_(sheet) || range.getColumn() > 7 || range.getLastColumn() < 7 || range.getLastRow() < 2) return;
  const ss = e.source || SpreadsheetApp.getActiveSpreadsheet();
  const lock = LockService.getDocumentLock();
  if (!lock || !lock.tryLock(1000)) { ss.toast('다른 작업 중입니다. 세특 전체 재검증을 실행해주세요.', '세특 검증', 6); return; }
  try {
    ensureSetcColumn_(sheet);
    const start = Math.max(2, range.getRow());
    const end = Math.min(range.getLastRow(), Math.max(start, sheet.getLastRow()));
    sheet.getRange(start, 9, end - start + 1, 1).setValue('재검증 필요');
    const deadline = Date.now() + 20000;
    let row = start;
    for (; row <= end && row < start + 200 && Date.now() < deadline; row++) validateSetcRow_(sheet, row);
    if (row <= end) ss.toast('남은 행은 세특 전체 재검증 메뉴로 확인해주세요.', '세특 검증', 8);
  } catch (error) {
    ss.toast('세특 검증 실패: ' + error.message, '세특 검증', 10);
  } finally { lock.releaseLock(); }
}

function validateSetcRow_(sheet, row) {
  const cell = sheet.getRange(row, 7), output = sheet.getRange(row, 9);
  if (cell.getFormula()) { output.setValue('수식 셀은 자동 검증 대상이 아닙니다.'); return; }
  const value = cell.getValue();
  if (value === '') { cell.setFontColor('#000000'); output.clearContent(); return; }
  if (typeof value !== 'string') { output.setValue('세특 내용을 문자열로 입력해주세요.'); return; }
  const issues = checkSetcLocalRules(value);
  const black = SpreadsheetApp.newTextStyle().setForegroundColor('#000000').build();
  const red = SpreadsheetApp.newTextStyle().setForegroundColor('#ff0000').build();
  const existing = cell.getRichTextValue();
  const builder = existing ? existing.copy() : SpreadsheetApp.newRichTextValue().setText(value);
  builder.setTextStyle(black);
  issues.forEach(issue => issue.spans.forEach(span => builder.setTextStyle(span.start, span.end, red)));
  // 잠금은 다른 스크립트 작업끼리 적용되므로 사용자 입력은 쓰기 직전에 다시 확인합니다.
  if (cell.getValue() !== value || cell.getFormula()) { output.setValue('재검증 필요'); return; }
  cell.setRichTextValue(builder.build());
  if (cell.getValue() !== value || cell.getFormula()) { output.setValue('재검증 필요'); return; }
  // '='로 시작하는 검출 표현도 수식이 아닌 텍스트로 기록합니다.
  const explanation = formatSetcIssues_(issues);
  if (explanation) output.setRichTextValue(SpreadsheetApp.newRichTextValue().setText(explanation).build());
  else output.clearContent();
}

function formatSetcIssues_(issues) {
  const groups = new Map();
  issues.forEach(issue => {
    if (!groups.has(issue.reason)) groups.set(issue.reason, new Set());
    issue.spans.forEach(span => groups.get(issue.reason).add(span.label || ''));
  });
  const lines = [...groups].map(entry => {
    const labels = [...entry[1]];
    const display = labels.slice(0, 40).map(s => Array.from(s).slice(0, 100).join('') + (Array.from(s).length > 100 ? '…' : '')).join(' / ');
    return display + (labels.length > 40 ? ' 외 ' + (labels.length - 40) + '개 표현' : '') + ': ' + entry[0];
  }).join('\n');
  return lines.length > 45000 ? lines.slice(0, 45000) + '\n사유가 많아 일부 설명을 생략했습니다. G열의 빨간 표현을 확인해주세요.' : lines;
}

/** 한 번에 최대 200행. 큰 명단은 같은 메뉴를 다시 누르면 저장한 다음 행부터 계속합니다. */
function revalidateAllSetc() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const lock = LockService.getDocumentLock();
  if (!lock || !lock.tryLock(10000)) { SpreadsheetApp.getUi().alert('다른 작업이 진행 중입니다. 잠시 후 다시 실행해주세요.'); return; }
  let message;
  try {
    const props = PropertiesService.getDocumentProperties();
    const sheets = ss.getSheets().filter(isCompletionSheet_).sort((a, b) => a.getSheetId() - b.getSheetId());
    let cursor = null;
    try { cursor = JSON.parse(props.getProperty(SETC_CURSOR_KEY_) || 'null'); } catch (_) { /* 잘못된 이전 커서는 새로 시작 */ }
    let index = cursor ? sheets.findIndex(s => s.getSheetId() === cursor.sheetId) : 0;
    if (index < 0) { index = 0; cursor = null; }
    let count = 0, pending = false;
    const failed = [], deadline = Date.now() + 240000;
    for (; index < sheets.length; index++) {
      const sheet = sheets[index];
      let row = cursor && cursor.sheetId === sheet.getSheetId() ? Math.max(2, cursor.row) : 2;
      const last = sheet.getLastRow();
      try {
        ensureSetcColumn_(sheet);
        if (row <= last) sheet.getRange(row, 9, last - row + 1, 1).setValue('재검증 필요');
        for (; row <= last; row++) {
          if (count >= 200 || Date.now() >= deadline) {
            props.setProperty(SETC_CURSOR_KEY_, JSON.stringify({sheetId: sheet.getSheetId(), row: row}));
            pending = true;
            break;
          }
          validateSetcRow_(sheet, row);
          count++;
        }
      } catch (error) { failed.push(sheet.getName() + ': ' + error.message); }
      if (pending) break;
    }
    if (!pending) props.deleteProperty(SETC_CURSOR_KEY_);
    message = '세특 재검증: ' + count + '행 처리\n' + (pending ? '남은 행이 있습니다. 같은 메뉴를 다시 눌러 이어서 처리해주세요.' : '현재 검사 범위 처리가 끝났습니다.');
    if (!sheets.length) message = '검사할 이수자 명단이 없습니다.';
    if (failed.length) message += '\n처리 실패(자료 유지):\n' + failed.join('\n');
  } finally { lock.releaseLock(); }
  SpreadsheetApp.getUi().alert(message);
}

/**
 * 생기부 검증기 LOCAL-RULES-v2.2.6의 단일 본문 검사 이식본.
 * 원본 사유/검토수준을 보존하고, 시트용 UTF-16 검출 위치와 표시 문구를 추가합니다.
 * 아래 데이터는 tools/build_rule_data.py로 원본 Python 사본에서 생성합니다.
 */
function setcInRanges_(cp, ranges) {
  let lo = 0, hi = ranges.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1, pair = ranges[mid];
    if (cp < pair[0]) hi = mid - 1;
    else if (cp > pair[1]) lo = mid + 1;
    else return true;
  }
  return false;
}

function setcStrip_(text, rightOnly) {
  const chars = Array.from(text);
  let start = 0, end = chars.length;
  if (!rightOnly) while (start < end && setcInRanges_(chars[start].codePointAt(0), SETC_RULE_DATA_.spaces)) start++;
  while (end > start && setcInRanges_(chars[end - 1].codePointAt(0), SETC_RULE_DATA_.spaces)) end--;
  return chars.slice(start, end).join('');
}

function setcRegex_(pattern) {
  // Python \s and JS \s differ for BOM and a few control characters.
  const whitespace = '\\u0009-\\u000d\\u001c-\\u0020\\u0085\\u00a0\\u1680\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000';
  let source = '', inClass = false;
  for (let i = 0; i < pattern.source.length; i++) {
    const ch = pattern.source[i];
    if (ch === '\\' && i + 1 < pattern.source.length) {
      const next = pattern.source[++i];
      source += next === 's' ? (inClass ? whitespace : '[' + whitespace + ']') :
        (next === '"' || next === "'" ? next : '\\' + next);
    } else {
      if (ch === '[') inClass = true;
      if (ch === ']') inClass = false;
      source += ch;
    }
  }
  return new RegExp(source, (pattern.flags || '') + 'gu');
}

function setcMatches_(pattern, text) {
  if (!pattern) return [];
  // Python IGNORECASE includes dotted/dotless I in ASCII I/i matching.
  const input = (pattern.flags || '').includes('i') ? text.replace(/[İı]/g, 'i') : text;
  return [...input.matchAll(setcRegex_(pattern))];
}

function setcCovered_(start, end, spans) {
  return spans.some(s => s.start <= start && end <= s.end);
}

function setcNearestCodePoint_(text, index, step) {
  let pos = step > 0 ? index + 1 : index;
  while (step > 0 ? pos < text.length : pos > 0) {
    let cp;
    if (step > 0) { cp = text.codePointAt(pos); pos += cp > 0xffff ? 2 : 1; }
    else {
      const lastUnit = text.charCodeAt(pos - 1);
      pos -= lastUnit >= 0xdc00 && lastUnit <= 0xdfff ? 2 : 1;
      cp = text.codePointAt(pos);
    }
    if (!setcInRanges_(cp, SETC_RULE_DATA_.spaces)) return cp;
  }
  return null;
}

function setcSpan_(text, start, end, label) {
  return {start: start, end: end, label: label === undefined ? text.slice(start, end) : label};
}

function setcQuotedPeriods_(text) {
  const quotes = new Map();
  [["'", "'"], ['"', '"'], ['‘', '’'], ['“', '”']].forEach(pair => {
    const escape = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(escape(pair[0]) + '([^' + escape(pair[0] + pair[1]) + '\\r\\n]*)' + escape(pair[1]), 'gu');
    for (const match of text.matchAll(re)) {
      if (match.index && /[a-zA-Z0-9]/.test(text[match.index - 1])) continue;
      quotes.set(match.index, match);
    }
  });
  const continued = new Map(), periods = new Set();
  [...quotes.keys()].sort((a, b) => b - a).forEach(start => {
    const match = quotes.get(start);
    let tail = start + match[0].length;
    let valid = /^(?:이라고|이라는|이라며|이란|라고|라는|라며|란|으로|에서|에게|처럼|보다|[을를의와과은는이가에로])/u.test(text.slice(tail));
    if (!valid) {
      while (tail < text.length && setcInRanges_(text.codePointAt(tail), SETC_RULE_DATA_.spaces)) tail++;
      if (text[tail] === ',') {
        tail++;
        while (tail < text.length && setcInRanges_(text.codePointAt(tail), SETC_RULE_DATA_.spaces)) tail++;
        valid = continued.get(tail) || false;
      }
    }
    continued.set(start, valid);
    const body = setcStrip_(match[1], true);
    if (valid && body.endsWith('.') && body.split('.').length === 2 && !/[…⋯]/u.test(body)) periods.add(start + 1 + body.length - 1);
  });
  return periods;
}

function checkSetcLocalRules(text) {
  if (typeof text !== 'string' || !text) return [];
  const data = SETC_RULE_DATA_, issues = [], namesCovered = [], moeCovered = [];
  const add = (ruleId, reason, spans, level) => {
    if (spans.length) issues.push({ruleId: ruleId, reason: reason, spans: spans, reviewLevel: level || null});
  };
  // Map lowercased UTF-16 units back to the original text, including case expansions.
  let lower = '', originalOffset = 0, lowerCp = 0;
  const lowerStarts = [], lowerEnds = [], lowerPositions = [], originalPositions = [];
  for (const ch of text) {
    originalPositions.push(originalOffset);
    const folded = ch.toLowerCase();
    for (const unit of folded) {
      for (let i = 0; i < unit.length; i++) { lowerStarts.push(originalOffset); lowerEnds.push(originalOffset + ch.length); lowerPositions.push(lowerCp); }
      lowerCp++;
    }
    lower += folded;
    originalOffset += ch.length;
  }
  originalPositions.push(originalOffset);
  const sourcePosition = cp => cp < originalPositions.length ? originalPositions[cp] : text.length + cp - originalPositions.length + 1;
  const nail = setcMatches_(data.nailLine, text).map(m => {
    const start = m.index + m[0].lastIndexOf(m.groups.term);
    return {start: start, end: start + m.groups.term.length};
  });
  data.names.forEach(entry => {
    const word = entry[0], spans = [];
    const exceptions = (data.nameExceptions[word] || []).flatMap(p => setcMatches_(p, text).map(m => ({start: m.index, end: m.index + m[0].length})));
    let offset = 0, index;
    while ((index = lower.indexOf(word, offset)) !== -1) {
      offset = index + word.length;
      const start = lowerStarts[index], end = lowerEnds[offset - 1];
      // 원본 Python의 소문자화 후 위치 기준도 중복 보고/예외 판정에 보존합니다.
      const sourceStart = sourcePosition(lowerPositions[index]);
      const sourceEnd = sourcePosition(lowerPositions[offset - 1] + 1);
      if (word === '라인' && nail.some(s => s.start === sourceStart && s.end === sourceEnd)) continue;
      if (setcCovered_(sourceStart, sourceEnd, exceptions)) continue;
      if (data.boundaries.includes(word) && (/[a-z가-힣]/u.test(lower[index - 1] || ' ') || /[a-z가-힣]/u.test(lower[offset] || ' '))) continue;
      spans.push(setcSpan_(text, start, end));
      namesCovered.push({start: sourceStart, end: sourceEnd});
    }
    add('LOCAL-NAME', entry[1], spans);
  });
  data.moe.forEach(rule => {
    const exceptions = (data.moeExceptions[rule.topic] || []).flatMap(p => setcMatches_(p, text).map(m => ({start: m.index, end: m.index + m[0].length})));
    const nonException = m => {
      if (rule.topic === 'COMPETITION') {
        const positions = [...m[0].matchAll(/대회/gu)].map(k => m.index + k.index);
        return !positions.length || positions.some(p => !setcCovered_(p, p + 2, exceptions));
      }
      return !setcCovered_(m.index, m.index + m[0].length, exceptions);
    };
    const high = setcMatches_(rule.high_pattern, text).filter(nonException);
    const matches = high.length ? high : setcMatches_(rule.sensitive_pattern, text).filter(nonException);
    if (!matches.length) return;
    // 원본은 첫 일치만 외국어 중복 보고 제외 범위로 사용합니다.
    moeCovered.push({start: matches[0].index, end: matches[0].index + matches[0][0].length});
    add(high.length ? rule.high_rule_id : rule.review_rule_id,
      high.length ? rule.high_reason : rule.review_reason,
      matches.map(m => setcSpan_(text, m.index, m.index + m[0].length)), high.length ? 'LIKELY_VIOLATION' : 'REVIEW');
  });
  const tokens = [...text.matchAll(/[a-zA-Z]+(?:-[a-zA-Z]+)*/g), ...setcMatches_(data.cjk, text)]
    .sort((a, b) => a.index - b.index)
    .filter(m => !data.foreignExceptions.includes(m[0].toLowerCase()) && !setcCovered_(m.index, m.index + m[0].length, namesCovered.concat(moeCovered)));
  const phrases = [];
  for (let i = 0; i < tokens.length;) {
    const start = tokens[i].index;
    let end = start + tokens[i][0].length, next = i + 1;
    while (next < tokens.length) {
      const gap = text.slice(end, tokens[next].index);
      if (setcStrip_(gap) !== '' || Array.from(gap).length > 2) break;
      end = tokens[next].index + tokens[next][0].length;
      next++;
    }
    phrases.push(setcSpan_(text, start, end));
    i = next;
  }
  add('LOCAL-FOREIGN-TEXT', '영어/외국어 표기', phrases);
  add('LOCAL-CONSECUTIVE-SPACES', '연속 공백 사용', [...text.matchAll(/ {2,}/g)]
    .map(m => setcSpan_(text, m.index, m.index + m[0].length, '연속 공백 ' + m[0].length + '칸')));
  const hidden = [], review = [], forbidden = [];
  let index = 0;
  for (const ch of text) {
    const cp = ch.codePointAt(0), span = setcSpan_(text, index, index + ch.length);
    if (setcInRanges_(cp, data.hidden)) hidden.push(setcSpan_(text, index, index + ch.length, data.hiddenLabels[String(cp)]));
    if (!data.allowed.includes(ch)) {
      if (data.forbidden.includes(ch)) forbidden.push(span);
      else if (ch === '-') {
        const before = setcNearestCodePoint_(text, index, -1), after = setcNearestCodePoint_(text, index, 1);
        if (!(before !== null && after !== null && setcInRanges_(before, data.digits) && setcInRanges_(after, data.digits))) review.push(span);
      } else if (data.review.includes(ch) || setcInRanges_(cp, data.symbols)) review.push(span);
    }
    index += ch.length;
  }
  const mergeAdjacent = spans => {
    const merged = [];
    spans.forEach(s => {
      const previous = merged[merged.length - 1];
      if (previous && previous.end === s.start) { previous.end = s.end; previous.label += s.label; }
      else merged.push({start: s.start, end: s.end, label: s.label});
    });
    return merged;
  };
  add('LOCAL-HIDDEN-CHAR', '숨은 문자·비표준 공백 사용', hidden);
  add('LOCAL-SPECIAL-SYMBOL', '특수기호 사용(확인필요)', mergeAdjacent(review));
  add('LOCAL-FORBIDDEN-SYMBOL', '금지기호 사용(수정필요)', mergeAdjacent(forbidden));
  const quoted = setcQuotedPeriods_(text);
  let sentenceStart = 0;
  text.split('.').forEach(sentence => {
    const period = sentenceStart + sentence.length, sentenceOffset = sentenceStart;
    sentenceStart = period + 1;
    if (quoted.has(period)) return;
    const s = setcStrip_(sentence), chars = Array.from(s), last = chars[chars.length - 1];
    if (!last || last < '가' || last > '힣' || [16, 10].includes((last.codePointAt(0) - 44032) % 28)) return;
    const lastSpace = chars.lastIndexOf(' ');
    const wrong = lastSpace >= 0 && chars.length - lastSpace <= 12 ? chars.slice(lastSpace + 1).join('') : chars.slice(-6).join('');
    const trimmedEnd = sentenceOffset + setcStrip_(sentence, true).length;
    add('LOCAL-ENDING', '어미 오류', [setcSpan_(text, trimmedEnd - wrong.length, trimmedEnd)]);
  });
  return issues;
}

// BEGIN GENERATED SETC RULE DATA
var SETC_RULE_DATA_ = {"version":"LOCAL-RULES-v2.2.6-cjk-foreign-text","unicodeVersion":"15.0.0","names":[["google","\uc0ac\uae30\uc5c5 \uba85\uce6d (\ud3ec\ud138/\uac80\uc0c9\uc5d4\uc9c4)"],["\uad6c\uae00","\uc0ac\uae30\uc5c5 \uba85\uce6d (\ud3ec\ud138/\uac80\uc0c9\uc5d4\uc9c4)"],["naver","\uc0ac\uae30\uc5c5 \uba85\uce6d (\ud3ec\ud138/\uac80\uc0c9\uc5d4\uc9c4)"],["\ub124\uc774\ubc84","\uc0ac\uae30\uc5c5 \uba85\uce6d (\ud3ec\ud138/\uac80\uc0c9\uc5d4\uc9c4)"],["daum","\uc0ac\uae30\uc5c5 \uba85\uce6d (\ud3ec\ud138/\uac80\uc0c9\uc5d4\uc9c4)"],["\ub2e4\uc74c","\uc0ac\uae30\uc5c5 \uba85\uce6d (\ud3ec\ud138/\uac80\uc0c9\uc5d4\uc9c4)"],["google classroom","\uc0ac\uae30\uc5c5 \uba85\uce6d (\uad50\uc721/\ud611\uc5c5 \ud50c\ub7ab\ud3fc)"],["\uad6c\uae00 \ud074\ub798\uc2a4\ub8f8","\uc0ac\uae30\uc5c5 \uba85\uce6d (\uad50\uc721/\ud611\uc5c5 \ud50c\ub7ab\ud3fc)"],["ebs \uc628\ub77c\uc778\ud074\ub798\uc2a4","\uc0ac\uae30\uc5c5 \uba85\uce6d (\uad50\uc721/\ud611\uc5c5 \ud50c\ub7ab\ud3fc)"],["classting","\uc0ac\uae30\uc5c5 \uba85\uce6d (\uad50\uc721/\ud611\uc5c5 \ud50c\ub7ab\ud3fc)"],["\ud074\ub798\uc2a4\ud305","\uc0ac\uae30\uc5c5 \uba85\uce6d (\uad50\uc721/\ud611\uc5c5 \ud50c\ub7ab\ud3fc)"],["padlet","\uc0ac\uae30\uc5c5 \uba85\uce6d (\uad50\uc721/\ud611\uc5c5 \ud50c\ub7ab\ud3fc)"],["\ud328\ub4e4\ub81b","\uc0ac\uae30\uc5c5 \uba85\uce6d (\uad50\uc721/\ud611\uc5c5 \ud50c\ub7ab\ud3fc)"],["thinkerbell","\uc0ac\uae30\uc5c5 \uba85\uce6d (\uad50\uc721/\ud611\uc5c5 \ud50c\ub7ab\ud3fc)"],["\ub775\ucee4\ubca8","\uc0ac\uae30\uc5c5 \uba85\uce6d (\uad50\uc721/\ud611\uc5c5 \ud50c\ub7ab\ud3fc)"],["allo","\uc0ac\uae30\uc5c5 \uba85\uce6d (\uad50\uc721/\ud611\uc5c5 \ud50c\ub7ab\ud3fc)"],["\uc54c\ub85c","\uc0ac\uae30\uc5c5 \uba85\uce6d (\uad50\uc721/\ud611\uc5c5 \ud50c\ub7ab\ud3fc)"],["careernet","\uc0ac\uae30\uc5c5 \uba85\uce6d (\uad50\uc721/\ud611\uc5c5 \ud50c\ub7ab\ud3fc)"],["\ucee4\ub9ac\uc5b4\ub137","\uc0ac\uae30\uc5c5 \uba85\uce6d (\uad50\uc721/\ud611\uc5c5 \ud50c\ub7ab\ud3fc)"],["\uc6cc\ud06c\ub137","\uc0ac\uae30\uc5c5 \uba85\uce6d (\uad50\uc721/\ud611\uc5c5 \ud50c\ub7ab\ud3fc)"],["majormap","\uc0ac\uae30\uc5c5 \uba85\uce6d (\uad50\uc721/\ud611\uc5c5 \ud50c\ub7ab\ud3fc)"],["\uba54\uc774\uc800\ub9f5","\uc0ac\uae30\uc5c5 \uba85\uce6d (\uad50\uc721/\ud611\uc5c5 \ud50c\ub7ab\ud3fc)"],["holland","\uc0ac\uae30\uc5c5 \uba85\uce6d (\uad50\uc721/\ud611\uc5c5 \ud50c\ub7ab\ud3fc)"],["\ud640\ub79c\ub4dc","\uc0ac\uae30\uc5c5 \uba85\uce6d (\uad50\uc721/\ud611\uc5c5 \ud50c\ub7ab\ud3fc)"],["kakaotalk","\uc0ac\uae30\uc5c5 \uba85\uce6d (SNS/\uba54\uc2e0\uc800)"],["\uce74\uce74\uc624\ud1a1","\uc0ac\uae30\uc5c5 \uba85\uce6d (SNS/\uba54\uc2e0\uc800)"],["\uce74\ud1a1","\uc0ac\uae30\uc5c5 \uba85\uce6d (SNS/\uba54\uc2e0\uc800)"],["instagram","\uc0ac\uae30\uc5c5 \uba85\uce6d (SNS/\uba54\uc2e0\uc800)"],["\uc778\uc2a4\ud0c0\uadf8\ub7a8","\uc0ac\uae30\uc5c5 \uba85\uce6d (SNS/\uba54\uc2e0\uc800)"],["twitter","\uc0ac\uae30\uc5c5 \uba85\uce6d (SNS/\uba54\uc2e0\uc800)"],["\ud2b8\uc704\ud130","\uc0ac\uae30\uc5c5 \uba85\uce6d (SNS/\uba54\uc2e0\uc800)"],["meta","\uc0ac\uae30\uc5c5 \uba85\uce6d (SNS/\uba54\uc2e0\uc800)"],["\uba54\ud0c0","\uc0ac\uae30\uc5c5 \uba85\uce6d (SNS/\uba54\uc2e0\uc800)"],["tiktok","\uc0ac\uae30\uc5c5 \uba85\uce6d (SNS/\uba54\uc2e0\uc800)"],["\ud2f1\ud1a1","\uc0ac\uae30\uc5c5 \uba85\uce6d (SNS/\uba54\uc2e0\uc800)"],["youtube","\uc0ac\uae30\uc5c5 \uba85\uce6d (\uc601\uc0c1/\uc2a4\ud2b8\ub9ac\ubc0d)"],["\uc720\ud29c\ube0c","\uc0ac\uae30\uc5c5 \uba85\uce6d (\uc601\uc0c1/\uc2a4\ud2b8\ub9ac\ubc0d)"],["tving","\uc0ac\uae30\uc5c5 \uba85\uce6d (\uc601\uc0c1/\uc2a4\ud2b8\ub9ac\ubc0d)"],["\ud2f0\ube59","\uc0ac\uae30\uc5c5 \uba85\uce6d (\uc601\uc0c1/\uc2a4\ud2b8\ub9ac\ubc0d)"],["watcha","\uc0ac\uae30\uc5c5 \uba85\uce6d (\uc601\uc0c1/\uc2a4\ud2b8\ub9ac\ubc0d)"],["\uc653\ucc60","\uc0ac\uae30\uc5c5 \uba85\uce6d (\uc601\uc0c1/\uc2a4\ud2b8\ub9ac\ubc0d)"],["netflix","\uc0ac\uae30\uc5c5 \uba85\uce6d (\uc601\uc0c1/\uc2a4\ud2b8\ub9ac\ubc0d)"],["\ub137\ud50c\ub9ad\uc2a4","\uc0ac\uae30\uc5c5 \uba85\uce6d (\uc601\uc0c1/\uc2a4\ud2b8\ub9ac\ubc0d)"],["wavve","\uc0ac\uae30\uc5c5 \uba85\uce6d (\uc601\uc0c1/\uc2a4\ud2b8\ub9ac\ubc0d)"],["\uc6e8\uc774\ube0c","\uc0ac\uae30\uc5c5 \uba85\uce6d (\uc601\uc0c1/\uc2a4\ud2b8\ub9ac\ubc0d)"],["disneyplus","\uc0ac\uae30\uc5c5 \uba85\uce6d (\uc601\uc0c1/\uc2a4\ud2b8\ub9ac\ubc0d)"],["\ub514\uc988\ub2c8+","\uc0ac\uae30\uc5c5 \uba85\uce6d (\uc601\uc0c1/\uc2a4\ud2b8\ub9ac\ubc0d)"],["\ub514\uc988\ub2c8\ud50c\ub7ec\uc2a4","\uc0ac\uae30\uc5c5 \uba85\uce6d (\uc601\uc0c1/\uc2a4\ud2b8\ub9ac\ubc0d)"],["google tv","\uc0ac\uae30\uc5c5 \uba85\uce6d (\uc601\uc0c1/\uc2a4\ud2b8\ub9ac\ubc0d)"],["\uad6c\uae00 \ud2f0\ube44","\uc0ac\uae30\uc5c5 \uba85\uce6d (\uc601\uc0c1/\uc2a4\ud2b8\ub9ac\ubc0d)"],["youtuber","\uc0ac\uae30\uc5c5 \uba85\uce6d (\uc601\uc0c1/\uc2a4\ud2b8\ub9ac\ubc0d)"],["\uc720\ud29c\ubc84","\uc0ac\uae30\uc5c5 \uba85\uce6d (\uc601\uc0c1/\uc2a4\ud2b8\ub9ac\ubc0d)"],["miricanvas","\uc0ac\uae30\uc5c5 \uba85\uce6d (\ub514\uc790\uc778/\ud3b8\uc9d1 \ub3c4\uad6c)"],["\ubbf8\ub9ac\uce94\ubc84\uc2a4","\uc0ac\uae30\uc5c5 \uba85\uce6d (\ub514\uc790\uc778/\ud3b8\uc9d1 \ub3c4\uad6c)"],["mangoboard","\uc0ac\uae30\uc5c5 \uba85\uce6d (\ub514\uc790\uc778/\ud3b8\uc9d1 \ub3c4\uad6c)"],["\ub9dd\uace0\ubcf4\ub4dc","\uc0ac\uae30\uc5c5 \uba85\uce6d (\ub514\uc790\uc778/\ud3b8\uc9d1 \ub3c4\uad6c)"],["canva","\uc0ac\uae30\uc5c5 \uba85\uce6d (\ub514\uc790\uc778/\ud3b8\uc9d1 \ub3c4\uad6c)"],["\uce94\ubc14","\uc0ac\uae30\uc5c5 \uba85\uce6d (\ub514\uc790\uc778/\ud3b8\uc9d1 \ub3c4\uad6c)"],["vllo","\uc0ac\uae30\uc5c5 \uba85\uce6d (\ub514\uc790\uc778/\ud3b8\uc9d1 \ub3c4\uad6c)"],["\ube14\ub85c","\uc0ac\uae30\uc5c5 \uba85\uce6d (\ub514\uc790\uc778/\ud3b8\uc9d1 \ub3c4\uad6c)"],["premiere pro","\uc0ac\uae30\uc5c5 \uba85\uce6d (\ub514\uc790\uc778/\ud3b8\uc9d1 \ub3c4\uad6c)"],["\ud504\ub9ac\ubbf8\uc5b4 \ud504\ub85c","\uc0ac\uae30\uc5c5 \uba85\uce6d (\ub514\uc790\uc778/\ud3b8\uc9d1 \ub3c4\uad6c)"],["\ud30c\uc6cc\ub514\ub809\ud130","\uc0ac\uae30\uc5c5 \uba85\uce6d (\ub514\uc790\uc778/\ud3b8\uc9d1 \ub3c4\uad6c)"],["\ud0a4\ub124\ub9c8\uc2a4\ud130","\uc0ac\uae30\uc5c5 \uba85\uce6d (\ub514\uc790\uc778/\ud3b8\uc9d1 \ub3c4\uad6c)"],["final cut pro","\uc0ac\uae30\uc5c5 \uba85\uce6d (\ub514\uc790\uc778/\ud3b8\uc9d1 \ub3c4\uad6c)"],["\ud30c\uc774\ub110 \ucef7 \ud504\ub85c","\uc0ac\uae30\uc5c5 \uba85\uce6d (\ub514\uc790\uc778/\ud3b8\uc9d1 \ub3c4\uad6c)"],["\ud3ec\ud1a0\uc0f5","\uc0ac\uae30\uc5c5 \uba85\uce6d (\ub514\uc790\uc778/\ud3b8\uc9d1 \ub3c4\uad6c)"],["\ud398\uc778\ud2b8\uc0f5 \ud504\ub85c","\uc0ac\uae30\uc5c5 \uba85\uce6d (\ub514\uc790\uc778/\ud3b8\uc9d1 \ub3c4\uad6c)"],["\uae40\ud504","\uc0ac\uae30\uc5c5 \uba85\uce6d (\ub514\uc790\uc778/\ud3b8\uc9d1 \ub3c4\uad6c)"],["gather town","\uc0ac\uae30\uc5c5 \uba85\uce6d (\uba54\ud0c0\ubc84\uc2a4/\uac00\uc0c1\ud604\uc2e4)"],["\uac1c\ub354\ud0c0\uc6b4","\uc0ac\uae30\uc5c5 \uba85\uce6d (\uba54\ud0c0\ubc84\uc2a4/\uac00\uc0c1\ud604\uc2e4)"],["zepeto","\uc0ac\uae30\uc5c5 \uba85\uce6d (\uba54\ud0c0\ubc84\uc2a4/\uac00\uc0c1\ud604\uc2e4)"],["\uc81c\ud398\ud1a0","\uc0ac\uae30\uc5c5 \uba85\uce6d (\uba54\ud0c0\ubc84\uc2a4/\uac00\uc0c1\ud604\uc2e4)"],["ifland","\uc0ac\uae30\uc5c5 \uba85\uce6d (\uba54\ud0c0\ubc84\uc2a4/\uac00\uc0c1\ud604\uc2e4)"],["\uc774\ud504\ub79c\ub4dc","\uc0ac\uae30\uc5c5 \uba85\uce6d (\uba54\ud0c0\ubc84\uc2a4/\uac00\uc0c1\ud604\uc2e4)"],["pad","\uc0ac\uae30\uc5c5 \uba85\uce6d (\uae30\uae30/SW/AI)"],["\uc544\uc774\ud328\ub4dc","\uc0ac\uae30\uc5c5 \uba85\uce6d (\uae30\uae30/SW/AI)"],["galaxy tab","\uc0ac\uae30\uc5c5 \uba85\uce6d (\uae30\uae30/SW/AI)"],["\uac24\ub7ed\uc2dc\ud0ed","\uc0ac\uae30\uc5c5 \uba85\uce6d (\uae30\uae30/SW/AI)"],["chrome book","\uc0ac\uae30\uc5c5 \uba85\uce6d (\uae30\uae30/SW/AI)"],["\ud06c\ub86c\ubd81","\uc0ac\uae30\uc5c5 \uba85\uce6d (\uae30\uae30/SW/AI)"],["hwp","\uc0ac\uae30\uc5c5 \uba85\uce6d (\uae30\uae30/SW/AI)"],["ms\uc6cc\ub4dc","\uc0ac\uae30\uc5c5 \uba85\uce6d (\uae30\uae30/SW/AI)"],["\ucc57gpt","\uc0ac\uae30\uc5c5 \uba85\uce6d (\uae30\uae30/SW/AI)"],["chatgpt","\uc0ac\uae30\uc5c5 \uba85\uce6d (\uae30\uae30/SW/AI)"],["zoom","\uc0ac\uae30\uc5c5 \uba85\uce6d (\ud654\uc0c1\ud68c\uc758/\ud1b5\uc2e0)"],["\uc90c","\uc0ac\uae30\uc5c5 \uba85\uce6d (\ud654\uc0c1\ud68c\uc758/\ud1b5\uc2e0)"],["\ub124\uc774\ubc84\uc6e8\uc77c","\uc0ac\uae30\uc5c5 \uba85\uce6d (\ud654\uc0c1\ud68c\uc758/\ud1b5\uc2e0)"],["line","\uc0ac\uae30\uc5c5 \uba85\uce6d (\ud654\uc0c1\ud68c\uc758/\ud1b5\uc2e0)"],["\ub77c\uc778","\uc0ac\uae30\uc5c5 \uba85\uce6d (\ud654\uc0c1\ud68c\uc758/\ud1b5\uc2e0)"],["ktx","\uc0ac\uae30\uc5c5 \uba85\uce6d (\uad50\ud1b5)"],["\ucf00\uc774\ud2f0\uc5d1\uc2a4","\uc0ac\uae30\uc5c5 \uba85\uce6d (\uad50\ud1b5)"],["srt","\uc0ac\uae30\uc5c5 \uba85\uce6d (\uad50\ud1b5)"],["\uc5d0\uc2a4\uc54c\ud2f0","\uc0ac\uae30\uc5c5 \uba85\uce6d (\uad50\ud1b5)"],["un","\uad6d\uc81c\uae30\uad6c/\uc678\ubd80\uae30\uad00 \uba85\uce6d"],["\uc720\uc5d4","\uad6d\uc81c\uae30\uad6c/\uc678\ubd80\uae30\uad00 \uba85\uce6d"],["eu","\uad6d\uc81c\uae30\uad6c/\uc678\ubd80\uae30\uad00 \uba85\uce6d"],["\uc720\ub7fd\uc5f0\ud569","\uad6d\uc81c\uae30\uad6c/\uc678\ubd80\uae30\uad00 \uba85\uce6d"],["who","\uad6d\uc81c\uae30\uad6c/\uc678\ubd80\uae30\uad00 \uba85\uce6d"],["\uc138\uacc4 \ubcf4\uac74 \uae30\uad6c","\uad6d\uc81c\uae30\uad6c/\uc678\ubd80\uae30\uad00 \uba85\uce6d"],["wto","\uad6d\uc81c\uae30\uad6c/\uc678\ubd80\uae30\uad00 \uba85\uce6d"],["\uc138\uacc4\ubb34\uc5ed\uae30\uad6c","\uad6d\uc81c\uae30\uad6c/\uc678\ubd80\uae30\uad00 \uba85\uce6d"],["oecd","\uad6d\uc81c\uae30\uad6c/\uc678\ubd80\uae30\uad00 \uba85\uce6d"],["\uacbd\uc81c\ud611\ub825\uac1c\ubc1c\uae30\uad6c","\uad6d\uc81c\uae30\uad6c/\uc678\ubd80\uae30\uad00 \uba85\uce6d"],["imf","\uad6d\uc81c\uae30\uad6c/\uc678\ubd80\uae30\uad00 \uba85\uce6d"],["\uad6d\uc81c\ud1b5\ud654\uae30\uae08","\uad6d\uc81c\uae30\uad6c/\uc678\ubd80\uae30\uad00 \uba85\uce6d"],["unesco","\uad6d\uc81c\uae30\uad6c/\uc678\ubd80\uae30\uad00 \uba85\uce6d"],["\uc720\ub124\uc2a4\ucf54","\uad6d\uc81c\uae30\uad6c/\uc678\ubd80\uae30\uad00 \uba85\uce6d"],["iaea","\uad6d\uc81c\uae30\uad6c/\uc678\ubd80\uae30\uad00 \uba85\uce6d"],["\uad6d\uc81c\uc6d0\uc790\ub825\uae30\uad6c","\uad6d\uc81c\uae30\uad6c/\uc678\ubd80\uae30\uad00 \uba85\uce6d"],["nato","\uad6d\uc81c\uae30\uad6c/\uc678\ubd80\uae30\uad00 \uba85\uce6d"],["\ubd81\ub300\uc11c\uc591\uc870\uc57d\uae30\uad6c","\uad6d\uc81c\uae30\uad6c/\uc678\ubd80\uae30\uad00 \uba85\uce6d"],["mbti","\uc2ec\ub9ac\uac80\uc0ac \ub3c4\uad6c\uba85"],["vr","\uae30\uc220 \uc57d\uc5b4 (\uc6d0\ubb38 \ud45c\uae30 \uae08\uc9c0)"],["\ube0c\uc774\uc54c","\uae30\uc220 \uc57d\uc5b4 (\uc6d0\ubb38 \ud45c\uae30 \uae08\uc9c0)"],["ar","\uae30\uc220 \uc57d\uc5b4 (\uc6d0\ubb38 \ud45c\uae30 \uae08\uc9c0)"],["\uc5d0\uc774\uc54c","\uae30\uc220 \uc57d\uc5b4 (\uc6d0\ubb38 \ud45c\uae30 \uae08\uc9c0)"],["html","\uae30\uc220 \uc57d\uc5b4 (\uc6d0\ubb38 \ud45c\uae30 \uae08\uc9c0)"],["\uc5d0\uc774\uce58\ud2f0\uc5e0\uc5d8","\uae30\uc220 \uc57d\uc5b4 (\uc6d0\ubb38 \ud45c\uae30 \uae08\uc9c0)"],["css","\uae30\uc220 \uc57d\uc5b4 (\uc6d0\ubb38 \ud45c\uae30 \uae08\uc9c0)"],["\uc528\uc5d0\uc2a4\uc5d0\uc2a4","\uae30\uc220 \uc57d\uc5b4 (\uc6d0\ubb38 \ud45c\uae30 \uae08\uc9c0)"],["google docs","\uc0ac\uae30\uc5c5 \uba85\uce6d (\uad6c\uae00 \uc11c\ube44\uc2a4)"],["\uad6c\uae00\ubb38\uc11c","\uc0ac\uae30\uc5c5 \uba85\uce6d (\uad6c\uae00 \uc11c\ube44\uc2a4)"]],"boundaries":["ar","css","eu","hwp","line","meta","pad","srt","un","vr","zoom","\ub77c\uc778"],"nameExceptions":{"\uc90c":[{"source":"(?:\ubcf4\uc5ec|\uc2ec\uc5b4|\uae38\ub7ec|\ub36e\uc5b4|\ubd80\uc5ec|\ub9d0\ud574|\ubd88\ub7ec|\ub113\ud600)\uc90c","flags":"i"},{"source":"(?:\ubcf4\uc5ec|\uc2ec\uc5b4|\uae38\ub7ec|\ub113\ud600|\uc124\uba85\ud574|\uac00\ub974\uccd0|\uc774\ub04c\uc5b4)\\s+\uc90c","flags":"i"},{"source":"(?:\uc2e0\ub8b0\uac10|\uc2e0\ub8b0|\uc778\uc0c1|\uae4a\uc740\\s+\uc778\uc0c1|\uac10\ub3d9|\uc6b8\ub9bc|\ub3c4\uc6c0|\ud070\\s+\ub3c4\uc6c0|\uc601\ud5a5|\uc548\uc815\uac10)(?:\uc744|\ub97c)?\\s+\uc90c","flags":"i"},{"source":"(?:\uc124\uba85|\uc5b8\uae09|\uc81c\uc2dc|\uc720\ub3c4)\ud558\uc5ec\\s+\uc90c","flags":"i"}],"\ub2e4\uc74c":[{"source":"\ub2e4\uc74c\\s+(?:\uc2dc\ub3c4|\ucc28\uc2dc|\ubaa9\ud45c|\uacfc\uc81c|\ud65c\ub3d9|\ub2e8\uacc4|\uc138\ub300|\ud0c0\uad6c|\ub3d9\uc791|\ud68c\ucc28|\uc8fc\uae30|\uc74c\ud45c|\uae30\ud68c|\uc218\uc5c5|\uacfc\uc815|\ubb3c\uc74c|\uc5f0\uad6c|\uacf5\uaca9|\ub2e8\uc5b4|\ub2f9\ucca8|\uacf5\uc815|\uc8fc\uc790)","flags":"i"},{"source":"\ub2e4\uc74c(?:\uc5d0|\uc5d0\ub294)(?=$|[\\s,.!?;:'\\\"\u201c\u201d\u2018\u2019()\\[\\]{}]|[\uc740\ub294\uc774\uac00\uc744\ub97c\ub3c4\uc758\ub85c\uc640\uacfc])","flags":"i"},{"source":"\ud55c\\s+\ub2e4\uc74c(?:\uc5d0|\uc5d0\ub294)?","flags":"i"}],"\uba54\ud0c0":[{"source":"\uba54\ud0c0\ubc84\uc2a4","flags":"i"},{"source":"\uba54\ud0c0\ub370\uc774\ud130","flags":"i"},{"source":"\uba54\ud0c0\uc778\uc9c0(?:\uc801)?","flags":"i"},{"source":"\uba54\ud0c0\\s*\ubd84\uc11d","flags":"i"},{"source":"\uba54\ud0c0\\s*\uc5f0\uad6c","flags":"i"},{"source":"\uba54\ud0c0\ubb3c\uc9c8","flags":"i"}],"\ube14\ub85c":[{"source":"\ube14\ub85c\uadf8","flags":"i"},{"source":"\ube14\ub85c\ud0b9","flags":"i"}],"\uc54c\ub85c":[{"source":"\uc54c\ub85c\uc2a4\ud14c\ub9ad","flags":"i"}]},"nailLine":{"source":"\ud480\ucf54\ud2b8\\s+\uceec\ub7ec\ub9c1[^.!?\\n]{0,60}?(?<term>\ub77c\uc778)(?=\\s+\ud45c\ud604(?:[\uc744\uc758\uc5d0\uc774\uc740\ub294\uacfc]|\uc73c\ub85c|\\s|[,.]|$))","flags":""},"moeExceptions":{"COMPETITION":[{"source":"\uc778\ubbfc\ub300\ud68c\ub2f9","flags":"i"}]},"moe":[{"topic":"LANG_TEST","review_rule_id":"MOE-LANG-TEST-REVIEW","review_reason":"\uacf5\uc778\uc5b4\ud559\uc2dc\ud5d8 \uad00\ub828 \ud45c\ud604 \ud655\uc778 \ud544\uc694","sensitive_pattern":{"source":"(?:TOEIC|TOEFL|TEPS|HSK|JPT|JLPT|(?<![A-Za-z])DELF(?![A-Za-z])|DALF|TESTDAF|DSH|DSD|TORFL|DELE|\ud1a0\uc775|\ud1a0\ud50c|\ud15d\uc2a4|\uacf5\uc778\uc5b4\ud559\uc2dc\ud5d8)","flags":"i"},"high_rule_id":"MOE-LANG-TEST-HIGH","high_reason":"\uacf5\uc778\uc5b4\ud559\uc2dc\ud5d8 \ucc38\uc5ec/\uc131\uc801 \uae30\uc7ac \uc758\uc2ec","high_pattern":{"source":"(?:(?:TOEIC|TOEFL|TEPS|HSK|JPT|JLPT|(?<![A-Za-z])DELF(?![A-Za-z])|DALF|TESTDAF|DSH|DSD|TORFL|DELE|\ud1a0\uc775|\ud1a0\ud50c|\ud15d\uc2a4)[^.!?\\n]{0,25}?(?:\uc751\uc2dc|\ucc38\uc5ec|\uc131\uc801|\uc810\uc218|\ub4f1\uae09|\uc218\uc0c1|\uc785\uc0c1|[0-9]{2,4}\\s*\uc810)|(?:\uc751\uc2dc|\ucc38\uc5ec|\uc131\uc801|\uc810\uc218|\ub4f1\uae09|\uc218\uc0c1|\uc785\uc0c1)[^.!?\\n]{0,25}?(?:TOEIC|TOEFL|TEPS|HSK|JPT|JLPT|(?<![A-Za-z])DELF(?![A-Za-z])|DALF|TESTDAF|DSH|DSD|TORFL|DELE|\ud1a0\uc775|\ud1a0\ud50c|\ud15d\uc2a4)|\uacf5\uc778\uc5b4\ud559\uc2dc\ud5d8[^.!?\\n]{0,20}?(?:\uc751\uc2dc|\ucc38\uc5ec|\uc131\uc801|\uc810\uc218|\ub4f1\uae09|\uc218\uc0c1|\uc785\uc0c1))","flags":"i"}},{"topic":"MOCK_EXAM","review_rule_id":"MOE-MOCK-SCORE-REVIEW","review_reason":"\ubaa8\uc758\uace0\uc0ac/\uc804\uad6d\uc5f0\ud569 \uad00\ub828 \ud45c\ud604 \ud655\uc778 \ud544\uc694","sensitive_pattern":{"source":"\ubaa8\uc758\\s*\uace0\uc0ac|\ud559\ub825\\s*\ud3c9\uac00|\ubaa8\uc758\\s*\uc218\ub2a5|\uc804\uad6d\\s*\uc5f0\ud569","flags":""},"high_rule_id":"MOE-MOCK-SCORE-HIGH","high_reason":"\ubaa8\uc758\uace0\uc0ac/\uc804\uad6d\uc5f0\ud569 \uc131\uc801 \uae30\uc7ac \uc758\uc2ec","high_pattern":{"source":"(?:\ubaa8\uc758\\s*\uace0\uc0ac|\ud559\ub825\\s*\ud3c9\uac00|\ubaa8\uc758\\s*\uc218\ub2a5|\uc804\uad6d\\s*\uc5f0\ud569)[^.!?\\n]{0,35}?(?:\uc6d0\uc810\uc218|\uc810\uc218|\uc11d\ucc28|\uc11d\ucc28\ub4f1\uae09|\ub4f1\uae09|\ubc31\ubd84\uc704|[1-9]\\s*\ub4f1\uae09)","flags":""}},{"topic":"COMPETITION","review_rule_id":"MOE-COMPETITION-REVIEW","review_reason":"\ub300\ud68c \uad00\ub828 \ud45c\ud604 \ud655\uc778 \ud544\uc694","sensitive_pattern":{"source":"\ub300\ud68c","flags":""},"high_rule_id":"MOE-COMPETITION-HIGH","high_reason":"\ub300\ud68c \ucc38\uc5ec/\uc218\uc0c1 \uae30\uc7ac \uc758\uc2ec","high_pattern":{"source":"(?:\uad50\ub0b4\\s*|\uad50\uc678\\s*)?\ub300\ud68c[^.!?\\n]{0,20}?(?:\ucc38\uac00|\ucc38\uc5ec|\ucd9c\uc804|\uc218\uc0c1|\uc785\uc0c1)(?:\ud568|\ud588|\ud558\uc5ec|\ud558\uace0|\ud558\uc600|\ud568\uc73c\ub85c)|(?:\ucc38\uac00|\ucc38\uc5ec|\ucd9c\uc804|\uc218\uc0c1|\uc785\uc0c1)(?:\ud568|\ud588|\ud558\uc5ec|\ud558\uace0|\ud558\uc600|\ud568\uc73c\ub85c)[^.!?\\n]{0,20}?(?:\uad50\ub0b4\\s*|\uad50\uc678\\s*)?\ub300\ud68c","flags":""}},{"topic":"BOOK_PUBLISH","review_rule_id":"MOE-BOOK-PUBLISH-REVIEW","review_reason":"\ub3c4\uc11c \ucd9c\uac04 \uad00\ub828 \ud45c\ud604 \ud655\uc778 \ud544\uc694","sensitive_pattern":{"source":"\ucd9c\uac04|\ucd9c\ud310","flags":""},"high_rule_id":"MOE-BOOK-PUBLISH-HIGH","high_reason":"\ub3c4\uc11c \ucd9c\uac04 \uc0ac\uc2e4 \uae30\uc7ac \uc758\uc2ec","high_pattern":{"source":"(?:\uc790\uc2e0\uc758|\ubcf8\uc778\uc758|\uc9c1\uc811\\s*)?[^.!?\\n]{0,8}?(?:\ub3c4\uc11c|\ucc45)(?:\uc744|\ub97c)?\\s*(?:\uc9c1\uc811\\s*)?(?:\ucd9c\uac04|\ucd9c\ud310)(?:\ud568|\ud588|\ud558\uc5ec|\ud558\uace0|\ud558\uc600|\ud55c)","flags":""}},{"topic":"IP","review_rule_id":"MOE-IP-REVIEW","review_reason":"\uc9c0\uc2dd\uc7ac\uc0b0\uad8c \uad00\ub828 \ud45c\ud604 \ud655\uc778 \ud544\uc694","sensitive_pattern":{"source":"\ud2b9\ud5c8|\uc2e4\uc6a9\uc2e0\uc548|\uc0c1\ud45c\uad8c|\ub514\uc790\uc778\uad8c|\uc9c0\uc2dd\uc7ac\uc0b0\uad8c","flags":""},"high_rule_id":"MOE-IP-HIGH","high_reason":"\uc9c0\uc2dd\uc7ac\uc0b0\uad8c \ucd9c\uc6d0/\ub4f1\ub85d \uae30\uc7ac \uc758\uc2ec","high_pattern":{"source":"(?:\ud2b9\ud5c8|\uc2e4\uc6a9\uc2e0\uc548|\uc0c1\ud45c\uad8c|\ub514\uc790\uc778\uad8c|\uc9c0\uc2dd\uc7ac\uc0b0\uad8c)(?:\uc744|\ub97c)?\\s*(?:\uc9c1\uc811\\s*)?(?:\ucd9c\uc6d0|\ub4f1\ub85d)(?:\ud568|\ud588|\ud558\uc5ec|\ud558\uace0|\ud558\uc600|\ud55c)","flags":""}},{"topic":"SCHOLARSHIP","review_rule_id":"MOE-SCHOLARSHIP-REVIEW","review_reason":"\uc7a5\ud559\uc0dd/\uc7a5\ud559\uae08 \uad00\ub828 \ub0b4\uc6a9 \ud655\uc778 \ud544\uc694","sensitive_pattern":{"source":"\uc7a5\ud559\uc0dd|\uc7a5\ud559\uae08","flags":""},"high_rule_id":null,"high_reason":null,"high_pattern":null},{"topic":"CERTIFICATE","review_rule_id":"MOE-CERTIFICATE-REVIEW","review_reason":"\uc790\uaca9\uc99d \uad00\ub828 \ud45c\ud604 \ud655\uc778 \ud544\uc694","sensitive_pattern":{"source":"\uc790\uaca9\uc99d","flags":""},"high_rule_id":"MOE-CERTIFICATE-HIGH","high_reason":"\uc790\uaca9\uc99d \ucde8\ub4dd \uc0ac\uc2e4 \uae30\uc7ac \uc758\uc2ec","high_pattern":{"source":"\uc790\uaca9\uc99d(?:\uc744|\ub97c)?\\s*(?:\uc9c1\uc811\\s*)?(?:\ucde8\ub4dd|\ud569\uaca9)(?:\ud568|\ud588|\ud558\uc5ec|\ud558\uace0|\ud558\uc600|\ud55c)|(?:\ucde8\ub4dd|\ud569\uaca9)(?:\ud568|\ud588|\ud558\uc5ec|\ud558\uace0|\ud558\uc600|\ud55c)[^.!?\\n]{0,15}?\uc790\uaca9\uc99d","flags":""}}],"cjk":{"source":"[\\u3400-\\u4dbf\\u4e00-\\u9fff\\uf900-\\ufaff\\u{00020000}-\\u{0002ee5f}\\u{0002f800}-\\u{0002fa1f}\\u{00030000}-\\u{000323af}\\u3041-\\u3096\\u309d-\\u309f\\u30a1-\\u30fa\\u30fc-\\u30ff\\u31f0-\\u31ff\\uff66-\\uff9f][\\u3400-\\u4dbf\\u4e00-\\u9fff\\uf900-\\ufaff\\u{00020000}-\\u{0002ee5f}\\u{0002f800}-\\u{0002fa1f}\\u{00030000}-\\u{000323af}\\u3041-\\u3096\\u3099-\\u309a\\u309d-\\u309f\\u30a1-\\u30fa\\u30fc-\\u30ff\\u31f0-\\u31ff\\uff66-\\uff9f]*","flags":""},"foreignExceptions":["ai"],"allowed":["'","(",")",",","."],"review":["\u00b7","\u318d"],"forbidden":["*","<",">","[","]","{","}","~","\u00ab","\u00bb","\u2010","\u2011","\u2012","\u2013","\u2014","\u2015","\u2022","\u203b","\u2190","\u2191","\u2192","\u2193","\u2194","\u21d0","\u21d2","\u21d4","\u2212","\u223c","\u226a","\u226b","\u25a0","\u25a1","\u25b2","\u25b3","\u25b6","\u25b7","\u25bc","\u25bd","\u25c0","\u25c1","\u25c6","\u25c7","\u25cb","\u25ce","\u25cf","\u25ef","\u2605","\u2606","\u3001","\u3002","\u3008","\u3009","\u300a","\u300b","\u300c","\u300d","\u300e","\u300f","\u3010","\u3011","\u3014","\u3015","\u3016","\u3017","\u3018","\u3019","\u301a","\u301b","\u301c","\u30fb","\uff0a","\uff0c","\uff0d","\uff0e","\uff1c","\uff1e","\uff3b","\uff3d","\uff5b","\uff5d","\uff5e","\uff61","\uff64","\uff65"],"spaces":[[9,13],[28,32],[133,133],[160,160],[5760,5760],[8192,8202],[8232,8233],[8239,8239],[8287,8287],[12288,12288]],"digits":[[48,57],[178,179],[185,185],[1632,1641],[1776,1785],[1984,1993],[2406,2415],[2534,2543],[2662,2671],[2790,2799],[2918,2927],[3046,3055],[3174,3183],[3302,3311],[3430,3439],[3558,3567],[3664,3673],[3792,3801],[3872,3881],[4160,4169],[4240,4249],[4969,4977],[6112,6121],[6160,6169],[6470,6479],[6608,6618],[6784,6793],[6800,6809],[6992,7001],[7088,7097],[7232,7241],[7248,7257],[8304,8304],[8308,8313],[8320,8329],[9312,9320],[9332,9340],[9352,9360],[9450,9450],[9461,9469],[9471,9471],[10102,10110],[10112,10120],[10122,10130],[42528,42537],[43216,43225],[43264,43273],[43472,43481],[43504,43513],[43600,43609],[44016,44025],[65296,65305],[66720,66729],[68160,68163],[68912,68921],[69216,69224],[69714,69722],[69734,69743],[69872,69881],[69942,69951],[70096,70105],[70384,70393],[70736,70745],[70864,70873],[71248,71257],[71360,71369],[71472,71481],[71904,71913],[72016,72025],[72784,72793],[73040,73049],[73120,73129],[73552,73561],[92768,92777],[92864,92873],[93008,93017],[120782,120831],[123200,123209],[123632,123641],[124144,124153],[125264,125273],[127232,127242],[130032,130041]],"symbols":[[33,47],[58,64],[91,96],[123,126],[161,169],[171,172],[174,177],[180,180],[182,184],[187,187],[191,191],[215,215],[247,247],[706,709],[722,735],[741,747],[749,749],[751,767],[885,885],[894,894],[900,901],[903,903],[1014,1014],[1154,1154],[1370,1375],[1417,1418],[1421,1423],[1470,1470],[1472,1472],[1475,1475],[1478,1478],[1523,1524],[1542,1551],[1563,1563],[1565,1567],[1642,1645],[1748,1748],[1758,1758],[1769,1769],[1789,1790],[1792,1805],[2038,2041],[2046,2047],[2096,2110],[2142,2142],[2184,2184],[2404,2405],[2416,2416],[2546,2547],[2554,2555],[2557,2557],[2678,2678],[2800,2801],[2928,2928],[3059,3066],[3191,3191],[3199,3199],[3204,3204],[3407,3407],[3449,3449],[3572,3572],[3647,3647],[3663,3663],[3674,3675],[3841,3863],[3866,3871],[3892,3892],[3894,3894],[3896,3896],[3898,3901],[3973,3973],[4030,4037],[4039,4044],[4046,4058],[4170,4175],[4254,4255],[4347,4347],[4960,4968],[5008,5017],[5120,5120],[5741,5742],[5787,5788],[5867,5869],[5941,5942],[6100,6102],[6104,6107],[6144,6154],[6464,6464],[6468,6469],[6622,6655],[6686,6687],[6816,6822],[6824,6829],[7002,7018],[7028,7038],[7164,7167],[7227,7231],[7294,7295],[7360,7367],[7379,7379],[8125,8125],[8127,8129],[8141,8143],[8157,8159],[8173,8175],[8189,8190],[8208,8231],[8240,8286],[8314,8318],[8330,8334],[8352,8384],[8448,8449],[8451,8454],[8456,8457],[8468,8468],[8470,8472],[8478,8483],[8485,8485],[8487,8487],[8489,8489],[8494,8494],[8506,8507],[8512,8516],[8522,8525],[8527,8527],[8586,8587],[8592,9254],[9280,9290],[9372,9449],[9472,10101],[10132,11123],[11126,11157],[11159,11263],[11493,11498],[11513,11516],[11518,11519],[11632,11632],[11776,11822],[11824,11869],[11904,11929],[11931,12019],[12032,12245],[12272,12283],[12289,12292],[12296,12320],[12336,12336],[12342,12343],[12349,12351],[12443,12444],[12448,12448],[12539,12539],[12688,12689],[12694,12703],[12736,12771],[12800,12830],[12842,12871],[12880,12880],[12896,12927],[12938,12976],[12992,13311],[19904,19967],[42128,42182],[42238,42239],[42509,42511],[42611,42611],[42622,42622],[42738,42743],[42752,42774],[42784,42785],[42889,42890],[43048,43051],[43062,43065],[43124,43127],[43214,43215],[43256,43258],[43260,43260],[43310,43311],[43359,43359],[43457,43469],[43486,43487],[43612,43615],[43639,43641],[43742,43743],[43760,43761],[43867,43867],[43882,43883],[44011,44011],[64297,64297],[64434,64450],[64830,64847],[64975,64975],[65020,65023],[65040,65049],[65072,65106],[65108,65126],[65128,65131],[65281,65295],[65306,65312],[65339,65344],[65371,65381],[65504,65510],[65512,65518],[65532,65533],[65792,65794],[65847,65855],[65913,65929],[65932,65934],[65936,65948],[65952,65952],[66000,66044],[66463,66463],[66512,66512],[66927,66927],[67671,67671],[67703,67704],[67871,67871],[67903,67903],[68176,68184],[68223,68223],[68296,68296],[68336,68342],[68409,68415],[68505,68508],[69293,69293],[69461,69465],[69510,69513],[69703,69709],[69819,69820],[69822,69825],[69952,69955],[70004,70005],[70085,70088],[70093,70093],[70107,70107],[70109,70111],[70200,70205],[70313,70313],[70731,70735],[70746,70747],[70749,70749],[70854,70854],[71105,71127],[71233,71235],[71264,71276],[71353,71353],[71484,71487],[71739,71739],[72004,72006],[72162,72162],[72255,72262],[72346,72348],[72350,72354],[72448,72457],[72769,72773],[72816,72817],[73463,73464],[73539,73551],[73685,73713],[73727,73727],[74864,74868],[77809,77810],[92782,92783],[92917,92917],[92983,92991],[92996,92997],[93847,93850],[94178,94178],[113820,113820],[113823,113823],[118608,118723],[118784,119029],[119040,119078],[119081,119140],[119146,119148],[119171,119172],[119180,119209],[119214,119274],[119296,119361],[119365,119365],[119552,119638],[120513,120513],[120539,120539],[120571,120571],[120597,120597],[120629,120629],[120655,120655],[120687,120687],[120713,120713],[120745,120745],[120771,120771],[120832,121343],[121399,121402],[121453,121460],[121462,121475],[121477,121483],[123215,123215],[123647,123647],[125278,125279],[126124,126124],[126128,126128],[126254,126254],[126704,126705],[126976,127019],[127024,127123],[127136,127150],[127153,127167],[127169,127183],[127185,127221],[127245,127405],[127462,127490],[127504,127547],[127552,127560],[127568,127569],[127584,127589],[127744,128727],[128732,128748],[128752,128764],[128768,128886],[128891,128985],[128992,129003],[129008,129008],[129024,129035],[129040,129095],[129104,129113],[129120,129159],[129168,129197],[129200,129201],[129280,129619],[129632,129645],[129648,129660],[129664,129672],[129680,129725],[129727,129733],[129742,129755],[129760,129768],[129776,129784],[129792,129938],[129940,129994]],"hidden":[[9,9],[11,12],[160,160],[173,173],[1536,1541],[1564,1564],[1757,1757],[1807,1807],[2192,2193],[2274,2274],[5760,5760],[6158,6158],[8192,8207],[8232,8239],[8287,8292],[8294,8303],[12288,12288],[65279,65279],[65529,65531],[69821,69821],[69837,69837],[78896,78911],[113824,113827],[119155,119162],[917505,917505],[917536,917631]],"hiddenLabels":{"9":"TAB (U+0009)","11":"VERTICAL TAB (U+000B)","12":"FORM FEED (U+000C)","160":"NO-BREAK SPACE (U+00A0)","173":"SOFT HYPHEN (U+00AD)","1536":"ARABIC NUMBER SIGN (U+0600)","1537":"ARABIC SIGN SANAH (U+0601)","1538":"ARABIC FOOTNOTE MARKER (U+0602)","1539":"ARABIC SIGN SAFHA (U+0603)","1540":"ARABIC SIGN SAMVAT (U+0604)","1541":"ARABIC NUMBER MARK ABOVE (U+0605)","1564":"ARABIC LETTER MARK (U+061C)","1757":"ARABIC END OF AYAH (U+06DD)","1807":"SYRIAC ABBREVIATION MARK (U+070F)","2192":"ARABIC POUND MARK ABOVE (U+0890)","2193":"ARABIC PIASTRE MARK ABOVE (U+0891)","2274":"ARABIC DISPUTED END OF AYAH (U+08E2)","5760":"OGHAM SPACE MARK (U+1680)","6158":"MONGOLIAN VOWEL SEPARATOR (U+180E)","8192":"EN QUAD (U+2000)","8193":"EM QUAD (U+2001)","8194":"EN SPACE (U+2002)","8195":"EM SPACE (U+2003)","8196":"THREE-PER-EM SPACE (U+2004)","8197":"FOUR-PER-EM SPACE (U+2005)","8198":"SIX-PER-EM SPACE (U+2006)","8199":"FIGURE SPACE (U+2007)","8200":"PUNCTUATION SPACE (U+2008)","8201":"THIN SPACE (U+2009)","8202":"HAIR SPACE (U+200A)","8203":"ZERO WIDTH SPACE (U+200B)","8204":"ZERO WIDTH NON-JOINER (U+200C)","8205":"ZERO WIDTH JOINER (U+200D)","8206":"LEFT-TO-RIGHT MARK (U+200E)","8207":"RIGHT-TO-LEFT MARK (U+200F)","8232":"LINE SEPARATOR (U+2028)","8233":"PARAGRAPH SEPARATOR (U+2029)","8234":"LEFT-TO-RIGHT EMBEDDING (U+202A)","8235":"RIGHT-TO-LEFT EMBEDDING (U+202B)","8236":"POP DIRECTIONAL FORMATTING (U+202C)","8237":"LEFT-TO-RIGHT OVERRIDE (U+202D)","8238":"RIGHT-TO-LEFT OVERRIDE (U+202E)","8239":"NARROW NO-BREAK SPACE (U+202F)","8287":"MEDIUM MATHEMATICAL SPACE (U+205F)","8288":"WORD JOINER (U+2060)","8289":"FUNCTION APPLICATION (U+2061)","8290":"INVISIBLE TIMES (U+2062)","8291":"INVISIBLE SEPARATOR (U+2063)","8292":"INVISIBLE PLUS (U+2064)","8294":"LEFT-TO-RIGHT ISOLATE (U+2066)","8295":"RIGHT-TO-LEFT ISOLATE (U+2067)","8296":"FIRST STRONG ISOLATE (U+2068)","8297":"POP DIRECTIONAL ISOLATE (U+2069)","8298":"INHIBIT SYMMETRIC SWAPPING (U+206A)","8299":"ACTIVATE SYMMETRIC SWAPPING (U+206B)","8300":"INHIBIT ARABIC FORM SHAPING (U+206C)","8301":"ACTIVATE ARABIC FORM SHAPING (U+206D)","8302":"NATIONAL DIGIT SHAPES (U+206E)","8303":"NOMINAL DIGIT SHAPES (U+206F)","12288":"IDEOGRAPHIC SPACE (U+3000)","65279":"ZERO WIDTH NO-BREAK SPACE/BOM (U+FEFF)","65529":"INTERLINEAR ANNOTATION ANCHOR (U+FFF9)","65530":"INTERLINEAR ANNOTATION SEPARATOR (U+FFFA)","65531":"INTERLINEAR ANNOTATION TERMINATOR (U+FFFB)","69821":"KAITHI NUMBER SIGN (U+110BD)","69837":"KAITHI NUMBER SIGN ABOVE (U+110CD)","78896":"EGYPTIAN HIEROGLYPH VERTICAL JOINER (U+13430)","78897":"EGYPTIAN HIEROGLYPH HORIZONTAL JOINER (U+13431)","78898":"EGYPTIAN HIEROGLYPH INSERT AT TOP START (U+13432)","78899":"EGYPTIAN HIEROGLYPH INSERT AT BOTTOM START (U+13433)","78900":"EGYPTIAN HIEROGLYPH INSERT AT TOP END (U+13434)","78901":"EGYPTIAN HIEROGLYPH INSERT AT BOTTOM END (U+13435)","78902":"EGYPTIAN HIEROGLYPH OVERLAY MIDDLE (U+13436)","78903":"EGYPTIAN HIEROGLYPH BEGIN SEGMENT (U+13437)","78904":"EGYPTIAN HIEROGLYPH END SEGMENT (U+13438)","78905":"EGYPTIAN HIEROGLYPH INSERT AT MIDDLE (U+13439)","78906":"EGYPTIAN HIEROGLYPH INSERT AT TOP (U+1343A)","78907":"EGYPTIAN HIEROGLYPH INSERT AT BOTTOM (U+1343B)","78908":"EGYPTIAN HIEROGLYPH BEGIN ENCLOSURE (U+1343C)","78909":"EGYPTIAN HIEROGLYPH END ENCLOSURE (U+1343D)","78910":"EGYPTIAN HIEROGLYPH BEGIN WALLED ENCLOSURE (U+1343E)","78911":"EGYPTIAN HIEROGLYPH END WALLED ENCLOSURE (U+1343F)","113824":"SHORTHAND FORMAT LETTER OVERLAP (U+1BCA0)","113825":"SHORTHAND FORMAT CONTINUING OVERLAP (U+1BCA1)","113826":"SHORTHAND FORMAT DOWN STEP (U+1BCA2)","113827":"SHORTHAND FORMAT UP STEP (U+1BCA3)","119155":"MUSICAL SYMBOL BEGIN BEAM (U+1D173)","119156":"MUSICAL SYMBOL END BEAM (U+1D174)","119157":"MUSICAL SYMBOL BEGIN TIE (U+1D175)","119158":"MUSICAL SYMBOL END TIE (U+1D176)","119159":"MUSICAL SYMBOL BEGIN SLUR (U+1D177)","119160":"MUSICAL SYMBOL END SLUR (U+1D178)","119161":"MUSICAL SYMBOL BEGIN PHRASE (U+1D179)","119162":"MUSICAL SYMBOL END PHRASE (U+1D17A)","917505":"LANGUAGE TAG (U+E0001)","917536":"TAG SPACE (U+E0020)","917537":"TAG EXCLAMATION MARK (U+E0021)","917538":"TAG QUOTATION MARK (U+E0022)","917539":"TAG NUMBER SIGN (U+E0023)","917540":"TAG DOLLAR SIGN (U+E0024)","917541":"TAG PERCENT SIGN (U+E0025)","917542":"TAG AMPERSAND (U+E0026)","917543":"TAG APOSTROPHE (U+E0027)","917544":"TAG LEFT PARENTHESIS (U+E0028)","917545":"TAG RIGHT PARENTHESIS (U+E0029)","917546":"TAG ASTERISK (U+E002A)","917547":"TAG PLUS SIGN (U+E002B)","917548":"TAG COMMA (U+E002C)","917549":"TAG HYPHEN-MINUS (U+E002D)","917550":"TAG FULL STOP (U+E002E)","917551":"TAG SOLIDUS (U+E002F)","917552":"TAG DIGIT ZERO (U+E0030)","917553":"TAG DIGIT ONE (U+E0031)","917554":"TAG DIGIT TWO (U+E0032)","917555":"TAG DIGIT THREE (U+E0033)","917556":"TAG DIGIT FOUR (U+E0034)","917557":"TAG DIGIT FIVE (U+E0035)","917558":"TAG DIGIT SIX (U+E0036)","917559":"TAG DIGIT SEVEN (U+E0037)","917560":"TAG DIGIT EIGHT (U+E0038)","917561":"TAG DIGIT NINE (U+E0039)","917562":"TAG COLON (U+E003A)","917563":"TAG SEMICOLON (U+E003B)","917564":"TAG LESS-THAN SIGN (U+E003C)","917565":"TAG EQUALS SIGN (U+E003D)","917566":"TAG GREATER-THAN SIGN (U+E003E)","917567":"TAG QUESTION MARK (U+E003F)","917568":"TAG COMMERCIAL AT (U+E0040)","917569":"TAG LATIN CAPITAL LETTER A (U+E0041)","917570":"TAG LATIN CAPITAL LETTER B (U+E0042)","917571":"TAG LATIN CAPITAL LETTER C (U+E0043)","917572":"TAG LATIN CAPITAL LETTER D (U+E0044)","917573":"TAG LATIN CAPITAL LETTER E (U+E0045)","917574":"TAG LATIN CAPITAL LETTER F (U+E0046)","917575":"TAG LATIN CAPITAL LETTER G (U+E0047)","917576":"TAG LATIN CAPITAL LETTER H (U+E0048)","917577":"TAG LATIN CAPITAL LETTER I (U+E0049)","917578":"TAG LATIN CAPITAL LETTER J (U+E004A)","917579":"TAG LATIN CAPITAL LETTER K (U+E004B)","917580":"TAG LATIN CAPITAL LETTER L (U+E004C)","917581":"TAG LATIN CAPITAL LETTER M (U+E004D)","917582":"TAG LATIN CAPITAL LETTER N (U+E004E)","917583":"TAG LATIN CAPITAL LETTER O (U+E004F)","917584":"TAG LATIN CAPITAL LETTER P (U+E0050)","917585":"TAG LATIN CAPITAL LETTER Q (U+E0051)","917586":"TAG LATIN CAPITAL LETTER R (U+E0052)","917587":"TAG LATIN CAPITAL LETTER S (U+E0053)","917588":"TAG LATIN CAPITAL LETTER T (U+E0054)","917589":"TAG LATIN CAPITAL LETTER U (U+E0055)","917590":"TAG LATIN CAPITAL LETTER V (U+E0056)","917591":"TAG LATIN CAPITAL LETTER W (U+E0057)","917592":"TAG LATIN CAPITAL LETTER X (U+E0058)","917593":"TAG LATIN CAPITAL LETTER Y (U+E0059)","917594":"TAG LATIN CAPITAL LETTER Z (U+E005A)","917595":"TAG LEFT SQUARE BRACKET (U+E005B)","917596":"TAG REVERSE SOLIDUS (U+E005C)","917597":"TAG RIGHT SQUARE BRACKET (U+E005D)","917598":"TAG CIRCUMFLEX ACCENT (U+E005E)","917599":"TAG LOW LINE (U+E005F)","917600":"TAG GRAVE ACCENT (U+E0060)","917601":"TAG LATIN SMALL LETTER A (U+E0061)","917602":"TAG LATIN SMALL LETTER B (U+E0062)","917603":"TAG LATIN SMALL LETTER C (U+E0063)","917604":"TAG LATIN SMALL LETTER D (U+E0064)","917605":"TAG LATIN SMALL LETTER E (U+E0065)","917606":"TAG LATIN SMALL LETTER F (U+E0066)","917607":"TAG LATIN SMALL LETTER G (U+E0067)","917608":"TAG LATIN SMALL LETTER H (U+E0068)","917609":"TAG LATIN SMALL LETTER I (U+E0069)","917610":"TAG LATIN SMALL LETTER J (U+E006A)","917611":"TAG LATIN SMALL LETTER K (U+E006B)","917612":"TAG LATIN SMALL LETTER L (U+E006C)","917613":"TAG LATIN SMALL LETTER M (U+E006D)","917614":"TAG LATIN SMALL LETTER N (U+E006E)","917615":"TAG LATIN SMALL LETTER O (U+E006F)","917616":"TAG LATIN SMALL LETTER P (U+E0070)","917617":"TAG LATIN SMALL LETTER Q (U+E0071)","917618":"TAG LATIN SMALL LETTER R (U+E0072)","917619":"TAG LATIN SMALL LETTER S (U+E0073)","917620":"TAG LATIN SMALL LETTER T (U+E0074)","917621":"TAG LATIN SMALL LETTER U (U+E0075)","917622":"TAG LATIN SMALL LETTER V (U+E0076)","917623":"TAG LATIN SMALL LETTER W (U+E0077)","917624":"TAG LATIN SMALL LETTER X (U+E0078)","917625":"TAG LATIN SMALL LETTER Y (U+E0079)","917626":"TAG LATIN SMALL LETTER Z (U+E007A)","917627":"TAG LEFT CURLY BRACKET (U+E007B)","917628":"TAG VERTICAL LINE (U+E007C)","917629":"TAG RIGHT CURLY BRACKET (U+E007D)","917630":"TAG TILDE (U+E007E)","917631":"CANCEL TAG (U+E007F)"}};
// END GENERATED SETC RULE DATA
