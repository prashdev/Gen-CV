/**
 * Google Apps Script — CV Generator Webhook
 * Receives POST requests from Spring Boot app, saves PDFs/LaTeX to Google Drive,
 * and logs CV generation history to Google Sheets.
 *
 * SETUP:
 * 1. Go to Google Sheets > create new spreadsheet (name it "CV Generation History")
 * 2. Copy the Spreadsheet ID from the URL (between /d/ and /edit)
 * 3. Open Extensions > Apps Script
 * 4. Paste this entire code
 * 5. Update SPREADSHEET_ID below with your Sheet ID
 * 6. Click Deploy > New Deployment > Web App
 *    - Execute as: Me
 *    - Who has access: Anyone
 * 7. Copy the web app URL
 * 8. In Render: add env var GOOGLE_SHEETS_WEBHOOK = <web app URL>
 *
 * @author Prasheek Kamble
 */

// ============================================================
// CONFIGURATION — UPDATE SPREADSHEET_ID WITH YOUR SHEET ID
// ============================================================
const FOLDER_ID = '1B5fAUjKD3AWkdpL3bSSLDzaQzwQu6jV2';  // GenCV folder
const SPREADSHEET_ID = '1UEKGmqFcJgY0dUR4oe5JlwzLgNlCuv06xyPz0Dhooqw';
const SHEET_NAME = 'Sheet1';

// Subfolder names (must match your Drive folder structure)
const PDF_FOLDER_NAME = 'Pdf Files';
const LATEX_FOLDER_NAME = 'Latex Files';

