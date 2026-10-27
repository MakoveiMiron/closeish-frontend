## V18.4 – kompakt eredményképernyő és teljes ponttáblázat

- Sikeres eredménymentésnél a zöld `RESULT COUNTED ON THE SERVER` sáv nem jelenik meg. A mentésellenőrzés továbbra is fut, és sikertelen vagy függő rögzítésnél a figyelmeztetés megmarad.
- `VIEW EXACT SCORE COUNTS`: a 0–7200 között elérhető összes lehetséges pontszám (37 érték, 200 pontos lépcsőkkel) egyszerre látszik, több, egymás melletti SCORE / PLAYERS oszlopcsoportban, a táblázaton belüli görgetés nélkül.
- A táblázatcsoportok száma a képernyő méretéhez igazodik; nyitott ablak átméretezésekor is újrarendeződnek.
- Az eredményadatok nem változnak, a frontend továbbra is a backend által küldött histogramot jeleníti meg, a görbe/stat-API működése és a V18.3 mobilos billentyűzetes nézet változatlan.

---

## V18.1 – hibás kezdőképernyő-felvillanás javítása

- Az első betöltés **állapotfüggő**: ha az adott napon még biztosan nem indult játék, továbbra is azonnal megjelenik a kezdőképernyő, miközben az API-hívások párhuzamosan futnak.
- Korábban megkezdett vagy befejezett játék esetén a szerveres állapot ellenőrzéséig egy semleges „Restoring your game…” képernyő jelenik meg. A statikus HTML kezdőképernyője ilyenkor már a **legelső megjelenítés előtt** el van rejtve; nem villan fel grafikonról, kérdésről vagy eredményoldalról frissítéskor.
- A szerver válasza alapján közvetlenül a megfelelő kérdés/reveal/eredmény nézet kerül a képernyőre. A visszaszámlálás és a pontozás nem változott, a görbe továbbra sem pollol a háttérben.
- Régebbi frontendről érkező azonosított látogatóknál, amikor még nincs helyi megjelenítési jelzés, a biztonságos visszatöltés élvez elsőbbséget. Ha a szerver megerősíti, hogy az adott nap még nem kezdődött el, a következő betöltés már azonnali kezdőképernyőt kaphat.
- A `closeish-first-screen-v1` böngészős kulcs **kizárólag a betöltési nézetet** jegyzi meg dátumonként, legfeljebb 90 napig; nem tartalmaz kérdést, választ, pontszámot vagy hiteles előrehaladást. Az adatbázis marad a hiteles forrás.
- Ha a visszatöltés sikertelen, a betöltési képernyőn jelenik meg a hiba és a TRY AGAIN, nem vált vissza hirtelen a kezdőoldalra. Új backend-migráció nem szükséges.

Ellenőrzés: `python tests/restore-first-paint.browser.py` (Chromium + Playwright), `python tests/instant-start.browser.py`, `node --test tests/*.mock.mjs`.

---

## V18.0 – inkognitóablak eredményének beszámítása

- A hatodik válasz után a frontend azonnal sorba állítja a szerver által aláírt eredményt, ha az answer API nem jelzett `counted: true` értéket. Nem kell megvárni a NEXT gombot vagy a diagram megnyitását.
- Ha a szerver `counted: true` választ adott, a diagram első megjelenésekor az API-tól ellenőrzi a hivatalos státuszt. Ha nincs hivatalos eredmény, az aláírt válaszokkal egyszer megkísérli a tartalék beküldést. Az egyébként beszámított eredményt nem POST-olja újra.
- A sikeres eredményrögzítést a szerver visszaigazolja, de külön sikerjelzés nem látható; a függő vagy hibás eredményrögzítés egyértelmű figyelmeztetést kap. Ha a böngésző letiltotta a helyi tárolást, nem szabad bezárni a privát ablakot, amíg a szerver nem igazolta vissza.
- A backend **V18.0** és a 006-os adatbázis-migráció ajánlott és éles környezetben szükséges a két mentés tranzakciós garanciájához. A frontend változatlanul build nélküli; az azonnali kezdőoldal, az ARCHIVE, a Suggest POST és az egyedi hibaoldalak működnek.
- A grafikon továbbra is csak az eredményképernyő első megjelenésekor, illetve kész nap betöltésekor kér friss statisztikát; egy nyitva hagyott másik böngészőablak görbéje nem követi élőben az inkognitóablak új eredményét.

