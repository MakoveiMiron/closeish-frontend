# CLOSEISH – önálló frontend (V17.1)

Ez a csomag csak a frontendet tartalmazza. A backend külön ZIP és külön futó szolgáltatás. A teljes kérdés- és válaszbank nincs a frontendben.

## Helyi indítás

Node.js 24+ szükséges. Ebben a mappában:

```sh
npm run dev
```

Megnyitás: http://localhost:5173

**A frontendhez nem kell npm install.** Nincs csomagfüggősége és buildlépése. A helyi webszerver a `/api/` kéréseket a külön elindított `http://127.0.0.1:3000` backendre továbbítja; nem indítja el helyetted a backendet.

A másik terminálban, a külön `CLOSEISH-backend` mappában először `npm ci`, majd `npm run demo`. A két mappának nem kell egymás mellett lennie.

Másik API-címhez az `API_PROXY_TARGET` környezeti változó állítható. Ez a helyi fejlesztői proxy beállítása. A `WEB_PORT` alapértéke 5173. A backend `ALLOWED_ORIGINS` listája engedélyezze a használt frontend-origint.

## Éles frontend + Railway backend

A statikus tárhelyre az `index.html`, `style.css`, `config.js`, `api.js`, `view-core.js`, `community.js`, `score-chart.js`, `statistics-client.js`, `game.js` fájlok kerüljenek, a webhely gyökerébe. A `scripts/` csak helyi fejlesztői segédlet; éles statikus kiszolgáláshoz nem kell.

A `config.js` fájlban állítsd be a tényleges Railway API HTTPS-originjét:

```js
window.CLOSEISH_CONFIG={apiBase:'https://SAJAT-BACKEND-DOMAIN'};
```

A backenden az `ALLOWED_ORIGINS` a frontend HTTPS-originjét engedélyezze, útvonal és záró perjel nélkül. Ha van CSP, a `connect-src` szabály is engedje az API-t. Az `/api/` proxy használata esetén az `apiBase` maradhat üres.

## A 30 másodperces számláló

A visszaszámláló **teljes egészében a böngészőben fut**, a `game.js` kezeli. A frontend a kör kezdetén egyszer kiszámítja a határidőt, elmenti helyben, és a saját órájából számolja a hátralévő másodperceket. A backend egyszer adja át a kérdés adataival a 30 másodperces időkeretet; **nem küld másodpercenként hátralévő időt**.

Nincs timer-polling, WebSocket vagy szerveres másodpercüzenet. A számláló internetkimaradás közben is csökken. Frissítés és újranyitás után az eredeti határidő marad, nem jár új 30 másodperc. Időlejáratkor egy normál válasz-/időtúllépés-beküldés történhet; hálózati hiba esetén mentett függő állapotban marad.

A gépelési javaslatok, válaszpontozás és napi statisztika továbbra is API-t használnak. A kész eredményoldal 30 másodperces adatfrissítése és a 60 másodperces napellenőrzés külön funkció, nem a visszaszámláló működtetése.

Az előrehaladás és a teljes eredmények újraküldési várólistája localStorage-ban él, ugyanazon böngészőprofilon és originen. A tárolás törlése vagy a domainváltás a helyi előzmények elvesztésével járhat. A timer helyi kezelése nem csalásbiztos versenyidő-ellenőrzés.

## Ellenőrzés

A külön frontend és backend együtt, Chromiumban ellenőrizve. A számláló futása alatt nincs másodpercenkénti API-kérés; offline is csökken, frissítéskor az eredeti határidőt folytatja. A részletes gépi eredmény a backend `docs/KULON-CSOMAG-ELLENORZES.md` fájljában található.
