/**
 * UB2026 check-in + GPS position backend (Google Apps Script Web App).
 *
 * TELEPÍTÉS:
 * 1. Nyisd meg a Google Sheetedet (azt amiben az UB2025 és Váltás tabok vannak).
 * 2. Menü: Bővítmények → Apps Script (vagy Extensions → Apps Script).
 * 3. Töröld a `function myFunction()` placeholder-t, és illeszd be ezt a teljes fájlt.
 * 4. Mentés (floppy ikon), név adása: pl. "UB2026 Checkins".
 * 5. Deploy (jobb felső) → New deployment → Type: Web app.
 *      - Description: "UB2026 checkins v2"
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
 * Séma:
 *   "Checkins" tab: waypoint | datetime | runner | submitted_ts
 *   "Positions" tab: runner | lat | lon | acc | submitted_ts  (max 7 sor, upsert)
 *
 * doGet visszaad: { checkins: { wp: {datetime, runner, ts} }, positions: { runner: {lat, lon, acc, ts} } }
 * doPost:
 *   type == 'position' → upsert a Positions tabban
 *   egyéb (check-in)   → append a Checkins tabban
 */

const SHEET_NAME = 'Checkins';
const HEADERS = ['waypoint', 'datetime', 'runner', 'submitted_ts'];

const POS_SHEET_NAME = 'Positions';
const POS_HEADERS = ['runner', 'lat', 'lon', 'acc', 'submitted_ts'];

const RACE_DATE = [2026, 3, 25]; // JS hónap 0-indexelt: április = 3

// ── Sheet helpers ──────────────────────────────────────────────────────────

function getSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(SHEET_NAME);
  if (!sh) {
    sh = ss.insertSheet(SHEET_NAME);
    sh.appendRow(HEADERS);
    sh.setFrozenRows(1);
  }
  sh.getRange('B:B').setNumberFormat('@');
  return sh;
}

function getPosSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(POS_SHEET_NAME);
  if (!sh) {
    sh = ss.insertSheet(POS_SHEET_NAME);
    sh.appendRow(POS_HEADERS);
    sh.setFrozenRows(1);
  }
  return sh;
}

// ── Datetime util ──────────────────────────────────────────────────────────

// Bármilyen bemenetet (Date, ISO string, HH:MM) ISO datetime stringgé alakít.
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
  if (/^\d{4}-\d{2}-\d{2}T/.test(s)) return s;
  const m = s.match(/^(\d{1,2}):(\d{2})/);
  if (m) {
    const hh = parseInt(m[1], 10);
    const mm = parseInt(m[2], 10);
    const d = new Date(RACE_DATE[0], RACE_DATE[1], RACE_DATE[2], hh, mm, 0);
    return d.toISOString();
  }
  return s;
}

// ── Map builders ───────────────────────────────────────────────────────────

function buildCheckinMap_() {
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
  return map;
}

function buildPositionMap_() {
  const sh = getPosSheet_();
  const values = sh.getDataRange().getValues();
  const map = {};
  for (let i = 1; i < values.length; i++) {
    const runner = String(values[i][0] || '').trim();
    if (!runner) continue;
    const lat = parseFloat(values[i][1]);
    const lon = parseFloat(values[i][2]);
    const acc = parseFloat(values[i][3]);
    const ts = values[i][4];
    if (isNaN(lat) || isNaN(lon)) continue;
    map[runner] = {
      lat: lat,
      lon: lon,
      acc: isNaN(acc) ? null : acc,
      ts: (ts instanceof Date) ? ts.toISOString() : String(ts || '')
    };
  }
  return map;
}

// ── Upsert position ────────────────────────────────────────────────────────

function upsertPosition_(runner, lat, lon, acc) {
  const sh = getPosSheet_();
  const values = sh.getDataRange().getValues();
  const now = new Date().toISOString();
  for (let i = 1; i < values.length; i++) {
    if (String(values[i][0] || '').trim() === runner) {
      sh.getRange(i + 1, 1, 1, 5).setValues([[runner, lat, lon, acc, now]]);
      return;
    }
  }
  sh.appendRow([runner, lat, lon, acc, now]);
}

// ── HTTP handlers ──────────────────────────────────────────────────────────

function doGet(e) {
  try {
    const result = {
      checkins: buildCheckinMap_(),
      positions: buildPositionMap_()
    };
    return ContentService
      .createTextOutput(JSON.stringify(result))
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

    if (body.type === 'position') {
      const runner = String(body.runner || '').trim();
      const lat = parseFloat(body.lat);
      const lon = parseFloat(body.lon);
      const acc = body.acc !== undefined ? parseFloat(body.acc) : null;
      if (!runner) throw new Error('runner kötelező');
      if (isNaN(lat) || isNaN(lon)) throw new Error('érvénytelen koordináta');
      upsertPosition_(runner, lat, lon, acc);
      return ContentService
        .createTextOutput(JSON.stringify({ ok: true, type: 'position', runner: runner }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    // Check-in
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