---

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

## Suggest beküldések (szerveres)

A `SUGGEST +` űrlap `POST /api/v1/suggestions` útvonalra küld. Éles üzemben a backendnek rendelkeznie kell a `question_suggestions` PostgreSQL táblával (`005_question_suggestions.sql`). A frontend már nem tárol/exportál javaslattörténetet és nincs DOWNLOAD IDEAS funkció; hálózati hibánál sem állítja, hogy a beküldés sikeres volt. A korábbi demóban kizárólag helyben tárolt javaslatok az új verzió betöltésekor törlődnek, mivel nem kerültek fel a szerverre.


## V17.9 – azonnali kezdőképernyő és saját hibaoldalak

A böngésző a `index.html` részeként **azonnal kirajzolja** a CLOSEISH teljes kezdőképernyőjét, a napi kérdések és a PostgreSQL-előrehaladás válaszára várakozás nélkül. A háttérben rögtön, egymással párhuzamosan indulnak a `/api/v1/today` (archívumnál `/api/v1/days/YYYY-MM-DD`) és `/api/v1/progress` lekérések, valamint a függőségmentes JS-fájlok betöltése. A még meg nem érkezett napi kérdések nem kerülnek a kezdőképernyőre, és a böngésző nem tárolja el őket. Amint a szerverválasz és a teljes játék logikája elérhető, a kezdőképernyő a valós napi és előrehaladási állapottal frissül.

A korán megnyomott **LET’S PLAY** nem vész el: a gomb rövid státuszt mutat, és a játék **automatikusan megnyitja az első kérdést**, amint a két szerverválasz beérkezett. A **30 másodperces visszaszámlálás csak a tényleges kör megjelenésekor** indul. Az előzőleg befejezett nap a szerverről érkező állapot alapján zárolva marad; az előzőleg elkezdett kör folytatása a már létező visszaállítási szabály szerint történik. A korai HOW TO PLAY / ARCHIVE / SUGGEST kattintások szintén megvárják a kész felületet, és automatikusan megnyílnak.

A `404.html` egységes, mobilon is megjelenő **valós 404-es** oldal az ismeretlen URL-ekhez; a `500.html` ugyanilyen stílusú tartalék oldal az olyan tárhelyek számára, amelyek támogatják az 500-as sablont. A GitHub Pages az elsőt automatikusan használja, a `500.html` fájlt önmagában nem tudja 500-as hibához hozzárendelni: ezt csak erre képes hoszton/CDN-en lehet konfigurálni. API-hiba, időtúllépés és kapcsolathiány esetén nem tűnik el a kezdőképernyő, hanem értelmes hibaüzenet és **TRY AGAIN** jelenik meg. Az `npm run dev` statikus fejlesztői szerver is a `404.html`-t adja HTTP 404 státusszal az ismeretlen útvonalakra.

Változatlanul nincs buildlépés vagy böngészőbe beépített szerveradat / API titok. Az új `.html`, `.css`, `.js` fájlokat együtt kell a hoszt gyökerébe feltölteni. A böngészőben és a CDN-en korábban tárolt eszközfájlok verziószáma `17.9.0` lett.


## V18.2 – State-aware skeleton loading

- Befejezett nap frissítésekor ugyanannak a háromoszlopos eredményoldalnak a szerkezete tölt be azonnal: hat válaszsor, eloszlásgrafikon, három statisztikai kártya és hat Answer Catalogue sor. A tényleges adatok csak a PostgreSQL válasza után jelennek meg, sosem ideiglenes vagy kitalált pontszámként.
- A grafikon a statisztikai API-válaszig saját skeletonját mutatja a végleges helyén, ezért a napi adatok második lépcsős betöltésekor sem omlik össze az oszlop.
- Megkezdett játéknál a kérdésoldal váza látszik, azonnal kezdhető napnál megmarad a LET'S PLAY nyitóképernyő.
- A mentett helyi jelzés kizárólag azt mondja meg, milyen alakú felületet kell először kirajzolni. Kérdés, eredmény, válaszkatalógus, pontozás továbbra is szerveroldali forrásból jön.
- A háttéranimáció tiszteletben tartja a prefers-reduced-motion beállítást, hibás hálózati válasznál a skeleton helyén újrapróbálkozás jelenik meg.
- Az index.html és az api.js verzióparaméterei v=18.2.0-ra változtak, hogy a régi gyorsítótárazott fájlok ne keveredjenek az újakkal.
- Backend/API-módosítás nem szükséges.


