# CLOSEISH V17.5 – statikus frontend PostgreSQL-előrehaladással

A csomag csak a statikus weboldalt tartalmazza; sem a napi teljes válaszkatalógus, sem a pontozás, sem a PostgreSQL elérés nem található benne. **Nincs kötelező `npm install`, nincs buildlépés**: töltsd fel a statikus fájlokat a webtárhely gyökerébe.

## Fontos: közös V17.7 telepítés

A frontendnek a **V17.7 backendhez és az 001–004 SQL-migrációihoz** kell kapcsolódnia. A régi V17.6 backenddel már nem működik a kezdő állapot lekérése. Előbb a backend-migráció és az új API kerüljön élesbe, utána a statikus frontend. A részletes folyamat: `README-V17.5-POSTGRES.md`, illetve a backend csomag `docs/POSTGRES-PROGRESS-PERFORMANCE.md`.

## Konfiguráció

`config.js`:

```js
window.CLOSEISH_CONFIG = {
  apiBase: 'https://closeish-production.up.railway.app',
  apiKey: ''
};
```

A végleges domainhez állítsd be a backend `ALLOWED_ORIGINS` pontos értékét, és az `index.html` CSP `connect-src` originjét is. Az API-kulcs ide írva **nem titkos**; erős backend titkok és adatbázisjelszavak soha nem kerülhetnek frontendbe. Az API-hoz HTTPS szükséges.

## Tárolás

A PostgreSQL az igazság forrása az összes hitelesen elküldött válasz, aktuális állapot, végleges eredmény és archívumnap vonatkozásában. A böngésző csak a játékos UUID-ját (`closeish-player-v1`), a **folyamatban lévő, még nem feltétlenül szinkronizált** kör állapotát (`closeish-pending-v1`) és az esetleg el nem küldött végső eredmény várólistáját (`closeish-statistics-v1`) őrzi. A *SUGGEST* funkció továbbra is helyi, beküldés nélküli jegyzetfüzetet használ.

A V17.7 dátumváltása miatt a régi `closeish-progress-v2` rekordok már nem tölthetők fel biztonságosan ugyanahhoz a dátumhoz; a szerveres eredményeket a 004-es migráció rendezi át. A régi böngészős rekordokat a frontend nem tekinti hiteles előrehaladásnak, de nem is törli automatikusan. Sikeres migráció után eltávolítja; a nem ellenőrizhető történeti adatot nem törli automatikusan. Már korábban beszámított eredmények szerveroldalról befejezettnek számítanak, és soha nem játszhatók újra.

## Gyorsítás

A `/api/v1/today` nyilvános tartalmát a böngésző HTTP-cache/ETag kezelése revalidálja; a játék JSON-je nem kerül a localStorage-ba. Az öt további JavaScript párhuzamosan töltődik, de helyes végrehajtási sorrendben fut le. Az időzítő abszolút határidő alapján a böngészőben működik; nincs másodpercenkénti API-kérés. Az aktív kör indulása külön szerver-mérföldkő, a gépelés nem ír az adatbázisba. A napi statisztikák ritkábban frissülnek.

## Lokális fejlesztés

A külön backend projektben fejlesztői memória-tárral indítsd a Node szervert (nem éles adat!), majd ebben a könyvtárban:

```sh
npm run dev
```

A statikus dev proxy alapból `http://127.0.0.1:3000` API-ra mutat. Lokális proxyteszthez állítsd a `config.js` `apiBase` értékét ideiglenesen üres stringre (`''`), máskülönben a böngésző közvetlenül az éles Railway API-t hívja. Teszt után állítsd vissza az éles konfigurációt.

## Tesztelés

```sh
node --check api.js
node --check game.js
node --check statistics-client.js
node tests/transport-outbox.mock.mjs
node tests/uuid-fallback.mock.mjs
```

A Playwright-es teljes kör/újratöltés tesztje a külön backenddel: `tests/countdown.browser.mjs`. A böngészős tesztet a telepítési környezetben is el kell végezni. A 150 ezer játékos/nap terhelés külön load testtel igazolandó.


## V17.6: korábbi napok lejátszása

Az ARCHIVE naptárban a korábbi közzétett napok is megnyithatók. A kiválasztott nap `?day=YYYY-MM-DD` URL-en nyílik meg. A backend a mai vagy korábbi scheduled naphoz enged új játékot, ugyanarra a napra ugyanannak a játékosnak csak egy futása lehet; az eredmény az eredeti napi statisztikát növeli. **A V17.6 frontendhez V17.6 backend is kell.** Az előző PostgreSQL migrációk érvényesek; új migráció nincs.

## V17.7 – ARCHIVE, metrikus mértékegységek, indulás október 23-án

Az új kezelőfelületen mindenhol ARCHIVE szerepel. A nyitónap 2026-10-23, első kihívás #001. A backend dátumait és adatbázis-migrációját lásd: `docs/LAUNCH-2026-10-23.md` a V17.7 backend ZIP-jében. A hét napi kérdéscsomag 2026-10-23–29 között jelenik meg.
