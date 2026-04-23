/**
 * UB2026 check-in backend (Google Apps Script Web App).
 *
 * TELEPÍTÉS:
 * 1. Nyisd meg a Google Sheetedet (azt amiben az UB2025 és Váltás tabok vannak).
 * 2. Menü: Bővítmények → Apps Script (vagy Extensions → Apps Script).
 * 3. Töröld a `function myFunction()` placeholder-t, és illeszd be ezt a teljes fájlt.
 * 4. Mentés (floppy ikon), név adása: pl. "UB2026 Checkins".
 * 5. Deploy (jobb felső) → New deployment → Type: Web app.
 *      - Description: "UB2026 checkins v1"
 *      - Execute as:   Me (a saját Google fiókod)
 *      - Who has access: Anyone
 *    → Deploy → (engedélyek elfogadása).
 * 6. Másold ki a kapott Web App URL-t (pl. https://script.google.com/macros/s/AKfy.../exec).
 * 7. Nyisd meg index.html-t, és a `const CHECKIN_URL = '';` sorba illeszd be az URL-t.
 * 8. Commit + push → GitHub Pages frissül → működik az összes eszközön.
 *
 * Ha később módosítod a kódot, mindig "Manage deployments → szerkeszt → New version"-nel
 * deployolj, hogy az URL ne változzon.
 *
 * Séma: a "Checkins" tab automatikusan létrejön 4 oszloppal:
 *   waypoint | time(HH:MM vagy üres=visszavonás) | runner | timestamp(ISO)
 *
 * Minden check-in (és visszavonás) új sor, append-only. A doGet a legutolsó
 * esemény alapján építi a waypoint→time map-et. Üres time = törlés.
 */

const SHEET_NAME = 'Checkins';
const HEADERS = ['waypoint', 'time', 'runner', 'timestamp'];

function getSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(SHEET_NAME);
  if (!sh) {
    sh = ss.insertSheet(SHEET_NAME);
    sh.appendRow(HEADERS);
    sh.setFrozenRows(1);
  }
  return sh;
}

function doGet(e) {
  try {
    const sh = getSheet_();
    const values = sh.getDataRange().getValues();
    const map = {};
    for (let i = 1; i < values.length; i++) {
      const wp = String(values[i][0] || '').trim();
      const time = values[i][1];
      const runner = String(values[i][2] || '').trim();
      const ts = values[i][3];
      if (!wp) continue;
      if (time === '' || time === null || time === undefined) {
        delete map[wp];
      } else {
        map[wp] = {
          time: String(time),
          runner: runner,
          ts: (ts instanceof Date) ? ts.toISOString() : String(ts || '')
        };
      }
    }
    return ContentService
      .createTextOutput(JSON.stringify(map))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ error: String(err) }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    const wp = String(body.waypoint || '').trim();
    const time = (body.time === null || body.time === undefined) ? '' : String(body.time).trim();
    const runner = String(body.runner || '').trim();
    if (!wp) throw new Error('waypoint kötelező');
    if (time && !/^\d{1,2}:\d{2}$/.test(time)) throw new Error('érvénytelen időformátum');
    const sh = getSheet_();
    sh.appendRow([wp, time, runner, new Date().toISOString()]);
    return ContentService
      .createTextOutput(JSON.stringify({ ok: true, waypoint: wp, time: time, runner: runner }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ ok: false, error: String(err) }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}
