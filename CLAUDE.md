# UB2026 – Projekt kontextus Claude-nak

## Mi ez
NN Ultrabalaton 2026 – 7 fős csapatverseny webes csapattérkép (Leaflet + vanilla JS, egy fájl).
- **Verseny**: 2026-04-25 szombat, rajt 02:05, várható finish 23:29, ~208 km Balaton körül.
- **Deploy**: GitHub Pages – https://leventesulyok.github.io/ub2026/ (repo: leventesulyok/ub2026).
- **Adatforrás**: két published CSV egy Google Sheetből – `CSV_UB25` (futók) és `CSV_VALTAS` (váltási terv). `fetchAndRender()` 15s-ként pollozza.
- **Check-in backend**: Google Apps Script Web App (`gas-checkins.js`) ugyanabban a Sheet-ben. URL-t a `CHECKIN_URL` konstansba kell kézzel beírni (egyszeri setup).

## A 7 futó
Levi, Réka, Tomi, Csenge, Bende, Kíra, Patrik. Pace és szín a `C` és Sheet szerint.

## Architektúra (fontos!)
- **Minden egy fájl**: `index.html` (~1000+ sor, no build, no deps). Ne hozz létre új fájlokat ok nélkül.
- **Kritikus**: `index.html` 3 sora óriási (JSON adatok inline-ban), a `Read` tool 25K token limitje miatt nem olvasható egyben:
  - `sor 197` = `const S=[…]` (szakaszok, ~60K char)
  - `sor 198` = `const W=[…]` (váltópontok, ~35K char)
  - `sor 199` = `const AT={…}` (AllTrails URL-ek, ~10K char)
  - **Workaround**: `awk 'NR==198' index.html | head -c 2500` vagy részletekben `Read` + `offset`/`limit`, kihagyva a 3 nagy sort. Ne próbáld az egész fájlt egyben olvasni.
- **Lokátor grep**: `Grep -n '^(function|const|let) |function …'` megadja a függvények sorszámát.

## Fő függvények (index.html) – hol keresd
- `parseCSV`, `applyUB25`, `applyValtas`: CSV → W[] és S[] adatstruktúrába.
- `fetchAndRender`: 15s-ként CSV + weather + check-in fetch, majd render.
- `buildMap` (egyszer) / `updateMapData` (frissítéskor): Leaflet markerek és popup HTML.
- `buildWpHtml(wp, i)`: waypoint popup HTML – itt van az érkezés badge, check-in gomb.
- `makeWpIcon(wp)`: marker ikon generátor, `buildMap` és `updateMapData` is ezt hívja.
- `applyCheckins()`: effektív delta propagáció (d_m = C_m − P_m ha van check-in, különben d_{m−1}).
- `updateHeaderProgress`, `updateHeaderDelta`, `updateNowRunning`, `updateActiveSegments`: fejléc és aktív szakaszok.

## Waypoint és szegmens séma (röviden)
- `W` elemek: `{ name, lat, lon, special, finish, arrival, arrivals[], departures[], relay, relay_time, sofor, kocsi, kocsi2, _szallas, _indulas, _autoidő, runner_change, is_relay_white, light }`
- `W.length === 59` (W[0] = rajt "Balatonfüred versenyközpont", W[58] = finish ugyanoda visszatérve). 58 check-in pont = minden W kivéve W[0].
- `S` elemek: `{ runner, from, to, coords[], km, dplus, dminus, pace, phase, time_from, time_to }`
- Check-in után `applyCheckins` mutálja `wp.arrival`-t és `seg.time_from/time_to`-t; az eredeti `_plannedArrival` mezőbe kerül.

## localStorage kulcsok
`ub26_csv_ub25`, `ub26_csv_valtas`, `ub26_csv_ts` (CSV offline cache), `ub26_checkins` (check-in cache), `ub26_active_runner` (ki vagy).

## Check-in szemantika (fázis 1+2)
- Minden 58 váltóponton lehet check-inelni. A check-in az aktuális órai idő (HH:MM), szerkeszthetetlen.
- A 7 futó közül kell választani (név-választó a fejlécben, localStorage-ba mentve).
- Minden váltóponton forward-propagál a delta: `d_m = C_m − P_m` ha van check-in, egyébként `d_{m−1}`. Korábbi szakaszok NEM változnak.
- Visszavonás: check-in törlésével a waypointtól újra a megelőző check-in delta-ját örökli (vagy 0 ha nincs).
- Eredeti tervezett idő zárójelben marad látható, ha delta ≠ 0.
- Webhook: optimista lokális update, majd POST. Következő 15s pollon minden eszköz konvergál.

## Tipikus gotchák (ne fuss bele újra)
- Dátum: **2026-04-25** (nem 05-08 – régi bug volt, javítva).
- Idő parse: `"2:05:00"` → `.slice(0,5)` = `"2:05:"` ROSSZ. Használd: `.split(':').slice(0,2).join(':')`.
- Apps Script CORS: csak `Content-Type: text/plain;charset=utf-8` működik cross-origin POST-hoz (preflight nélkül). `application/json` NEM jó.
- `applyUB25` minden cikluson felülírja `wp.arrival`-t, tehát a delta-t minden ciklusban újra kell alkalmazni (ne tárold az effektív értéket tartósan).
- A `finish` (W[58]) is check-in pont a user kérésére.

## Munkamódszer, user preferenciák
- **Nyelv**: magyarul kommunikálunk.
- **Előtte érts meg, utána javíts**: a user több mint egyszer mondta "nehogy elrontsd ami jó". Bugfix előtt olvass kódot.
- **Commit/push**: a user MAGA pusholja git-et, én ne kezdeményezzek push-t kérés nélkül. `gh` CLI telepítve és auth-olva.
- **Ne hozz létre felesleges fájlokat** (README, doc stb.) – ha kell, mondja. Kivétel: `CLAUDE.md` (ez) és `gas-checkins.js` (Apps Script deploy).
- **Tokenspórolás**: a CSV sor-lookupoknál ne olvasd be az egész Sheet-et; a nagy inline adatsorokat awk-kal chunkban olvasd.