// ============================================================
// MAIN WEBHOOK HANDLER
// ============================================================
function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);

    // Save PDF to Drive > Pdf Files subfolder
    let pdfLink = '';
    if (data.pdfBase64) {
      pdfLink = savePdfToDrive(data);
    }

    // Save LaTeX to Drive > Latex Files subfolder
    let latexLink = '';
    if (data.latexContent) {
      latexLink = saveLatexToDrive(data);
    }

    // Log to Google Sheets
    logToSheet(data, pdfLink, latexLink);

    return ContentService.createTextOutput(JSON.stringify({
      status: 'ok',
      pdfLink: pdfLink,
      latexLink: latexLink
    })).setMimeType(ContentService.MimeType.JSON);

  } catch (error) {
    Logger.log('Error in doPost: ' + error.toString());
    return ContentService.createTextOutput(JSON.stringify({
      status: 'error',
      message: error.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

// ============================================================
// SAVE PDF TO GOOGLE DRIVE > "Pdf Files" SUBFOLDER
// ============================================================
function savePdfToDrive(data) {
  const parentFolder = DriveApp.getFolderById(FOLDER_ID);

  // Find existing "Pdf Files" subfolder
  let pdfFolder;
  const pdfFolders = parentFolder.getFoldersByName(PDF_FOLDER_NAME);
  if (pdfFolders.hasNext()) {
    pdfFolder = pdfFolders.next();
  } else {
    pdfFolder = parentFolder.createFolder(PDF_FOLDER_NAME);
  }

  const fileName = buildFileName(data, 'pdf');
  const decoded = Utilities.base64Decode(data.pdfBase64);
  const blob = Utilities.newBlob(decoded, 'application/pdf', fileName);
  const file = pdfFolder.createFile(blob);

  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return file.getUrl();
}

// ============================================================
// SAVE LATEX TO GOOGLE DRIVE > "Latex Files" SUBFOLDER
// ============================================================
function saveLatexToDrive(data) {
  const parentFolder = DriveApp.getFolderById(FOLDER_ID);

  // Find existing "Latex Files" subfolder
  let latexFolder;
  const latexFolders = parentFolder.getFoldersByName(LATEX_FOLDER_NAME);
  if (latexFolders.hasNext()) {
    latexFolder = latexFolders.next();
  } else {
    latexFolder = parentFolder.createFolder(LATEX_FOLDER_NAME);
  }

  const fileName = buildFileName(data, 'tex');
  const blob = Utilities.newBlob(data.latexContent, 'text/plain', fileName);
  const file = latexFolder.createFile(blob);

  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return file.getUrl();
}

// ============================================================
// BUILD FILE NAME
// ============================================================
function buildFileName(data, extension) {
  const date = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd_HHmm');
  const company = (data.companyName || 'Unknown').replace(/[^a-zA-Z0-9]/g, '_').substring(0, 30);
  const role = (data.jobTitle || 'Role').replace(/[^a-zA-Z0-9]/g, '_').substring(0, 30);
  return 'CV_' + company + '_' + role + '_' + date + '.' + extension;
}

// ============================================================
// LOG TO GOOGLE SHEETS
// Columns: Date | Company | Job Description | Match % | PDF Link | LaTeX Link | Skill Gaps | 7-Day Plan | 14-Day Plan | Interview Questions
// ============================================================
function logToSheet(data, pdfLink, latexLink) {
  const sheet = getOrCreateSheet();

  const coachBrief = parseCoachBrief(data.coachBrief);

  const row = [
    new Date(),                                          // A: Date
    data.companyName || '',                              // B: Company
    cleanJobDescription(data.jobDescription || ''),      // C: Job Description
    data.matchScore || '',                               // D: Match %
    pdfLink,                                             // E: PDF Link
    latexLink,                                           // F: LaTeX Link
    coachBrief.skillGaps,                                // G: Skill Gaps
    coachBrief.sevenDayPlan,                             // H: 7-Day Plan
    coachBrief.fourteenDayPlan,                          // I: 14-Day Plan
    coachBrief.interviewQuestions                         // J: Interview Questions
  ];

  sheet.appendRow(row);
  formatDataRow(sheet, sheet.getLastRow());
}

// ============================================================
// GET OR CREATE SHEET WITH HEADERS
// ============================================================
function getOrCreateSheet() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  let sheet = ss.getSheetByName(SHEET_NAME);

  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
  }

  // Check if headers exist
  if (sheet.getLastRow() === 0) {
    const headers = [
      'Date', 'Company', 'Job Description', 'Match %',
      'PDF Link', 'LaTeX Link', 'Skill Gaps',
      '7-Day Plan', '14-Day Plan', 'Interview Questions'
    ];
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);

    // Format headers
    const headerRange = sheet.getRange(1, 1, 1, headers.length);
    headerRange.setBackground('#1a73e8');
    headerRange.setFontColor('#ffffff');
    headerRange.setFontWeight('bold');
    headerRange.setHorizontalAlignment('center');

    // Set column widths
    sheet.setColumnWidth(1, 150);   // Date
    sheet.setColumnWidth(2, 150);   // Company
    sheet.setColumnWidth(3, 300);   // Job Description
    sheet.setColumnWidth(4, 80);    // Match %
    sheet.setColumnWidth(5, 200);   // PDF Link
    sheet.setColumnWidth(6, 200);   // LaTeX Link
    sheet.setColumnWidth(7, 250);   // Skill Gaps
    sheet.setColumnWidth(8, 250);   // 7-Day Plan
    sheet.setColumnWidth(9, 250);   // 14-Day Plan
    sheet.setColumnWidth(10, 250);  // Interview Questions

    // Freeze header row
    sheet.setFrozenRows(1);
  }

  return sheet;
}

// ============================================================
// FORMAT DATA ROW
// ============================================================
function formatDataRow(sheet, rowNum) {
  const range = sheet.getRange(rowNum, 1, 1, 10);

  // Alternate row colours
  if (rowNum % 2 === 0) {
    range.setBackground('#f8f9fa');
  } else {
    range.setBackground('#ffffff');
  }

  // Date column format
  sheet.getRange(rowNum, 1).setNumberFormat('yyyy-MM-dd HH:mm');

  // Wrap text for long columns
  sheet.getRange(rowNum, 3).setWrap(true);   // Job Description
  sheet.getRange(rowNum, 7).setWrap(true);   // Skill Gaps
  sheet.getRange(rowNum, 8).setWrap(true);   // 7-Day Plan
  sheet.getRange(rowNum, 9).setWrap(true);   // 14-Day Plan
  sheet.getRange(rowNum, 10).setWrap(true);  // Interview Questions
}

// ============================================================
// CLEAN JOB DESCRIPTION
// ============================================================
function cleanJobDescription(jd) {
  return jd
    .replace(/\s+/g, ' ')
    .trim()
    .substring(0, 500);
}

// ============================================================
// PARSE COACH BRIEF
// ============================================================
function parseCoachBrief(coachBrief) {
  const result = {
    skillGaps: '',
    sevenDayPlan: '',
    fourteenDayPlan: '',
    interviewQuestions: ''
  };

  if (!coachBrief) return result;

  try {
    const brief = typeof coachBrief === 'string' ? JSON.parse(coachBrief) : coachBrief;

    if (brief.skill_gaps && Array.isArray(brief.skill_gaps)) {
      result.skillGaps = brief.skill_gaps.join('\n');
    }

    if (brief.learning_roadmap) {
      if (brief.learning_roadmap['7_days']) {
        result.sevenDayPlan = brief.learning_roadmap['7_days'].join('\n');
      }
      if (brief.learning_roadmap['14_days']) {
        result.fourteenDayPlan = brief.learning_roadmap['14_days'].join('\n');
      }
    }

    if (brief.interview_questions && Array.isArray(brief.interview_questions)) {
      result.interviewQuestions = brief.interview_questions.join('\n');
    }
  } catch (e) {
    Logger.log('Error parsing coach brief: ' + e.toString());
  }

  return result;
}

// ============================================================
// TEST FUNCTION (run manually to verify setup)
// ============================================================
function testSetup() {
  // Test Drive access
  try {
    const folder = DriveApp.getFolderById(FOLDER_ID);
    Logger.log('✅ Drive folder found: ' + folder.getName());

    const pdfFolders = folder.getFoldersByName(PDF_FOLDER_NAME);
    Logger.log('✅ Pdf Files subfolder: ' + (pdfFolders.hasNext() ? 'Found' : 'Will be created'));

    const latexFolders = folder.getFoldersByName(LATEX_FOLDER_NAME);
    Logger.log('✅ Latex Files subfolder: ' + (latexFolders.hasNext() ? 'Found' : 'Will be created'));
  } catch (e) {
    Logger.log('❌ Drive error: ' + e.toString());
  }

  // Test Sheet access
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    Logger.log('✅ Spreadsheet found: ' + ss.getName());
  } catch (e) {
    Logger.log('❌ Sheet error: ' + e.toString());
  }
}
