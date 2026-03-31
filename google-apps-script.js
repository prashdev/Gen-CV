/**
 * Google Apps Script — CV Generator Webhook
 * Receives POST requests from Spring Boot app, saves PDFs/LaTeX to Google Drive,
 * and logs CV generation history to Google Sheets.
 *
 * SETUP:
 * 1. Create a Google Sheet (or use existing)
 * 2. Open Extensions > Apps Script
 * 3. Paste this code
 * 4. Update FOLDER_ID and SPREADSHEET_ID below
 * 5. Deploy as Web App (Execute as: Me, Access: Anyone)
 * 6. Copy the web app URL and set it as GOOGLE_SHEETS_WEBHOOK env var in Render
 *
 * @author Prasheek Kamble
 */

// ============================================================
// CONFIGURATION — UPDATE THESE WITH YOUR IDS
// ============================================================
const FOLDER_ID = 'YOUR_GOOGLE_DRIVE_FOLDER_ID';  // Parent folder for CV files
const SPREADSHEET_ID = 'YOUR_GOOGLE_SHEET_ID';     // Google Sheet for logging
const SHEET_NAME = 'CV History';

// ============================================================
// MAIN WEBHOOK HANDLER
// ============================================================
function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);

    // Save PDF to Drive
    let pdfLink = '';
    if (data.pdfBase64) {
      pdfLink = savePdfToDrive(data);
    }

    // Save LaTeX to Drive
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
// SAVE PDF TO GOOGLE DRIVE
// ============================================================
function savePdfToDrive(data) {
  const folder = DriveApp.getFolderById(FOLDER_ID);

  // Get or create PDF subfolder
  let pdfFolder;
  const pdfFolders = folder.getFoldersByName('pdf');
  if (pdfFolders.hasNext()) {
    pdfFolder = pdfFolders.next();
  } else {
    pdfFolder = folder.createFolder('pdf');
  }

  const fileName = buildFileName(data, 'pdf');
  const decoded = Utilities.base64Decode(data.pdfBase64);
  const blob = Utilities.newBlob(decoded, 'application/pdf', fileName);
  const file = pdfFolder.createFile(blob);

  // Make shareable
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return file.getUrl();
}

// ============================================================
// SAVE LATEX TO GOOGLE DRIVE
// ============================================================
function saveLatexToDrive(data) {
  const folder = DriveApp.getFolderById(FOLDER_ID);

  // Get or create LaTeX subfolder
  let latexFolder;
  const latexFolders = folder.getFoldersByName('latex');
  if (latexFolders.hasNext()) {
    latexFolder = latexFolders.next();
  } else {
    latexFolder = folder.createFolder('latex');
  }

  const fileName = buildFileName(data, 'tex');
  const blob = Utilities.newBlob(data.latexContent, 'text/plain', fileName);
  const file = latexFolder.createFile(blob);

  // Make shareable
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
// ============================================================
function logToSheet(data, pdfLink, latexLink) {
  const sheet = getOrCreateSheet();

  const coachBrief = parseCoachBrief(data.coachBrief);

  const row = [
    new Date(),                                          // Date
    data.companyName || '',                              // Company
    cleanJobDescription(data.jobDescription || ''),      // Job Description
    data.matchScore || '',                               // Match %
    pdfLink,                                             // PDF Link
    latexLink,                                           // LaTeX Link
    coachBrief.skillGaps,                                // Skill Gaps
    coachBrief.sevenDayPlan,                             // 7-Day Plan
    coachBrief.fourteenDayPlan,                          // 14-Day Plan
    coachBrief.interviewQuestions                         // Interview Questions
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

    // Add headers
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
    sheet.setColumnWidth(3, 300);   // JD
    sheet.setColumnWidth(4, 80);    // Match %
    sheet.setColumnWidth(5, 200);   // PDF Link
    sheet.setColumnWidth(6, 200);   // LaTeX Link
    sheet.setColumnWidth(7, 250);   // Skill Gaps
    sheet.setColumnWidth(8, 250);   // 7-Day
    sheet.setColumnWidth(9, 250);   // 14-Day
    sheet.setColumnWidth(10, 250);  // Interview

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
  sheet.getRange(rowNum, 1).setNumberFormat('dd-MMM-yyyy HH:mm');

  // Wrap text for long columns
  sheet.getRange(rowNum, 3).setWrap(true);  // JD
  sheet.getRange(rowNum, 7).setWrap(true);  // Skill Gaps
  sheet.getRange(rowNum, 8).setWrap(true);  // 7-Day
  sheet.getRange(rowNum, 9).setWrap(true);  // 14-Day
  sheet.getRange(rowNum, 10).setWrap(true); // Interview
}

// ============================================================
// CLEAN JOB DESCRIPTION
// ============================================================
function cleanJobDescription(jd) {
  return jd
    .replace(/\s+/g, ' ')
    .trim()
    .substring(0, 500);  // Limit to 500 chars in sheet
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
