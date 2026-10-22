# CLOSEISH – statikus frontend V17.3 / Railway API

A csomag **csak a frontend**: sem a napi válaszlisták, sem a pontozási algoritmus, sem az adatbázis nem található benne. Nincs npm-függőség és buildlépés.

## Éles publikálás

Másold a webtárhely gyökerébe ezeket: `index.html`, `favicon.svg`, `style.css`, `config.js`, `api.js`, `view-core.js`, `community.js`, `score-chart.js`, `statistics-client.js`, `game.js`. A `_headers` fájlt is másold át, ha a tárhely támogatja az ilyen formátumú válaszfejléceket.

A `config.js` alapértelmezetten a Railway API-ra mutat:

```js
window.CLOSEISH_CONFIG = {
  apiBase: 'https://closeish-production.up.railway.app',
  apiKey: ''
};
```

Az `apiBase` origin, nincs a végén `/`. Ugyanazon originen működő `/api/` reverse proxy használatakor az `apiBase` legyen `''`. Ha a backend `API_KEYS` konfigurációt igényel, az **egyébként nyilvánosan látható** `apiKey` megadható, ekkor minden `/api/` kéréshez automatikusan elküldi az `X-API-Key` fejlécet. Ez nem titok, és nem jelent valódi klienshitelesítést. A backend `SIGNING_SECRET`, adatbázis kapcsolati adat és egyéb titok soha nem kerülhet a frontendbe.

A **cross-origin** ETag és `Retry-After` fejlécek JavaScriptből való kiolvasásához a backendnek `Access-Control-Expose-Headers: ETag, Retry-After` fejlécet is vissza kell adnia. Ellenkező esetben az ETag optimalizáció nem működik, a 429-es hibánál pedig a frontend csak óvatos alapértelmezett késleltetést tud alkalmazni. Az `X-API-Key` bekapcsolásakor a CORS preflight `Access-Control-Allow-Headers` listája is engedje ezt a fejlécet.

A backend `ALLOWED_ORIGINS` tartalmazza pontosan a `https://closeish.eu` értéket (záró perjel nélkül). Az `index.html` már tartalmazza a `connect-src 'self' https://closeish-production.up.railway.app` CSP-szabályt; ha a tárhely CSP-fejlécet is küld, az ne írja felül ellentmondásosan.

**Cache:** az `/api/` útvonalakat a CDN, reverse proxy és statikus hosting ne cache-elje (`Cache-Control: no-store`). `index.html` és `config.js`: `no-cache, max-age=0, must-revalidate` vagy szigorúbb. A frontend a napi válasz JSON-t kizárólag a helyi böngészőben tartja meg az ETag/`If-None-Match` → `304` esetére. A script- és CSS-URL-ek verziózottak. A `_headers` csak néhány statikus hoston automatikus; más platformon a szabályokat külön kell megadni.

## Helyi futtatás

Telepítés nélkül:

```sh
npm run dev
```

Megnyitás: `http://localhost:5173`. Node.js szükséges. A `scripts/dev.mjs` csak helyi webszerver, a `/api/` kéréseket alapból a `http://127.0.0.1:3000` címen futó **külön backendhez** proxyzza. `API_PROXY_TARGET` változóval a cél megváltoztatható. Mivel a `config.js` éles Railway-originre mutat, **helyi proxyzáshoz állítsd át átmenetileg `apiBase: ''`-re** (vagy a Railway `ALLOWED_ORIGINS` listába vedd fel a helyi címet a közvetlen API-eléréshez). Ez nem módosítja az éles csomag konfigurációját, hacsak a módosított fájlt nem töltöd fel.

## Működési szerződés

- `GET /api/v1/today` adja az adott Europe/Budapest nap hat kérdését; `available:false` esetén nem kérünk másik napot.
- A `playerId` egyszeri UUID v4, a `runId` új futásonként új UUID v4 a `localStorage`-ban. Ha `crypto.randomUUID()` HTTP alatt nem elérhető, a frontend a `crypto.getRandomValues()` biztonságos véletlenértékeiből állítja elő ugyanazt az UUID v4 formátumot (nem használ `Math.random()`-ot). Az éles oldalnak ettől függetlenül HTTPS-en kell működnie, különben a Railway `ALLOWED_ORIGINS=https://closeish.eu` szabálya a HTTP-oldal API-kéréseit elutasítja.
- A válaszokat (vagy skip/timeout állapotot) külön `POST /api/v1/questions/:id/answer` pontozza; a kliens nem küld pontszámot, hanem eltárolja a szervertől kapott aláírt receiptet.
- Hat receiptből készül a `POST /api/v1/results` tartós, újraküldhető várólistája. Hálózati hibánál, 429-nél, 503-nál nem feltételezünk sikert; 400-nál véglegesen eltávolítjuk a sorból, és megtartjuk a helyi futást. A 72 órás igazolás-érvényességet a backend vizsgálja.
- A statisztikai pontértékeket és a `betterThanPercent` mezőt a backend szolgáltatja. A hisztogram 0–7200 között 200 pontos lépésekben, mind a 37 pontos értékkel jelenik meg; a görbe csak vizuálisan simított. A kliens nem számolja újra a százalékot.
- A 30 másodperces időzítő **csak a böngészőben fut**: abszolút határidő helyi tárolással, nincs szerveres másodperc-tick, nincs WebSocket. Az időzítő frissítés után sem indul újra.
- Az archivált, V16-os *aláíratlan* eredmény nem hivatalos. Régi napot nem pontozunk újra. A böngészőnkénti azonosító nem csalásbiztos felhasználói rangsor.
- A korábban befejezett helyi futásról külön eredeti pillanatkép marad a napi gyakorló újrajátszások esetén is. A személyes adatok és eredmények a böngésző eredetén belül maradnak; domainváltás vagy tárolástörlés esetén nem szinkronizálódnak automatikusan.

## Tesztelés

```sh
node --check api.js
node --check game.js
node --check statistics-client.js
```

Telepítést nem igénylő mockolt API-/várólista-teszt:

```sh
node tests/transport-outbox.mock.mjs
node tests/uuid-fallback.mock.mjs
```

Opcionális böngészős interakciós teszt (Python Playwright + Chromium szükséges; a teszt közvetlenül `about:blank` oldalba tölti a UI-szkripteket, így nem küld valós API-kérést):

```sh
python tests/ui.mock.py
```

A `tests/countdown.browser.mjs` opcionális Playwright-futtatásához a külön backend és Playwright szükséges; a csomag nem telepít függőségeket automatikusan.
