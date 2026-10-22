/* Smoothed display of the backend's real histogram. All comparison arithmetic stays on the backend. */
(function(root){
  'use strict';
  const MAX_SCORE=7200;
  const STEP=200;
  const BANDWIDTH=370;
  const safeScore=value=>Math.max(0,Math.min(MAX_SCORE,Number(value)||0));
  const f=value=>Number(value.toFixed(2));
  const fmt=value=>Math.round(value).toLocaleString('en-US');

  function distribution(data,score){
    return {...data,rows:data.histogram,score:safeScore(score),percentile:data.comparison?.betterThanPercent};
  }

  function svg(data,compact=false){
    const W=compact?440:620,H=compact?276:328;
    const L=compact?33:46,R=W-(compact?24:31),T=compact?42:50,B=H-(compact?58:58);
    const plotW=R-L,plotH=B-T;
    const x=score=>L+safeScore(score)/MAX_SCORE*plotW;
    // Gaussian kernel density for the entire distribution (not exact bucket counts).
    // Its scale is normalized: the Y axis has no player-count ticks.
    const density=at=>data.rows.reduce((sum,r)=>{
      const z=(at-r.score)/BANDWIDTH;
      return sum+r.count*Math.exp(-0.5*z*z);
    },0);
    const count=145;
    const samples=Array.from({length:count},(_,i)=>({score:MAX_SCORE*i/(count-1)}));
    samples.forEach(p=>p.density=density(p.score));
    const highest=Math.max(1,...samples.map(p=>p.density));
    const y=score=>B-density(score)/highest*(plotH*.79);
    const pts=samples.map(p=>({x:x(p.score),y:B-p.density/highest*(plotH*.79)}));
    // Smooth cubic curve with continuous tangents across all sample points.
    const commands=[`M${f(pts[0].x)} ${f(pts[0].y)}`];
    for(let i=0;i<pts.length-1;i++){
      const prev=pts[Math.max(0,i-1)],a=pts[i],b=pts[i+1],next=pts[Math.min(pts.length-1,i+2)];
      commands.push(`C${f(a.x+(b.x-prev.x)/6)} ${f(a.y+(b.y-prev.y)/6)} `+
        `${f(b.x-(next.x-a.x)/6)} ${f(b.y-(next.y-a.y)/6)} ${f(b.x)} ${f(b.y)}`);
    }
    const line=commands.join(' ');
    const area=`${line} L${f(R)} ${B} L${L} ${B} Z`;
    const scoreX=x(data.score),scoreY=y(data.score),meanX=x(data.mean),meanY=y(data.mean);
    const ticks=[0,1200,2400,3600,4800,6000,7200];
    const tickLabels=ticks.map(value=>{
      const xx=f(x(value));
      const label=value===0?'0':value===7200?'7200':`${value/1000}k`;
      return `<line x1="${xx}" y1="${B+2}" x2="${xx}" y2="${B+7}" stroke="#807298" stroke-width="1.3"/>`+
        `<text x="${xx}" y="${B+25}" font-size="${compact?14:15}" font-weight="700" `+
        `fill="#635973" text-anchor="middle">${label}</text>`;
    }).join('');
    const grid=ticks.slice(1,-1).map(value=>`<line x1="${f(x(value))}" x2="${f(x(value))}" `+
      `y1="${T+10}" y2="${B}" stroke="#c5b8e0" stroke-dasharray="2 7" opacity=".55"/>`).join('');
    const overlap=Math.abs(meanX-scoreX)<(compact?53:65);
    const meanLabelX=Math.max(L+30,Math.min(R-31,meanX+(overlap?(meanX<scoreX?-24:24):0)));
    const meanLine=`<line class="avg-line" x1="${f(meanX)}" y1="${f(meanY-1)}" x2="${f(meanX)}" y2="${B}" `+
      `stroke="#332a44" stroke-width="2.3" stroke-dasharray="5 5" opacity=".82"/>`;
    const ownLine=`<line class="you-line" x1="${f(scoreX)}" y1="${f(scoreY)}" x2="${f(scoreX)}" y2="${B}" `+
      `stroke="#fa6d58" stroke-width="3"/>`;
    const meanTag=`<text class="chart-label" x="${f(meanLabelX)}" y="${T+14}" text-anchor="middle" `+
      `font-size="${compact?13:14}" font-weight="800" letter-spacing="1.1" fill="#32243e">AVERAGE</text>`;
    const youLabel=scoreX<L+25?'start':scoreX>R-25?'end':'middle';
    const ownTag=`<text class="chart-label" x="${f(scoreX)}" y="${B+46}" font-size="${compact?14:15}" font-weight="900" `+
      `text-anchor="${youLabel}" fill="#c13d35" letter-spacing="1">YOU</text>`;
    return `<svg xmlns="http://www.w3.org/2000/svg" class="mock-chart ${compact?'chart-mobile':'chart-desktop'}" `+
      `viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" role="img" `+
      `aria-label="Smoothed distribution of completed daily games. `+
      `Your score: ${fmt(data.score)} out of 7,200. Daily average: ${fmt(data.mean)}. `+
      `${data.total} completed games.">`+
      `<title>Distribution of completed daily scores</title>`+
      `<desc>Horizontal axis: 0 to 7,200 points. Curve height: relative frequency, `+
      `smoothed from actual completed scores. Dashed line shows the daily average; coral line and dot show your score. `+
      `Vertical height is not the number of players at any exact score.</desc>`+
      `<defs><linearGradient id="closeish-density-${compact?'small':'wide'}" x1="0" x2="0" y1="0" y2="1">`+
      `<stop offset="0%" stop-color="#705cff" stop-opacity=".29"/>`+
      `<stop offset="100%" stop-color="#705cff" stop-opacity=".015"/></linearGradient>`+
      `<filter id="closeish-dot-${compact?'small':'wide'}" x="-70%" y="-70%" width="240%" height="240%">`+
      `<feDropShadow dx="0" dy="2" stdDeviation="3" flood-color="#402958" flood-opacity=".25"/></filter></defs>`+
      `<rect width="${W}" height="${H}" rx="10" fill="#f6f0ff"/>`+
      `<g font-family="Consolas, 'DejaVu Sans Mono', monospace">`+
      `<text x="${L+8}" y="${T-16}" text-anchor="start" font-size="${compact?13:14}" fill="#5c4f73" `+
      `font-weight="800" letter-spacing="1">${compact?'SCORE SPREAD':'SCORE DISTRIBUTION'}</text>`+
      `${grid}<line x1="${L}" x2="${R}" y1="${B}" y2="${B}" stroke="#605471" stroke-width="1.6"/>`+
      `<path class="chart-area" d="${area}" fill="url(#closeish-density-${compact?'small':'wide'})"/>`+
      `<path class="chart-curve" d="${line}" fill="none" stroke="#705cff" stroke-width="${compact?3.4:4.1}" stroke-linecap="round" stroke-linejoin="round"/>`+
      `${meanLine}${ownLine}`+
      `<circle class="you-dot" cx="${f(scoreX)}" cy="${f(scoreY)}" r="${compact?6:7}" fill="#ff6a55" `+
      `stroke="#fff8f4" stroke-width="3" filter="url(#closeish-dot-${compact?'small':'wide'})"/>`+
      `${meanTag}${tickLabels}${ownTag}</g></svg>`;
  }
  const api={distribution,svg};
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.CLOSEISHChart=api;
})(globalThis);
