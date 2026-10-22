# CLOSEISH V17.5 – frontend és szerveres előrehaladás

A frontend továbbra is teljesen statikus, telepítést/buildet nem igényel. A `config.js` a külön Railway API-ra mutat; az összes személyes napló a PostgreSQL-en van. A 30 másodperces óra a böngészőben működik, szerveres tick **nincs**.

- `GET /api/v1/today`: napi 6 kérdés, újrakérdezéskor HTTP ETag/cache revalidáció; semmilyen korábbi napi válaszbank nem kerül a frontendre.
- `GET /api/v1/progress?playerId=<uuid>&month=YYYY-MM`: a szerverről jön az aktuális nap hiteles állapota és a kiválasztott hónap történései. MY DAYS hónapváltáskor csak a szükséges hónap töltődik.
- `POST /api/v1/progress/start`: a kör elkezdésének egyszeri mentése, nincs gépelésenkénti szerverírás.
- `POST /api/v1/questions/:id/answer`: a szerver hitelesít, pontoz és a PostgreSQL-be ment, majd visszaküldi a rögzített választ. Az utolsó körnél `counted:true` esetén nincs szükség külön eredmény-POST-ra.
- A `closeish-player-v1` UUID helyi marad; csak a még nem szinkronizált `closeish-pending-v1` állapot és a be nem küldött aláírt eredmény (`closeish-statistics-v1`) kerül mellé. A SUGGEST felületen korábban is helyi, beküldés nélküli ötletek és vázlatok vannak – ezek nem részei a játékos-előrehaladásnak.
- Régi V17 helyi mentés esetén egy alkalommal megpróbálja importálni az érvényes, aláírt receipt-eket. A 72 óránál régebbi, nem ellenőrizhető mentést nem törli automatikusan. Régi, már beszámított eredmény a szerveren DONE állapotként látszik, de az összes részletes válasz nem feltétlenül állítható helyre.

A frontend V17.5-höz új backend és DB-migráció szükséges. Lásd a backend `docs/POSTGRES-PROGRESS-PERFORMANCE.md` fájlját. Éles DNS-/domainváltásnál a frontend `config.js` `apiBase`, az `index.html` CSP `connect-src`, valamint a backend `ALLOWED_ORIGINS` legyen összehangolva. A frontend beégetett `apiKey` csak nyilvános kliens-azonosító, nem titkos API kulcs.

**Tesztek:** `node tests/transport-outbox.mock.mjs`, `node tests/uuid-fallback.mock.mjs`. Opcionális böngészős integrációhoz Playwright és önálló backend szükséges (`tests/countdown.browser.mjs`).

## V17.5.1 – egyszeri napi diagram-lekérés

- A napi statisztikai diagram adatlekérése **egyszer** indul, a befejezett nap eredményképernyőjének első megjelenésekor. Ha a nap már meg van oldva az oldal betöltésekor, ugyanilyen egyszeri lekérés történik. Azoknál a régi, szerveren már beszámított napoknál is megjelenik a diagram, amelyek részletes válaszai nem állíthatók vissza.
- Nincs automatikus statisztika-lekérés 120 másodpercenként, hálózati visszakapcsolódáskor vagy az oldalra visszatéréskor. A még nem szinkronizált eredmények **feltöltése** továbbra is működik ezekben az esetekben, ez nem periodikus diagramlekérés.
- A megnyitott modális ablakok és az archívum nem hozzák létre újra a diagram SVG-jét. A statisztika-API egyetlen sikeres betöltése legfeljebb egyszer váltja le a diagram paneljét.
- A diagram a következő **teljes oldalbetöltéskor** újra lekérhető; nincs többperces automatikus frissítési ciklus. Nem kellett változtatni a Railway backenden vagy a PostgreSQL-sémán.
- Ellenőrzés: `python tests/chart-snapshot.browser.py` (Chromium + Python Playwright). Teszteli az első befejezést, a már kész nap újratöltését, a régi – válaszrészletek nélküli – befejezést, a modális ablakokat és a virtuálisan eltelt 125 másodpercet.
