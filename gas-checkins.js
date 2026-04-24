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
const HEADERS = ['waypoint', 'datetime', 'runner', 'submitted_ts'];
const RACE_DATE = [2026, 3, 25]; // JS hónap 0-indexelt: április = 3

function getSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(SHEET_NAME);
  if (!sh) {
    sh = ss.insertSheet(SHEET_NAME);
    sh.appendRow(HEADERS);
    sh.setFrozenRows(1);
  }
  // A datetime oszlop (B) plain text, hogy a sheet ne konvertálja Date-té.
  sh.getRange('B:B').setNumberFormat('@');
  return sh;
}

// Bármilyen bemenetet (Date, ISO string, HH:MM) ISO datetime stringgé alakít.
// Ha HH:MM jön (legacy), a verseny napjához rendeljük.
// Ha 1899-es Date (régi sheet epoch bug), az órát/percet átemeljük a versenynapra.
function toIso_(v) {
  if (v === '' || v === null || v === undefined) return '';
  if (v instanceof Date) {
    const y = v.getFullYear();
    if (y < 1950) {
      const d = new Date(RACE_DATE[0], RACE_DATE[1], RACE_DATE[2], v.getHours(), v.getMinutes(), v.getSeconds());
      return d.toISOString();
    }
    return v.toISOString();
  }
  const s = String(v).trim();
  if (!s) return '';
  // ISO datetime?
  if (/^\d{4}-\d{2}-\d{2}T/.test(s)) return s;
  // HH:MM legacy
  const m = s.match(/^(\d{1,2}):(\d{2})/);
  if (m) {
    const hh = parseInt(m[1], 10);
    const mm = parseInt(m[2], 10);
    const d = new Date(RACE_DATE[0], RACE_DATE[1], RACE_DATE[2], hh, mm, 0);
    return d.toISOString();
  }
  return s;
}

function doGet(e) {
  try {
    const sh = getSheet_();
    const values = sh.getDataRange().getValues();
    const map = {};
    for (let i = 1; i < values.length; i++) {
      const wp = String(values[i][0] || '').trim();
      const datetime = toIso_(values[i][1]);
      const runner = String(values[i][2] || '').trim();
      const ts = values[i][3];
      if (!wp) continue;
      if (!datetime) {
        delete map[wp];
      } else {
        map[wp] = {
          datetime: datetime,
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
    const raw = (body.datetime === null || body.datetime === undefined) ? '' : String(body.datetime).trim();
    const runner = String(body.runner || '').trim();
    if (!wp) throw new Error('waypoint kötelező');
    if (raw && !/^\d{4}-\d{2}-\d{2}T/.test(raw) && !/^\d{1,2}:\d{2}$/.test(raw)) {
      throw new Error('érvénytelen datetime formátum');
    }
    const sh = getSheet_();
    sh.appendRow([wp, raw, runner, new Date().toISOString()]);
    return ContentService
      .createTextOutput(JSON.stringify({ ok: true, waypoint: wp, datetime: raw, runner: runner }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ ok: false, error: String(err) }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}
