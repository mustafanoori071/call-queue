/**
 * Call Queue — Google Apps Script write-back
 *
 * Setup:
 * 1. Open your team sheet → Extensions → Apps Script
 * 2. Paste this file, save
 * 3. Deploy → New deployment → Web app
 *    - Execute as: Me
 *    - Who has access: Anyone
 * 4. Copy the deployment URL into Vercel as SHEET_WRITE_URL
 *
 * Sheet columns expected:
 * - Status (required) — written on each call outcome
 * - Called By (optional) — team member name from the app
 * - Notes (optional) — call note appended if present
 */

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    const row = Number(body.row);
    const status = String(body.status || "").trim();
    const calledBy = String(body.calledBy || "").trim();
    const note = String(body.note || "").trim();

    if (!row || row < 2 || !status) {
      return jsonResponse({ ok: false, error: "row (>=2) and status are required" }, 400);
    }

    const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];

    const statusCol = findColumn(headers, ["status"]);
    const calledByCol = findColumn(headers, ["called by", "caller", "called_by"]);
    const notesCol = findColumn(headers, ["notes", "note", "comments"]);

    if (!statusCol) {
      return jsonResponse({ ok: false, error: "Status column not found in row 1" }, 400);
    }

    sheet.getRange(row, statusCol).setValue(status);

    if (calledBy && calledByCol) {
      sheet.getRange(row, calledByCol).setValue(calledBy);
    }

    if (note && notesCol) {
      const cell = sheet.getRange(row, notesCol);
      const existing = String(cell.getValue() || "").trim();
      const stamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "M/d HH:mm");
      const line = calledBy
        ? `[${stamp} · ${calledBy}] ${note}`
        : `[${stamp}] ${note}`;
      cell.setValue(existing ? `${existing}\n${line}` : line);
    }

    return jsonResponse({ ok: true, row, status });
  } catch (err) {
    return jsonResponse({ ok: false, error: String(err) }, 500);
  }
}

function doGet() {
  return jsonResponse({ ok: true, service: "call-queue-write" });
}

function findColumn(headers, names) {
  const lower = headers.map(function (h) {
    return String(h || "").toLowerCase().trim();
  });
  for (var i = 0; i < names.length; i++) {
    var idx = lower.indexOf(names[i]);
    if (idx !== -1) return idx + 1;
  }
  for (var j = 0; j < lower.length; j++) {
    for (var k = 0; k < names.length; k++) {
      if (lower[j].indexOf(names[k]) !== -1) return j + 1;
    }
  }
  return 0;
}

function jsonResponse(obj, code) {
  var output = ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(
    ContentService.MimeType.JSON
  );
  // Apps Script web apps don't expose HTTP status codes to clients reliably;
  // the JSON body carries success/failure.
  return output;
}
