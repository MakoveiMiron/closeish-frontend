# CLOSEISH – adatkezelési ellenőrzőlista kiadás előtt

Az elkészült `privacy.html` a feltöltött frontend V18.6 + backend V24 forrásának áttekintése alapján készült, **nem jogi tanácsadás, és nem tekinthető önmagában teljesen végleges GDPR-tájékoztatónak**.

Kötelezően pontosítandó a nyilvános közzététel előtt:

1. A GDPR 13. cikke alapján az adatkezelő teljes neve és kapcsolattartási/postai címe (`privacy.html` 01. pont). Ne publikáld a szögletes zárójeles helyőrzőt végleges jogi tájékoztatásként.
2. Az üzemelő statikus hoszt, Railway régió, e-mail szolgáltató, szerződött adatfeldolgozók és a harmadik országokba történő adattovábbítás, ha van ilyen.
3. A PostgreSQL-ben tárolt napi eredmények, előrehaladás és ötletjavaslatok **jelenleg nem rendelkeznek automatikus törlési ütemezéssel**. Dönts dokumentált adatmegőrzési időtartamokról, majd igazítsd hozzá a backendet és a `privacy.html` 06. pontját.
4. Az adatkezelési kérelmek kiszolgálása – különösen a pszeudonim player hash alapján történő hozzáférés, törlés és azonosítás – működési eljárást igényel.
5. Ellenőrizd az éles frontend kiszolgálását, CDN-t és Railway ingress-t: nem állítanak-e be további sütiket, tracking kódokat, és mennyi ideig őrzik az IP-alapú hozzáférési naplókat.
6. A tájékoztatót az oldal nyelvén, itt angolul írtuk meg. Vizsgáld meg, hogy a célközönségre tekintettel szükséges-e magyar változat is.

## Sütisáv

A forráskódban nem található reklám-, analitikai vagy harmadik feles követőkód; a `localStorage` a játékos véletlenszerű UUID-ját, a hálózati hibák utáni szinkronizáláshoz szükséges adatokat, illetve indítási nézeti segédállapotot tartalmaz. A játék alapfunkciójához szükséges tárolás esetén az ePrivacy irányelv 5. cikk (3) bekezdése kivételt enged a hozzájárulás alól; **nem építettünk ál-hozzájárulási sávot**. A tárolást a külön Privacy Policy oldal ismerteti. Ha később nem szükséges analitika, marketing vagy más hozzáférés kerül be, annak használata előtt be kell vezetni a megfelelő hozzájárulási folyamatot.

Források: EU ePrivacy irányelv 2002/58/EK 5. cikk (3); GDPR 13. cikk; EU Your Europe – Data protection and online privacy.
