(()=>{'use strict';
  const norm=s=>String(s??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/ß/g,'ss').replace(/œ/g,'oe').replace(/ð/g,'d').replace(/þ/g,'th').replace(/đ/g,'d').replace(/ı/g,'i').replace(/ø/g,'o').replace(/ł/g,'l').replace(/æ/g,'ae').replace(/&/g,' and ').replace(/c\+\+/g,' cplusplus ').replace(/c#/g,' csharp ').replace(/f#/g,' fsharp ').replace(/[^a-z0-9]+/g,' ').trim();
globalThis.CLOSEISHCore={norm,TIERS:{1200:'PERFECT HIT',1000:'RAZOR EDGE',800:'CLOSE CALL',600:'SOLID HIT',400:'IN THE ZONE',200:'ON THE BOARD'},START:'2026-10-20',dayNumber:iso=>Math.floor((Date.parse(iso+'T00:00:00Z')-Date.parse('2026-10-20T00:00:00Z'))/86400000)+1,questions:day=>day?Array.from({length:6},(_,i)=>day['q'+(i+1)]).filter(Boolean):[]};
})();