## V18.3 — ismételt megnyitás és mobil billentyűzet

- A már futó böngészőlapot a Web Locks API akadályozza meg duplikált, egyidejű szerkesztésben. Ha egy másik lapon már él a zár, a második lapon teljes képernyős, arculatos **ALREADY OPEN** oldal jelenik meg **TRY AGAIN** gombbal. A zár csak azonos böngésző-origin/profil között működik; más böngésző, készülék vagy inkognitóprofil esetén nincs szerveroldali munkamenetzár.
- A mobilos *aktív játékkör* egy görgetés nélküli, látható viewporthoz (VisualViewport API) igazított kártya. A billentyűzet megnyílásakor a kérdés, a közelítési irány, a határ, a válaszmező, a CONFIRM és a SKIP marad előtérben; a díszítések és másodlagos metaadatok eltűnnek. Hosszabb kérdések szövegmérete a rendelkezésre álló helyhez igazodik.
- Eredményoldal, archívum, szabályzat, Suggest és a skeleton betöltési folyamat változatlan.
- Nem kerül sor `user-scalable=no` használatára, ezért a böngésző saját akadálymentesítési nagyítása elérhető marad.
- Módosított/felvett fájlok: `index.html`, `api.js`, `game.js`, `style.css`, `mobile-viewport.js`, `package.json`, új teszt. A backendhez nem kell hozzányúlni.


## V18.5 – Egyképernyős megjelenítés különböző monitorméreteken

Az új `desktop-viewport.js` a ténylegesen kirenderelt `#app` magasságát és szélességét méri, és **csak túllógás esetén** az alkalmazás saját CSS `zoom` értékét igazítja. A monitor/böngésző zoombeállításait és a hozzáférhetőséget nem módosítja. Játék, napváltás és eredményképernyő frissítése után is újaméri a méreteket; nem érinti a pontozást, a helyi 30 másodperces órát vagy a backend API-t. A 700 px-nél keskenyebb kijelzők élő játékfázisában továbbra is az eredeti, billentyűzetet kezelő `mobile-viewport.js` irányít, saját zoom nélküli rögzített kerettel.

A `style.css` alacsonyabb asztali képernyőknél a díszítő margókat csökkenti. A vizuális ellenőrzéshez futtatható a `python tests/viewport-fit.browser.py`, amely 2560×1440-től 320×568-ig ellenőrzi a bevezető és az eredményképernyőt. A modálok és a hosszú válaszkatalógus **belső** görgethetősége megmarad a tartalom elérhetősége miatt. Nagyon kis kijelzőkön a teljes tartalom egy képernyőre illesztése szükségszerűen kisebb megjelenítést eredményezhet.


## V18.6 – mobilos elrendezés és kis monitoros felugró ablakok

- **Csak a mobilos elrendezést** alakítottuk át (700 px-ig). A színek és az eredeti arculat változatlanok. Mobilon a kezdőlap kompakt, a mérőszámok egy sorba kerülnek, a kérdésmező és az időzítő a látható képernyőn marad.
- A napi eredmény mobilon három választható, egyképernyős nézetet használ: **RESULT / STATS / ANSWERS**. A válaszkatalógus táblázata a panelen belül görgethető, maga az oldal nem.
- Az Archive, How to Play, Suggest és a pontos ponthistogram ablak a kijelző tényleges méretéhez illeszkedik. A felugró ablak nem örökli az oldal automatikus kicsinyítését.
- A szövegmezőnél a mobilos billentyűzet nyitása továbbra is a látható viewportot használja. A 30 másodperces számláló működése nem változott.
- Ellenőrzés: `python tests/layout-mobile-v186.browser.py` és `python tests/ui.mobile.mock.py` (Playwright, Chromium).
