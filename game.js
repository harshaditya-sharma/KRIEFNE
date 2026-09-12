/* KRIEFNE v2 — Roguelite. Vanilla Canvas, zero deps.
 * v2: sleek ship, HUD-safe playfield, settings/help, 12 upgrades,
 * rule-bound validated procgen (BFS reachability), themed maps/music. */
(() => {
'use strict';
const W = 960, H = 640, WALL = 24, HUD_H = 56;
// World bounds + size are per-sector (sectors are larger than the viewport and
// grow endlessly). PX0..PY1 double as the camera-clamped playfield rect.
let PX0 = WALL, PY0 = HUD_H + WALL, PX1 = W - WALL, PY1 = H - WALL;
let WW = W, HH = H;
const cam = { x:0, y:0 };
const canvas = document.getElementById('game');
let ctx = canvas.getContext('2d');
try{ ctx.imageSmoothingEnabled = false; }catch(e){}
// ---------- viewport fit + devicePixelRatio scaling ----------
// Game logic draws in fixed 960x640 units (W/H) so balance, hitboxes and
// tests never move. Only the canvas backing store and CSS size adapt: the
// canvas fills the window (preserving 3:2) and renders at device pixels
// (capped) so the engraved hairlines stay crisp on hidpi instead of
// blurring. Touch here is groundwork only: a single touch maps to aim+tap
// so menus already work on a phone; the full touch scheme (sticks and
// gestures) is still undecided and must build on `touch`, not beside it.
let viewScale = 1;  // CSS px per logical px (window fill factor)
let devicePx = 1;   // backing px per logical px
const touch = { active:false, id:-1, x:W/2, y:H/2 };
function fitCanvas(){
 try{
  if(!canvas || typeof canvas.width !== 'number') return;
  const dprCap = 2, maxBack = 2560;
  let dpr = 1;
  try{ dpr = (window.devicePixelRatio || 1); }catch(e){ dpr = 1; }
  if(!(dpr > 0)) dpr = 1;
  dpr = Math.min(dpr, dprCap);
  let vw = 0, vh = 0, hintH = 0;
  try{ vw = (document.documentElement && document.documentElement.clientWidth) || 0; }catch(e){}
  try{ vh = (document.documentElement && document.documentElement.clientHeight) || 0; }catch(e){}
  if(!vw){ try{ vw = window.innerWidth || 0; }catch(e){} }
  if(!vh){ try{ vh = window.innerHeight || 0; }catch(e){} }
  try{ const hEl = (typeof document !== 'undefined' && document.getElementById) ? document.getElementById('hint') : null;
   if(hEl && hEl.offsetHeight) hintH = hEl.offsetHeight + 22; }catch(e){}
  if(!(vw > 0)) vw = W; if(!(vh > 0)) vh = H;
  const availW = Math.max(320, vw - 24);
  const availH = Math.max(240, vh - hintH - 28);
  const fit = Math.min(availW / W, availH / H);
  viewScale = fit > 0 ? fit : 1;
  const cssW = Math.max(1, Math.round(W * viewScale));
  const cssH = Math.max(1, Math.round(H * viewScale));
  let eff = Math.min(dpr, maxBack / cssW, maxBack / cssH);
  if(!(eff > 0)) eff = 1;
  const bw = Math.max(1, Math.round(cssW * eff));
  const bh = Math.max(1, Math.round(cssH * eff));
  try{ if(canvas.style){ canvas.style.width = cssW + 'px'; canvas.style.height = cssH + 'px'; } }catch(e){}
  if(canvas.width !== bw || canvas.height !== bh){
   canvas.width = bw; canvas.height = bh;
   try{ ctx.imageSmoothingEnabled = false; }catch(e){}
   // Caches are repainted at the new density below; each is guarded because
   // fitCanvas can run before those bindings initialise.
   try{ farStars = null; }catch(e){}
   try{ worldCache = null; }catch(e){}
  }
  devicePx = (canvas.width / W) || 1;
  try{ ctx.setTransform(devicePx, 0, 0, devicePx, 0, 0); }catch(e){}
 }catch(e){}
}
let fitQueued = false;
function queueFit(){ try{
  if(fitQueued) return; fitQueued = true;
  const run = () => { fitQueued = false; fitCanvas(); };
  if(typeof requestAnimationFrame === 'function'){ try{ requestAnimationFrame(run); return; }catch(e){} }
  run();
 }catch(e){} }
try{ window.addEventListener('resize', queueFit); }catch(e){}
try{ window.addEventListener('orientationchange', queueFit); }catch(e){}
try{ if(window.visualViewport && window.visualViewport.addEventListener) window.visualViewport.addEventListener('resize', queueFit); }catch(e){}
try{ if(typeof ResizeObserver !== 'undefined' && document.getElementById){
  const wrapEl = document.getElementById('wrap'); if(wrapEl) new ResizeObserver(queueFit).observe(wrapEl);
 }}catch(e){}
try{ if(document.addEventListener) document.addEventListener('DOMContentLoaded', fitCanvas); }catch(e){}
// ---------- visual tokens: the Etched Record ----------
// One palette, one meaning per colour. Gold is KRIEFNE, home and its own
// instrument (never an enemy). Oxide red is harm: every round, blast,
// beam, field and tell that is about to hurt you. Pigment is WHO a hostile is
// (see PIGMENT_DEF). Hydrogen is salvage and nothing else. Bare metal is
// wreckage and neutral text.
const K={
 ground:'#07080c', deep:'#040507', lift:'#0e1118', hull:'#12151d',
 metal:'#8b95a2', metalDim:'#4a525e', metalFaint:'#262b34',
 text:'#dde2e8', textDim:'#9ca5b0',
 gold:'#e2ae4b', goldHi:'#f7d991', goldDim:'#86672c', goldFaint:'#3a2d14',
 red:'#e2553c', redHi:'#ff8166', redDim:'#7c2b1f',
 hydro:'#bfe8f3',
 onGold:'#3b2c10' // secondary ink on the inverted gold field
};
// OKLCH -> sRGB hex. Pigments and sector tints are written as lightness,
// chroma and hue, so every variant is derived and none is hand-typed.
function rgba(hex,a){ const n=parseInt(hex.slice(1),16); return 'rgba('+(n>>16&255)+','+(n>>8&255)+','+(n&255)+','+a+')'; }
// translucent inks, derived once from the tokens above
K.scrim=rgba(K.ground,0.9); K.veil=rgba(K.ground,0.84); K.inkWash=rgba(K.ground,0.18); K.groundGroove=rgba(K.ground,0.12);
K.goldSheen=rgba(K.gold,0.35); K.goldWash=rgba(K.gold,0.22); K.goldGroove=rgba(K.goldDim,0.42);
function oklch(L,C,H){
 const h=H*Math.PI/180, a=C*Math.cos(h), b=C*Math.sin(h);
 const l=Math.pow(L+0.3963377774*a+0.2158037573*b,3), m=Math.pow(L-0.1055613458*a-0.0638541728*b,3), s=Math.pow(L-0.0894841775*a-1.2914855480*b,3);
 const g=v=>{ v=v<=0.0031308?12.92*v:1.055*Math.pow(v,1/2.4)-0.055; return Math.round(Math.min(1,Math.max(0,v))*255).toString(16).padStart(2,'0'); };
 return '#'+g(4.0767416621*l-3.3077115913*m+0.2309699292*s)+g(-1.2684380046*l+2.6097574011*m-0.3413193965*s)+g(-0.0041960863*l-0.7034186147*m+1.7076147010*s);
}
// Pigment: one muted colour per servitor and per god, learned across runs the
// way the old hulls were. The rules keep the palette's meanings intact, and
// test.js enforces every one of them:
//  * hue outside gold's band and red's (15–118), lightness 0.58–0.74, chroma
//    at most 0.12: never as bright or as loud as gold, never red;
//  * at least ΔE 0.13 (OKLab) from gold, red, red-hi and hydrogen;
//  * at least 0.09 between any two gods (any two can share a court), any two
//    servitors, and every god and the servitors it summons.
// [hue, lightness, chroma], found by a constrained search that held each god
// as near as it could to its character hue.
const PIGMENT_DEF={
 stalker:[122,0.66,0.063], brute:[176,0.71,0.111], tempest:[160,0.59,0.119],
 sniper:[231,0.61,0.098], drone:[265,0.72,0.114], mite:[344,0.69,0.110],
 basilisk:[131,0.58,0.104],    // moss         · Keeper of the Held
 nullifier:[148,0.74,0.116],   // pale jade    · the Silent
 leviathan:[173,0.64,0.108],   // verdigris    · the Lane-Wyrm
 chorus:[200,0.73,0.080],      // sea-glass    · the Norn-Choir
 oracle:[217,0.58,0.067],      // slate        · the Rememberer
 warden:[230,0.66,0.118],      // cerulean     · Bridge-Warden
 singularity:[267,0.74,0.111], // ultraviolet  · the One-Eyed
 phantom:[272,0.60,0.111],     // indigo       · the Undelivered
 archon:[303,0.67,0.118],      // amethyst     · the Lawspeaker
 harbinger:[321,0.58,0.111],   // plum         · the Horn
 juggernaut:[336,0.74,0.118],  // orchid       · the Unsteered
 overlord:[356,0.66,0.075]     // madder       · the Berserk
};
// c: outline, core, rank · hi: enraged · dim: inner engraving · body: hull
// fill, the pigment barely present · flash: the hull struck.
function mkPigment(H,L,C){ return { c:oklch(L,C,H), hi:oklch(Math.min(0.88,L+0.1),C*0.85,H), dim:oklch(L*0.6,C*0.7,H), body:oklch(0.215,C*0.28,H), flash:oklch(0.37,C*0.6,H) }; }
const PIG={}; for(const k in PIGMENT_DEF){ const d=PIGMENT_DEF[k]; PIG[k]=mkPigment(d[0],d[1],d[2]); }
function pigOf(e){ return PIG[e.kind||e.type]||PIG.drone; }
// Each sector is lit by its own dying star, so its dark, its wreckage and its
// motif take a slight tint of that star's hue. Chroma stays under .04: a
// tint to notice over a run, never a colour to read.
// The lit edge of wreckage stays bare silver so no hull passes for a hostile,
// and a star near red's hue keeps its motif quieter than hazard hatching.
function mkSectorPal(H){ const nearRed=Math.abs(((H-32)%360+540)%360-180)<=20;
 return { ground:oklch(0.145,0.018,H), deep:oklch(0.115,0.012,H), hull:oklch(0.205,0.02,H), faint:oklch(0.27,0.024,H), dim:oklch(0.4,0.028,H), metal:oklch(0.56,0.01,H), motif:oklch(0.36,nearRed?0.02:0.04,H) }; }
// Two monoline voices cut by the same stylus: wide engraver's capitals for
// names and titles, a narrow tabular face for numbers and KRIEFNE's voice.
const FONT_D="Michroma, 'Martian Mono', sans-serif", FONT_M="'Martian Mono', ui-monospace, Menlo, Consolas, monospace";
function fD(px){ return px+'px '+FONT_D; }
function fM(px,w){ return (w||400)+' '+px+'px '+FONT_M; }
function track(px){ try{ if(ctx.letterSpacing!==undefined) ctx.letterSpacing=px+'px'; }catch(e){} }
const REDUCED=(()=>{ try{ return !!(window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches); }catch(e){ return false; } })();
// Hold the first frames until the bundled faces are ready, so nothing flashes
// in a fallback font. Never waits more than 1.5s.
let fontsReady=true;
try{ if(document.fonts&&document.fonts.load){ fontsReady=false;
 Promise.all([document.fonts.load("16px Michroma"),document.fonts.load("400 12px 'Martian Mono'"),document.fonts.load("600 12px 'Martian Mono'")]).then(()=>{ fontsReady=true; },()=>{ fontsReady=true; });
 setTimeout(()=>{ fontsReady=true; },1500); } }catch(e){ fontsReady=true; }

// ---------- utils ----------
function clamp(v,a,b){ return v<a?a:(v>b?b:v); }
function dist2(ax,ay,bx,by){ const dx=ax-bx, dy=ay-by; return dx*dx+dy*dy; }
function len(x,y){ return Math.sqrt(x*x+y*y) || 0.0001; }
function mulberry32(a){ return function(){ a|=0; a=a+0x6D2B79F5|0; let t=Math.imul(a^a>>>15,1|a); t=t+Math.imul(t^t>>>7,61|t)^t; return ((t^t>>>14)>>>0)/4294967296; }; }
function circleHit(a,b){ const dx=a.x-b.x, dy=a.y-b.y, r=a.r+b.r; return dx*dx+dy*dy < r*r; }
function circleRect(cx,cy,cr,r){ const nx=clamp(cx,r.x,r.x+r.w), ny=clamp(cy,r.y,r.y+r.h); const dx=cx-nx, dy=cy-ny; return dx*dx+dy*dy < cr*cr; }
function resolveCircleRect(e,r){ const nx=clamp(e.x,r.x,r.x+r.w), ny=clamp(e.y,r.y,r.y+r.h); let dx=e.x-nx, dy=e.y-ny; let d=Math.sqrt(dx*dx+dy*dy); if(d < e.r){ if(d<0.001){ e.x=r.x-e.r-0.5; return; } const push=(e.r-d); e.x+=dx/d*push; e.y+=dy/d*push; } }
// ---------- convex polygon obstacles ----------
// A third obstacle kind beside rect and circle, so debris fields can be built from
// hex pylons, wedges, octagon bunkers and chevrons instead of the same two
// shapes every sector. Stored as {kind:'poly', x, y, pts:[[dx,dy],..], r} where
// pts are local offsets and r is the bounding radius used for broad-phase.
// Winding is normalised to counter-clockwise at construction so the inside test
// can never silently flip.
function mkPoly(x,y,pts){
 let area=0;
 for(let i=0;i<pts.length;i++){ const a=pts[i], b=pts[(i+1)%pts.length]; area+=a[0]*b[1]-b[0]*a[1]; }
 if(area<0) pts=pts.slice().reverse();
 let r=0; for(const q of pts) r=Math.max(r,Math.hypot(q[0],q[1]));
 return {kind:'poly',x,y,pts,r};
}
// Distance from a point to the polygon: 0 when inside, else the gap to the
// nearest edge. One routine backs the point test, the circle test and push-out.
function polyDist(px,py,o){
 const pts=o.pts, n=pts.length;
 let inside=true, best=1e9;
 for(let i=0;i<n;i++){
  const ax=o.x+pts[i][0], ay=o.y+pts[i][1];
  const bx=o.x+pts[(i+1)%n][0], by=o.y+pts[(i+1)%n][1];
  const ex=bx-ax, ey=by-ay;
  if(ex*(py-ay)-ey*(px-ax)<0) inside=false;
  const L2=ex*ex+ey*ey; let t=L2>0?((px-ax)*ex+(py-ay)*ey)/L2:0; t=t<0?0:(t>1?1:t);
  const qx=ax+ex*t-px, qy=ay+ey*t-py;
  const d=Math.sqrt(qx*qx+qy*qy); if(d<best) best=d;
 }
 return inside?0:best;
}
function circlePoly(cx,cy,cr,o){ const dx=cx-o.x, dy=cy-o.y; if(dx*dx+dy*dy>(cr+o.r)*(cr+o.r)) return false; const d=polyDist(cx,cy,o); return d===0||d<cr; }
// Push a circle out of a polygon along the shortest exit. Inside the shape the
// nearest edge normal is unavailable from polyDist alone, so walk the edges.
function resolveCirclePoly(e,o){
 const dx=e.x-o.x, dy=e.y-o.y;
 if(dx*dx+dy*dy>(e.r+o.r)*(e.r+o.r)) return;
 const pts=o.pts, n=pts.length;
 let inside=true, best=1e9, bx2=0, by2=0;
 for(let i=0;i<n;i++){
  const ax=o.x+pts[i][0], ay=o.y+pts[i][1];
  const bx=o.x+pts[(i+1)%n][0], by=o.y+pts[(i+1)%n][1];
  const ex=bx-ax, ey=by-ay;
  if(ex*(e.y-ay)-ey*(e.x-ax)<0) inside=false;
  const L2=ex*ex+ey*ey; let t=L2>0?((e.x-ax)*ex+(e.y-ay)*ey)/L2:0; t=t<0?0:(t>1?1:t);
  const qx=ax+ex*t, qy=ay+ey*t;
  const d=Math.hypot(e.x-qx,e.y-qy);
  if(d<best){ best=d; bx2=qx; by2=qy; }
 }
 if(!inside&&best>=e.r) return;
 if(inside){
  // exit direction points from the body OUT through the nearest edge point
  let ox=bx2-e.x, oy=by2-e.y, ol=Math.hypot(ox,oy);
  if(ol<0.001){ ox=e.x-o.x; oy=e.y-o.y; ol=Math.hypot(ox,oy)||1; } // dead centre: shove outward
  e.x=bx2+ox/ol*e.r; e.y=by2+oy/ol*e.r;
 } else {
  let ox=e.x-bx2, oy=e.y-by2, ol=Math.hypot(ox,oy)||1;
  const push=e.r-best; e.x+=ox/ol*push; e.y+=oy/ol*push;
 }
}
// Swept collision. Returns the parameter t in [0,1] at which the segment
// (x1,y1)->(x2,y2) first enters circle (cx,cy,r), or -1 if it never does.
// A plain point test tunnels: bullets travel up to ~70px per 60Hz step with
// rate/speed upgrades, which is wider than most hitboxes, so shots visibly
// passed straight through bosses and came out the far side.
function segCircleT(x1,y1,x2,y2,cx,cy,r){
 const dx=x2-x1, dy=y2-y1, fx=x1-cx, fy=y1-cy;
 const a=dx*dx+dy*dy;
 if(a<1e-9) return (fx*fx+fy*fy<=r*r)?0:-1;
 const c=fx*fx+fy*fy-r*r;
 if(c<=0) return 0; // started already overlapping
 const b=2*(fx*dx+fy*dy);
 let disc=b*b-4*a*c; if(disc<0) return -1;
 disc=Math.sqrt(disc);
 const t=(-b-disc)/(2*a);
 return (t>=0&&t<=1)?t:-1;
}

// ---------- settings ----------
let settings = { shake:!REDUCED, particles:!REDUCED, music:true, autofire:true, showSeed:true, musicVol:0.8, sfxVol:0.6, dmgNums:true };
try{ const s=JSON.parse(lsGet('cfg')||'null'); if(s&&typeof s==='object') settings=Object.assign(settings,s); }catch(e){}
function saveCfg(){ try{ lsSet('cfg',JSON.stringify(settings)); }catch(e){} }

// ---------- audio ----------
let AC=null, master=null, musicBus=null, noiseBuf=null, muted=false, musicTimer=null, musicStep=0, musicPat=[55,0,55,65.41,0,55,49,58.27], musicTempo=190, musicLead=[], musicWave='square';
function ac(){ try{ if(!AC){ const C=window.AudioContext||window.webkitAudioContext; if(!C) return null; AC=new C(); master=AC.createGain(); master.gain.value=muted?0:settings.sfxVol; master.connect(AC.destination); musicBus=AC.createGain(); musicBus.gain.value=(muted||!settings.music)?0:settings.musicVol; musicBus.connect(AC.destination); } if(AC.state==='suspended') AC.resume(); return AC; }catch(e){ return null; } }
function applyVol(){ try{ if(master) master.gain.value=muted?0:settings.sfxVol; if(musicBus) musicBus.gain.value=(muted||!settings.music)?0:settings.musicVol; }catch(e){} }
function tone(type,f0,f1,dur,vol,delay,bus){ const c=ac(); if(!c||muted) return; delay=delay||0; try{ const t0=c.currentTime+delay; const o=c.createOscillator(), g=c.createGain(); o.type=type; o.frequency.setValueAtTime(Math.max(1,f0),t0); o.frequency.exponentialRampToValueAtTime(Math.max(1,f1),t0+dur); g.gain.setValueAtTime(vol,t0); g.gain.exponentialRampToValueAtTime(0.001,t0+dur); o.connect(g); g.connect(bus||master); o.start(t0); o.stop(t0+dur+0.03); }catch(e){} }
function noiseHit(dur,vol,hp,delay,bus){ const c=ac(); if(!c||muted) return; delay=delay||0; try{ const t0=c.currentTime+delay; if(!noiseBuf){ noiseBuf=c.createBuffer(1,c.sampleRate*0.5,c.sampleRate); const d=noiseBuf.getChannelData(0); for(let i=0;i<d.length;i++) d[i]=Math.random()*2-1; } const s=c.createBufferSource(); s.buffer=noiseBuf; s.loop=true; const f=c.createBiquadFilter(); f.type='highpass'; f.frequency.value=hp||6000; const g=c.createGain(); g.gain.setValueAtTime(vol,t0); g.gain.exponentialRampToValueAtTime(0.001,t0+dur); s.connect(f); f.connect(g); g.connect(bus||master); s.start(t0); s.stop(t0+dur+0.03); }catch(e){} }
const SFX={
 shoot(){ tone('square',800,200,0.07,0.09); },
 eshoot(){ tone('square',300,150,0.09,0.06); },
 hit(){ tone('sawtooth',400,150,0.07,0.15); },
 die(){ tone('sawtooth',300,40,0.22,0.2); noiseHit(0.18,0.1,800); },
 hurt(){ tone('sawtooth',220,50,0.28,0.26); noiseHit(0.14,0.07,500); },
 block(){ tone('triangle',1200,600,0.12,0.2); },
 pickup(){ tone('sine',660,1320,0.11,0.16); },
 levelup(){ [440,660,880].forEach((f,i)=>tone('square',f,f,0.1,0.15,i*0.09)); },
 upgrade(){ tone('triangle',500,1000,0.15,0.18); },
 alarm(){ for(let i=0;i<3;i++) tone('square',300,600,0.15,0.18,i*0.34); },
 win(){ [523,659,784,1046].forEach((f,i)=>tone('triangle',f,f,0.18,0.18,i*0.12)); },
 lose(){ [400,300,200,100].forEach((f,i)=>tone('sawtooth',f,Math.max(30,f*0.8),0.25,0.18,i*0.16)); },
  click(){ tone('square',1000,800,0.04,0.07); },
  dash(){ noiseHit(0.12,0.09,2000); },
  portal(){ tone('sine',300,900,0.25,0.16); },
  ring(){ tone('sawtooth',120,60,0.2,0.16); },
  brk(){ tone('square',700,90,0.3,0.22); noiseHit(0.2,0.12,900); },
  stasis(){ [220,330,440,660,880].forEach((f,i)=>tone('sine',f,f*1.01,0.22,0.16,i*0.1)); },
  rare(){ [660,880,1320,1760].forEach((f,i)=>tone('triangle',f,f,0.12,0.14,i*0.08)); }
};
function setMusic(pat,tempo,lead,wave){ musicPat=pat.slice(); musicTempo=tempo; musicLead=(lead||[]).slice(); musicWave=wave||'square'; if(musicTimer){ clearInterval(musicTimer); musicTimer=null; } if(!settings.music) return; try{ ac(); applyVol(); musicTimer=setInterval(()=>{ musicStep++; if(muted||!settings.music) return; try{ const f=musicPat[musicStep%musicPat.length]; if(f) tone('sawtooth',f,f*0.99,0.22,0.09,0,musicBus); if(musicLead.length){ const lf=musicLead[musicStep%musicLead.length]; if(lf) tone(musicWave,lf,lf*1.004,0.15,0.055,0,musicBus); } if(musicStep%2===1) noiseHit(0.03,0.025,7000,0,musicBus); }catch(e){} },musicTempo); }catch(e){} }
function setMusicCfg(c){ if(!c) return; setMusic(c.bass,c.tempo,c.lead,c.lwave); }
function stopMusic(){ if(musicTimer){ clearInterval(musicTimer); musicTimer=null; } }

// ---------- input ----------
const keys={};
const mouse={x:W/2,y:H/2,down:false}; // SCREEN coords; gameplay uses world coords below
function wmx(){ return mouse.x + cam.x; }
function wmy(){ return mouse.y + cam.y; }
window.addEventListener('keydown',e=>{
 if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space'].includes(e.code)) e.preventDefault();
 if(!keys[e.code]) handleKeyPress(e.code);
 keys[e.code]=true; ac();
});
window.addEventListener('keyup',e=>{ keys[e.code]=false; });
function canvasPos(e){ const r=canvas.getBoundingClientRect(); return { x:(e.clientX-r.left)*W/r.width, y:(e.clientY-r.top)*H/r.height }; }
canvas.addEventListener('mousemove',e=>{ const p=canvasPos(e); mouse.x=p.x; mouse.y=p.y; });
canvas.addEventListener('mousedown',e=>{ const p=canvasPos(e); mouse.x=p.x; mouse.y=p.y; mouse.down=true; ac(); handleClick(p.x,p.y); });
window.addEventListener('mouseup',e=>{ mouse.down=false; try{ const p=canvasPos(e); handleRelease(p.x,p.y); }catch(_){} });
canvas.addEventListener('contextmenu',e=>e.preventDefault());
// Touch groundwork (no designed scheme yet): the first touch drives the same
// aim point the mouse drives, and a tap is a click, so every canvas-drawn
// menu, draft card and gate already answers on a phone. Multi-touch and
// movement sticks stay for the real mobile scheme; until then extra touches
// are tracked but never act.
function touchPos(t){ const r=canvas.getBoundingClientRect(); return { x:(t.clientX-r.left)*W/r.width, y:(t.clientY-r.top)*H/r.height }; }
try{
 canvas.addEventListener('touchstart',e=>{
  try{ ac(); }catch(_){}
  if(!e || !e.changedTouches || !e.changedTouches.length) return;
  const t=e.changedTouches[0], p=touchPos(t);
  touch.active=true; touch.id=(t.identifier===undefined?-1:t.identifier); touch.x=p.x; touch.y=p.y;
  mouse.x=p.x; mouse.y=p.y; mouse.down=true;
  try{ handleClick(p.x,p.y); }catch(_){}
  if(e.cancelable) e.preventDefault();
 },{passive:false});
 canvas.addEventListener('touchmove',e=>{
  if(!touch.active || !e || !e.changedTouches) return;
  for(let i=0;i<e.changedTouches.length;i++){ const t=e.changedTouches[i];
   if(t.identifier===touch.id || touch.id===-1){ const p=touchPos(t); touch.x=p.x; touch.y=p.y; mouse.x=p.x; mouse.y=p.y; break; } }
  if(e.cancelable) e.preventDefault();
 },{passive:false});
 const endTouch=e=>{
  try{
   if(e && e.changedTouches) for(let i=0;i<e.changedTouches.length;i++)
    if(e.changedTouches[i].identifier===touch.id || touch.id===-1){ touch.active=false; touch.id=-1; break; }
  }catch(_){ touch.active=false; touch.id=-1; }
  mouse.down=false; try{ handleRelease(touch.x,touch.y); }catch(_){}
 };
 canvas.addEventListener('touchend',endTouch);
 canvas.addEventListener('touchcancel',endTouch);
}catch(e){}
// auto-pause when the tab loses focus / window blurs / page occluded (alt-tab safe).
// Why a belt-and-braces approach: on alt-tab the browser often stalls rAF for the
// covered page WITHOUT firing visibilitychange, so the game freezes on its last frame
// and the pause overlay never paints. We therefore (a) pause on blur too, (b) run a
// 250ms watchdog on document.hasFocus(), and (c) paint one frame synchronously.
function clearInputs(){ try{ for(const k in keys) keys[k]=false; mouse.down=false; }catch(e){} }
function toPaused(auto){ clearInputs(); floaters=[]; state='paused'; autoPaused=!!auto; setMusicCfg(PAUSE_MUS); try{ render(); }catch(e){} }
function toPlaying(){ state='playing'; autoPaused=false; if(arena&&arena.theme) setMusicCfg(arena.theme); }
function autoPause(){ if(state==='playing') toPaused(true); }
function focusLost(){ try{ if(document.hidden) return true; if(typeof document.hasFocus==='function'&&!document.hasFocus()) return true; }catch(e){} return false; }
function focusWatch(){ if(state==='playing'&&focusLost()) autoPause(); }
try{ if(document.addEventListener) document.addEventListener('visibilitychange',()=>{ try{ if(document.hidden) autoPause(); }catch(e){} }); }catch(e){}
window.addEventListener('blur',()=>{ try{ autoPause(); }catch(e){} });
window.addEventListener('focus',()=>{ try{ if(state==='paused') render(); }catch(e){} });
try{ setInterval(()=>{ try{ focusWatch(); }catch(e){} },250); }catch(e){}
// first-gesture audio unlock: browsers block all sound until the player interacts.
// Keys/clicks already reach ac()+ensureTitleMusic via the handlers above; this pair
// additionally covers gestures outside the canvas and retries after a blocked attempt.
try{
 window.addEventListener('pointerdown',()=>{ try{ ac(); ensureTitleMusic(); }catch(e){} });
 window.addEventListener('touchstart',()=>{ try{ ac(); ensureTitleMusic(); }catch(e){} },{passive:true});
}catch(e){}

// ---------- persistence ----------
function lsGet(k){ try{ return localStorage.getItem('kriefne_'+k); }catch(e){ return null; } }
function lsSet(k,v){ try{ localStorage.setItem('kriefne_'+k,v); }catch(e){} }
function lsDel(k){ try{ localStorage.removeItem('kriefne_'+k); }catch(e){} }
let best=0, depth=0, bosses=0; // best score, deepest sector, total boss kills (banks +2% dmg each)
try{ best=parseInt(lsGet('best')||'0',10)||0; depth=parseInt(lsGet('depth')||'0',10)||0; bosses=parseInt(lsGet('bosses')||'0',10)||0; }catch(e){}
function saveMeta(){ try{ lsSet('best',String(best)); lsSet('depth',String(depth)); lsSet('bosses',String(bosses)); }catch(e){} }
// Codex progress: ids of every foe type and boss kind defeated at least once,
// across all runs. An entry stays locked — name, stats and lore hidden — until
// its first kill.
let codexKills={};
try{ const c=JSON.parse(lsGet('codex')||'[]'); if(Array.isArray(c)) for(const id of c) codexKills[id]=true; }catch(e){}
function saveCodex(){ try{ lsSet('codex',JSON.stringify(Object.keys(codexKills))); }catch(e){} }
function codexKnown(id){ return !!codexKills[id]; }
// Every encounter ends in a kill or a lost hull, so meeting a foe is enough
// to earn its portrait, name, rank, tells and counters. The field note (the
// lore) still waits for the first kill.
let codexSeenMap={};
try{ const c=JSON.parse(lsGet('seen')||'[]'); if(Array.isArray(c)) for(const id of c) codexSeenMap[id]=true; }catch(e){}
function codexSeen(id){ return !!(codexSeenMap[id]||codexKills[id]); }
function markSeen(id){ if(!id||codexSeenMap[id]) return; codexSeenMap[id]=true; try{ lsSet('seen',JSON.stringify(Object.keys(codexSeenMap))); }catch(e){} }

// ---------- data ----------
// tint: the hue of the sector's star (mkSectorPal). Steel, teal, sage, umber,
// ash-lilac, rose: every step along the trail shifts the light.
const THEMES=[
 {name:'Relay Drift', tint:245, light:-0.6, motif:'relays', bass:[55,0,55,65.41,0,55,49,58.27], tempo:190, lwave:'square', lead:[440,0,523.25,0,587.33,0,523.25,392,440,0,523.25,659.25,0,587.33,523.25,0]},
 {name:'Archive Reef', tint:195, light:2.4, motif:'shards', bass:[49,0,49,58.27,0,49,43.65,51.91], tempo:180, lwave:'square', lead:[392,0,440,0,493.88,587.33,0,493.88,440,0,392,0,329.63,0,392,0]},
 {name:'Broken Ring', tint:140, light:0.4, motif:'ring', bass:[65.41,0,65.41,73.42,0,65.41,55,62.23], tempo:200, lwave:'sawtooth', lead:[523.25,659.25,0,783.99,0,659.25,523.25,0,440,523.25,0,659.25,783.99,0,659.25,0]},
 {name:'Slag Belt', tint:50, light:-2.2, motif:'belt', bass:[43.65,0,43.65,49,0,55,43.65,41.2], tempo:175, lwave:'square', lead:[349.23,0,349.23,415.3,0,349.23,311.13,293.66,349.23,0,415.3,0,466.16,415.3,349.23,0]},
 {name:'Hull Ossuary', tint:295, light:1.6, motif:'none', bass:[36.71,0,36.71,43.65,0,36.71,34.65,38.89], tempo:205, lwave:'sawtooth', lead:[369.99,0,440,0,554.37,0,493.88,440,369.99,0,415.3,440,0,493.88,440,0]},
 {name:'Rose Veil', tint:350, light:-1.2, motif:'veil', bass:[55,55,0,65.41,55,0,49,58.27], tempo:185, lwave:'square', lead:[440,440,0,523.25,0,587.33,0,659.25,587.33,0,523.25,440,392,440,0,0]}
];
for(const th of THEMES) th.pal=mkSectorPal(th.tint);
const TITLE_MUS={ bass:[110,0,0,0,130.81,0,0,0,98,0,0,0,146.83,0,0,0], tempo:300, lwave:'sine', lead:[220,0,0,261.63,0,0,329.63,0,0,293.66,0,261.63,0,246.94,0,0] };
const PAUSE_MUS={ bass:[110,0,0,0,0,0,0,0,98,0,0,0,0,0,0,0], tempo:340, lwave:'triangle', lead:[220,0,0,0,174.61,0,0,0,196,0,0,0,164.81,0,0,0] };
// ---------- endless sectors ----------
// The run never ends: sectors grow larger, denser and meaner forever.
// Every 5th sector is a boss NEST. Its roster is DERIVED, not hand-typed:
//   * a signature nest (S5, S50, S100) uses its authored roster
//   * a debut nest belongs to the boss debuting there, alone
//   * any other nest is a commander from the top two ranks you have met,
//     escorted by subordinates from strictly lower ranks
// Deterministic per sector, so the codex, the hub lore and the tests all agree.
function isBossSector(s){ return ((s+1)%5)===0; }
const _nestCache={}; // deterministic per sector, and mkBoss asks for every boss it builds
function bossKindsFor(s){
 const n=s+1;
 if(!_nestCache[n]) _nestCache[n]=deriveNest(n);
 return _nestCache[n].slice();
}
function deriveNest(n){
 const sig=SIGNATURE_NESTS[n];
 if(sig) return sig.kinds.slice();
 if(DEBUTS[n]) return [DEBUTS[n]];
 const met=BOSS_KINDS.filter(k=>BOSSDEF[k].debut<=n);
 if(!met.length) return ['overlord'];
 const R=mulberry32((n*2654435761)>>>0);
 // Never the same court twice running — back-to-back identical nests read as
 // the schedule being stuck.
 const prev=n>5?bossKindsFor(n-6).join('+'):'';
 let court=null;
 for(let attempt=0;attempt<8;attempt++){ court=pickCourt(met,n,R); if(court.join('+')!==prev) break; }
 return court;
}
// A court: a commander from the top two ranks you have met, escorted by its OWN
// subordinates — one rank below first (distinct kinds), stepping further down
// only when that rank runs out. Picking escorts from "anything lower" made the
// lone Enforcer tag along with almost every nest.
function pickCourt(met,n,R){
 const tierOf=k=>BOSSDEF[k].tier;
 const topT=Math.max.apply(null,met.map(tierOf));
 let leads=met.filter(k=>tierOf(k)>=topT-1&&met.some(j=>tierOf(j)<tierOf(k)));
 if(!leads.length) leads=met.filter(k=>tierOf(k)===topT);
 // the highest rank you have met leads three times as often as the rank below
 const top=leads.filter(k=>tierOf(k)===topT);
 leads=leads.concat(top,top);
 const lead=leads[(R()*leads.length)|0];
 const out=[lead];
 let t=tierOf(lead)-1, pool=[];
 for(let i=0;i<escortsFor(n);i++){
  while(!pool.length&&t>=1){ pool=met.filter(k=>tierOf(k)===t); t--; }
  if(!pool.length) break;
  const j=(R()*pool.length)|0; out.push(pool[j]); pool.splice(j,1);
 }
 return out;
}
function nestCommandDepth(s){ const sig=SIGNATURE_NESTS[s+1]; return (sig&&sig.cmd!==undefined)?sig.cmd:commandDepth(s+1); }
function sectorName(s){ return 'S'+String(s+1).padStart(2,'0'); }
// galaxy hub flavor: lore that builds the trail instead of restating mechanics.
// Nest lines name the nightmare; sector lines rotate with the run seed.
// One bespoke line per boss for its solo debut, naming its RANK — so the hub
// teaches the chain of command you are climbing, one rung at a time. Codex field
// notes are separate and longer; these are the headline.
const DEBUT_LORE={
 overlord:'AN ENFORCER BARS THE TRAIL — OVERLORD, the Berserk, has never yielded a holmgang. End the saga.',
 warden:'A CAPTAIN HOLDS THE BRIDGE — WARDEN guards a lane that leads nowhere now. It still guards it.',
 phantom:'A CAPTAIN WITHOUT A POST — PHANTOM carries a reply that no one is left to read.',
 leviathan:'A LORD OF THE DEEP LANE — LEVIATHAN answers to Sovereigns. Past here, nests call for help.',
 oracle:'A LORD WHO KEEPS THE LEDGER — ORACLE has already calculated this fight. Break its wards.',
 archon:'THE FIRST SOVEREIGN — ARCHON the Lawspeaker wrote the holmgang you fight under.',
 basilisk:'A LORD OF QUARANTINE — do not meet BASILISK\'s eye. Its last visitor is still held there.',
 harbinger:'A LORD WHO SOUNDS THE HORN — HARBINGER wants you to see it coming. Read the walls; find the gap.',
 juggernaut:'A SOVEREIGN THAT CANNOT STEER — JUGGERNAUT commands by momentum alone. Get behind it.',
 nullifier:'A SOVEREIGN OF SILENCE — NULLIFIER needs you ordinary for four seconds. Keep moving.',
 chorus:'A SOVEREIGN IN THREE VOICES — CHORUS was a people once. Every echo tells the truth.',
 singularity:'THE APEX — SINGULARITY, the One-Eyed. Every rank you have fought answers to it alone.'
};
function nestLore(s){
 const n=s+1, kinds=bossKindsFor(s), lead=kinds[0], d=BOSSDEF[lead];
 if(kinds.length===1&&DEBUT_LORE[lead]&&d.debut===n) return DEBUT_LORE[lead];
 const esc=kinds.slice(1).map(k=>BOSSDEF[k].name);
 const rank=TIER_NAMES[d.tier], art=/^[AEIOU]/.test(rank)?'AN ':'A ';
 if(n>100) return 'PAST THE APEX — '+d.name+' ('+rank+')'+(esc.length?' with '+esc.join(', '):'')+'. Command runs '+nestCommandDepth(s)+' deep.';
 if(!esc.length) return art+rank+' AT LARGE — '+d.name+' holds this nest alone.';
 return art+rank+'\'S COURT — '+d.name+' leads; '+esc.join(' and ')+(esc.length>1?' answer':' answers')+' to it.';
}
function galaxyLore(s,thName){
 if(isBossSector(s)) return nestLore(s);
 if(s<=clearedMax) return 'Sector pacified. Salvage logged — replay to strip it, or push deeper.';
 const pools=[
  'Static on the fringe channels. Something out there is counting your kills.',
  'The trail bends through '+thName+'. The locals stopped transmitting.',
  'Drift and static. The gate ahead has swallowed better pilots than you.',
  'Old maps call this stretch the Throat. It swallowed the cartographers too.',
  'Your hull still pings with the last fight. The next one is already listening.',
  'Neon ahead, silence behind. That is the whole job description.',
  'Home channel open. Incoming: nothing. Logged, again.',
  'Dead relays on every band. Somebody built all this to be heard.'];
 return pools[(s+runSeed)%pools.length];
}
// normal-sector composition: totals rise with depth, new species unlock along the way.
// S1 fields ~11 hostiles, S4 ~33, deep sectors push toward 45 — density keeps pace
// with the growing worlds so sectors feel populated, not empty.
function compFor(s){
 return {
  drone: 8+Math.min(8,s),
  stalker: 3+Math.min(6,((s+1)/2)|0),
  mite: s>=1?3+Math.min(4,s):0,
  tempest: s>=1?2+Math.min(4,(s/2)|0):0,
  sniper: s>=2?2+Math.min(4,((s-1)/2)|0):0,
  brute: s>=3?1+Math.min(3,((s-2)/2)|0):0
 };
}
function sectorWorld(s){ return { w:Math.min(2400,1200+s*130), h:Math.min(1600,880+s*85) }; }
// r: rarity 0 common (w10) / 1 uncommon (w5) / 2 rare (w2, RARE tag + jingle); drawn as 1/2/3 rim ticks
const UPGRADES=[
 // Stack caps on the four core multipliers. Uncapped, `dmg` and `rate` compounded
 // to 126x player DPS by S30 against bosses only 2.4x tougher — every deep nest
 // melted in four seconds. Capped, a single stat line can no longer carry a run;
 // late-game power comes from the ability lines instead, which cap separately.
 // Gains stack ADDITIVELY on the base, penalties stay multiplicative (a "-15%"
 // should really cut 15%). Multiplicative gains compounded to a 147x ceiling;
 // additive gains give a curve that can actually be matched by an enemy curve.
 {id:'rate', name:'Overclock Barrel', desc:'+20% base fire rate', max:8, r:0, apply(p){ p.fireRate+=0.9; }},
 {id:'dmg', name:'AP Rounds', desc:'+30% base damage', max:10, r:0, apply(p){ p.dmgMult+=0.30; }},
 {id:'hp', name:'Nanoweave Plating', desc:'+25 Max HP, heal 25', max:10, r:0, apply(p){ p.maxhp+=25; p.hp=Math.min(p.maxhp,p.hp+25); }},
 {id:'spd', name:'Ion Thrusters', desc:'UNLOCK dash', max:4, dyn(p){ return p.dashUnlocked?{name:'Ion Thrusters',desc:'-20% dash cooldown'}:null; }, apply(p){ if(!p.dashUnlocked){ p.dashUnlocked=true; p.dashCd=0; } else { p.dashCdMax=Math.max(0.7,p.dashCdMax*0.8); } }},
 {id:'slip', name:'Slipstream Coils', desc:'+10% move speed (needs dash)', max:3, r:1, req(p){ return p.dashUnlocked; }, apply(p){ p.speed*=1.1; }},
 {id:'split', name:'Split Chamber', desc:'RARE: +1 projectile, -15% dmg', max:2, r:2, apply(p){ p.shots+=1; p.dmgMult*=0.85; }},
 {id:'array', name:'Gun Array', desc:'+1 barrel: +1 bullet, no penalty', max:3, r:1, apply(p){ p.shots+=1; }},
 {id:'minigun', name:'Minigun Amps', desc:'+1 barrel, wider spread, damage rebalanced', max:3, r:1, apply(p){ const n=p.shots; p.shots+=1; p.dmgMult*=n/(n+1); p.minigun+=1; }},
 {id:'vamp', name:'Vampire Chip', desc:'Heal 3 HP per kill', max:6, dyn(p){ return p.vamp>0?{name:'Vampire Chip',desc:'Feed harder: +1 HP per kill (now '+p.vamp+')'}:null; }, apply(p){ p.vamp=p.vamp>0?p.vamp+1:3; }},
 {id:'seek', name:'Seeker Rounds', desc:'Bullets home in on foes', max:2, r:1, apply(p){ p.homing+=1; }},
 {id:'rico', name:'Ricochet Core', desc:'Bullets bounce off walls +1', max:2, r:1, apply(p){ p.bounce+=1; }},
 {id:'inc', name:'Incendiary Rounds', desc:'Bullets ignite: burn 6dps/2s', max:2, r:1, apply(p){ p.inc+=1; }},
 {id:'cryo', name:'Cryo Rounds', desc:'Bullets chill: slow 1.2s+', max:2, r:1, apply(p){ p.cryo+=1; }},
 {id:'slug', name:'Slug Rounds', desc:'+45% base dmg, bigger, -12% rate', max:2, r:1, apply(p){ p.dmgMult+=0.45; p.fireRate*=0.88; p.slug+=1; }},
 {id:'aegis', name:'Aegis Pulse', desc:'Recharging shield blocks hits', max:2, r:1, apply(p){ p.aegisLvl++; p.shieldCdMax=Math.max(6,12-(p.aegisLvl-1)*3); p.shieldT=0; }},
 {id:'ward', name:'Warding Plate', desc:'Blocks 1st hit EVERY round', r:0, max:1, apply(p){ p.hasWard=true; p.wardUp=true; }},
 {id:'bulwark', name:'Bulwark Matrix', desc:'Blocks 2 hits/round, +1/stack', max:3, r:1, apply(p){ p.bulMax+=(p.bulMax?1:2); p.bulwark=p.bulMax; }},
 {id:'mirror', name:'Crit Ward', desc:'RARE: blocks 1 HEAVY hit/round', max:1, r:2, apply(p){ p.hasMirror=true; p.mirrorUp=true; }},
 {id:'barrier', name:'Ablative Barrier', desc:'ONE-TIME: absorbs 50 dmg', max:1, r:2, apply(p){ p.barrier+=50; }},
 {id:'stasis', name:'Stasis Protocol', desc:'Cheat death: revive at 1 HP', max:3, r:2, dyn(p){ if(p.stasisTier===1) return {name:'Stasis Protocol',desc:'Stronger revival: 25% HP + charge'}; if(p.stasisTier>=2) return {name:'Stasis Protocol',desc:'Perfect revival: FULL HP + charge'}; return null; }, apply(p){ p.stasisTier=Math.min(3,p.stasisTier+1); p.stasisN=Math.min(3,p.stasisN+1); }},
 {id:'crit', name:'Crit Matrix', desc:'+15% crit chance (x2 dmg)', max:3, r:1, apply(p){ p.critCh=Math.min(0.5,p.critCh+0.15); }},
 {id:'surge', name:'Kill Surge', desc:'Kills: +25% spd/rate 2.5s', max:2, r:1, apply(p){ p.surgeLvl++; }},
 {id:'tract', name:'Tractor Core', desc:'+70% magnet, +10% XP', max:2, r:0, apply(p){ p.magnet*=1.7; p.xpBonus*=1.1; }},
 {id:'magnet', name:'Magnet Core', desc:'+120% pickup radius, faster gems', max:3, r:0, dyn(p){ return (p.magnet>90||p.pull>430)?{name:'Magnet Core',desc:'Vacuum EVERY gem + wider pickup'}:null; }, apply(p){ p.magnet*=2.2; p.pull=(p.pull||430)*1.4; collectGems(); }},
 {id:'pcell', name:'Portal Cell', desc:'ITEM: +2 recall charges (max 5)', req(p){ return p.charges<5; },
  dyn(p){ return p.recallUnlocked?null:{name:'Portal Cell',desc:'UNLOCK recall (E): +2 gate charges'}; }, apply(p){ p.recallUnlocked=true; p.charges=Math.min(5,p.charges+2); }},
 {id:'gatecd', name:'Gate Overdrive', desc:'-25% recall cooldown', max:3, r:1, req(p){ return p.recallUnlocked; }, apply(p){ p.recallCdMax=Math.max(2,p.recallCdMax*0.75); }},
 {id:'transit', name:'Instant Transit', desc:'-0.2s blink channel time', max:3, r:1, req(p){ return p.recallUnlocked; }, apply(p){ p.channelMax=Math.max(0.1,p.channelMax-0.2); }},
 {id:'orbit', name:'Guardian Orbit', desc:'+1 orbiting blade (contact dmg)', max:2, r:1, apply(p){ p.orbs+=1; }},
 {id:'nova', name:'Frost Nova', desc:'Chilling pulse slows foes', max:2, r:1, apply(p){ p.novaLvl++; p.novaT=Math.min(p.novaT||99,1.5); }},
 {id:'tesla', name:'Tesla Arc', desc:'RARE: lightning zaps + chains', max:2, r:2, apply(p){ p.teslaLvl++; p.teslaT=Math.min(p.teslaT||99,1); }},
 {id:'pierce', name:'Lance Rounds', desc:'Bullets pierce +1 foe', max:2, r:1, apply(p){ p.pierce+=1; }},
 {id:'wind', name:'Second Wind', desc:'RARE: revive once at 50% HP', max:1, r:2, apply(p){ p.secondWind=true; }},
 // ---------- kinetic discharge line ----------
 // Charges on kills, not on a timer, so it rewards clearing packs rather than
 // hiding. The three follow-ups are req-gated: they cannot appear before the
 // unlock, so you never draft an upgrade for a system you do not own.
 {id:'shock', name:'Kinetic Discharge', desc:'ITEM: every 50 kills, release a shockwave', max:1, r:1,
  apply(p){ p.shockOn=true; p.shockNeed=50; p.shockKills=0; p.shockDmg=28; p.shockR=180; }},
 {id:'shockcap', name:'Capacitor Tuning', desc:'-10 kills to charge a discharge', max:4, r:1,
  req(p){ return p.shockOn&&p.shockNeed>12; },
  dyn(p){ return {name:'Capacitor Tuning',desc:'Discharge at '+Math.max(12,p.shockNeed-10)+' kills (now '+p.shockNeed+')'}; },
  apply(p){ p.shockNeed=Math.max(12,p.shockNeed-10); }},
 {id:'shockamp', name:'Discharge Amplifier', desc:'+60% shockwave damage', max:3, r:1,
  req(p){ return !!p.shockOn; }, apply(p){ p.shockDmg*=1.6; }},
 {id:'shockrad', name:'Resonance Field', desc:'+45% shockwave radius, and it chills', max:3, r:1,
  req(p){ return !!p.shockOn; }, apply(p){ p.shockR*=1.45; p.shockChill=(p.shockChill||0)+1; }},
 // ---------- heavy ordnance ----------
 {id:'orbital', name:'Orbital Cannon', desc:'Calls a telegraphed strike on a target', max:3, r:1,
  dyn(p){ return p.orbitalLvl>0?{name:'Orbital Cannon',desc:'Faster cadence, +1 strike per salvo (now '+p.orbitalLvl+')'}:null; },
  apply(p){ p.orbitalLvl++; p.orbitalCd=Math.max(3.5,9-(p.orbitalLvl-1)*2); p.orbitalT=Math.min(p.orbitalT||99,3); }},
 {id:'lance', name:'Prism Lance', desc:'Periodic piercing beam along your aim', max:3, r:1,
  dyn(p){ return p.lanceLvl>0?{name:'Prism Lance',desc:'Wider beam, faster cycle (now '+p.lanceLvl+')'}:null; },
  apply(p){ p.lanceLvl++; p.lanceCd=Math.max(2.2,6-(p.lanceLvl-1)*1.4); p.lanceT=Math.min(p.lanceT||99,2); }},
 // ---------- ammunition ----------
 {id:'flak', name:'Flak Rounds', desc:'Bullets detonate for splash on impact', max:2, r:1,
  apply(p){ p.flak+=1; }},
 {id:'corrode', name:'Corrosive Rounds', desc:'Hits shred armour: +8% damage taken, stacks 5', max:2, r:1,
  apply(p){ p.corrode+=1; }},
 {id:'chain', name:'Chain Shot', desc:'Hits arc to a nearby foe', max:2, r:1,
  apply(p){ p.chain+=1; }},
 {id:'overcharge', name:'Overcharge Rounds', desc:'Every 5th shot is a heavy piercing slug', max:2, r:1,
  apply(p){ p.overcharge+=1; }},
 // ---------- sustain and pressure ----------
 {id:'adrenal', name:'Adrenal Core', desc:'Up to +50% damage as your HP drops', max:2, r:1,
  apply(p){ p.adrenal+=1; }},
 {id:'repair', name:'Repair Drone', desc:'Regenerate 1.5 HP/s after 4s undamaged', max:3, r:1,
  apply(p){ p.repair+=1.5; }},
 {id:'shrap', name:'Shrapnel Core', desc:'Slain foes burst for splash damage', max:2, r:1,
  apply(p){ p.shrap+=1; }},
 {id:'salvage', name:'Salvage Protocol', desc:'Gems mend 1 HP and pay +15% XP', max:2, r:0,
  apply(p){ p.salvage+=1; p.xpBonus*=1.15; }}
];
function rarityW(u){ return u.r===2?2:(u.r===1?5:10); }
// Never drafted normally — only used when a capped pool has nothing left to offer.
const REFIT={id:'refit', name:'Field Refit', desc:'+10 Max HP, full repair', r:0, apply(p){ p.maxhp+=10; p.hp=p.maxhp; }};

// ---------- state ----------
let state='title', settingsFrom='title', helpFrom='title', autoPaused=false;
let runSeed=1, arenaIdx=0, kills=0, arenasCleared=0, timeSec=0;
let arena=null, player=null, portal=null;
let bullets=[], ebullets=[], enemies=[], gems=[], parts=[], floaters=[], rings=[];
const MAX_PARTS=420, MAX_FLOATERS=30;
function pushPart(p){ if(parts.length>=MAX_PARTS) parts.splice(0,parts.length-MAX_PARTS+1); parts.push(p); }
let hazards=[]; // lingering ground effects: mines, zones, spike fields, jammers
let strikes=[], beams=[]; // orbital cannon impacts, prism lance traces
let spawnQueue=[], spawnT=0; // wave director: queued reinforcements stream in off-screen
let bossWarnT=0, bossWarnTxt='', bossWarnSub=[];
// what a nest has given up so far: the end-of-nest draft names it
let nestTally={kinds:[],banked:0,firsts:[]};
let galaxySel=0, clearedMax=-1; // level selector: highest cleared sector idx, next unlocks
let shake=0, levelChoices=[], upgradeCounts={}, starterOffered=false;
let sectorCleared=false; // clear bonus fires once per sector, not per empty field
let pendingLevels=0;     // level-ups earned but not yet drafted (see gainXp)
// Dash and recall are the two abilities that make the game move. Passing on
// them early must not lock a run out of them for good: while one is still
// locked, each draft it is missing from counts up, and once it has been
// absent for PITY_DRAFTS drafts in a row it is forced into the next one.
const CORE_UNLOCKS=[{id:'spd',locked:p=>!p.dashUnlocked},{id:'pcell',locked:p=>!p.recallUnlocked}];
const PITY_DRAFTS=3;
let pity={spd:0,pcell:0};
let levelBack=null; // the core unlock offered again as a fourth card, if any
let enterT=-1e9;     // when the current sector was entered: drives the pulsar fix
let wipeArmT=0;      // Reset records asks twice: the first press arms it until this time
let nestDraftAt=0;   // set when a nest's bonus draft opens: that draft is drawn inverted
let nestLtLeft=0;        // boss-class lieutenants this nest may still field (shared by all bosses)

function newPlayer(dmgBonus){
  return { x:480, y:(PY0+PY1)/2, r:11, hp:100, maxhp:100, speed:240, level:1, xp:0, xpNeed:xpNeedFor(1),
   fireRate:4.5, fireCd:0, dmgBase:12, dmgMult:dmgBonus, shots:1, critCh:0.05, critMult:2,
   dashCd:0, dashCdMax:2.5, dashT:0, dashDx:1, dashDy:0, invuln:0, magnet:90, pull:430, vamp:0,
   aim:0, face:0, autoFire:settings.autofire, projSpeed:640, flash:0, recall:null, recallCd:0,
   homing:0, bounce:0, inc:0, cryo:0, slug:0,
   aegisLvl:0, shieldCdMax:12, shieldT:0, shieldReady:false,
   hasWard:false, wardUp:false, bulMax:0, bulwark:0, hasMirror:false, mirrorUp:false, barrier:0, stasisN:0, stasisTier:0,
   surgeLvl:0, surgeT:0, xpBonus:1, dashUnlocked:false, recallUnlocked:false, recallCdMax:8,
   charges:0, channel:null, channelMax:0.6, gateRange:520,
   orbs:0, orbAng:0, novaLvl:0, novaT:3, teslaLvl:0, teslaT:2, pierce:0, minigun:0, secondWind:false, lockMsgCd:0,
   rootT:0, jamT:0,
   shockOn:false, shockKills:0, shockNeed:50, shockDmg:28, shockR:180, shockChill:0,
   orbitalLvl:0, orbitalCd:9, orbitalT:99, lanceLvl:0, lanceCd:6, lanceT:99,
   flak:0, corrode:0, chain:0, overcharge:0, shotN:0,
   adrenal:0, repair:0, shrap:0, salvage:0 };
}
// XP curve: ~1 level-up per arena. L2 lands mid-A1 (~14 XP); thresholds then
// outrun per-arena payouts (A1 ~26, A2 ~72, A3 ~117, A4 ~166, A5 ~228 incl.
// mite splits + gem scaling), so each cleared wave funds roughly one draft.
// xpNeedFor(L) = XP needed for NEXT level while at level L.
function xpNeedFor(L){ return Math.round(14+(L-1)*30+Math.pow(L-1,1.7)); }

// ---------- validated procgen ----------
// Rules (playability contract): all spawns + portal reachable from player via BFS
// on a 40px grid with obstacles inflated by 16px; open-space ratio >= 0.55;
// obstacle density scales with map area (~1 per 55k px², capped); 40 seed retries.
// Layouts are structured debris fields (a jittered grid of hull plates + a pylon landmark),
// with a boosted-scatter variant for variety — never the old 5-obstacle void.
const CELL=40;
function pointBlocked(x,y,m,obs){
 for(const o of obs){
  if(o.kind==='rect'){ if(x>o.x-m&&x<o.x+o.w+m&&y>o.y-m&&y<o.y+o.h+m) return true; }
  else if(o.kind==='poly'){ if(circlePoly(x,y,m,o)) return true; }
  else { const dx=x-o.x, dy=y-o.y; if(dx*dx+dy*dy < (o.r+m)*(o.r+m)) return true; }
 }
 return false;
}
function freeSpot(R,obs,px,py,minD,margin){
 for(let t=0;t<40;t++){
  const x=PX0+30+R()*(PX1-PX0-60), y=PY0+30+R()*(PY1-PY0-60);
  if(Math.hypot(x-px,y-py)<minD) continue;
  if(pointBlocked(x,y,margin||20,obs)) continue;
  return {x,y};
 }
  return {x:clamp(px+150,PX0+40,PX1-40), y:clamp(py,PY0+40,PY1-40)};
}
// region sampler: opening spawns cycle map quadrants so packs spread evenly
// instead of clumping; falls back to the global sampler when cramped
function freeSpotIn(R,obs,px,py,minD,margin,x0,x1,y0,y1){
 for(let t=0;t<40;t++){
  const x=x0+30+R()*((x1-x0)-60), y=y0+30+R()*((y1-y0)-60);
  if(Math.hypot(x-px,y-py)<minD) continue;
  if(pointBlocked(x,y,margin||20,obs)) continue;
  return {x,y};
 }
 return freeSpot(R,obs,px,py,minD,margin);
}
// Boss drop points: evenly spaced on a ring around the arena centre, never
// closer than `minWall` to any edge. Corner spawns turned a duel into a commute
// — the player reported chasing an OVERLORD across a whole sector to start the
// fight at all.
function bossRingSpots(R,obs,n,minWall){
 const cxm=(PX0+PX1)/2, cym=(PY0+PY1)/2;
 const maxR=Math.max(140,Math.min((PX1-PX0)/2,(PY1-PY0)/2)-minWall-30);
 const out=[];
 for(let k=0;k<n;k++){
  let spot=null;
  for(let t=0;t<50&&!spot;t++){
   const ang=(k/n)*6.283+(R()-0.5), rad=Math.min(maxR,230+R()*150);
   const x=cxm+Math.cos(ang)*rad, y=cym+Math.sin(ang)*rad;
   if(x-PX0<minWall||PX1-x<minWall||y-PY0<minWall||PY1-y<minWall) continue;
   if(pointBlocked(x,y,48,obs)) continue;
   if(out.some(o=>Math.hypot(o.x-x,o.y-y)<180)) continue;
   spot={x,y};
  }
  if(!spot){ const ang=(k/n)*6.283, rad=Math.min(maxR,240);
   spot={x:clamp(cxm+Math.cos(ang)*rad,PX0+minWall,PX1-minWall),y:clamp(cym+Math.sin(ang)*rad,PY0+minWall,PY1-minWall)}; }
  out.push(spot);
 }
 return out;
}
function bfsCheck(px,py,targets,obs){
 const cols=Math.floor((PX1-PX0)/CELL), rows=Math.floor((PY1-PY0)/CELL);
 const blocked=new Uint8Array(cols*rows);
 let open=0;
 for(let cy=0;cy<rows;cy++) for(let cx=0;cx<cols;cx++){
  const x=PX0+cx*CELL+CELL/2, y=PY0+cy*CELL+CELL/2;
  const b=pointBlocked(x,y,16,obs)?1:0; blocked[cy*cols+cx]=b; if(!b) open++;
 }
 function cellOf(x,y){ return {cx:clamp(Math.floor((x-PX0)/CELL),0,cols-1), cy:clamp(Math.floor((y-PY0)/CELL),0,rows-1)}; }
 // Two separate guarantees, previously conflated into one number:
 //   ratio    = reachable / open  -> CONNECTIVITY (no walled-off pockets)
 //   openFrac = open / total      -> BREATHING ROOM (the map is not a solid maze)
 // Only the first was ever computed, so a 90%-walls sector could pass validation.
 const openFrac=open/Math.max(1,cols*rows);
 const s=cellOf(px,py);
 if(blocked[s.cy*cols+s.cx]) return {ok:false,ratio:0,openFrac};
 const seen=new Uint8Array(cols*rows); const q=[s.cy*cols+s.cx]; seen[q[0]]=1; let reach=1;
 while(q.length){ const c=q.pop(); const cx=c%cols, cy=(c/cols)|0;
  const nb=[[1,0],[-1,0],[0,1],[0,-1]];
  for(const d of nb){ const nx=cx+d[0], ny=cy+d[1]; if(nx<0||ny<0||nx>=cols||ny>=rows) continue; const ni=ny*cols+nx; if(seen[ni]||blocked[ni]) continue; seen[ni]=1; reach++; q.push(ni); } }
 for(const t of targets){ const c=cellOf(t.x,t.y); if(!seen[c.cy*cols+c.cx]) return {ok:false,ratio:reach/Math.max(1,open),openFrac}; }
 return {ok:true,ratio:reach/Math.max(1,open),openFrac};
}
// ---------- structure vocabulary ----------
// Every piece here is CONVEX — polyDist's inside test assumes it. Shapes that
// read as concave (L-blocks, crosses, chevrons) are composed from several
// convex pieces instead of one concave polygon.
function rotPts(pts,rot){ const c=Math.cos(rot), s=Math.sin(rot); return pts.map(q=>[q[0]*c-q[1]*s,q[0]*s+q[1]*c]); }
function shapeNGon(x,y,r,n,rot){ const p=[]; for(let i=0;i<n;i++){ const a=rot+i*6.283/n; p.push([Math.cos(a)*r,Math.sin(a)*r]); } return mkPoly(x,y,p); }
function shapeBar(x,y,w,h,rot){ const hw=w/2, hh=h/2; return mkPoly(x,y,rotPts([[-hw,-hh],[hw,-hh],[hw,hh],[-hw,hh]],rot)); } // girder, rotatable — rects can only sit axis-aligned
function shapeWedge(x,y,r,rot){ return mkPoly(x,y,rotPts([[r,0],[-r*0.5,-r*0.8],[-r*0.75,0],[-r*0.5,r*0.8]],rot)); } // kite: convex, reads as a prow
function shapeTrap(x,y,w,h,rot){ const hw=w/2, hh=h/2; return mkPoly(x,y,rotPts([[-hw,hh],[hw,hh],[hw*0.55,-hh],[-hw*0.55,-hh]],rot)); }
function obsCX(o){ return o.kind==='rect'?o.x+o.w/2:o.x; }
function obsCY(o){ return o.kind==='rect'?o.y+o.h/2:o.y; }
function obsRadius(o){ return o.kind==='rect'?Math.hypot(o.w,o.h)/2:o.r; }
// Spacing test for a candidate against what is already placed. Rect-vs-rect gets
// an exact AABB test so long girders can sit near blocks instead of being
// rejected by an oversized bounding radius; everything else uses bounding circles.
function obsClash(cand,obs,pad){
 const cr=obsRadius(cand), cx=obsCX(cand), cy=obsCY(cand);
 for(const b of obs){
  if(cand.kind==='rect'&&b.kind==='rect'){
   if(cand.x<b.x+b.w+pad&&cand.x+cand.w+pad>b.x&&cand.y<b.y+b.h+pad&&cand.y+cand.h+pad>b.y) return true;
   continue;
  }
  const dx=cx-obsCX(b), dy=cy-obsCY(b), rr=cr+obsRadius(b)+pad;
  if(dx*dx+dy*dy<rr*rr) return true;
 }
 return false;
}
function place(obs,C,cand,pad){
 const cx=obsCX(cand), cy=obsCY(cand), cr=obsRadius(cand);
 if(!C.inBounds(cx,cy,cr+8)) return false;
 if(C.clearOfSpawn(cx,cy,cr)) return false;
 if(obsClash(cand,obs,pad===undefined?24:pad)) return false;
 obs.push(cand); return true;
}
// ---------- layout archetypes ----------
// Six recognisable layout types instead of one grid and one scatter, so two
// sectors at the same depth no longer look like the same map with the blocks
// shuffled. Every one is still BFS-validated downstream.
const LAYOUTS=['debris','arena','corridors','bastion','spokes','scatter'];
function layoutDebris(R,obs,C,idx){
 const early=idx<3;
 const cellW=early?160:200, cellH=early?150:180;
 const cols=Math.max(2,Math.floor((PX1-PX0)/cellW)), rows=Math.max(2,Math.floor((PY1-PY0)/cellH));
 const cw=(PX1-PX0)/cols, ch=(PY1-PY0)/rows;
 const density=Math.min(0.8,(early?0.62:0.55)+idx*0.03), sz=C.sizeJ;
 for(let cy=0;cy<rows;cy++) for(let cx=0;cx<cols;cx++){
  if(R()>density) continue;
  for(let a=0;a<3;a++){ // 3 jitter tries per cell: one bad roll shouldn't void the block
   const jx=PX0+cx*cw+R()*cw, jy=PY0+cy*ch+R()*ch, roll=R();
   let cand;
   if(roll<0.24) cand={kind:'circle',x:jx,y:jy,r:(22+R()*30)*sz};             // comm tower
   else if(roll<0.44) cand=shapeNGon(jx,jy,(26+R()*26)*sz,6,R()*6.283);       // hex pylon
   else if(roll<0.58) cand=shapeBar(jx,jy,(70+R()*90)*sz,(20+R()*16)*sz,R()*6.283); // barricade
   else if(roll<0.70) cand=shapeWedge(jx,jy,(30+R()*26)*sz,R()*6.283);        // prow
   else { const w=(50+R()*80)*sz, h=(50+R()*80)*sz; cand={kind:'rect',x:jx-w/2,y:jy-h/2,w,h}; }
   if(place(obs,C,cand,24)) break;
  }
 }
 // landmark: a 3-pylon avenue far from spawn — reads as intentional architecture
 for(let t=0;t<12;t++){
  const ax=R()*6.283, lx=C.px+Math.cos(ax)*(340+R()*300), ly=C.py+Math.sin(ax)*(260+R()*220);
  if(!C.inBounds(lx,ly,120)) continue;
  const tilt=R()*6.283, step=92, lr=(26+R()*12)*sz;
  const trio=[0,1,2].map(k=>shapeNGon(lx+Math.cos(tilt)*step*k,ly+Math.sin(tilt)*step*k,lr,6,tilt));
  if(trio.every(o=>C.inBounds(o.x,o.y,o.r+8)&&!C.clearOfSpawn(o.x,o.y,o.r)&&!obsClash(o,obs,24))){ for(const o of trio) obs.push(o); break; }
 }
}
function layoutArena(R,obs,C,idx){
 // Open duelling floor: a pillar ring outside the clearing, heavy bunkers on the
 // rim, nothing in the middle. Boss nests use this — a large body cannot wedge
 // itself on terrain that simply is not there.
 const sz=C.sizeJ, span=Math.min(PX1-PX0,PY1-PY0)*0.5;
 const ringR=Math.min(C.clearR+90+R()*70,span-60);
 const n=6+((R()*5)|0);
 for(let k=0;k<n;k++){ const a=k/n*6.283+R()*0.3;
  place(obs,C,shapeNGon(C.px+Math.cos(a)*ringR,C.py+Math.sin(a)*ringR,(24+R()*16)*sz,6,a),26); }
 const m=5+((R()*5)|0)+Math.min(6,idx>>1);
 for(let k=0;k<m;k++) for(let t=0;t<22;t++){
  const a=R()*6.283, rad=ringR+80+R()*300;
  const x=C.px+Math.cos(a)*rad, y=C.py+Math.sin(a)*rad, roll=R(), r=(34+R()*30)*sz;
  const cand=roll<0.4?shapeNGon(x,y,r,8,R()*6.283)
   :(roll<0.72?shapeBar(x,y,(90+R()*110)*sz,(22+R()*16)*sz,R()*6.283)
   :{kind:'rect',x:x-r,y:y-r*0.7,w:r*2,h:r*1.4});
  if(place(obs,C,cand,28)) break;
 }
}
function layoutCorridors(R,obs,C,idx){
 // Lanes of girders with deliberate gaps, sometimes diagonal. Fights here are
 // about corners and firing angles rather than open-field circling.
 const sz=C.sizeJ, diag=R()<0.4, lanes=3+((R()*3)|0);
 for(let k=0;k<lanes;k++){
  const horiz=R()<0.5, segs=2+((R()*3)|0);
  const rot=diag?(R()<0.5?0.7854:-0.7854):(horiz?0:1.5708);
  for(let sN=0;sN<segs;sN++) for(let t=0;t<16;t++){
   const x=PX0+60+R()*(PX1-PX0-120), y=PY0+60+R()*(PY1-PY0-120);
   if(place(obs,C,shapeBar(x,y,(150+R()*220)*sz,(22+R()*14)*sz,rot),30)) break;
  }
 }
 const p=4+((R()*4)|0);
 for(let k=0;k<p;k++) for(let t=0;t<16;t++){
  const x=PX0+50+R()*(PX1-PX0-100), y=PY0+50+R()*(PY1-PY0-100);
  if(place(obs,C,{kind:'circle',x,y,r:(24+R()*20)*sz},26)) break;
 }
}
function layoutBastion(R,obs,C,idx){
 // Heavy octagonal bunkers with lighter scatter filling the gaps between them.
 const sz=C.sizeJ, big=3+((R()*3)|0);
 for(let k=0;k<big;k++) for(let t=0;t<24;t++){
  const x=PX0+90+R()*(PX1-PX0-180), y=PY0+90+R()*(PY1-PY0-180);
  if(place(obs,C,shapeNGon(x,y,(58+R()*36)*sz,8,R()*6.283),34)) break;
 }
 const small=9+((R()*7)|0)+Math.min(10,idx);
 for(let k=0;k<small;k++) for(let t=0;t<20;t++){
  const x=PX0+50+R()*(PX1-PX0-100), y=PY0+50+R()*(PY1-PY0-100), roll=R();
  const cand=roll<0.5?shapeNGon(x,y,(22+R()*20)*sz,6,R()*6.283)
   :(roll<0.78?{kind:'circle',x,y,r:(20+R()*18)*sz}
   :shapeTrap(x,y,(56+R()*46)*sz,(40+R()*30)*sz,R()*6.283));
  if(place(obs,C,cand,24)) break;
 }
}
function layoutSpokes(R,obs,C,idx){
 // Radial avenues running out of the clearing, gaps between the arms.
 const sz=C.sizeJ, arms=4+((R()*4)|0), base=R()*6.283, start=C.clearR+70;
 for(let k=0;k<arms;k++){
  const a=base+k/arms*6.283, segs=2+((R()*3)|0);
  for(let sN=0;sN<segs;sN++){
   const rad=start+sN*(130+R()*90);
   place(obs,C,shapeBar(C.px+Math.cos(a)*rad,C.py+Math.sin(a)*rad,(120+R()*110)*sz,(22+R()*14)*sz,a+1.5708),28);
  }
  const rad2=start+segs*(140+R()*60);
  place(obs,C,shapeNGon(C.px+Math.cos(a)*rad2,C.py+Math.sin(a)*rad2,(26+R()*18)*sz,6,a),26);
 }
 const fill=5+((R()*5)|0);
 for(let k=0;k<fill;k++) for(let t=0;t<16;t++){
  const x=PX0+60+R()*(PX1-PX0-120), y=PY0+60+R()*(PY1-PY0-120);
  if(place(obs,C,{kind:'circle',x,y,r:(22+R()*22)*sz},26)) break;
 }
}
function layoutScatter(R,obs,C,idx){
 const sz=C.sizeJ, n=10+((R()*6)|0)+Math.min(10,idx);
 for(let i=0;i<n;i++) for(let t=0;t<24;t++){
  const x=PX0+50+R()*(PX1-PX0-100), y=PY0+50+R()*(PY1-PY0-100), roll=R();
  let cand;
  if(roll<0.22) cand={kind:'circle',x,y,r:(26+R()*40)*sz};
  else if(roll<0.44) cand=shapeNGon(x,y,(28+R()*32)*sz,R()<0.5?6:5,R()*6.283);
  else if(roll<0.60) cand=shapeWedge(x,y,(32+R()*28)*sz,R()*6.283);
  else if(roll<0.76) cand=shapeBar(x,y,(80+R()*120)*sz,(24+R()*18)*sz,R()*6.283);
  else { const w=(50+R()*110)*sz, h=(50+R()*110)*sz; cand={kind:'rect',x:x-w/2,y:y-h/2,w,h}; }
  if(place(obs,C,cand,24)) break;
 }
}
function buildLayout(kind,R,obs,C,idx){
 if(kind==='arena') layoutArena(R,obs,C,idx);
 else if(kind==='corridors') layoutCorridors(R,obs,C,idx);
 else if(kind==='bastion') layoutBastion(R,obs,C,idx);
 else if(kind==='spokes') layoutSpokes(R,obs,C,idx);
 else if(kind==='scatter') layoutScatter(R,obs,C,idx);
 else layoutDebris(R,obs,C,idx);
 // density floor: a small early map, or an archetype whose geometry mostly fell
 // outside the bounds, must still offer real cover rather than an empty void
 const minObs=idx<3?8:6;
 if(obs.length<minObs) layoutScatter(R,obs,C,idx);
}
function genArenaValidated(baseSeed, idx, spawnTypes){
 const theme=THEMES[idx%THEMES.length];
 const px=(PX0+PX1)/2, py=(PY0+PY1)/2; // player drops at map center: keep it clear
 // One shuffled deck of archetypes per run, dealt by sector index: every run
 // cycles through all six. Picking from runSeed alone gave every normal sector
 // of a run the SAME layout.
 const patR=mulberry32((baseSeed^0x51ab3f)>>>0), deck=LAYOUTS.slice();
 for(let k=deck.length-1;k>0;k--){ const m=(patR()*(k+1))|0; const t=deck[k]; deck[k]=deck[m]; deck[m]=t; }
 const layoutKind=isBossSector(idx)?'arena':deck[idx%deck.length];
 for(let att=0; att<40; att++){
  const s=(baseSeed+att*100003+idx*7919)>>>0;
  const R=mulberry32(s);
  const obs=[];
  // Boss nests keep a clearer centre for the duel. Scaled to the map: a flat
  // 300px clearing swallowed most of an early 1200x880 sector.
  const clearR=isBossSector(idx)?Math.min(300,Math.min(PX1-PX0,PY1-PY0)*0.30):210;
  const clearOfSpawn=(x,y,r)=>Math.hypot(x-px,y-py)<clearR+r;
  const overlaps=(x,y,pad)=>obs.some(b=>{ if(b.kind==='rect') return x>b.x-pad&&x<b.x+b.w+pad&&y>b.y-pad&&y<b.y+b.h+pad; const dx=x-b.x,dy=y-b.y; return dx*dx+dy*dy<(b.r+pad)*(b.r+pad); });
  const inBounds=(x,y,m)=>x-m>=PX0&&y-m>=PY0&&x+m<=PX1&&y+m<=PY1;
  const C={px,py,clearR,clearOfSpawn,inBounds,sizeJ:Math.min(1.3,0.85+idx*0.05)};
  buildLayout(layoutKind,R,obs,C,idx);
  // candidate spawns + portal: opening spawns spread across quadrants (round-robin)
  // so no sector opens with every pack in one corner; each spawn's wall margin
  // fits what actually spawns there (bosses need a 34px gap, brutes 22, rest 14).
  const R2=mulberry32((s^0x9e3779b9)>>>0);
  const midX=(PX0+PX1)/2, midY=(PY0+PY1)/2;
  const marginFor=(ty)=>ty.indexOf('boss:')===0?34:(ty==='brute'?22:14);
  const spawns=spawnTypes.map((ty,k)=>{ const q=k%4;
   return freeSpotIn(R2,obs,px,py,240,marginFor(ty),(q===0||q===2)?PX0:midX,(q===0||q===2)?midX:PX1,q<2?PY0:midY,q<2?midY:PY1); });
  const bIdx=[]; spawnTypes.forEach((ty,k)=>{ if(ty.indexOf('boss:')===0) bIdx.push(k); });
  if(bIdx.length){ const ring=bossRingSpots(R2,obs,bIdx.length,110); bIdx.forEach((k,n)=>{ spawns[k]=ring[n]; }); }
  const port=freeSpot(R2,obs,px,py,300,24);
  const chk=bfsCheck(px,py,spawns.concat([port]),obs);
  if(chk.ok&&chk.ratio>=0.55&&chk.openFrac>=0.45) return {seed:s, obs, theme, layout:layoutKind, spawns, port, validated:true, ratio:chk.ratio, openFrac:chk.openFrac};
 }
 // fallback: open field (always playable)
 return {seed:baseSeed>>>0, obs:[], theme, layout:'open-fallback', spawns:spawnTypes.map((_,i)=>({x:PX0+80+(i%4)*((PX1-PX0-160)/3),y:PY0+70})), port:{x:PX1-90,y:PY1-90}, validated:true, ratio:1, openFrac:1};
}

// ---------- enemies ----------
// endless scaling: fast growth for the first 5 sectors, then a gentler endless ramp.
// Curves stay below player power growth (~+20-30% damage per draft) so deep
// sectors stay hard but playable — density is decor, not difficulty.
// Named eHpScale/eDmgScale, not hpMult/dmgMult: the old names shadowed the
// player's own `dmgMult` property in every reader's head.
// The HP curve is EXPONENTIAL past the opening sectors because player power is
// exponential too. A near-linear enemy curve is why S30 melted in four seconds.
// EXP_HP is tuned in test.js against the measured capped player DPS curve —
// change one and re-run `node test.js --only balance`.
// Fitted, not guessed. A balanced draft's sustained DPS grows ~22x between S5
// and S60; nest HP must grow ~43x over the same span to hold time-to-kill in a
// 26s->55s band, which solves to these bases. Enemy DAMAGE deliberately grows
// slower than player max HP so deep sectors kill you through density and
// pressure rather than by two-shotting you out of nowhere.
//
// Three segments, because the player curve has three phases:
//   S5-S60    both sides grow fast; EXP_HP tracks the drafted build.
//   S60-S100  the capped card pool PLATEAUS the player. A single exponential
//             kept compounding here and walled the run at ~S85-95 — before
//             the Apex, which the design requires to be winnable. Growth slows
//             to *_LATE so it stays harder every nest but beatable with farming.
//   S100+     past the Apex bosses repeat. S100-S110 is a two-nest breather,
//             then *_APEX ramps steeply on purpose: the endless run is meant
//             to end, in the S110-S130 band. Asserted in test.js --only balance.
// a is the 0-based sector index; S60 is a=59, S110 is a=109.
const EXP_HP=1.057, EXP_HP_LATE=1.02, EXP_HP_APEX=1.10;
const EXP_DMG=1.030, EXP_DMG_LATE=1.012, EXP_DMG_APEX=1.07;
function seg(a,lo,hi){ return Math.max(0,Math.min(a,hi)-lo); }
function eHpScale(a){ return (1+0.32*Math.min(a,4))*Math.pow(EXP_HP,seg(a,4,59))*Math.pow(EXP_HP_LATE,seg(a,59,109))*Math.pow(EXP_HP_APEX,Math.max(0,a-109)); }
function eDmgScale(a){ return (1+0.10*Math.min(a,6))*Math.pow(EXP_DMG,seg(a,6,59))*Math.pow(EXP_DMG_LATE,seg(a,59,109))*Math.pow(EXP_DMG_APEX,Math.max(0,a-109)); }
const EBASE={ drone:{hp:24,sp:130,dmg:8,r:10,xp:3}, stalker:{hp:40,sp:110,dmg:12,r:11,xp:4}, sniper:{hp:30,sp:70,dmg:10,r:10,xp:4}, brute:{hp:130,sp:75,dmg:20,r:18,xp:8}, boss:{hp:1500,sp:90,dmg:15,r:30,xp:50}, mite:{hp:18,sp:155,dmg:6,r:7,xp:2}, tempest:{hp:46,sp:95,dmg:9,r:11,xp:5} };
let uidC=1;
function mkEnemy(type,x,y,a){
 const hm=eHpScale(a), dm=eDmgScale(a);
 const b=EBASE[type];
 const j=0.9+Math.random()*0.2;
  return { type, kind:null, x, y, r:b.r, hp:b.hp*hm, maxhp:b.hp*hm, sp:b.sp*j*(1+Math.min(0.25,0.02*a)), dmg:Math.round(b.dmg*dm),
   xp:b.xp, uid:uidC++, orbCd:0, slowT:0, burnT:0, burnDps:0, lastHit:timeSec, t:Math.random()*10, fireCd:1+Math.random()*1.5, slamCd:1.5, windup:0,
  dashState:0, strafeT:0.8+Math.random()*0.8, dashT:0, dashDx:0, dashDy:0, strafeDir:Math.random()<0.5?1:-1,
  aimT:0, flash:0, contactCd:0, phase:0, phaseT:0, burstT:0, charging:false, chargeDx:0, chargeDy:0, teleCd:2, spirT:0,
  mode:'hunt', modeT:8, warnT:0, warnX:0, warnY:0, phased:false, spawned:[], spdMul:1, bname:'',
  canRecover:false, desperate:false, retreatHp:0, laser:null, laserT:3, beamT:0, beamA:0, wave2:false,
   wob:Math.random()*6.28, vscale:0.92+Math.random()*0.16, spawnT:0.5 };
}
// ---------- boss roster ----------
// Twelve kinds. Each one owns a distinct phase cycle drawn from a shared library
// of attack primitives PLUS a signature mechanic nothing else has, and a distinct
// silhouette — so they read as different fights, not restatted reskins.
//   tier      : rank in the chain of command (TIER_NAMES). Load-bearing: a boss
//               only ever summons bosses from exactly one tier below it.
//   debut     : the nest where it is first met, alone. The single source of
//               truth for "first seen" — the schedule and the codex both read it.
//   hp        : pre-scale base, multiplied by eHpScale(sector)
//   phases    : cycle of primitives, advanced every `pt` seconds
//   sig       : the mechanic unique to this boss
//   recov     : null | 'retreat' | 'phase'  (budgeted by the recovery economy)
//   chaff     : the ordinary enemies it summons (flavour only — boss-class
//               summons come from the tier table, never from this list)
//   commander : calls lieutenants on a shorter cadence
const BOSSDEF={
 overlord:{name:'OVERLORD',tier:1,debut:5,hp:985,r:30,spd:1.00,shape:'octa',pt:3.0,
  phases:['burst','summon','charge','sweep'],sig:null,recov:null,chaff:['drone','stalker']},
 warden:{name:'WARDEN',tier:2,debut:10,hp:1250,r:34,spd:0.80,shape:'hex',pt:3.5,
  phases:['spiral','summon','slam','twinwave'],sig:null,recov:'retreat',chaff:['drone','stalker']},
 phantom:{name:'PHANTOM',tier:2,debut:15,hp:760,r:26,spd:1.35,shape:'diamond',pt:9,
  phases:['skirmish'],sig:'laser',recov:'phase',chaff:['drone','mite']},
 leviathan:{name:'LEVIATHAN',tier:3,debut:30,hp:1700,r:36,spd:0.85,shape:'serpent',pt:4.0,
  phases:['tailsweep','mines','burrow','spiral'],sig:'segments',recov:'retreat',chaff:['mite','drone']},
 oracle:{name:'ORACLE',tier:3,debut:40,hp:1150,r:30,spd:0.90,shape:'eye',pt:3.6,
  phases:['clockbeam','zone','summon','burst'],sig:'wards',recov:'phase',chaff:['tempest','drone']},
 archon:{name:'ARCHON',tier:4,debut:50,hp:1800,r:34,spd:0.90,shape:'crown',pt:3.8,
  phases:['crossbeam','lieutenant','burst','slam'],sig:'command',recov:'retreat',chaff:['stalker','sniper'],commander:true},
 basilisk:{name:'BASILISK',tier:3,debut:60,hp:1350,r:31,spd:1.10,shape:'coil',pt:3.4,
  phases:['gaze','linecharge','spikes','fan'],sig:'petrify',recov:null,chaff:['stalker','mite']},
 harbinger:{name:'HARBINGER',tier:3,debut:70,hp:1100,r:29,spd:1.00,shape:'star',pt:3.2,
  phases:['spiralwall','meteor','fan','spiral'],sig:null,recov:null,chaff:['tempest','mite']},
 juggernaut:{name:'JUGGERNAUT',tier:4,debut:80,hp:1700,r:38,spd:0.95,shape:'ram',pt:3.0,
  phases:['ram','slam','debris','ram'],sig:'vent',recov:null,chaff:['brute','drone']},
 nullifier:{name:'NULLIFIER',tier:4,debut:90,hp:1250,r:30,spd:1.00,shape:'prism',pt:3.4,
  phases:['disrupt','fan','summon','burst'],sig:'jam',recov:'phase',chaff:['sniper','stalker']},
 chorus:{name:'CHORUS',tier:4,debut:95,hp:1400,r:28,spd:1.05,shape:'triad',pt:3.0,
  phases:['fan','spiral','summon','burst'],sig:'split',recov:null,chaff:['mite','drone']},
 singularity:{name:'SINGULARITY',tier:5,debut:100,hp:1950,r:40,spd:0.85,shape:'well',pt:4.0,
  phases:['gravity','debris','lieutenant','spiralwall'],sig:'wellpull',recov:'phase',chaff:['tempest','brute'],commander:true}
};
// ---------- the chain of command ----------
// Rank names are deliberately NOT boss names — "WARDEN" as a rank would collide
// with the WARDEN boss, so tier 2 is CAPTAIN.
const TIER_NAMES=['CHAFF','ENFORCER','CAPTAIN','LORD','SOVEREIGN','APEX'];
const BOSS_KINDS=Object.keys(BOSSDEF);
// Derived once from BOSSDEF so tier membership is never typed twice.
const BOSSES_BY_TIER=(()=>{ const t=[]; for(const k of BOSS_KINDS){ const n=BOSSDEF[k].tier; (t[n]=t[n]||[]).push(k); } return t; })();
const DEBUTS=(()=>{ const m={}; for(const k of BOSS_KINDS) m[BOSSDEF[k].debut]=k; return m; })();
// Command depth — how many links of boss-class lieutenant a nest may field — is
// set by SECTOR, not by the boss's own tier. That is what keeps the recursion
// from exploding early: below S31 nothing can summon a boss at all, however
// high-ranked it is. A lieutenant inherits one less, so every chain terminates.
function commandDepth(n){ if(n<=30) return 0; if(n<=60) return 1; if(n<=100) return 2; return Math.min(4,3+(((n-101)/50)|0)); }
// Nest-wide, shared by every boss in the nest and every link of every chain.
function ltBudgetFor(n){ if(n<=30) return 0; if(n<=60) return 2; if(n<=100) return 3; return Math.min(6,4+(((n-101)/40)|0)); }
// Subordinate escorts beside the nest's commander (not lieutenants — these are
// full bosses present from the start).
// Past the Apex the courts regrow from one escort: S101-S110 two bosses, S111+
// three. Jumping straight to a full court at S105 walled the run instantly.
function escortsFor(n){ if(n<=60) return 1; if(n<=100) return 2; return Math.min(3,1+(((n-101)/10)|0)); }
const LT_LIVE_CAP=2;     // at most this many lieutenants alive at once, regardless of budget
const LT_HP_DECAY=0.22;  // a lieutenant at chain depth d has 0.22^d of a full boss
// Hand-authored set pieces that override the derived schedule. Everything not
// listed here is derived from tiers and debuts by bossKindsFor.
const SIGNATURE_NESTS={
 5:{kinds:['overlord']},             // the gatekeeper: alone, and too early to recover
 50:{kinds:['archon']},              // the first Sovereign and the first real command stack
 100:{kinds:['singularity'],cmd:3}   // the Apex: three links of command beneath it
};
// ---------- recovery economy (applies to EVERY boss, present and future) ----------
// The old rule was "recover whenever the 8s mode timer expires", which let an
// S10 PHANTOM phase out eight times in two minutes and knit ~25% of its bar back
// while untouchable — the fight could not be won, only outlasted. Recovery is now
// a scripted, budgeted beat instead of a loop:
//   * at most RECOV_MAX times per boss, for the whole fight
//   * triggered by crossing an HP threshold, never by a timer
//   * never in the opening RECOV_OPEN seconds, never below RECOV_FLOOR HP
//   * RECOV_CD seconds minimum between them
//   * each one may restore at most RECOV_HEAL of max HP (drawn from a pool, so
//     a long recovery heals no more than a short one)
// Lifetime healing is therefore hard-capped at RECOV_MAX*RECOV_HEAL = 12%.
const RECOV_MAX=2, RECOV_CD=30, RECOV_OPEN=12, RECOV_HEAL=0.06, RECOV_FLOOR=0.30;
const BOSS_HARD_ENRAGE=180; // safety valve: no boss fight may stall past 3 minutes
function bossHeal(e,amt){ if(e.healPool<=0) return; const h=Math.min(amt,e.healPool,e.maxhp-e.hp); if(h<=0) return; e.hp+=h; e.healPool-=h; }
function mkBoss(kind,x,y,s){
 const d=BOSSDEF[kind]||BOSSDEF.overlord;
 const e=mkEnemy('boss',x,y,s);
 e.kind=kind; e.def=d; e.bname=d.name; e.r=d.r;
 // Shared scaling, not a second inline copy of the formula. The duplicate that
 // used to live here had drifted to a linear curve while regular enemies used
 // the exponential one, so bosses fell further behind the player every nest.
 // Multi-boss nests: total HP rises sub-linearly with count and each boss hits
 // softer, so three bosses is busier and harder — not three times longer.
 const n=bossKindsFor(s).length||1;
 e.maxhp=e.hp=d.hp*eHpScale(s)*(0.34+0.66/n);
 e.dmg=Math.round(15*eDmgScale(s)*(0.75+0.25/n));
 e.mode='hunt'; e.modeT=8;
 // Recovery unlocks past S5 and only for archetypes that own one. The S5
 // OVERLORD is pure aggression — no recovery, ever, so the first nest teaches
 // the fight without teaching the escape.
 e.recovKind=(s>=9)?(d.recov||null):null;
 e.recovLeft=e.recovKind?RECOV_MAX:0; e.recovCd=RECOV_OPEN; e.recovAt=0.66; e.healPool=0;
 e.fightT=0; e.hardEnrage=false; e.hunger=0;
 e.stuckT=0; e.sampleT=0.5; e.lastX=x; e.lastY=y;
 e.spdMul=d.spd; e.sp*=d.spd;
 e.phase=0; e.phaseT=0; e.segs=[]; e.wards=[]; e.split=0;
 e.gazeT=2.5+Math.random(); e.zoneT=2; e.ramT=1; e.wellT=2;
 e.chain=0; e.cmd=nestCommandDepth(s); e.ltCd=d.commander?5:9;
 if(d.sig==='segments'){ for(let k=0;k<5;k++) e.segs.push({x,y,r:d.r*(0.72-k*0.08)}); }
 return e;
}
// A boss fielded as another boss's lieutenant. Same behaviour and silhouette,
// but HP decays by how far down the chain it sits (22% / 4.8% / 1.1%), it hits
// softer, it inherits one less link of command, and it never recovers —
// otherwise a deep nest would stack several recovery economies on each other.
function mkLieutenant(kind,x,y,s,chain,cmd){
 const e=mkBoss(kind,x,y,s);
 const d=e.def;
 e.maxhp=e.hp=d.hp*eHpScale(s)*Math.pow(LT_HP_DECAY,chain);
 e.dmg=Math.round(15*eDmgScale(s)*0.7*Math.pow(0.9,chain-1));
 e.r=d.r*0.8;
 e.lieutenant=true; e.chain=chain; e.cmd=Math.max(0,cmd);
 e.recovKind=null; e.recovLeft=0;
 e.bname=d.name+' LT';
 return e;
}
// steering: probe ahead and slide around obstacles instead of face-planting into them
function steer(e,dx,dy){
 const l=len(dx,dy)||1; dx/=l; dy/=l;
 if(!arena||!arena.obs) return [dx,dy];
 const m=e.r+6;
 if(!pointBlocked(e.x+dx*48,e.y+dy*48,m,arena.obs)) return [dx,dy];
 for(const a of [0.6,-0.6,1.2,-1.2,1.9,-1.9]){
  const c=Math.cos(a), s=Math.sin(a), nx=dx*c-dy*s, ny=dx*s+dy*c;
  if(!pointBlocked(e.x+nx*48,e.y+ny*48,m,arena.obs)) return [nx,ny];
 }
 return [dx,dy];
}
function startRun(){
 runSeed=(Math.random()*0xFFFFFFFF)>>>0;
 titleMusOk=false;
 arenaIdx=0; kills=0; arenasCleared=0; timeSec=0;
 bullets=[]; ebullets=[]; gems=[]; parts=[]; floaters=[]; rings=[]; hazards=[]; strikes=[]; beams=[]; portal=null;
 spawnQueue=[]; spawnT=0;
 upgradeCounts={};
 player=newPlayer(1+0.02*bosses);
 starterOffered=false; pendingLevels=0; pity={spd:0,pcell:0};
 loadArena(0); // live world behind the hub; entering S1 reloads it fresh
 galaxySel=0; clearedMax=-1;
 setMusicCfg(TITLE_MUS);
 state='galaxy'; autoPaused=false;
 saveRun();
}
// ---------- run save / resume ----------
// A run ends only when the ship dies. It is checkpointed to localStorage every
// time it reaches the galaxy hub and every time it enters a sector, so closing
// the tab, reloading, or quitting to the title never loses it. Resuming lands on
// the hub with that sector selected. What happens INSIDE a sector after entering
// it is not saved: quitting mid-sector replays the sector from its start, so a
// reload can never duplicate XP, drafts or kills.
const RUN_V=1;
function saveRun(){
 if(!player) return;
 const snap={ v:RUN_V, runSeed, arenaIdx, kills, arenasCleared, timeSec, upgradeCounts,
  starterOffered, pendingLevels, clearedMax, galaxySel, pity,
  player:Object.assign({},player,{recall:null,channel:null}) };
 lsSet('run',JSON.stringify(snap));
}
function clearRun(){ lsDel('run'); }
// The title parses the saved run every frame (draw + hit-test + input), so
// memoize on the raw localStorage string: unchanged bytes are a cache hit
// with zero JSON.parse, and any write still re-parses on the next read.
let runCacheRaw=undefined, runCacheVal=null, runCacheHit=false;
function readRun(){
 try{
  const raw=lsGet('run')||'null';
  if(runCacheHit&&raw===runCacheRaw) return runCacheVal;
  const r=JSON.parse(raw);
  const ok=r&&r.v===RUN_V&&r.player&&typeof r.player==='object'&&isFinite(r.player.hp)&&r.player.hp>0&&isFinite(r.clearedMax)&&isFinite(r.galaxySel);
  runCacheRaw=raw; runCacheVal=ok?r:null; runCacheHit=true;
  return runCacheVal;
 }catch(e){ try{ runCacheRaw=lsGet('run')||'null'; }catch(_){ runCacheRaw='null'; } runCacheVal=null; runCacheHit=true; return null; }
}
function continueRun(){
 const r=readRun(); if(!r){ startRun(); return; }
 runSeed=r.runSeed>>>0;
 titleMusOk=false;
 kills=r.kills|0; arenasCleared=r.arenasCleared|0; timeSec=+r.timeSec||0;
 bullets=[]; ebullets=[]; gems=[]; parts=[]; floaters=[]; rings=[]; hazards=[]; strikes=[]; beams=[]; portal=null;
 spawnQueue=[]; spawnT=0;
 upgradeCounts=Object.assign({},r.upgradeCounts);
 // Merge onto fresh defaults, so a save written before a field existed still loads.
 player=Object.assign(newPlayer(1),r.player,{recall:null,channel:null});
 starterOffered=!!r.starterOffered; pendingLevels=r.pendingLevels|0;
 pity=Object.assign({spd:0,pcell:0},r.pity);
 loadArena(0); // live world behind the hub, as in startRun
 clearedMax=Math.max(-1,r.clearedMax|0); galaxySel=clamp(r.galaxySel|0,0,clearedMax+1);
 arenaIdx=r.arenaIdx|0;
 setMusicCfg(TITLE_MUS);
 state='galaxy'; autoPaused=false; titleConfirm=false;
}
let titleConfirm=false; // NEW RUN over a saved run asks twice
let endInfo={src:null,newBest:false,at:0}; // what ended the last hull, for the end screen
let restartArm=0; // pause RESTART asks twice, like NEW RUN
let draftAt=0, draftPress=-1; const DRAFT_GRACE=300; // a draft ignores the mouse briefly after opening: clicks meant as shots must not pick
function handleRelease(x,y){ if(state!=='levelup'||draftPress<0) return; const i=draftPress; draftPress=-1; const r=draftRect(i); if(levelChoices[i]&&x>r.x&&x<r.x+r.w&&y>r.y&&y<r.y+r.h) pickUpgrade(levelChoices[i]); }
function loadArena(i){
 arenaIdx=i;
 const s=i, boss=isBossSector(s);
 // larger worlds deeper down the trail
 const wz=sectorWorld(s); WW=wz.w; HH=wz.h;
 PX0=WALL; PY0=HUD_H+WALL; PX1=WW-WALL; PY1=HH-WALL;
 bullets=[]; ebullets=[]; gems=[]; rings=[]; hazards=[]; strikes=[]; beams=[]; portal=null; spawnQueue=[]; spawnT=1.4; sectorCleared=false;
 nestLtLeft=boss?ltBudgetFor(s+1):0;
  player.x=(PX0+PX1)/2; player.y=(PY0+PY1)/2; player.fireCd=0; player.dashT=0; player.invuln=1; player.shieldT=0; player.shieldReady=false; player.surgeT=0; player.recall=null; player.recallCd=0; player.channel=null;
  // round-refresh shields re-arm every arena; barrier pool + stasis persist until spent
  player.wardUp=player.hasWard; player.bulwark=player.bulMax; player.mirrorUp=player.hasMirror;
 cam.x=clamp(player.x-W/2,0,Math.max(0,WW-W)); cam.y=clamp(player.y-H/2,0,Math.max(0,HH-H));
 enemies=[];
 let types=[];
  if(boss){ for(const k of bossKindsFor(s)) types.push('boss:'+k);
   // nests open with a small honor guard so the arena feels alive, not 1v1 empty
   const guards=3+Math.min(3,(s/5)|0);
   for(let k=0;k<guards;k++) types.push(k%2?'stalker':'drone'); }
  else { const c=compFor(s); for(const t in c) for(let k=0;k<c[t];k++) types.push(t); }
 // shuffle so the opening wave is a mixed pack, not grouped by species
 for(let k=types.length-1;k>0;k--){ const j=(Math.random()*(k+1))|0; const tmp=types[k]; types[k]=types[j]; types[j]=tmp; }
 const g=genArenaValidated(runSeed,i,types);
 arena=g;
 // opening wave materializes on load; the rest streams in off-screen as the round progresses.
 // The opening pack scales with depth so big new maps start busy, not vacant.
 const initial=boss?types.length:Math.min(types.length,6+s);
 types.forEach((ty,k)=>{
  if(k<initial){
   const sp=g.spawns[k]||{x:PX0+80,y:PY0+80};
   enemies.push(ty.indexOf('boss:')===0?mkBoss(ty.slice(5),sp.x,sp.y,s):mkEnemy(ty,sp.x,sp.y,s));
  } else spawnQueue.push(ty);
 });
 if(boss){ bossWarnT=3.2; const kinds=bossKindsFor(s), lead=BOSSDEF[kinds[0]];
   // the arrival states the court's order, the same line the hub gave: who leads, who answers
   bossWarnTxt=kinds.length>1?lead.name+"'S COURT":lead.name;
   const ln=nestLore(s), tail=ln.indexOf(' — ')>=0?ln.slice(ln.indexOf(' — ')+3):ln;
   const sub=TIER_NAMES[lead.tier]+' · '+tail; bossWarnSub=sub.length<=86?[sub]:wrapLines(sub,Math.ceil(sub.length/2)+6).slice(0,2);
   nestTally={kinds:kinds.slice(),banked:0,firsts:[]}; SFX.alarm(); }
  setMusicCfg(g.theme);
  addFloater(player.x,player.y-30,sectorName(s)+' · '+g.theme.name.toUpperCase(),K.gold); enterT=performance.now();
}
// hostiles remaining this sector (alive + queued)
function hostiles(){ return enemies.length+spawnQueue.length; }
// reinforcement spawn point: off-screen edge, far from the player, out of walls
function spawnEdgePos(){
 const p=player, m=36;
 for(let t=0;t<12;t++){
  const a=Math.random()*6.283, d=560+Math.random()*220;
  const x=clamp(p.x+Math.cos(a)*d,PX0+m,PX1-m), y=clamp(p.y+Math.sin(a)*d,PY0+m,PY1-m);
  const dx=x-p.x, dy=y-p.y;
  if(dx*dx+dy*dy>380*380&&!pointBlocked(x,y,24,arena.obs)) return {x,y};
 }
 const fx=p.x<(PX0+PX1)/2?PX1-m-40:PX0+m+40, fy=p.y<(PY0+PY1)/2?PY1-m-40:PY0+m+40;
 return {x:clamp(fx,PX0+m,PX1-m), y:clamp(fy,PY0+m,PY1-m)};
}
function spawnEnemy(type){
 const q=spawnEdgePos();
 const e=type.indexOf('boss:')===0?mkBoss(type.slice(5),q.x,q.y,arenaIdx):mkEnemy(type,q.x,q.y,arenaIdx);
 e.spawnT=0.9; enemies.push(e);
 rings.push({x:q.x,y:q.y,r:6,maxR:46,spd:220,dmg:0,hit:true}); // harmless spawn ripple
}
// title music starts on first user gesture (autoplay policy needs one).
// Latch only on success so a blocked/failed attempt retries on the next gesture.
let titleMusOk=false;
function ensureTitleMusic(){ if(titleMusOk||!settings.music) return; try{ setMusicCfg(TITLE_MUS); titleMusOk=true; }catch(e){} }
function spawnBurst(x,y,n,col,spd,life,size){
 if(!settings.particles) n=Math.ceil(n/3);
 if(parts.length>=MAX_PARTS) return;
 if(n>MAX_PARTS-parts.length) n=MAX_PARTS-parts.length;
 for(let i=0;i<n;i++){ const a=Math.random()*6.283; const s=(0.4+Math.random()*0.6)*spd; pushPart({x,y,vx:Math.cos(a)*s,vy:Math.sin(a)*s,life:life*(0.6+Math.random()*0.6),maxlife:life,col,r:size*(0.6+Math.random()*0.8)}); }
}
function zapFx(x1,y1,x2,y2){ for(let i=0;i<=8;i++){ const t=i/8; pushPart({x:x1+(x2-x1)*t+(Math.random()-0.5)*10,y:y1+(y2-y1)*t+(Math.random()-0.5)*10,vx:0,vy:0,life:0.15,maxlife:0.15,col:K.gold,r:3}); } }
// A boss's call-outs rise from above its name, never through its rings and
// HP bar; anything else speaks from just over its hull.
function calloutY(e){ return e.type==='boss'?e.y-e.r-((e.def&&e.def.tier)||1)*3.5-58:e.y-44; }
function addFloater(x,y,txt,col){ let n=0; for(const f of floaters){ const dx=f.x-x, dy=f.y-y; if(dx*dx+dy*dy<576) n++; } if(floaters.length>=MAX_FLOATERS) floaters.splice(0,floaters.length-MAX_FLOATERS+1); floaters.push({x,y:y-n*14,txt,col:col||K.text,life:0.9}); }
// A single pickup can cross several thresholds at once — a Magnet Core vacuum
// banks the whole field in one call. The old `if` awarded exactly one draft and
// silently swallowed the rest, so the biggest payout in the game paid the least.
// Levels are now queued and drafted one after another.
function gainXp(v){
 player.xp+=v*player.xpBonus; SFX.pickup();
 while(player.xp>=player.xpNeed){
  player.xp-=player.xpNeed; player.level++; player.xpNeed=xpNeedFor(player.level); pendingLevels++;
  // Passive frame growth. Without it, deep sectors are only survivable by a
  // build that spends most of its draft picks on Nanoweave, which punishes
  // every interesting build. Enemy damage is tuned against this line.
  player.maxhp+=3; player.hp=Math.min(player.maxhp,player.hp+3);
 }
 if(pendingLevels>0&&state==='playing'){ pendingLevels--; openLevelUp(); }
}
// Magnet Core vacuum: bank every gem on the field at once. This is the ONLY way
// gems reach the ship without being flown over or pulled in — clearing a sector
// no longer vacuums the field. The credit is instantaneous, so show it: a streak
// from each gem toward the ship, and a running total, or it reads as "my XP
// vanished".
function collectGems(){ if(previewing) return; // a card preview must never touch the field
 let t=0;
  for(const g of gems){
   t+=g.v;
   for(let k=1;k<=3;k++){ const f=k/4;
    pushPart({x:g.x+(player.x-g.x)*f, y:g.y+(player.y-g.y)*f, vx:0, vy:0,
     life:0.30+f*0.20, maxlife:0.5, col:K.hydro, r:3.2});
   }
  }
 gems.length=0;
 if(t>0){
  const shown=Math.round(t*player.xpBonus);
  addFloater(player.x,player.y-40,'+'+shown+' XP',K.hydro);
  gainXp(t);
 }
}
function openLevelUp(){
 const avail=u=>(!u.req||u.req(player))&&(!u.max||(upgradeCounts[u.id]||0)<u.max);
 // first level-up always offers the two ability unlocks so dash/recall enter play early
 if(!starterOffered){
  starterOffered=true;
  const get=id=>UPGRADES.find(u=>u.id===id);
  const picks=[get('spd'),get('pcell')].filter(Boolean).filter(avail);
  const rest=UPGRADES.filter(u=>picks.indexOf(u)<0&&avail(u));
  while(picks.length<3&&rest.length) picks.push(rest.splice((Math.random()*rest.length)|0,1)[0]);
  openDraft(picks); return;
 }
  const pool=UPGRADES.filter(avail);
  const cp=pool.slice(); const picks=[];
  while(picks.length<3&&cp.length){ // rarity-weighted sample without replacement
   let tot=0; for(const u of cp) tot+=rarityW(u);
   let r=Math.random()*tot, ix=0;
   while(ix<cp.length-1&&r>rarityW(cp[ix])){ r-=rarityW(cp[ix]); ix++; }
   picks.push(cp.splice(ix,1)[0]);
  }
  // The most overdue locked core ability comes back as a FOURTH card, under the
  // usual three — never in place of one, so passing on it costs nothing.
  const due=CORE_UNLOCKS.filter(c=>c.locked(player)&&pity[c.id]>=PITY_DRAFTS&&!picks.some(u=>u.id===c.id)).sort((a,b)=>pity[b.id]-pity[a.id]);
  const back=due.length?pool.find(u=>u.id===due[0].id):null;
  if(back) picks.push(back);
  openDraft(picks,back);
}
// Single exit for every draft, starter included. Endless runs eventually exhaust
// a capped pool; without a repeatable filler the draft opens with zero cards and
// the 1/2/3 handler throws on undefined — a hard softlock at the exact moment a
// run is going well.
function openDraft(picks,back){
 if(!picks.length) picks=[REFIT];
 levelBack=back||null;
 for(const c of CORE_UNLOCKS){
  if(!c.locked(player)) pity[c.id]=0;
  else pity[c.id]=picks.some(u=>u.id===c.id)?0:pity[c.id]+1;
 }
 levelChoices=picks; floaters=[]; state='levelup'; draftAt=performance.now(); draftPress=-1; SFX.levelup();
}
function pickUpgrade(u){
 if(!u) return;
 nestDraftAt=0;
 upgradeCounts[u.id]=(upgradeCounts[u.id]||0)+1; u.apply(player);
 addFloater(player.x,player.y-24,u.name,K.gold);
 if(u.r===2) SFX.rare(); else SFX.upgrade();
 state='playing';
 if(pendingLevels>0){ pendingLevels--; openLevelUp(); } // drain queued level-ups
}
function scoreCalc(){ return kills*50+arenasCleared*250+player.level*100+Math.max(0,1800-Math.floor(timeSec)*5); }
function die(){ state='gameover'; floaters=[]; clearRun(); const s=scoreCalc(); endInfo={src:player.lastSrc||null, newBest:s>best&&s>0, at:performance.now()}; if(endInfo.src) markSeen(endInfo.src.id); if(s>best) best=s; depth=Math.max(depth,arenaIdx+1); saveMeta(); SFX.lose(); stopMusic(); spawnBurst(player.x,player.y,40,K.gold,260,0.8,4); }

// WARDEN retreat: fall back with guards — recovers only while unpressured,
// so chase it down and keep shooting to cut the recovery short.
// A free point in a ring around (cx,cy). Recovery minions use this instead of
// the off-screen edge: the player has to kill them to end the recovery, so
// spawning them 700px away in a corner turned a 5s beat into a scavenger hunt.
function nearSpot(cx,cy,minD,maxD,margin){
 for(let t=0;t<24;t++){
  const a=Math.random()*6.283, d=minD+Math.random()*(maxD-minD);
  const x=clamp(cx+Math.cos(a)*d,PX0+margin,PX1-margin), y=clamp(cy+Math.sin(a)*d,PY0+margin,PY1-margin);
  if(Math.hypot(x-cx,y-cy)<minD*0.7) continue;
  if(pointBlocked(x,y,margin,arena.obs)) continue;
  return {x,y};
 }
 return spawnEdgePos();
}
function bossRetreat(e){
 e.mode='retreat'; e.modeT=5; e.retreatHp=e.hp; e.charging=false; e.laser=null;
 e.healPool=e.maxhp*RECOV_HEAL; e.spawned=[];
 const nm=2+(arenaIdx>=15?1:0);
 for(let k=0;k<nm&&enemies.length<16;k++){ const s2=nearSpot(player.x,player.y,220,360,30); const m=mkEnemy(k?'stalker':'drone',s2.x,s2.y,arenaIdx); m.spawnT=0.9; enemies.push(m); e.spawned.push(m.uid); }
 addFloater(e.x,calloutY(e),e.bname+' RETREATS — chase it down',K.red); SFX.portal();
}
// PHANTOM phase: go translucent on the spot — kill every minion to break it out.
// It absorbs rounds at 30% damage while phased; it is never bullet-transparent.
function bossPhase(e){
 e.mode='phase'; e.modeT=4.5; e.phased=true; e.charging=false; e.laser=null; e.beamT=0;
 e.healPool=e.maxhp*RECOV_HEAL; e.spawned=[];
 const nm=2+(arenaIdx>=15?1:0);
 for(let k=0;k<nm&&enemies.length<16;k++){ const s2=nearSpot(player.x,player.y,200,330,26); const m=mkEnemy(k?'mite':'drone',s2.x,s2.y,arenaIdx); m.spawnT=0.9; enemies.push(m); e.spawned.push(m.uid); }
 rings.push({x:e.x,y:e.y,r:10,maxR:120,spd:320,dmg:0,hit:true});
 addFloater(e.x,calloutY(e),e.bname+' PHASES — kill minions',K.red); SFX.portal();
}
// Anti-stuck: a boss wedged in geometry, or one that has kited itself into a
// corner the player cannot reach, blinks back into the open near the player.
// Without this a fight can stall indefinitely with nothing to shoot.
function bossReposition(e,p){
 const spot=nearSpot(p.x,p.y,240,380,e.r+20);
 rings.push({x:e.x,y:e.y,r:8,maxR:80,spd:300,dmg:0,hit:true});
 e.x=clamp(spot.x,PX0+e.r,PX1-e.r); e.y=clamp(spot.y,PY0+e.r,PY1-e.r);
 resolveObstacles(e);
 rings.push({x:e.x,y:e.y,r:8,maxR:80,spd:300,dmg:0,hit:true});
 addFloater(e.x,calloutY(e),(e.bname||'BOSS')+' REPOSITIONS',K.red); SFX.portal();
}
// ---------- boss behaviour ----------
// Twelve bosses share one library of attack primitives; each definition picks a
// different cycle and owns one signature nothing else has. That keeps every
// fight readable (a telegraph means the same thing everywhere) while the
// combinations stay distinct.
function eshot(e,a,spd,r,dmgMul,life){ ebullets.push({x:e.x,y:e.y,vx:Math.cos(a)*spd,vy:Math.sin(a)*spd,r:r||6,dmg:Math.round(e.dmg*(dmgMul||1)),life:life||3.4,heavy:true}); }
// Ordinary enemies a boss throws into the fight. Flavour per boss, no hierarchy.
function summonChaff(e,n,cap){
 const kinds=(e.def&&e.def.chaff)||['drone'];
 let made=0;
 for(let i=0;i<n;i++){
  if(enemies.length>=(cap||9)) break;
  const s2=nearSpot(player.x,player.y,260,400,26);
  const m=mkEnemy(kinds[i%kinds.length],s2.x,s2.y,arenaIdx); m.spawnT=0.9; enemies.push(m);
  made++;
 }
 if(made) addFloater(e.x,calloutY(e),'SUMMON',K.red);
}
// ---------- command ----------
// Who a boss may call: exactly one rank below it, and only kinds already met on
// the trail — every boss is fought alone at its debut before it can ever turn
// up as somebody's lieutenant.
function subordinateKinds(tier,n){ return (BOSSES_BY_TIER[tier-1]||[]).filter(k=>BOSSDEF[k].debut<=n); }
function liveLieutenants(){ let c=0; for(const o of enemies) if(o.lieutenant&&!o.echo) c++; return c; }
// Four structural limits, all of which must allow it: this boss's own command
// depth, the nest-wide budget, the live cap, and a rank below that exists yet.
function canCommand(e){
 if(!e.def||e.cmd<=0||nestLtLeft<=0||liveLieutenants()>=LT_LIVE_CAP) return false;
 return subordinateKinds(e.def.tier,arenaIdx+1).length>0;
}
function callLieutenant(e){
 const opts=subordinateKinds(e.def.tier,arenaIdx+1);
 const kind=opts[(Math.random()*opts.length)|0];
 nestLtLeft--;
 const s2=nearSpot(e.x,e.y,200,330,40);
 const lt=mkLieutenant(kind,s2.x,s2.y,arenaIdx,e.chain+1,e.cmd-1);
 lt.spawnT=0.9; enemies.push(lt);
 rings.push({x:s2.x,y:s2.y,r:10,maxR:120,spd:300,dmg:0,hit:true});
 addFloater(e.x,calloutY(e),e.bname+' CALLS '+TIER_NAMES[lt.def.tier]+' '+lt.def.name,K.red); SFX.alarm();
}
function bossBehave(e,C){
 const p=C.p, d=C.d, nx=C.nx, ny=C.ny, dt=C.dt, sF=C.sF, enrage=C.enrage;
 const def=e.def||BOSSDEF.overlord;
 // hunger: disengaging makes it hunt harder, so running away never pays
 const spdM=(enrage?1.35:1)*(1+0.35*e.hunger);
 const aim=Math.atan2(C.dy,C.dx);
 const mv=f=>{ const sv=steer(e,nx,ny); e.x+=sv[0]*e.sp*f*spdM*sF*dt; e.y+=sv[1]*e.sp*f*spdM*sF*dt; };
 const orbit=f=>{ e.x+=(-ny*e.sp*f*spdM*sF+nx*(d>320?60:-30))*dt; e.y+=(nx*e.sp*f*spdM*sF+ny*(d>320?60:-30))*dt; };
 e.charging=false;
 e.phaseT+=dt;
 const cyc=def.phases, pt=def.pt||3;
 e.phase=Math.floor(e.phaseT/pt)%cyc.length;
 if(e.phaseT>=pt*cyc.length) e.phaseT=0;
 bossSignature(e,C,spdM,aim);
 // The chain of command runs on its own clock, independent of the phase cycle,
 // so EVERY boss with rank below it commands — not just the two that happen to
 // have a 'lieutenant' phase. canCommand() is where the cascade is bounded.
 e.ltCd-=dt;
 if(e.ltCd<=0){ e.ltCd=def.commander?9:16; if(canCommand(e)) callLieutenant(e); }
 switch(cyc[e.phase]){
  case 'burst': // radial ring — walk out of the gaps
   mv(0.5); e.burstT-=dt;
   if(e.burstT<=0){ e.burstT=enrage?0.75:1.1; const n=enrage?12:8;
    for(let k=0;k<n;k++) eshot(e,k/n*6.283+e.t,230,6);
    SFX.eshoot(); }
   break;
  case 'summon':
   mv(0.3); e.burstT-=dt;
   if(e.burstT<=0){ e.burstT=2.6; summonChaff(e,2,8); }
   break;
  case 'lieutenant': // commanders: call a subordinate now if allowed, chaff if not
   mv(0.35); e.burstT-=dt;
   if(e.burstT<=0){ e.burstT=7;
    if(canCommand(e)){ callLieutenant(e); e.ltCd=Math.max(e.ltCd,6); }
    else summonChaff(e,2,10); }
   break;
  case 'charge':
   if(!e.chargeOn){ e.chargeOn=true; e.chargeDx=nx; e.chargeDy=ny; addFloater(e.x,calloutY(e),'CHARGE',K.red); }
   e.charging=true;
   e.x+=e.chargeDx*(enrage?340:300)*dt; e.y+=e.chargeDy*(enrage?340:300)*dt;
   break;
  case 'sweep': // fan tracking across an arc — keep moving, don't stand in it
   mv(0.4); e.spirT-=dt;
   if(e.spirT<=0){ e.spirT=enrage?0.11:0.14; eshot(e,aim+Math.sin(e.phaseT*2.2)*1.1,250,5); }
   break;
  case 'spiral':
   mv(0.4); e.spirT-=dt;
   if(e.spirT<=0){ e.spirT=enrage?0.14:0.2; const a0=e.t*2.2;
    for(let k=0;k<3;k++) eshot(e,a0+k*2.094,210,6);
    SFX.eshoot(); }
   break;
  case 'spiralwall': // dense rotating wall with ONE safe gap — find it and hold it
   mv(0.3); e.spirT-=dt;
   if(e.spirT<=0){ e.spirT=enrage?0.30:0.42; const n=13, gap=(e.t*0.9)%6.283;
    for(let k=0;k<n;k++){ const a=k/n*6.283;
     let da=Math.abs(((a-gap+Math.PI)%6.283)-Math.PI);
     if(da<0.55) continue; // the gap
     eshot(e,a+e.t*0.5,190,5,0.85,4); }
    SFX.eshoot(); }
   break;
  case 'fan':
   orbit(1.0); e.burstT-=dt;
   if(e.burstT<=0){ e.burstT=enrage?1.1:1.7;
    for(let k=-2;k<=2;k++) eshot(e,aim+k*0.16,260,5);
    SFX.eshoot(); }
   break;
  case 'skirmish': // PHANTOM's whole kit: weave, fan, blink
   orbit(1.1); e.burstT-=dt;
   if(e.burstT<=0){ e.burstT=enrage?1.1:1.7;
    for(let k=-2;k<=2;k++) eshot(e,aim+k*0.16,260,5);
    SFX.eshoot(); }
   e.teleCd-=dt;
   // Blink to a VALIDATED spot 190-300px out: on screen, out of obstacles, off
   // the walls. The old version clamped a raw 260-380px flank offset, which
   // regularly dumped it off-screen or half inside a pylon — you lost the boss.
   if(e.teleCd<=0){ e.teleCd=enrage?3:4.5;
    rings.push({x:e.x,y:e.y,r:8,maxR:70,spd:300,dmg:0,hit:true});
    const tp=nearSpot(p.x,p.y,190,300,e.r+16);
    e.x=clamp(tp.x,PX0+e.r,PX1-e.r); e.y=clamp(tp.y,PY0+e.r,PY1-e.r);
    resolveObstacles(e);
    rings.push({x:e.x,y:e.y,r:8,maxR:70,spd:300,dmg:0,hit:true}); SFX.portal(); }
   break;
  case 'slam':
   mv(0.7); e.slamCd-=dt;
   if(d<150&&e.slamCd<=0){ e.slamCd=enrage?1.6:2.4;
    rings.push({x:e.x,y:e.y,r:20,maxR:175,spd:300,dmg:e.dmg,hit:false,heavy:true});
    SFX.ring(); if(settings.shake) shake=Math.min(10,shake+4); spawnBurst(e.x,e.y,14,K.red,220,0.5,3); }
   break;
  case 'twinwave': // two staggered rings — dodge, then dodge again
   mv(0.5); e.slamCd-=dt;
   if(e.slamCd<=0){ e.slamCd=enrage?2.0:2.8;
    rings.push({x:e.x,y:e.y,r:20,maxR:150,spd:280,dmg:e.dmg,hit:false,heavy:true});
    e.wave2=true; e.burstT=0.4; SFX.ring(); if(settings.shake) shake=Math.min(10,shake+3); }
   break;
  case 'tailsweep': // LEVIATHAN: the body itself is the attack
   orbit(0.85); e.spirT-=dt;
   if(e.spirT<=0){ e.spirT=0.5; const a=e.t*1.6;
    for(let k=0;k<2;k++) eshot(e,a+k*3.14,200,7,0.9); }
   break;
  case 'mines': // drop lingering hazards, then leave — the floor becomes the threat
   mv(0.6); e.burstT-=dt;
   if(e.burstT<=0){ e.burstT=1.4;
    hazards.push({x:e.x+(Math.random()-0.5)*90,y:e.y+(Math.random()-0.5)*90,r:52,t:0,life:6,dmg:Math.round(e.dmg*0.5),tick:0});
    SFX.click(); }
   break;
  case 'burrow': // submerge and resurface under the player, telegraphed
   if(!e.burrowT){ e.burrowT=1.2; e.burrowX=p.x; e.burrowY=p.y; addFloater(e.x,calloutY(e),'BURROWS',K.red); SFX.portal(); }
   e.burrowT-=dt;
   if(e.burrowT<=0){ e.burrowT=0;
    e.x=clamp(e.burrowX,PX0+e.r,PX1-e.r); e.y=clamp(e.burrowY,PY0+e.r,PY1-e.r); resolveObstacles(e);
    rings.push({x:e.x,y:e.y,r:14,maxR:150,spd:320,dmg:e.dmg,hit:false,heavy:true});
    spawnBurst(e.x,e.y,20,K.red,240,0.6,3); SFX.ring(); }
   break;
  case 'clockbeam': // ORACLE: a slow rotating hand — walk with it, not into it
   mv(0.25); e.spirT-=dt;
   if(e.spirT<=0){ e.spirT=0.10; const a=e.phaseT*1.5;
    eshot(e,a,240,5,0.7,2.6); eshot(e,a+3.1416,240,5,0.7,2.6); }
   break;
  case 'zone': // a damaging field parked on you — move house
   mv(0.35); e.zoneT-=dt;
   if(e.zoneT<=0){ e.zoneT=2.6;
    hazards.push({x:p.x,y:p.y,r:78,t:0,life:4.5,dmg:Math.round(e.dmg*0.45),tick:0,warn:0.7});
    SFX.click(); }
   break;
  case 'gaze': // BASILISK: telegraphed cone that roots you where you stand
   mv(0.4); e.gazeT-=dt;
   if(e.gaze){ e.gaze.t-=dt;
    if(e.gaze.t<=0){ const a=e.gaze.ang;
     let da=Math.abs(((aim-a+Math.PI)%6.283)-Math.PI);
     if(da<0.45&&d<430){ p.rootT=Math.max(p.rootT||0,1.0); hurtPlayer(Math.round(e.dmg*0.8),true,srcOf(e,'GAZE')); addFloater(p.x,p.y-30,'PETRIFIED',K.red); }
      for(let k=0;k<9;k++) pushPart({x:e.x+Math.cos(a)*k*46,y:e.y+Math.sin(a)*k*46,vx:0,vy:0,life:0.3,maxlife:0.3,col:K.red,r:5});
     e.gaze=null; e.gazeT=enrage?2.6:4; SFX.eshoot(); } }
   else if(e.gazeT<=0){ e.gaze={t:0.75,ang:aim}; SFX.click(); }
   break;
  case 'linecharge': // commits along a straight line, leaving spikes behind
   if(!e.chargeOn){ e.chargeOn=true; e.chargeDx=nx; e.chargeDy=ny; addFloater(e.x,calloutY(e),'LUNGE',K.red); }
   e.charging=true;
   e.x+=e.chargeDx*320*dt; e.y+=e.chargeDy*320*dt;
   e.burstT-=dt;
   if(e.burstT<=0){ e.burstT=0.22; hazards.push({x:e.x,y:e.y,r:30,t:0,life:4,dmg:Math.round(e.dmg*0.35),tick:0}); }
   break;
  case 'spikes':
   mv(0.5); e.burstT-=dt;
   if(e.burstT<=0){ e.burstT=1.0;
    for(let k=0;k<3;k++){ const a=aim+(k-1)*0.7, rr=140+Math.random()*130;
     hazards.push({x:e.x+Math.cos(a)*rr,y:e.y+Math.sin(a)*rr,r:36,t:0,life:4.5,dmg:Math.round(e.dmg*0.4),tick:0,warn:0.5}); } }
   break;
  case 'ram': // JUGGERNAUT: repeated commits, shockwave on wall impact
   e.ramT-=dt;
   if(!e.chargeOn&&e.ramT<=0){ e.chargeOn=true; e.chargeDx=nx; e.chargeDy=ny; e.facing=Math.atan2(ny,nx); addFloater(e.x,calloutY(e),'RAM',K.red); SFX.alarm(); }
   if(e.chargeOn){ e.charging=true;
    // Obstacles are resolved AFTER bossBehave, so a pinned ram still takes its
    // full step here. Judge "stuck" by net travel since last frame's step
    // instead: a pylon keeps pushing it back to the same spot.
    const step=(enrage?400:340)*dt;
    const stuck=e.ramLx!==undefined&&Math.hypot(e.x-e.ramLx,e.y-e.ramLy)<step*0.25;
    e.ramLx=e.x; e.ramLy=e.y;
    e.x+=e.chargeDx*step; e.y+=e.chargeDy*step;
    const hitWall=e.x<=PX0+e.r+1||e.x>=PX1-e.r-1||e.y<=PY0+e.r+1||e.y>=PY1-e.r-1;
    if(hitWall||stuck){
     e.chargeOn=false; e.ramT=enrage?1.4:2.2; e.ramLx=undefined;
     rings.push({x:e.x,y:e.y,r:16,maxR:200,spd:330,dmg:e.dmg,hit:false,heavy:true});
     if(settings.shake) shake=Math.min(12,shake+6); spawnBurst(e.x,e.y,22,K.red,260,0.6,4); SFX.ring(); }
   } else mv(0.45);
   break;
  case 'debris': // orbital junk flung outward on a lazy arc
   mv(0.4); e.burstT-=dt;
   if(e.burstT<=0){ e.burstT=enrage?0.5:0.8;
    for(let k=0;k<4;k++) eshot(e,e.t*1.4+k*1.5708,170+Math.random()*90,7,0.8,4.5);
    SFX.eshoot(); }
   break;
  case 'disrupt': // NULLIFIER: a field that jams one system while you stand in it
   mv(0.45); e.burstT-=dt;
   if(e.burstT<=0){ e.burstT=3.4;
    hazards.push({x:p.x,y:p.y,r:96,t:0,life:4,dmg:0,tick:0,warn:0.6,jam:true});
    addFloater(e.x,calloutY(e),'DISRUPTOR FIELD',K.red); SFX.alarm(); }
   break;
  case 'crossbeam': // ARCHON: a rotating cross, four arms, wide safe wedges
   mv(0.3); e.spirT-=dt;
   if(e.spirT<=0){ e.spirT=0.13; const a=e.phaseT*1.1;
    for(let k=0;k<4;k++) eshot(e,a+k*1.5708,225,5,0.75,3); }
   break;
  case 'gravity': // SINGULARITY: drags you in — thrust away or get crushed
   mv(0.2);
   if(d>40){ const pull=(enrage?150:110)*dt; p.x-=nx*pull; p.y-=ny*pull; } // n points boss→player, so subtract to drag inward
   e.burstT-=dt;
   if(e.burstT<=0){ e.burstT=1.2;
    for(let k=0;k<6;k++) eshot(e,k/6*6.283-e.t*1.2,200,6,0.85);
    SFX.eshoot(); }
   break;
 }
 if(e.wave2){ e.burstT-=dt; if(e.burstT<=0){ e.wave2=false; rings.push({x:e.x,y:e.y,r:20,maxR:200,spd:340,dmg:e.dmg,hit:false,heavy:true}); SFX.ring(); } }
 if(cyc[e.phase]!=='charge'&&cyc[e.phase]!=='linecharge'&&cyc[e.phase]!=='ram'){ e.chargeOn=false; e.ramLx=undefined; }
 // A burrow or gaze cut off by the phase change is dropped, not carried over: a
 // stale burrow would surface on where you stood a whole cycle ago with no
 // warning, and a stale gaze would keep drawing its cone through other phases.
 if(cyc[e.phase]!=='burrow') e.burrowT=0;
 if(cyc[e.phase]!=='gaze') e.gaze=null;
}
// Signature mechanics: one per boss, always running regardless of phase.
function bossSignature(e,C,spdM,aim){
 const def=e.def, dt=C.dt, p=C.p, d=C.d, enrage=C.enrage;
 if(!def||!def.sig) return;
 switch(def.sig){
  case 'laser': { // PHANTOM: locks a line, telegraphs, then fires down it
   e.laserT-=dt;
   if(e.laser){ e.laser.t-=dt;
    if(e.laser.t<=0){ const a=e.laser.ang, dx2=Math.cos(a), dy2=Math.sin(a);
     const tt=clamp((p.x-e.x)*dx2+(p.y-e.y)*dy2,0,700), cx=e.x+dx2*tt, cy=e.y+dy2*tt;
     e.beamA=a; e.beamT=0.25; e.laser=null; e.laserT=enrage?3.5:5;
      for(let k=0;k<=10;k++) pushPart({x:e.x+dx2*k*70,y:e.y+dy2*k*70,vx:0,vy:0,life:0.25,maxlife:0.25,col:K.red,r:5});
     SFX.eshoot();
     if(Math.hypot(p.x-cx,p.y-cy)<16) hurtPlayer(e.dmg+8,true,srcOf(e)); } }
   else if(e.laserT<=0){ e.laser={t:0.7,ang:aim}; SFX.click(); }
   break; }
  case 'segments': { // LEVIATHAN: a trailing body that also hurts to touch
   const head={x:e.x,y:e.y};
   let prev=head;
   for(const g of e.segs){
    const vx=prev.x-g.x, vy=prev.y-g.y, l=len(vx,vy), want=e.r*0.82;
    if(l>want){ g.x+=vx/l*(l-want); g.y+=vy/l*(l-want); }
    prev=g;
    if(!e.phased&&e.contactCd<=0&&dist2(p.x,p.y,g.x,g.y)<(g.r+p.r)*(g.r+p.r)){
     e.contactCd=0.7; hurtPlayer(Math.round(e.dmg*0.6),true,srcOf(e,'BODY')); }
   }
   break; }
  case 'wards': { // ORACLE: orbiting shields — break them or it takes 25% damage
   if(!e.wards.length&&!e.wardsBroken){ for(let k=0;k<3;k++) e.wards.push({a:k*2.094,hp:1}); e.wardsBroken=false; }
   e.wardA=(e.wardA||0)+dt*1.1;
   e.shielded=e.wards.length>0;
   break; }
  case 'petrify': break; // handled inside the gaze phase
  case 'vent': // armoured front, exposed rear. Facing locks during a ram, which
   // is the window to get behind it.
   if(!e.charging) e.facing=Math.atan2(p.y-e.y,p.x-e.x);
   break;
  case 'jam': break;   // handled by the disruptor hazard
  case 'command': break; // handled by the lieutenant phase
  case 'split': { // CHORUS: fractures into synced copies at 66% and 33%
   const f=e.hp/e.maxhp;
   if(!e.lieutenant&&((e.split===0&&f<=0.66)||(e.split===1&&f<=0.33))){
    e.split++;
    const n=2;
    for(let k=0;k<n&&enemies.length<14;k++){
     const s2=nearSpot(e.x,e.y,120,220,e.r+14);
     const c=mkBoss('chorus',s2.x,s2.y,arenaIdx);
     c.maxhp=c.hp=e.maxhp*0.22; c.r=e.r*0.72; c.dmg=Math.round(e.dmg*0.6);
     // echoes are CHORUS's own mechanic, not command: they neither spend the
     // nest's lieutenant budget nor call anyone themselves
     c.lieutenant=true; c.echo=true; c.cmd=0; c.recovKind=null; c.recovLeft=0; c.split=2; c.bname='CHORUS ECHO';
     c.spawnT=0.6; enemies.push(c);
     rings.push({x:s2.x,y:s2.y,r:8,maxR:90,spd:300,dmg:0,hit:true});
    }
    addFloater(e.x,calloutY(e),'CHORUS FRACTURES',K.red); SFX.brk();
   }
   break; }
  case 'wellpull': break; // handled by the gravity phase
 }
}
function bossLabel(e){
 if(e.mode==='phase') return 'PHASED';
 if(e.mode==='retreat') return 'RETREAT';
 if(e.mode!=='hunt') return 'REPOSITIONING';
 const def=e.def;
 if(!def||!def.phases) return e.bname||'BOSS';
 return String(def.phases[e.phase]||def.name).toUpperCase();
}
// ---------- combat ----------
function playerShoot(){
  const p=player;
  let tx, ty;
  if(mouse.down){ tx=wmx(); ty=wmy(); }
 else if(p.autoFire){ let bd=700*700, be=null; for(const e of enemies){ const d=dist2(p.x,p.y,e.x,e.y); if(d<bd){ bd=d; be=e; } } if(!be) return; tx=be.x; ty=be.y; }
 else return;
 const base=Math.atan2(ty-p.y,tx-p.x); p.aim=base;
  const n=p.shots, spread=(n-1)*0.14*(1+0.35*(p.minigun||0));
 const rate=p.fireRate*(p.surgeT>0?1.2:1);
 // ADRENAL CORE: scales with MISSING health, so it pays off exactly when a run
 // is about to end. Capped so it can never become the whole build.
 const adren=p.adrenal>0?(1+Math.min(0.5,0.25*p.adrenal)*(1-p.hp/p.maxhp)):1;
 // OVERCHARGE: every 5th volley is a heavy piercing slug
 p.shotN=(p.shotN||0)+1;
 const heavy=p.overcharge>0&&(p.shotN%5===0);
 for(let i=0;i<n;i++){
  const a=base-spread/2+(n===1?0:(i*(spread/(n-1))));
  const crit=Math.random()<p.critCh;
  const dmg=p.dmgBase*p.dmgMult*adren*(crit?p.critMult:1)*(heavy?(1.6+0.4*p.overcharge):1);
   bullets.push({x:p.x+Math.cos(a)*14,y:p.y+Math.sin(a)*14,vx:Math.cos(a)*p.projSpeed,vy:Math.sin(a)*p.projSpeed,
    r:3.5+(p.slug||0)*1.2+(heavy?2.2:0),dmg,life:1.1,crit,bounce:p.bounce,turn:p.homing>0?(2.2+1.6*p.homing):0,
    burn:p.inc>0?6*p.inc:0, chill:p.cryo>0?1.2+0.6*(p.cryo-1):0,
    flak:p.flak,chain:p.chain,corrode:p.corrode,heavyShot:heavy,
    pierce:p.pierce+(heavy?2:0),hitUid:null});
 }
 if(heavy) tone('square',420,140,0.12,0.12);
 p.fireCd=1/rate;
 SFX.shoot();
 pushPart({x:p.x+Math.cos(base)*15,y:p.y+Math.sin(base)*15,vx:0,vy:0,life:0.06,maxlife:0.06,col:K.goldHi,r:4});
}
function shieldBlock(msg,col){ const p=player; p.invuln=Math.max(p.invuln,0.4); addFloater(p.x,p.y-20,msg,col); SFX.block(); spawnBurst(p.x,p.y,10,col,180,0.4,3); }
// heavy=true: sniper/tempest bolts, brute rings, boss contact+bursts (blocked by Crit Ward)
// ---------- what brought the hull down ----------
// Every hostile round, ring and field is stamped with its maker as it is made
// (stampNext runs between enemies in the update loop), so the end screen can
// name the god and the blow instead of a bare HULL LOST.
const CHAFF_BLOW={drone:'RAM',mite:'RAM',stalker:'LUNGE',sniper:'HEAVY BOLT',tempest:'ROTOR SPREAD',brute:'BLAST RING'};
function srcOf(e,what){ if(!e) return null; const id=e.kind||e.type;
 let w=what||(e.type==='boss'?bossLabel(e):(CHAFF_BLOW[id]||'CONTACT')); if(w==='REPOSITIONING') w='RE-ENTRY';
 const f=e.def?null:CODEX_FOES.find(c=>c.type===id);
 return { id, name:e.def?e.def.name:(f?f.name:String(id).toUpperCase()), lt:!!e.lieutenant, what:w }; }
let stampActor=null, stampB=0, stampR=0, stampH=0;
function stampReset(){ stampActor=null; stampB=ebullets.length; stampR=rings.length; stampH=hazards.length; }
function stampNext(e){
 if(stampActor){ let sr=null; const S=()=>sr||(sr=srcOf(stampActor));
  for(let i=stampB;i<ebullets.length;i++) if(!ebullets[i].src) ebullets[i].src=S();
  for(let i=stampR;i<rings.length;i++) if(!rings[i].src&&rings[i].dmg>0&&!rings[i].own) rings[i].src=S();
  for(let i=stampH;i<hazards.length;i++) if(!hazards[i].src) hazards[i].src=S(); }
 stampActor=e; stampB=ebullets.length; stampR=rings.length; stampH=hazards.length; }
function hurtPlayer(dmg,heavy,src){
 const p=player; if(p.invuln>0||p.dashT>0||state!=='playing') return;
 if(heavy&&p.mirrorUp){ p.mirrorUp=false; shieldBlock('CRIT BLOCKED',K.goldHi); return; }
 if(p.wardUp){ p.wardUp=false; shieldBlock('WARDED',K.gold); return; }
 if(p.bulwark>0){ p.bulwark--; if(p.bulwark<=0){ addFloater(p.x,p.y-20,'BULWARK DOWN',K.gold); SFX.brk(); } else shieldBlock('BLOCKED ('+p.bulwark+' left)',K.gold); p.invuln=Math.max(p.invuln,0.4); return; }
 if(p.barrier>0){ const take=Math.min(p.barrier,dmg); p.barrier-=take; dmg-=take; spawnBurst(p.x,p.y,8,K.gold,170,0.4,3);
  if(p.barrier<=0){ addFloater(p.x,p.y-20,'BARRIER DOWN',K.gold); SFX.brk(); } else addFloater(p.x,p.y-20,'ABSORBED ('+Math.ceil(p.barrier)+' left)',K.gold);
  p.invuln=Math.max(p.invuln,0.4); SFX.block(); if(dmg<=0) return; }
 if(p.shieldReady){ p.shieldReady=false; p.shieldT=p.shieldCdMax; shieldBlock('BLOCKED',K.gold); return; }
 p.hp-=dmg; p.flash=0.15; p.invuln=0.35; p.lastHurt=timeSec; if(src) p.lastSrc=src;
 if(settings.shake) shake=Math.min(10,shake+4);
 addFloater(p.x+24,p.y-20,'-'+Math.round(dmg),K.red); SFX.hurt();
 spawnBurst(p.x,p.y,8,K.red,200,0.5,3);
 if(p.hp<=0){ if(p.stasisN>0){ p.stasisN--; p.hp=p.stasisTier>=3?p.maxhp:(p.stasisTier===2?Math.ceil(p.maxhp*0.25):1); p.invuln=2.5; rings.push({x:p.x,y:p.y,r:20,maxR:260,spd:420,dmg:0,hit:true,own:true}); spawnBurst(p.x,p.y,40,K.goldHi,300,0.9,4); addFloater(p.x,p.y-28,'STASIS ('+p.stasisN+' left)',K.goldHi); SFX.stasis(); return; } if(p.secondWind){ p.secondWind=false; p.hp=Math.ceil(p.maxhp*0.5); p.invuln=2; rings.push({x:p.x,y:p.y,r:20,maxR:200,spd:380,dmg:0,hit:true,own:true}); spawnBurst(p.x,p.y,30,K.goldHi,260,0.8,4); addFloater(p.x,p.y-28,'SECOND WIND',K.goldHi); SFX.levelup(); return; } p.hp=0; die(); }
}
// A kill can cascade (Shrapnel, Discharge, mite splits) and remove OTHER entries,
// so any loop that can kill walks a snapshot of `enemies` and skips `dead` ones —
// a live index goes stale the moment a cascade splices below it.
function killEnemy(j){
 const e=enemies[j]; enemies.splice(j,1); kills++; e.dead=true;
 // A burn or splash can finish something off after the ship has already died
 // this frame: the kill still counts, but it must not heal (or draft) a corpse.
 const over=state==='gameover';
 // First kill of a kind unlocks its codex entry. Lieutenants and echoes count
 // for their kind — defeating one is defeating one.
 const cid=e.type==='boss'?e.kind:e.type;
 if(cid&&!codexKills[cid]){
  codexKills[cid]=true; saveCodex(); if(e.type==='boss') nestTally.firsts.push(cid);
  const nm=e.type==='boss'?(BOSSDEF[cid]?BOSSDEF[cid].name:cid):cid.toUpperCase();
  addFloater(e.x,e.y-58,'CODEX UNLOCKED · '+nm+' [C]',K.gold);
 }
 if(e.type==='mite'&&enemies.length<20){ for(let k=0;k<2;k++){ const m=mkEnemy('drone',e.x+(Math.random()-0.5)*30,e.y+(Math.random()-0.5)*30,arenaIdx); enemies.push(m); } addFloater(e.x,e.y-16,'SPLIT',K.red); }
 spawnBurst(e.x,e.y,e.type==='boss'?50:(e.type==='brute'?22:12),e.type==='boss'?pigOf(e).c:K.metal,240,0.6,3);
 SFX.die();
  const n=e.type==='brute'?3:(e.type==='boss'?8:1);
  const gemV=Math.max(1,Math.round(e.xp/n*(1+0.12*arenaIdx))); // later arenas pay more: pacing stays smooth
  for(let k=0;k<n;k++) gems.push({x:e.x+(Math.random()-0.5)*24,y:e.y+(Math.random()-0.5)*24,v:gemV,t:0});
 if(player.vamp>0&&!over){ player.hp=Math.min(player.maxhp,player.hp+player.vamp); addFloater(player.x,player.y-26,'+'+player.vamp,K.gold); }
 if(player.surgeLvl>0){ player.surgeT=Math.min(5,player.surgeT+2.5); }
 // SHRAPNEL CORE: the corpse is the weapon
 if(player.shrap>0) splashDamage(e.x,e.y,62+16*player.shrap,10*player.dmgMult*player.shrap,K.metal,e.uid);
 // KINETIC DISCHARGE: charges on kills, releases a shockwave at the threshold
 if(player.shockOn){
  player.shockKills++;
  if(player.shockKills>=player.shockNeed){
   player.shockKills=0;
   const R=player.shockR, dmg=player.shockDmg*player.dmgMult;
   rings.push({x:player.x,y:player.y,r:18,maxR:R,spd:520,dmg:0,hit:true,own:true});
   const snap=enemies.slice();
   for(let j=snap.length-1;j>=0;j--){ const o=snap[j]; if(o.dead) continue;
    if(dist2(player.x,player.y,o.x,o.y)>R*R) continue;
    if(player.shockChill>0) o.slowT=Math.max(o.slowT,1.2+0.5*player.shockChill);
    damageEnemy(o,dmg,K.metal,o.x,o.y);
    if(o.hp<=0){ const ix=enemies.indexOf(o); if(ix>=0) killEnemy(ix); } }
   spawnBurst(player.x,player.y,26,K.gold,300,0.7,4);
   addFloater(player.x,player.y-32,'DISCHARGE',K.goldHi);
   if(settings.shake) shake=Math.min(10,shake+4);
   tone('sine',200,900,0.32,0.18);
  }
 }
 if(e.type==='boss'){
  // Lieutenants are somebody else's minions: they do not bank the permanent
  // +2% damage, or an ARCHON nest would be a damage-meta farm.
  if(!e.lieutenant){ bosses++; saveMeta(); nestTally.banked+=2; }
  if(over) return;
  player.hp=Math.min(player.maxhp,player.hp+(e.lieutenant?10:30));
  const left=enemies.filter(o=>o.type==='boss').length;
  if(left>0){ addFloater(player.x,player.y-34,'BOSS DOWN — '+left+' LEFT',K.gold); SFX.win(); }
  else { addFloater(player.x,player.y-34,'NEST CLEARED · bonus draft',K.goldHi); SFX.win();
   // A draft already on screen must not be replaced by the bonus: queue it
   // behind the open one and pickUpgrade drains it next.
   if(state==='levelup') pendingLevels++; else { openLevelUp(); nestDraftAt=performance.now(); } }
  return; }
 // Sector-clear bonus, ONCE per sector. The field empties repeatedly between
 // reinforcement batches, so the old unguarded `enemies.length===0` test paid
 // +10 HP and +250 score every single time the last drone on screen died —
 // free sustain all round long and badly inflated scores.
 if(enemies.length===0&&spawnQueue.length===0&&!sectorCleared&&!over){
  sectorCleared=true; player.hp=Math.min(player.maxhp,player.hp+10);
  addFloater(player.x,player.y-30,'SECTOR CLEAR +10 HP',K.gold);
 }
}
// clearing a sector returns to the galaxy hub with the next sector unlocked
function nextArena(){ if(state!=='playing') return; SFX.portal(); arenasCleared=Math.max(arenasCleared,arenaIdx+1); clearedMax=Math.max(clearedMax,arenaIdx); galaxySel=arenaIdx+1; setMusicCfg(TITLE_MUS); state='galaxy'; saveRun(); }
function loadSector(i){ loadArena(i); galaxySel=i; state='playing'; autoPaused=false; saveRun(); }
function galaxyConfirm(){ if(galaxySel<=clearedMax+1){ SFX.click(); loadSector(galaxySel); } else SFX.brk(); }
// node layout shared by draw + click hit-testing: 9-node scrolling window.
// Node y is clamped to a band so the S-labels (drawn below each node) can
// never collide with the description / hint lines at the bottom of the hub.
function galNodes(){
 const out=[], start=Math.max(0,galaxySel-2);
 for(let k=0;k<9;k++){ const i=start+k;
  out.push({i,x:110+k*92,y:clamp(H/2+40+Math.sin(i*0.9+(runSeed%7))*110,250,420),unlocked:i<=clearedMax+1,cleared:i<=clearedMax,cur:i===galaxySel});
 }
 return out;
}
// E key / recall-gate click: EXIT ring has priority; recall is a charged item with
// cast channel, max range and cooldown. E while channeling cancels it.
function nearExit(){ return portal&&player&&Math.hypot(player.x-portal.x,player.y-portal.y)<player.r+portal.r+34; }
function doPortalKey(){
 const p=player; if(!p||state!=='playing') return;
 if(nearExit()){ nextArena(); return; }
 if(!p.recallUnlocked){ if(p.lockMsgCd<=0){ p.lockMsgCd=1; addFloater(p.x,p.y-24,'RECALL LOCKED: Portal Cell',K.textDim); } return; }
 if(p.jamT>0){ if(p.lockMsgCd<=0){ p.lockMsgCd=1; addFloater(p.x,p.y-24,'SYSTEMS JAMMED',K.red); } return; }
 if(p.channel){ p.channel=null; addFloater(p.x,p.y-24,'BLINK OFF',K.textDim); SFX.click(); return; }
 if(!p.recall){
  if(p.charges>0){ p.charges--; p.recall={x:p.x,y:p.y}; addFloater(p.x,p.y-24,'GATE SET ('+p.charges+' left)',K.gold); SFX.upgrade(); spawnBurst(p.x,p.y,8,K.gold,140,0.4,2.5); }
  else if(p.lockMsgCd<=0){ p.lockMsgCd=1; addFloater(p.x,p.y-24,'NO CHARGES: Portal Cell',K.textDim); }
  return;
 }
 const d=Math.hypot(p.x-p.recall.x,p.y-p.recall.y);
 if(d<44){ p.recall.x=p.x; p.recall.y=p.y; addFloater(p.x,p.y-24,'GATE MOVED',K.gold); SFX.click(); return; }
 if(d>p.gateRange){ if(p.lockMsgCd<=0){ p.lockMsgCd=1; addFloater(p.x,p.y-24,'GATE OUT OF RANGE',K.textDim); } return; }
 if(p.recallCd>0){ if(p.lockMsgCd<=0){ p.lockMsgCd=1; addFloater(p.x,p.y-24,'GATE '+p.recallCd.toFixed(1)+'s',K.textDim); } return; }
 p.channel={t:p.channelMax,tx:p.recall.x,ty:p.recall.y}; tone('sine',300,900,p.channelMax,0.14);
}
function resolveObstacles(e){
 for(const o of arena.obs){
  if(o.kind==='rect') resolveCircleRect(e,o);
  else if(o.kind==='poly') resolveCirclePoly(e,o);
  else { const dx=e.x-o.x, dy=e.y-o.y, d=Math.sqrt(dx*dx+dy*dy), rr=e.r+o.r; if(d<rr&&d>0.001){ e.x=o.x+dx/d*rr; e.y=o.y+dy/d*rr; } else if(d<=0.001){ e.x=o.x+rr; } }
 }
}
function bulletBlocked(x,y,r){
 for(const o of arena.obs){
  if(o.kind==='rect'){ if(circleRect(x,y,r,o)) return true; }
  else if(o.kind==='poly'){ if(circlePoly(x,y,r,o)) return true; }
  else { const dx=x-o.x,dy=y-o.y; if(dx*dx+dy*dy<(r+o.r)*(r+o.r)) return true; }
 }
 return false;
}
// Obstacle test across the whole step, not just the endpoint: a fast round can
// otherwise straddle a thin girder in a single frame and appear to shoot through it.
function bulletPathBlocked(b){ return bulletBlocked(b.x,b.y,b.r)||bulletBlocked((b.px+b.x)*0.5,(b.py+b.y)*0.5,b.r); }
// ---------- damage ----------
// Corrosive stacks are a flat additive shred, capped at 5, so they compose with
// everything without multiplying into a runaway.
function corrodeMul(e){ return 1+0.08*(e.corrode||0); }
// Shared non-bullet damage path: abilities, splash, chains, orbital strikes.
// Routing them all through here keeps phase mitigation and armour shred
// consistent no matter which system dealt the hit.
function damageEnemy(e,amount,col,hx,hy){
 if(!e||e.hp<=0) return 0;
 const dmg=amount*(e.phased?0.30:1)*corrodeMul(e);
 e.hp-=dmg; e.lastHit=timeSec; e.flash=Math.max(e.flash,0.08);
 if(settings.dmgNums) addFloater(hx===undefined?e.x:hx,(hy===undefined?e.y:hy)-14,Math.round(dmg),col||K.metal);
 return dmg;
}
// Radius damage used by Flak, Shrapnel and the Orbital Cannon.
function splashDamage(x,y,r,amount,col,skipUid){
 const snap=enemies.slice();
 for(let j=snap.length-1;j>=0;j--){ const e=snap[j]; if(e.dead) continue;
  if(skipUid&&e.uid===skipUid) continue;
  if(dist2(x,y,e.x,e.y)>r*r) continue;
  damageEnemy(e,amount,col,e.x,e.y);
  if(e.hp<=0){ const ix=enemies.indexOf(e); if(ix>=0) killEnemy(ix); } }
 rings.push({x,y,r:4,maxR:r,spd:r*4,dmg:0,hit:true,own:true});
}
// ---------- bullet impact ----------
// Resolve one bullet against one enemy at the contact point. Returns true when
// the round is spent, so it is removed rather than continuing out the far side.
function applyBulletHit(e,b,hx,hy){
 const phased=!!e.phased;
 let dmg=b.dmg*(phased?0.30:1)*corrodeMul(e);
 if(b.corrode&&!phased) e.corrode=Math.min(5,(e.corrode||0)+b.corrode);
 // ORACLE wards soak most of the round until they are broken — a visible,
 // solvable reason the boss is tanky, instead of an invisible damage reduction.
 if(e.shielded&&e.wards&&e.wards.length){
  const w=e.wards[0]; w.hp-=dmg*0.75; dmg*=0.25;
  spawnBurst(hx,hy,3,K.metal,150,0.25,2);
  if(w.hp<=0){ e.wards.shift(); spawnBurst(e.x,e.y,12,pigOf(e).c,220,0.5,3); SFX.brk();
   if(!e.wards.length){ e.wardsBroken=true; e.shielded=false; addFloater(e.x,calloutY(e),'WARDS DOWN — EXPOSED',K.gold); }
   else addFloater(e.x,calloutY(e),'WARD BROKEN ('+e.wards.length+' left)',K.gold); }
 }
 // JUGGERNAUT: armoured prow, exposed rear vent. It locks its facing while
 // ramming, so flanking a charge is the whole fight.
 if(e.def&&e.def.sig==='vent'){
  // Narrow arcs on purpose: an 80-degree prow and a 95-degree vent, with the
  // whole flank neutral. A wide frontal shield on a boss that always faces you
  // is not a positioning puzzle, it is just a damage tax.
  const a=Math.atan2(hy-e.y,hx-e.x);
  const da=Math.abs(((a-(e.facing||0)+Math.PI)%6.283)-Math.PI);
  if(da<0.7){ dmg*=0.6; spawnBurst(hx,hy,3,K.metal,150,0.25,2); }
  else if(da>2.3){ dmg*=1.9; addFloater(hx,hy-20,'VENT',K.goldHi); }
 }
 e.hp-=dmg; e.lastHit=timeSec; e.flash=Math.max(e.flash,0.08);
 if(!phased){ if(b.burn>0){ e.burnT=2; e.burnDps=b.burn; } if(b.chill>0) e.slowT=Math.max(e.slowT,b.chill); }
 if(settings.dmgNums) addFloater(hx,hy-14,Math.round(dmg),phased?K.textDim:(b.crit?K.goldHi:K.metal));
 spawnBurst(hx,hy,b.crit?8:4,phased?K.metalDim:K.goldHi,180,0.35,2.5);
 if(e.type==='boss') spawnBurst(hx,hy,3,K.metal,130,0.22,2);
 SFX.hit();
 // FLAK: detonate on contact. Splash is deliberately weaker than the round that
 // caused it, so it thickens crowd clear without doubling single-target damage.
 if(b.flak>0){ const r=54+18*b.flak;
  spawnBurst(hx,hy,10,K.gold,220,0.4,3);
  splashDamage(hx,hy,r,b.dmg*0.38*b.flak,K.metal,e.uid); }
 // CHAIN SHOT: one short arc to a different nearby foe
 if(b.chain>0){ let bd=210*210, be=null;
  for(const o of enemies){ if(o===e||o.phased) continue; const dd=dist2(hx,hy,o.x,o.y); if(dd<bd){ bd=dd; be=o; } }
  if(be){ zapFx(hx,hy,be.x,be.y); damageEnemy(be,b.dmg*0.45*b.chain,K.metal,be.x,be.y);
   if(be.hp<=0){ const ix=enemies.indexOf(be); if(ix>=0) killEnemy(ix); } } }
 if(e.hp<=0){ const ix=enemies.indexOf(e); if(ix>=0) killEnemy(ix); return true; }
 if(phased) return true; // a phased boss ABSORBS the round: mitigated, never transparent
 if(b.pierce>0){ b.pierce--; (b.hitUid=b.hitUid||[]).push(e.uid); return false; }
 return true;
}
// Sweep this frame's travel against every enemy, resolving hits nearest-first
// so a pierce round chews through targets in the order it actually meets them.
function bulletSweep(b){
 let hits=null;
 for(let j=0;j<enemies.length;j++){ const e=enemies[j];
  if(b.hitUid&&b.hitUid.indexOf(e.uid)>=0) continue;
  const t=segCircleT(b.px,b.py,b.x,b.y,e.x,e.y,e.r+b.r);
  if(t>=0){ if(!hits) hits=[]; hits.push({t,e}); }
 }
 if(!hits) return false;
 if(hits.length>1) hits.sort((p,q)=>p.t-q.t);
 for(const h of hits){
  if(enemies.indexOf(h.e)<0) continue; // already died to an earlier hit this pass
  const hx=b.px+(b.x-b.px)*h.t, hy=b.py+(b.y-b.py)*h.t;
  if(applyBulletHit(h.e,b,hx,hy)) return true;
 }
 return false;
}
// ricochet: step back out of the obstacle and mirror velocity on the blocked
// axis (walls, kiosks and towers all bounce). Returns false if still stuck.
function reflectBullet(b,dt){
 b.x-=b.vx*dt; b.y-=b.vy*dt;
 const bx=bulletBlocked(b.x+b.vx*dt,b.y,b.r), by=bulletBlocked(b.x,b.y+b.vy*dt,b.r);
 if(bx) b.vx=-b.vx; if(by) b.vy=-b.vy;
 if(!bx&&!by){ b.vx=-b.vx; b.vy=-b.vy; }
 return !bulletBlocked(b.x,b.y,b.r);
}

// ---------- update ----------
function update(dt){
 if(state==='galaxy'){ updateFx(dt); return; }
 if(state==='playing'){
  timeSec+=dt;
  if(bossWarnT>0) bossWarnT-=dt;
  const p=player;
  p.fireCd-=dt; p.dashCd-=dt; p.invuln-=dt; p.flash-=dt;
  if(p.recallCd>0) p.recallCd-=dt; if(p.lockMsgCd>0) p.lockMsgCd-=dt;
  if(p.surgeT>0) p.surgeT-=dt;
  if(p.dashT>0) p.dashT-=dt;
  // aegis recharge
  if(p.aegisLvl>0&&!p.shieldReady){ p.shieldT-=dt; if(p.shieldT<=0){ p.shieldReady=true; addFloater(p.x,p.y-24,'AEGIS UP',K.gold); SFX.upgrade(); } }
  // ability systems: frost nova / tesla arc / guardian orbit
  if(p.novaLvl>0){ p.novaT-=dt; if(p.novaT<=0){ p.novaT=6-1.5*(p.novaLvl-1); const R=200+50*p.novaLvl; rings.push({x:p.x,y:p.y,r:20,maxR:R,spd:420,dmg:0,hit:true,own:true}); for(const e of enemies){ if(dist2(p.x,p.y,e.x,e.y)<R*R){ e.slowT=2; e.flash=Math.max(e.flash,0.1); } } spawnBurst(p.x,p.y,10,K.gold,180,0.5,3); tone('sine',900,200,0.3,0.12); } }
  if(p.teslaLvl>0){ p.teslaT-=dt; if(p.teslaT<=0){ p.teslaT=3; let from={x:p.x,y:p.y}; const hit=[]; for(let c=0;c<=p.teslaLvl;c++){ let bd=(c===0?320:220); bd*=bd; let be=null; for(const e of enemies){ if(e.phased||hit.indexOf(e.uid)>=0) continue; const d=dist2(from.x,from.y,e.x,e.y); if(d<bd){ bd=d; be=e; } } if(!be) break; const dmg=22*p.dmgMult; be.hp-=dmg; be.lastHit=timeSec; be.flash=0.1; addFloater(be.x,be.y-14,Math.round(dmg),K.metal); zapFx(from.x,from.y,be.x,be.y); SFX.hit(); hit.push(be.uid); from=be; if(be.hp<=0){ const ix=enemies.indexOf(be); if(ix>=0) killEnemy(ix); } } } }
  // repair drone: only out of combat, so it is sustain between fights and never
  // an attrition win inside one
  if(p.repair>0&&timeSec-(p.lastHurt||0)>4&&p.hp<p.maxhp&&p.hp>0){
   p.hp=Math.min(p.maxhp,p.hp+p.repair*dt);
  }
  // ORBITAL CANNON: telegraphed strike on the biggest threat in range
  if(p.orbitalLvl>0){ p.orbitalT-=dt;
   if(p.orbitalT<=0&&enemies.length){ p.orbitalT=p.orbitalCd;
    const n=p.orbitalLvl, picked=[];
    for(let k=0;k<n;k++){
     let best=null, bv=-1;
     for(const e of enemies){ if(picked.indexOf(e.uid)>=0) continue;
      if(dist2(p.x,p.y,e.x,e.y)>620*620) continue;
      const v=e.hp*(e.type==='boss'?4:1);
      if(v>bv){ bv=v; best=e; } }
     if(!best) break;
     picked.push(best.uid);
     strikes.push({x:best.x,y:best.y,t:0,warn:0.8,r:70+14*p.orbitalLvl,dmg:60*p.dmgMult*(1+0.25*(p.orbitalLvl-1))});
    }
    if(picked.length) SFX.click();
   }
  }
  // PRISM LANCE: piercing beam down the aim line
  if(p.lanceLvl>0){ p.lanceT-=dt;
   if(p.lanceT<=0){ p.lanceT=p.lanceCd;
    const a=p.aim, w=13+5*p.lanceLvl, reach=620;
    const ex=p.x+Math.cos(a)*reach, ey=p.y+Math.sin(a)*reach;
    const dmg=46*p.dmgMult*(1+0.3*(p.lanceLvl-1));
    const snap=enemies.slice();
    for(let j=snap.length-1;j>=0;j--){ const e=snap[j]; if(e.dead) continue;
     if(segCircleT(p.x,p.y,ex,ey,e.x,e.y,e.r+w)<0) continue;
     damageEnemy(e,dmg,K.metal,e.x,e.y);
     if(e.hp<=0){ const ix=enemies.indexOf(e); if(ix>=0) killEnemy(ix); } }
    beams.push({x:p.x,y:p.y,a,len:reach,w,t:0,life:0.28});
    tone('sawtooth',1400,300,0.22,0.13);
   }
  }
  if(p.orbs>0){ p.orbAng+=dt*2.6; const odmg=15*p.dmgMult; for(let k=0;k<p.orbs;k++){ const a=p.orbAng+k*6.283/p.orbs; const ox=p.x+Math.cos(a)*34, oy=p.y+Math.sin(a)*34; const snap=enemies.slice(); for(let j=snap.length-1;j>=0;j--){ const e=snap[j]; if(e.dead||e.phased) continue; const dx=e.x-ox, dy=e.y-oy; if(dx*dx+dy*dy<(e.r+8)*(e.r+8)&&e.orbCd<=0){ e.orbCd=0.45; e.hp-=odmg; e.lastHit=timeSec; e.flash=0.1; addFloater(e.x,e.y-12,Math.round(odmg),K.gold); spawnBurst(ox,oy,4,K.gold,160,0.3,2.5); SFX.hit(); if(e.hp<=0) killEnemy(enemies.indexOf(e)); } } } }
 if(p.channel){ p.channel.t-=dt; pushPart({x:p.x+(Math.random()-0.5)*20,y:p.y+(Math.random()-0.5)*20,vx:0,vy:0,life:0.2,maxlife:0.2,col:K.gold,r:2.5});
  if(p.channel.t<=0){ const c=p.channel; p.channel=null; spawnBurst(p.x,p.y,12,K.gold,200,0.5,3);
   p.x=clamp(c.tx,PX0+p.r,PX1-p.r); p.y=clamp(c.ty,PY0+p.r,PY1-p.r); resolveObstacles(p);
   p.invuln=Math.max(p.invuln,0.5); p.recallCd=p.recallCdMax;
   spawnBurst(p.x,p.y,14,K.gold,220,0.5,3); addFloater(p.x,p.y-24,'RECALL',K.gold); SFX.portal(); } }
  let ax=((keys.KeyD||keys.ArrowRight)?1:0)-((keys.KeyA||keys.ArrowLeft)?1:0);
  let ay=((keys.KeyS||keys.ArrowDown)?1:0)-((keys.KeyW||keys.ArrowUp)?1:0);
  // BASILISK petrification roots you in place; NULLIFIER jamming locks abilities.
  // Neither ever takes away your guns — being unable to shoot is not a mechanic,
  // it is just waiting.
  if(p.rootT>0){ p.rootT-=dt; ax=0; ay=0; }
  if(p.jamT>0) p.jamT-=dt;
  const al=len(ax,ay); if(al>1){ ax/=al; ay/=al; }
  if(ax||ay) p.face=Math.atan2(ay,ax); // hull nose follows movement; turret (p.aim) still tracks the mouse/target
  const spd=p.speed*(p.surgeT>0?1.25:1);
  if(p.dashT>0){ p.x+=p.dashDx*1050*dt; p.y+=p.dashDy*1050*dt; pushPart({x:p.x,y:p.y,vx:0,vy:0,life:0.3,maxlife:0.3,col:K.goldDim,r:5}); }
  else { p.x+=ax*spd*dt; p.y+=ay*spd*dt; }
  p.x=clamp(p.x,PX0+p.r,PX1-p.r); p.y=clamp(p.y,PY0+p.r,PY1-p.r);
  resolveObstacles(p);
  // smooth follow: ease toward the target each frame instead of hard-snapping,
  // so the world glides instead of juddering with every micro-movement
  // (loadArena still snaps the camera on sector entry)
  const ctx2=clamp(p.x-W/2,0,Math.max(0,WW-W)), cty2=clamp(p.y-H/2,0,Math.max(0,HH-H));
  const cl=Math.min(1,dt*6); cam.x+=(ctx2-cam.x)*cl; cam.y+=(cty2-cam.y)*cl;
  p.aim=Math.atan2(wmy()-p.y,wmx()-p.x);
  if((mouse.down||p.autoFire)&&p.fireCd<=0) playerShoot();
  // player bullets (homing + ricochet)
  for(let i=bullets.length-1;i>=0;i--){ const b=bullets[i];
   if(b.turn>0&&enemies.length){ let bd=420*420, be=null; for(const e of enemies){ const d=dist2(b.x,b.y,e.x,e.y); if(d<bd){ bd=d; be=e; } } if(be){ const want=Math.atan2(be.y-b.y,be.x-b.x), cur=Math.atan2(b.vy,b.vx); let dA=want-cur; while(dA>Math.PI)dA-=6.283; while(dA<-Math.PI)dA+=6.283; const na=cur+clamp(dA,-b.turn*dt,b.turn*dt); const sp=len(b.vx,b.vy); b.vx=Math.cos(na)*sp; b.vy=Math.sin(na)*sp; } }
   b.px=b.x; b.py=b.y;
   b.x+=b.vx*dt; b.y+=b.vy*dt; b.life-=dt;
   let dead=b.life<=0;
   if(!dead&&(b.x<PX0+b.r||b.x>PX1-b.r)){ if(b.bounce>0){ b.bounce--; if(b.x<PX0+b.r){b.x=PX0+b.r;b.vx=Math.abs(b.vx);} else {b.x=PX1-b.r;b.vx=-Math.abs(b.vx);} b.px=b.x; b.py=b.y; } else dead=true; }
   if(!dead&&(b.y<PY0+b.r||b.y>PY1-b.r)){ if(b.bounce>0){ b.bounce--; if(b.y<PY0+b.r){b.y=PY0+b.r;b.vy=Math.abs(b.vy);} else {b.y=PY1-b.r;b.vy=-Math.abs(b.vy);} b.px=b.x; b.py=b.y; } else dead=true; }
   if(!dead&&bulletPathBlocked(b)){
    if(b.bounce>0){ b.bounce--; if(reflectBullet(b,dt)){ spawnBurst(b.x,b.y,3,K.gold,120,0.3,2); SFX.click(); b.px=b.x; b.py=b.y; } else dead=true; }
    else { spawnBurst(b.x,b.y,3,K.metal,120,0.3,2); dead=true; }
   }
   if(!dead&&bulletSweep(b)) dead=true;
   if(dead) bullets.splice(i,1);
  }
  // enemy bullets
  for(let i=ebullets.length-1;i>=0;i--){ const b=ebullets[i];
   b.px=b.x; b.py=b.y; b.x+=b.vx*dt; b.y+=b.vy*dt; b.life-=dt;
   let dead=b.life<=0||b.x<PX0||b.x>PX1||b.y<PY0||b.y>PY1;
   if(!dead&&bulletPathBlocked(b)) dead=true;
   // swept against the ship too, so a fast bolt can never straddle the hitbox
   if(!dead&&segCircleT(b.px,b.py,b.x,b.y,p.x,p.y,p.r+b.r)>=0){ hurtPlayer(b.dmg,b.heavy,b.src); dead=true; }
   if(dead) ebullets.splice(i,1);
  }
  // Orbital strikes: land after their telegraph, then damage everything inside.
  // Targeted where the enemy WAS, so a moving target can still slip the circle.
  for(let i=strikes.length-1;i>=0;i--){ const s=strikes[i]; s.t+=dt;
   if(s.t>=s.warn){
    splashDamage(s.x,s.y,s.r,s.dmg,K.metal);
    spawnBurst(s.x,s.y,22,K.gold,300,0.6,4);
    if(settings.shake) shake=Math.min(10,shake+3);
    tone('sawtooth',300,60,0.3,0.18);
    strikes.splice(i,1);
   }
  }
  for(let i=beams.length-1;i>=0;i--){ const b2=beams[i]; b2.t+=dt; if(b2.t>=b2.life) beams.splice(i,1); }
  // Lingering ground hazards. `warn` gives a telegraph window before one arms,
  // so a field never damages you the instant it appears under your feet.
  for(let i=hazards.length-1;i>=0;i--){ const h=hazards[i]; h.t+=dt;
   if(h.t>=(h.warn||0)&&dist2(p.x,p.y,h.x,h.y)<h.r*h.r){
    if(h.jam){ p.jamT=Math.max(p.jamT,0.6); if(p.channel){ p.channel=null; addFloater(p.x,p.y-24,'BLINK JAMMED',K.red); } }
    if(h.dmg>0){ h.tick-=dt; if(h.tick<=0){ h.tick=0.6; hurtPlayer(h.dmg,false,h.src); } }
   }
   if(h.t>=h.life) hazards.splice(i,1);
  }
  // shock rings (brute)
   for(let i=rings.length-1;i>=0;i--){ const g=rings[i]; g.r+=g.spd*dt;
    if(g.dmg>0&&!g.hit){ const d=Math.hypot(p.x-g.x,p.y-g.y); if(Math.abs(d-g.r)<14){ g.hit=true; hurtPlayer(g.dmg,g.heavy,g.src); } }
   if(g.r>=g.maxR) rings.splice(i,1);
  }
  // enemies
  const esnap=enemies.slice(); stampReset();
  for(let j=esnap.length-1;j>=0;j--){ const e=esnap[j]; stampNext(e); if(e.dead) continue; if(!codexSeenMap[e.kind||e.type]) markSeen(e.kind||e.type); e.t+=dt; e.flash-=dt; e.contactCd-=dt; if(e.orbCd>0)e.orbCd-=dt; if(e.spawnT>0)e.spawnT-=dt;
   if(e.burnT>0){ e.burnT-=dt; if(!e.phased){ e.hp-=e.burnDps*dt; e.lastHit=timeSec; e.flash=Math.max(e.flash,0.05); if(Math.random()<dt*10) pushPart({x:e.x+(Math.random()-0.5)*10,y:e.y+(Math.random()-0.5)*10,vx:0,vy:-40,life:0.3,maxlife:0.3,col:K.gold,r:3}); if(e.hp<=0){ killEnemy(enemies.indexOf(e)); continue; } } }
   const sF=e.slowT>0?0.55:1; if(e.slowT>0)e.slowT-=dt;
   const dx=p.x-e.x, dy=p.y-e.y, d=len(dx,dy), nx=dx/d, ny=dy/d;
   for(const o of enemies){ if(o===e) continue; const d2=dist2(e.x,e.y,o.x,o.y); const rr=e.r+o.r; if(d2<rr*rr&&d2>0.01){ const dd=Math.sqrt(d2); const push=(rr-dd)*0.4; e.x+=(e.x-o.x)/dd*push*0.5; e.y+=(e.y-o.y)/dd*push*0.5; } }
   if(e.type==='drone'||e.type==='mite'){ e.wob+=dt*4; const burst=d<160?1.25:1; const ms=e.sp*sF*burst; const sv=steer(e,nx,ny); e.x+=(sv[0]*ms+Math.cos(e.wob)*45)*dt; e.y+=(sv[1]*ms+Math.sin(e.wob)*45)*dt; }
   else if(e.type==='stalker'){
     if(e.dashState===0){ // strafe orbit then commit
      e.strafeT-=dt; const ox=-ny*e.strafeDir, oy=nx*e.strafeDir;
       const vx=ox*e.sp*sF*0.7+nx*(d>260?e.sp*sF*0.5:-20), vy=oy*e.sp*sF*0.7+ny*(d>260?e.sp*sF*0.5:-20);
       const sv=steer(e,vx,vy), vl=len(vx,vy); e.x+=sv[0]*vl*dt; e.y+=sv[1]*vl*dt;
     if(e.strafeT<=0){ e.dashState=1; e.dashT=0.5; }
    } else if(e.dashState===1){ e.dashT-=dt; e.flash=0.05; if(e.dashT<=0){ e.dashState=2; e.dashT=0.42; e.dashDx=nx; e.dashDy=ny; } }
    else { const dashSp=360+Math.min(140,arenaIdx*12); e.x+=e.dashDx*dashSp*dt; e.y+=e.dashDy*dashSp*dt; e.dashT-=dt; if(e.dashT<=0){ e.dashState=0; e.strafeT=Math.max(0.5,0.9-arenaIdx*0.04)+Math.random()*0.9; } }
   }
    else if(e.type==='sniper'){
     // deep snipers aim faster and cycle shots quicker — keep strafing
     if(e.aimT>0){ e.aimT-=dt; e.aimX=nx; e.aimY=ny; if(e.aimT<=0){ ebullets.push({x:e.x,y:e.y,vx:nx*300,vy:ny*300,r:5,dmg:e.dmg,life:3,heavy:true}); SFX.eshoot(); e.fireCd=Math.max(1.4,2.0-arenaIdx*0.1); e.reloc=0.5; } }
     else { const ms=e.sp*sF; if(d<280){ e.x-=nx*ms*dt; e.y-=ny*ms*dt; } else if(d>430){ e.x+=nx*ms*dt; e.y+=ny*ms*dt; } else { e.x+=Math.cos(e.t*1.5)*30*dt; e.y+=Math.sin(e.t*1.5)*30*dt; }
      if(e.reloc>0){ e.reloc-=dt; e.x+=-ny*ms*dt; e.y+=nx*ms*0.5*dt; }
      e.fireCd-=dt; if(e.fireCd<=0&&d<580){ e.aimT=arenaIdx>=5?0.35:0.5; } }
    }
    else if(e.type==='tempest'){ // weaver: holds ~340 range, telegraphed bolt spread —
     // 5-wide past S6, cycling faster with depth
     if(e.aimT>0){ e.aimT-=dt; if(e.aimT<=0){ const base=Math.atan2(dy,dx); const fan=arenaIdx>=6?2:1; for(let k=-fan;k<=fan;k++){ const a=base+k*0.18; ebullets.push({x:e.x,y:e.y,vx:Math.cos(a)*280,vy:Math.sin(a)*280,r:5,dmg:e.dmg,life:3,heavy:true}); } SFX.eshoot(); e.fireCd=Math.max(1.8,2.6-arenaIdx*0.12); } }
     else { const ms=e.sp*sF; if(d<280){ e.x-=nx*ms*dt; e.y-=ny*ms*dt; } else if(d>400){ e.x+=nx*ms*dt; e.y+=ny*ms*dt; } else { e.x+=-ny*ms*0.8*dt; e.y+=nx*ms*0.8*dt; }
      e.fireCd-=dt; if(e.fireCd<=0&&d<560){ e.aimT=arenaIdx>=5?0.28:0.35; } }
    }
    else if(e.type==='brute'){
     // deep brutes slam more often with wider rings — stay out of the band
     if(e.windup>0){ e.windup-=dt; if(e.windup<=0){ rings.push({x:e.x,y:e.y,r:20,maxR:110+Math.min(60,arenaIdx*6),spd:260,dmg:e.dmg,hit:false,heavy:true}); SFX.ring(); if(settings.shake) shake=Math.min(10,shake+3); spawnBurst(e.x,e.y,12,K.red,200,0.5,3); } }
     else { const sv=steer(e,nx,ny); e.x+=sv[0]*e.sp*sF*dt; e.y+=sv[1]*e.sp*sF*dt; e.slamCd-=dt; if(d<95&&e.slamCd<=0){ e.windup=0.6; e.slamCd=Math.max(1.6,2.6-arenaIdx*0.12); } }
    }
   else if(e.type==='boss'){
    const enrage=e.hp<e.maxhp*0.3||e.hardEnrage;
    if(e.beamT>0) e.beamT-=dt;
    e.fightT+=dt; if(e.recovCd>0) e.recovCd-=dt;
    // safety valve: a fight that has run three minutes stops offering outs
    if(!e.hardEnrage&&e.fightT>BOSS_HARD_ENRAGE){ e.hardEnrage=true; e.recovLeft=0; e.healPool=0;
     if(e.mode==='phase'||e.mode==='retreat'){ e.phased=false; e.mode='hunt'; e.modeT=8; }
     addFloater(e.x,calloutY(e),(e.bname||'BOSS')+' RELENTLESS',K.red); SFX.alarm(); }
    // disengagement ramp: backing off never pays, the boss only hunts harder
    e.hunger=clamp((timeSec-e.lastHit-8)/12,0,1);
    // anti-stuck watchdog: sample movement, blink out of wedges and far corners
    e.sampleT-=dt;
    if(e.sampleT<=0){ e.sampleT=0.5;
     const moved=Math.hypot(e.x-e.lastX,e.y-e.lastY); e.lastX=e.x; e.lastY=e.y;
     if(e.mode!=='phase'&&d>170&&moved<12) e.stuckT+=0.5; else e.stuckT=0;
     if(e.stuckT>=2.5||(e.mode!=='phase'&&d>900)){ e.stuckT=0; bossReposition(e,p); }
    }
    // desperation: first time below 30% — surge minions and visibly relocate (no heal)
    if(!e.desperate&&e.hp<e.maxhp*0.3){
     e.desperate=true;
     for(let k=0;k<3&&enemies.length<16;k++){ const s2=spawnEdgePos(); const m=mkEnemy(['drone','stalker','mite'][k%3],s2.x,s2.y,arenaIdx); m.spawnT=0.9; enemies.push(m); }
     rings.push({x:e.x,y:e.y,r:10,maxR:110,spd:320,dmg:0,hit:true});
     const q=spawnEdgePos(); e.x=clamp(q.x,PX0+e.r,PX1-e.r); e.y=clamp(q.y,PY0+e.r,PY1-e.r); resolveObstacles(e);
     rings.push({x:e.x,y:e.y,r:10,maxR:110,spd:320,dmg:0,hit:true});
     addFloater(e.x,calloutY(e),(e.bname||'BOSS')+' DESPERATE',K.red); SFX.alarm();
    }
    e.modeT-=dt;
    if(e.mode==='phase'){
     // translucent on the spot, knitting from a fixed pool — kill every minion
     // to break it out early. Rounds still land at 30%, so it is never a wall.
     bossHeal(e,e.maxhp*0.02*dt);
     e.spawned=e.spawned.filter(u=>{ for(const o of enemies) if(o.uid===u) return true; return false; });
     if(e.modeT<=0||e.spawned.length===0){
      e.phased=false; e.mode='warn'; e.warnT=0.8;
      rings.push({x:e.x,y:e.y,r:10,maxR:90,spd:300,dmg:0,hit:true}); SFX.alarm();
     }
    } else if(e.mode==='retreat'){
     // Kiting behind a minion screen. Heals only while unpressured, only from the
     // fixed pool, and only up to 520px out — beyond that it holds, so it can
     // never kite into a corner and stall the fight.
     if(timeSec-e.lastHit>2) bossHeal(e,e.maxhp*0.02*dt);
     if(d<520){
      let rx=-nx, ry=-ny;
      // bias away from walls: a retreat that ends in a corner is a stalemate
      const cxm=(PX0+PX1)/2, cym=(PY0+PY1)/2;
      if(Math.min(e.x-PX0,PX1-e.x,e.y-PY0,PY1-e.y)<220){ const tx=cxm-e.x, ty=cym-e.y, tl=len(tx,ty); rx+=tx/tl*1.6; ry+=ty/tl*1.6; }
      const sv=steer(e,rx,ry); e.x+=sv[0]*e.sp*1.05*sF*dt; e.y+=sv[1]*e.sp*1.05*sF*dt;
     }
     if(e.modeT<=0||(e.retreatHp-e.hp)>e.maxhp*0.08){ e.mode='hunt'; e.modeT=8; }
    } else if(e.mode==='warn'){
     e.warnT-=dt;
     if(e.warnT<=0){ e.mode='hunt'; e.modeT=e.kind==='phantom'?7:8;
      const n2=e.kind==='warden'?10:8;
      for(let k=0;k<n2;k++){ const a=k/n2*6.283+e.t; ebullets.push({x:e.x,y:e.y,vx:Math.cos(a)*230,vy:Math.sin(a)*230,r:6,dmg:e.dmg,life:3.5,heavy:true}); }
      SFX.eshoot(); }
    } else {
     // NO passive regen while hunting. The old 0.5%/s trickle was the engine of
     // the damage → flee → heal loop: disengaging always out-healed the chip
     // damage a player could land, so the bar never went down.
     const hpF=e.hp/e.maxhp;
     if(e.recovKind&&e.recovLeft>0&&e.recovCd<=0&&hpF<=e.recovAt&&hpF>RECOV_FLOOR){
      e.recovLeft--; e.recovCd=RECOV_CD; e.recovAt=0.42;
      if(e.recovKind==='phase') bossPhase(e); else bossRetreat(e);
     }
     else bossBehave(e,{p,dx,dy,d,nx,ny,dt,sF,enrage});
    }
   }
   e.x=clamp(e.x,PX0+e.r,PX1-e.r); e.y=clamp(e.y,PY0+e.r,PY1-e.r);
   resolveObstacles(e);
   if(!e.phased&&circleHit(e,p)&&e.contactCd<=0){ e.contactCd=0.6; if(e.type!=='brute'||e.windup<=0) hurtPlayer(e.dmg,(e.type==='boss'||e.type==='brute'),srcOf(e,e.type==='boss'?null:({drone:'RAM',mite:'RAM',stalker:'LUNGE'}[e.type]||'CONTACT'))); }
  }
  stampNext(null);
  // gems
  for(let i=gems.length-1;i>=0;i--){ const g=gems[i]; g.t+=dt; const d2=dist2(p.x,p.y,g.x,g.y);
   if(d2<p.magnet*p.magnet){ const d=Math.sqrt(d2)||1; const pull=p.pull||430; g.x+=(p.x-g.x)/d*pull*dt; g.y+=(p.y-g.y)/d*pull*dt; }
   if(d2<22*22){ gems.splice(i,1);
    if(p.salvage>0&&p.hp<p.maxhp) p.hp=Math.min(p.maxhp,p.hp+p.salvage);
    gainXp(g.v); if(state!=='playing') break; }
  }
  // wave director: reinforcements stream in from off-screen as the round progresses.
  // Deeper sectors trickle faster, in bigger packs (max 3), against a higher alive cap.
  if(spawnQueue.length>0){
   spawnT-=dt;
   const cap=8+Math.min(8,arenaIdx);
   if(spawnT<=0&&enemies.length<cap){
    spawnT=Math.max(0.5,2.0-arenaIdx*0.18);
    let n=1+(arenaIdx>=2?1:0)+(arenaIdx>=5?1:0);
    while(n-->0&&spawnQueue.length>0&&enemies.length<cap) spawnEnemy(spawnQueue.shift());
   }
  }
  if(enemies.length===0&&spawnQueue.length===0&&!portal){
   // exit lands near the player (250-550px) so the flight out is short but never
   // on top of them. Leftover gems STAY where they fell: XP is collected, never
   // handed out. Fly over it, pull it in with Magnet/Tractor, or lose it when you
   // leave — loadArena clears the field. The pre-validated arena.port is the
   // fallback if no near spot is free.
   let q=null;
   for(let t=0;t<40&&!q;t++){ const a=Math.random()*6.283, d=250+Math.random()*300;
    const x=clamp(p.x+Math.cos(a)*d,PX0+30,PX1-30), y=clamp(p.y+Math.sin(a)*d,PY0+30,PY1-30);
    if(Math.hypot(x-p.x,y-p.y)<230) continue;
    if(pointBlocked(x,y,26,arena.obs)) continue;
    q={x,y}; }
   portal={x:(q||arena.port).x,y:(q||arena.port).y,r:20,t:0}; SFX.portal();
  }
  if(portal){ portal.t+=dt; if(dist2(p.x,p.y,portal.x,portal.y)<(p.r+portal.r)*(p.r+portal.r)) nextArena(); }
  updateFx(dt);
  if(shake>0) shake=Math.max(0,shake-dt*22);
 } else {
  updateFx(dt);
 }
}
function updateFx(dt){
 for(let i=parts.length-1;i>=0;i--){ const q=parts[i]; q.x+=q.vx*dt; q.y+=q.vy*dt; q.vx*=0.94; q.vy*=0.94; q.life-=dt; if(q.life<=0) parts.splice(i,1); }
 if(parts.length>MAX_PARTS) parts.splice(0,parts.length-MAX_PARTS);
 for(let i=floaters.length-1;i>=0;i--){ const f=floaters[i]; f.y-=34*dt; f.life-=dt; if(f.life<=0) floaters.splice(i,1); }
}

// ---------- input actions ----------
function handleKeyPress(code){
 ac();
 if(code==='KeyM'){ muted=!muted; applyVol(); return; }
  if(state==='title'){
   ensureTitleMusic();
   if(code==='Enter'||code==='Space'){ SFX.click(); if(readRun()) continueRun(); else startRun(); return; }
   if(code==='KeyN'){ SFX.click(); titleNewRun(); return; }
   titleConfirm=false;
  if(code==='KeyO') openSettings('title');
  if(code==='KeyH'||code==='F1') openHelp('title');
  if(code==='KeyC') openCodex('title');
  return;
 }
 if(state==='codex'){
  if(code==='Digit1'||code==='Digit2'){ codexTab=CODEX_TABS[code==='Digit1'?0:1]; codexSel=0; SFX.click(); }
  else if(code==='ArrowLeft'||code==='ArrowRight'){ codexTab=codexTab==='bosses'?'bestiary':'bosses'; codexSel=0; SFX.click(); }
  else if(code==='ArrowDown'||code==='ArrowUp'){ codexStep(code==='ArrowDown'?1:-1); SFX.click(); }
  else if(code==='Escape'||code==='KeyC'||code==='Enter') closeCodex();
  return;
 }
  // Space is dash: a player mashing it as the hull goes must still see the end screen
  if(state==='gameover'){ if((code==='KeyR'||code==='Enter')&&endReady()){ SFX.click(); startRun(); } if(code==='Escape'){ state='title'; ensureTitleMusic(); } return; }
  if(state==='settings'){ settingsKey(code); return; }
 if(state==='help'){
  const dig=['Digit1','Digit2','Digit3','Digit4'].indexOf(code);
  if(dig>=0){ helpTab=HELP_TABS[dig]; SFX.click(); }
  else if(code==='ArrowRight'||code==='ArrowLeft'){
   let i=HELP_TABS.indexOf(helpTab);
   i=(i+(code==='ArrowRight'?1:HELP_TABS.length-1))%HELP_TABS.length;
   helpTab=HELP_TABS[i]; SFX.click();
  }
  else if(code==='Escape'||code==='KeyH'||code==='Enter') closeHelp();
  return; }
  if(state==='levelup'){ if(code==='KeyC'){ openCodex('levelup'); return; } if(code==='KeyH'){ openHelp('levelup'); return; } const d=['Digit1','Digit2','Digit3','Digit4'].indexOf(code); if(d>=0&&levelChoices[d]) pickUpgrade(levelChoices[d]); return; }
  if(state==='galaxy'){
   if(code==='Enter'||code==='Space'){ galaxyConfirm(); return; }
   if(code==='ArrowRight'||code==='ArrowLeft'){ const ns=clamp(galaxySel+(code==='ArrowRight'?1:-1),0,clearedMax+1); if(ns!==galaxySel){ galaxySel=ns; SFX.click(); } else SFX.brk(); return; }
   if(code==='Escape'){ quitToTitle(); return; }
   if(code==='KeyO'){ openSettings('galaxy'); return; }
   if(code==='KeyH'||code==='F1'){ openHelp('galaxy'); return; }
   if(code==='KeyC'){ openCodex('galaxy'); return; }
   return; }
  if(state==='playing'){
   if(code==='Escape'||code==='KeyP'){ toPaused(false); SFX.click(); return; }
  if(code==='KeyT'){ player.autoFire=!player.autoFire; addFloater(player.x,player.y-24,player.autoFire?'AUTO ON':'AUTO OFF',K.gold); return; }
  if(code==='KeyH'||code==='F1'){ openHelp('paused'); state='help'; helpFrom='playing-paused'; return; }
  if(code==='KeyC'){ openCodex('playing-paused'); return; } // look up what just hit you
  if(code==='KeyO'){ openSettings('paused'); settingsFrom='playing-paused'; return; }
  if(code==='Space'||code==='ShiftLeft'||code==='ShiftRight'){ tryDash(); return; }
  if(code==='KeyE'){ doPortalKey(); return; }
  return;
 }
 if(state==='paused'){ if(code==='Escape'||code==='KeyP'){ toPlaying(); SFX.click(); } if(code==='KeyR'){ pauseRestart(); } if(code==='KeyQ'){ quitToTitle(); return; } if(code==='KeyO') openSettings('paused'); if(code==='KeyH') openHelp('paused'); if(code==='KeyC') openCodex('paused'); return; }
}
// RESTART from pause throws away the saved run, so it asks twice, like NEW RUN.
function pauseRestart(){ SFX.click(); if(restartArm>performance.now()){ restartArm=0; startRun(); } else restartArm=performance.now()+3000; }
function endReady(){ return performance.now()-endInfo.at>=600; }
function tryDash(){
 const p=player; if(!p||state!=='playing') return;
 if(!p.dashUnlocked){ if(p.lockMsgCd<=0){ p.lockMsgCd=1; addFloater(p.x,p.y-24,'DASH LOCKED: Ion Thrusters',K.textDim); } return; }
 if(p.jamT>0){ if(p.lockMsgCd<=0){ p.lockMsgCd=1; addFloater(p.x,p.y-24,'SYSTEMS JAMMED',K.red); } return; }
 if(p.rootT>0){ if(p.lockMsgCd<=0){ p.lockMsgCd=1; addFloater(p.x,p.y-24,'PETRIFIED',K.red); } return; }
 if(p.dashCd>0||p.dashT>0) return;
 let ax=((keys.KeyD||keys.ArrowRight)?1:0)-((keys.KeyA||keys.ArrowLeft)?1:0);
 let ay=((keys.KeyS||keys.ArrowDown)?1:0)-((keys.KeyW||keys.ArrowUp)?1:0);
 if(ax===0&&ay===0){ ax=Math.cos(p.aim); ay=Math.sin(p.aim); }
 const l=len(ax,ay); p.dashDx=ax/l; p.dashDy=ay/l;
 p.dashT=0.16; p.dashCd=p.dashCdMax; p.invuln=Math.max(p.invuln,0.25);
 SFX.dash(); spawnBurst(p.x,p.y,7,K.goldDim,160,0.4,2.5);
}
function openSettings(from){ settingsFrom=from; prevPause=(state==='playing'||state==='paused')?state:null; state='settings'; if(from!=='title') setMusicCfg(PAUSE_MUS); SFX.click(); }
let prevPause=null;
function settingsKey(code){
  if(code==='Escape'||code==='KeyO'){ SFX.click(); const ap=autoPaused; if(settingsFrom==='playing') toPlaying(); else if(settingsFrom==='title'||settingsFrom==='galaxy') state=settingsFrom; else toPaused(ap);
   if(state==='title'||state==='galaxy') setMusicCfg(TITLE_MUS); else if(state==='playing'&&arena) setMusicCfg(arena.theme); else setMusicCfg(PAUSE_MUS); return; }
 if(code==='Digit1'){ settings.shake=!settings.shake; saveCfg(); }
 if(code==='Digit2'){ settings.particles=!settings.particles; saveCfg(); }
  if(code==='Digit3'){ settings.music=!settings.music; saveCfg(); applyVol(); if(settings.music){ if(settingsFrom==='title'||settingsFrom==='galaxy') setMusicCfg(TITLE_MUS); else if(state==='playing'&&arena) setMusicCfg(arena.theme); else setMusicCfg(PAUSE_MUS); } }
 if(code==='Digit4'){ settings.autofire=!settings.autofire; saveCfg(); if(player) player.autoFire=settings.autofire; }
 if(code==='Digit5'){ settings.showSeed=!settings.showSeed; saveCfg(); }
  if(code==='Digit6'){ if(wipeArmT>performance.now()){ wipeArmT=0; best=0; depth=0; bosses=0; saveMeta(); codexKills={}; saveCodex(); codexSeenMap={}; try{ lsDel('seen'); }catch(e){} } else wipeArmT=performance.now()+3000; }
 if(code==='Digit7'){ settings.musicVol=settings.musicVol>=1?0:Math.round((settings.musicVol+0.1)*10)/10; saveCfg(); applyVol(); }
 if(code==='Digit8'){ settings.sfxVol=settings.sfxVol>=1?0:Math.round((settings.sfxVol+0.1)*10)/10; saveCfg(); applyVol(); }
 if(code==='Digit9'){ settings.dmgNums=!settings.dmgNums; saveCfg(); }
 SFX.click();
}
let helpTab='controls'; // controls | shields | arsenal | lore
let codexPreview=false; // suppresses HP bars and combat labels in codex portraits
let codexSilhouette=false; // locked entries draw their real shape as a flat shadow
const HELP_TABS=['controls','shields','arsenal','lore'];
function helpTabRects(){ const a=[]; const w=170, g=10, x0=(W-(w*4+g*3))/2; for(let i=0;i<4;i++) a.push({x:x0+i*(w+g),y:132,w,h:30}); return a; }
// ---------- codex screen ----------
// Its own screen, reachable from the title, the galaxy hub and pause (key C).
let codexFrom='title', codexTab='bosses', codexSel=0;
const CODEX_TABS=['bestiary','bosses'];
function openCodex(from){ codexFrom=from; codexSel=0; state='codex'; if(from==='paused'||from==='playing-paused') setMusicCfg(PAUSE_MUS); SFX.click(); }
function closeCodex(){ SFX.click(); if(codexFrom==='paused'||codexFrom==='playing-paused') toPaused(autoPaused); else if(codexFrom==='galaxy') state='galaxy'; else if(codexFrom==='levelup') state='levelup'; else state='title'; }
function codexTabRects(){ const w=200, g=12, x0=(W-(w*2+g))/2; return [0,1].map(i=>({x:x0+i*(w+g),y:120,w,h:30})); }
// ---------- codex ----------
// One entry per thing that can kill you. TELL is what you see before it hurts,
// COUNTER is what you do about it — the two lines that actually change play.
// Lore builds the setting instead of restating the mechanic above it.
const CODEX_FOES=[
 {id:'drone', type:'drone', name:'DRONE', role:'Chaser', threat:'Low',
  tell:'Weaves as it closes, then accelerates inside 160px.',
  counter:'Strafe and let it commit. Never let three stack on one line.',
  lore:'Lane sweepers. They were built to clear debris from a shipping lane that stopped carrying ships a few hundred million years ago. They still weave around traffic that is no longer there, which is why they wobble. You count as debris.'},
 {id:'mite', type:'mite', name:'MITE', role:'Splitter', threat:'Low',
  tell:'Fastest thing on the field. Comes in straight and reckless.',
  counter:'Kill it at range — death spawns two drones on the spot.',
  lore:'Not a machine so much as a budget. Someone worked out that two cheap hulls delivered later beat one good hull delivered now, and shipped the maths as a weapon. The someone has been gone for a billion years. The maths has not.'},
 {id:'stalker', type:'stalker', name:'STALKER', role:'Duellist', threat:'Medium',
  tell:'Orbits at range, then FLASHES BRIGHT and holds still for half a second.',
  counter:'The flash is the commitment. Move perpendicular — it cannot correct mid-dash.',
  lore:'Holmgang duellists. The flash is not a targeting laser, it is a courtesy: under the holmgang, striking an unready opponent voids the contest. They salute before every lunge, and no one has ever saluted back.'},
 {id:'sniper', type:'sniper', name:'SNIPER', role:'Artillery', threat:'Medium',
  tell:'A RED LINE from it to you, half a second before a HEAVY bolt.',
  counter:'Break the line — put a pylon between you, or dash through it.',
  lore:'It relocates after every shot because the doctrine says so, and the doctrine was written for a war between two fleets that shot back with artillery. Both fleets are gone. Against one ship it is simply a nervous habit.'},
 {id:'tempest', type:'tempest', name:'TEMPEST', role:'Suppression', threat:'Medium',
  tell:'Rotor blades flare BRIGHT, then a spread of HEAVY bolts.',
  counter:'Close or leave — the spread is widest at range. Five bolts past S7.',
  lore:'Suppression rotors from a blockade that ended when the world it was blockading did. The spread is still calibrated for a fleet forty hulls wide, which is why so much of it goes nowhere.'},
 {id:'brute', type:'brute', name:'BRUTE', role:'Zone control', threat:'High',
  tell:'A red ring previews the blast radius while it winds up.',
  counter:'The wave is DODGEABLE — it is a ring, not a sphere. Step over the band or dash it.',
  lore:'Mining hull. It has no opinion about you at all; you are simply inside a volume of asteroid scheduled for extraction, and the schedule does not have a field for that.'}
];
const CODEX_BOSSES=[
 {id:'overlord',
  role:'Brawler', threat:'Never recovers',
  tell:'Cycles BURST / SUMMON / CHARGE / SWEEP on a three-second clock.',
  counter:'Pure aggression with no escape. Learn the cycle and out-damage it.',
  lore:'The Berserk. The youngest of the gods, which out here means a few hundred million years old. Its makers built it to win rather than to hold, and it has never yielded a holmgang. They called this discipline. There is no one left to call it anything.'},
 {id:'warden',
  role:'Siege fortress', threat:'Retreats once or twice',
  tell:'Slow. Spirals, guards, seismic slams, twin staggered waves.',
  counter:'Stay off the rings. When it RETREATS, chase — damage stops its healing.',
  lore:'Bridge-Warden. Lane authority, built to stand at the one crossing between two dead empires. It was never meant to advance, only to make advancing expensive, and it has kept that contract long after the lane stopped leading anywhere.'},
 {id:'phantom',
  role:'Skirmisher', threat:'Phases, briefly',
  tell:'A locked RED LINE that holds still — the beam comes down exactly there.',
  counter:'Step off the line. When it PHASES it still takes 30% damage — kill the minions to end it early.',
  lore:'The Undelivered. A courier that learned its cargo was itself. It crossed eleven thousand years to deliver a reply and arrived at an empty star. The blink hardware was for outrunning interdiction; the beam was improvised later, from the part that did the outrunning.'},
 {id:'leviathan',
  role:'Serpent', threat:'Body damages on contact',
  tell:'BURROWS with a telegraph, resurfaces underneath you with a shockwave.',
  counter:'Watch the ground, not the head. Segments hurt — never stand in the trail.',
  lore:'The Lane-Wyrm. Lane-boring infrastructure that kept growing after the contract lapsed, tunnelling debris fields for a trade that ended before home\'s star was lit. The segments are not armour; they are the original boring string, still following the head out of habit.'},
 {id:'oracle',
  role:'Zone controller', threat:'Warded until broken',
  tell:'Three shards orbit it. Rotating twin beams; damaging fields parked on you.',
  counter:'Break all three WARDS first — until then it soaks 75% of every round.',
  lore:'The Rememberer. It computes where you will be, which is a harder problem than it sounds and a cheaper one than aiming. It has run the same sum on every species it ever heard, and kept the answers. The wards are its working memory, and it cannot afford to lose them mid-calculation.'},
 {id:'harbinger',
  role:'Bullet-hell caster', threat:'Never recovers',
  tell:'Dense rotating walls with ONE gap, plus targeted meteors.',
  counter:'Find the gap and travel with it. Do not try to out-run the wall.',
  lore:'The Horn. An announcement, not a warship: it was built so that a species could be seen from far away. Everything it does is legible from a distance, because the point was always that you would see it coming and understand what it meant.'},
 {id:'basilisk',
  role:'Controller', threat:'Roots you in place',
  tell:'A ruled CONE opens before the gaze fires. Lunges leave spikes behind.',
  counter:'Leave the cone — being PETRIFIED next to a lunge is how this fight ends.',
  lore:'Keeper of the Held. A dying world built it to keep visitors away, so that whatever was killing them would not leave. It does not kill so much as hold you pending review. The reviewers ended nine hundred million years ago. The queue has not moved.'},
 {id:'juggernaut',
  role:'Ram', threat:'Armoured prow',
  tell:'RAM, then a straight commit, shockwave on impact. Facing LOCKS while charging.',
  counter:'The prow takes 40%, the REAR VENT takes 190%. Flank every charge.',
  lore:'The Unsteered. A colony ark built around one engine too large to be steered and too valuable to be wasted. The colonists never boarded. They put armour on the prow and filed the exhaust problem as acceptable.'},
 {id:'nullifier',
  role:'Disruptor', threat:'Jams your abilities',
  tell:'A hatched DISRUPTOR FIELD drops on your position.',
  counter:'Walk out. It locks dash and recall — never your guns. Sniper escorts punish standing still.',
  lore:'The Silent. Counter-insurgency hardware from a war against ships that relied on their gear. It cannot shoot especially well. It does not need to; it only needs you to be ordinary for four seconds. The holmgang lets it take your wings, never your guns, and it resents the clause.'},
 {id:'chorus',
  role:'Splitter', threat:'Fractures twice',
  tell:'At 66% and 33% it FRACTURES into smaller synced echoes.',
  counter:'Burst through the thresholds fast, or fight three at once. Echoes are fragile.',
  lore:'The Norn-Choir. Not built by a people; it is one: the last of a species that copied itself into machines so it would not end. Three copies were made, to be safe. Each echo believes it is the original and is, in every sense that has ever been tested, correct.'},
 {id:'archon',
  role:'Commander', threat:'Calls LORDS twice as often',
  tell:'Rotating cross-beams, and "ARCHON CALLS LORD …" — a weakened Lord arrives beside it.',
  counter:'Deep down the trail, its Lords call Captains of their own. Kill the ARCHON to stop the calls.',
  lore:'The Lawspeaker. Rank, rendered as a machine. It wrote the holmgang every god fights under, it has never fired the first shot in any holmgang it has won, and it regards this as the entire point of the office.'},
 {id:'singularity',
  role:'Apex', threat:'Commands three links deep',
  tell:'GRAVITY drags you inward while debris arcs outward, and SOVEREIGNS answer its call.',
  counter:'Thrust against the pull. Its Sovereigns call Lords, and those Lords call Captains — kill fast or drown in rank.',
  lore:'The One-Eyed. The first machine any species ever sent into the dark. It gave its eye to a black hole and lives at the lip of it, where time runs slow: the oldest thing in the universe, and the one that has lived through the least of it. Everything you have fought since the first sector was, in some documented sense, subcontracted from here.'}
];
function codexList(){ return codexTab==='bosses'?CODEX_BOSSES:CODEX_FOES; }
function codexId(entry){ return codexTab==='bosses'?entry.id:entry.type; }
// Bosses are listed as the chain of command itself — grouped under rank headers
// from APEX down — so the list IS the hierarchy tree. Headers are not selectable.
function codexRows(){
 const L=codexList(), rows=[];
 if(codexTab!=='bosses'){ L.forEach((entry,i)=>rows.push({entry,i})); return rows; }
 for(let t=TIER_NAMES.length-1;t>=1;t--){
  const members=L.map((entry,i)=>({entry,i})).filter(r=>BOSSDEF[r.entry.id]&&BOSSDEF[r.entry.id].tier===t)
   .sort((a,b)=>BOSSDEF[a.entry.id].debut-BOSSDEF[b.entry.id].debut);
  if(!members.length) continue;
  rows.push({hdr:TIER_NAMES[t]});
  for(const m of members) rows.push(m);
 }
 return rows;
}
function codexProgress(){
 let n=0, m=0, tot=0;
 for(const f of CODEX_FOES){ tot++; if(codexKnown(f.type)) n++; if(codexSeen(f.type)) m++; }
 for(const b of CODEX_BOSSES){ tot++; if(codexKnown(b.id)) n++; if(codexSeen(b.id)) m++; }
 return {n,m,tot};
}
// Left-aligned word wrap returning lines, so lore can flow in the detail pane.
function wrapLines(t,maxChars){
 const words=String(t).split(' '), out=[]; let line='';
 for(const w of words){
  if(line&&(line+' '+w).length>maxChars){ out.push(line); line=w; }
  else line=line?line+' '+w:w;
 }
 if(line) out.push(line);
 return out;
}
const HELP_TXT={
controls:[
'MOVE: WASD / Arrows — your nose follows movement, guns track the mouse.',
'FIRE: hold click, or leave AUTO-FIRE on (T) and just fly.',
'DASH: locked until Ion Thrusters — then Space / Shift (i-frames).',
'EXIT: walk into the ring or press E. Clearing a wave funds ~1 upgrade.',
'GALAXY: START drops you on the hub — pick a lit sector, clear it, pick the next.',
'WAVES: an opening pack loads in; reinforcements stream from off-screen.',
'RECALL: Portal Cell cards grant charges (max 5).',
'  E drops a gate (1 charge). E again channels a blink (520px, cooldown).',
'  Overdrive cuts cooldown, Transit cuts channel time. E cancels.',
'PICK: 1 / 2 / 3 or click a card. PAUSE: Esc / P. MUTE: M. SETTINGS: O. CODEX: C.',
'STATUS: PETRIFIED roots you; JAMMED locks dash + recall. Neither stops your guns.',
'TIP: first draft offers dash + recall — take one, then build damage.'],
shields:[
'Warding Plate: blocks the 1st hit of EVERY round. Refreshes per arena.',
'Bulwark Matrix: blocks 2+ hits per round. Refreshes per arena.',
'Crit Ward (rare): blocks 1 HEAVY hit per round. Refreshes per arena.',
'Aegis Pulse: a shield that recharges mid-fight and blocks hits.',
'Ablative Barrier (rare): ONE-TIME pool absorbs 50 damage — never comes back.',
'Stasis Protocol (rare): cheat death up to 3 times — revival grows 1 HP → 25% → FULL.',
'Second Wind (rare): one revive at 50% HP.',
'Block order: Crit Ward (heavy only) → Warding → Bulwark → Barrier → Aegis.',
'Live shields show under your HUD: WARD · BUL×2 · MIR · BAR50 · STASIS×1.',
'Repair Drone mends you only after 4s UNDAMAGED — sustain between fights.',
'Adrenal Core pays more the lower your HP. Salvage mends on every gem.'],
arsenal:[
'BARRELS: Gun Array +1 shot, no cost. Split Chamber (rare) +1 shot, -15% dmg.',
'  Minigun Amps +1 barrel, wider spread, per-bullet damage rebalanced.',
'AMMO: Incendiary burns · Cryo chills · Slug hits harder and slower.',
'  Flak detonates on impact · Corrosive shreds armour (5 stacks, +8% each).',
'  Chain Shot arcs to a second foe · Overcharge makes every 5th volley heavy.',
'  Seeker homes · Ricochet bounces · Lance Rounds pierce.',
'ABILITIES: Kinetic Discharge charges on KILLS then blasts — Capacitor Tuning',
'  lowers the kill cost, Amplifier raises damage, Resonance widens and chills.',
'  Orbital Cannon calls telegraphed strikes. Prism Lance fires a piercing beam.',
'  Guardian Orbit, Frost Nova, Tesla Arc (rare), Kill Surge, Shrapnel Core.',
'MAPS: every arena is validated — all spawns and the EXIT are always reachable,',
'  and at least 45% of the field is open. Six layout types, six themes.'],
lore:[
'You are KRIEFNE: an exploration ship sent from home, long ago, to find life.',
'Home has not answered once in all that time.',
'Out here are machines older than stars, ranked like the old northern gods.',
'They catch every signal that crosses their space — even the ones meant for you.',
'',
'Every fifth sector is a NEST. The gods keep a chain of command:',
'  APEX  >  SOVEREIGN  >  LORD  >  CAPTAIN  >  ENFORCER  >  chaff.',
'Each god is met alone the first time. After that it returns as a commander',
'holding court, or as an escort serving a god who outranks it.',
'They fight by holmgang: every blow shown first, your guns never taken.',
'',
'Past S30 a god can CALL one rank below it — a weakened lieutenant. Past S60 a',
'lieutenant can call one of its own. The Apex at S100 commands three links deep.',
'Kill the one giving orders and the calls stop.',
'',
'Lose your ship and the Wake restores you. Each god slain: +2% damage, for good.']
};
function openHelp(from){ helpFrom=from; helpTab='controls'; state='help'; if(from==='paused'||from==='playing-paused') setMusicCfg(PAUSE_MUS); SFX.click(); }
function closeHelp(){ SFX.click(); if(helpFrom==='levelup'){ state='levelup'; } else if(helpFrom==='paused'){ toPaused(autoPaused); } else if(helpFrom==='playing-paused'){ toPaused(autoPaused); } else if(helpFrom==='galaxy'){ state='galaxy'; } else { state='title'; } }
function inBtn(x,y,b){ return x>b.x&&x<b.x+b.w&&y>b.y&&y<b.y+b.h; }
// Starting over while a run is saved throws that run away, so it takes a
// second press: the first only arms the button.
function titleNewRun(){ if(readRun()&&!titleConfirm){ titleConfirm=true; return; } titleConfirm=false; startRun(); }
function quitToTitle(){ state='title'; autoPaused=false; titleConfirm=false; parts=[]; floaters=[]; clearInputs(); ensureTitleMusic(); SFX.click(); }
const BTN={ titleContinue:{x:64,y:346,w:400,h:44}, titleStart:{x:64,y:398,w:400,h:44}, titleSet:{x:64,y:462,w:126,h:34}, titleCodex:{x:201,y:462,w:126,h:34}, titleHelp:{x:338,y:462,w:126,h:34},
 pauseResume:{x:330,y:290,w:300,h:42}, pauseSet:{x:330,y:338,w:300,h:42}, pauseHelp:{x:330,y:386,w:300,h:42}, pauseCodex:{x:330,y:434,w:300,h:42}, pauseRestart:{x:330,y:482,w:300,h:42}, pauseQuit:{x:330,y:530,w:300,h:42},
 galCodex:{x:W-236,y:60,w:180,h:34},
 endRestart:{x:330,y:532,w:300,h:44}, endTitle:{x:330,y:584,w:300,h:36},
 back:{x:330,y:560,w:300,h:44} };
function handleClick(x,y){
 if(state==='title'){
  ensureTitleMusic();
  const saved=readRun();
  if(saved&&inBtn(x,y,BTN.titleContinue)){ SFX.click(); continueRun(); }
  else if(inBtn(x,y,titleStartRect())){ SFX.click(); if(saved) titleNewRun(); else startRun(); }
  else if(inBtn(x,y,BTN.titleSet)) openSettings('title');
  else if(inBtn(x,y,BTN.titleCodex)) openCodex('title');
  else if(inBtn(x,y,BTN.titleHelp)) openHelp('title');
  return;
 }
 if(state==='codex'){
  const tr=codexTabRects();
  for(let i=0;i<tr.length;i++){ if(inBtn(x,y,tr[i])){ codexTab=CODEX_TABS[i]; codexSel=0; SFX.click(); return; } }
  for(const r of codexRects()){ if(!r.row.hdr&&inBtn(x,y,r)){ codexSel=r.row.i; SFX.click(); return; } }
  if(inBtn(x,y,BTN.back)) closeCodex();
  return;
 }
 if(state==='settings'){
  const rows=rowRects();
  for(let i=0;i<rows.length;i++){ if(x>rows[i].x&&x<rows[i].x+rows[i].w&&y>rows[i].y&&y<rows[i].y+rows[i].h){ settingsKey('Digit'+(i+1)); return; } }
  if(inBtn(x,y,BTN.back)){ settingsKey('Escape'); }
  return;
 }
  if(state==='help'){ const tr=helpTabRects();
   for(let i=0;i<tr.length;i++){ if(inBtn(x,y,tr[i])){ helpTab=HELP_TABS[i]; SFX.click(); return; } }
   if(inBtn(x,y,BTN.back)) closeHelp(); return; }
  if(state==='gameover'){
   if(inBtn(x,y,BTN.endRestart)){ if(endReady()){ SFX.click(); startRun(); } }
   else if(inBtn(x,y,BTN.endTitle)){ state='title'; ensureTitleMusic(); }
   return;
  }
  if(state==='levelup'){ // a press only arms a card; the pick lands on release (handleRelease)
   draftPress=-1; if(performance.now()-draftAt<DRAFT_GRACE) return;
   for(let i=0;i<levelChoices.length;i++){ const r=draftRect(i); if(x>r.x&&x<r.x+r.w&&y>r.y&&y<r.y+r.h){ draftPress=i; return; } }
   return;
  }
  if(state==='galaxy'){
   if(inBtn(x,y,BTN.galCodex)){ openCodex('galaxy'); return; }
   for(const n of galNodes()){ if(Math.hypot(x-n.x,y-n.y)<20){ galaxySel=n.i; if(n.unlocked){ SFX.click(); loadSector(n.i); } else SFX.brk(); return; } }
   return;
  }
  if(state==='paused'){
   if(inBtn(x,y,BTN.pauseResume)){ toPlaying(); SFX.click(); }
  else if(inBtn(x,y,BTN.pauseSet)) openSettings('paused');
  else if(inBtn(x,y,BTN.pauseHelp)) openHelp('paused');
  else if(inBtn(x,y,BTN.pauseCodex)) openCodex('paused');
  else if(inBtn(x,y,BTN.pauseRestart)) pauseRestart();
  else if(inBtn(x,y,BTN.pauseQuit)) quitToTitle();
  return;
 }
  if(state==='playing'){
   const wx=x+cam.x, wy=y+cam.y; // clicks arrive in screen space; the world is camera-offset
   if(portal&&dist2(wx,wy,portal.x,portal.y)<50*50){ nextArena(); return; }
   const rc=player.recall;
   if(rc&&dist2(wx,wy,rc.x,rc.y)<40*40){ doPortalKey(); }
  }
}
function rowRects(){ const a=[]; for(let i=0;i<9;i++) a.push({x:230,y:176+i*42,w:500,h:38}); return a; }

// ---------- render ----------
// ======================================================================
//  RENDERING — the Etched Record
// ======================================================================
// Everything is drawn as if engraved on the record KRIEFNE carries: monoline
// strokes, ticks, hatching and binary counts. Light is line density, never glow.
// Colour means one thing each (see K at the top of the file).

// ---------- engraved components ----------
function line(x1,y1,x2,y2,col,w,dash){ ctx.strokeStyle=col; ctx.lineWidth=w||1; if(dash) ctx.setLineDash(dash); ctx.beginPath(); ctx.moveTo(x1,y1); ctx.lineTo(x2,y2); ctx.stroke(); if(dash) ctx.setLineDash([]); }
// A rule with end ticks. Solid is the committed state; dashed is everything else.
function rule(x,y,w,col,solid){ line(x,y,x+w,y,col,solid?1.5:1,solid?null:[4,4]); line(x,y-3,x,y+3,col,1); line(x+w,y-3,x+w,y+3,col,1); }
function diamond(x,y,s,col,hollow){ ctx.beginPath(); ctx.moveTo(x,y-s); ctx.lineTo(x+s,y); ctx.lineTo(x,y+s); ctx.lineTo(x-s,y); ctx.closePath(); if(hollow){ ctx.strokeStyle=col; ctx.lineWidth=1; ctx.stroke(); } else { ctx.fillStyle=col; ctx.fill(); } }
function hovered(b){ return mouse.x>b.x&&mouse.x<b.x+b.w&&mouse.y>b.y&&mouse.y<b.y+b.h; }
// Display lettering: engraver's wide capitals, tracked.
function heading(t,x,y,px,col,align){ ctx.textAlign=align||'left'; ctx.font=fD(px); ctx.fillStyle=col||K.gold; track(Math.round(px*0.18)); ctx.fillText(t,x,y); track(0); }
function mono(t,x,y,px,col,align,w){ ctx.textAlign=align||'left'; ctx.font=fM(px,w); ctx.fillStyle=col||K.text; ctx.fillText(t,x,y); }
// Engraved menu entry. `on` is the committed or primary choice: solid gold rule
// and a filled marker. Everything else is a dashed rule until hovered.
function entry(b,label,key,on,tone){
 const hot=on||hovered(b), danger=tone==='danger';
 const col=danger?K.red:(hot?K.gold:K.goldDim), cy=b.y+b.h/2-2;
 heading(label,b.x+22,cy+5,b.h>=40?13:10,danger?K.red:(hot?K.gold:K.text));
 if(key) mono(key,b.x+b.w,cy+4,11,K.textDim,'right');
 rule(b.x,b.y+b.h-5,b.w,col,hot);
 diamond(b.x+8,cy+1,4,col,!hot);
}
// Corner-ticked plate: the frame an engraver leaves around a figure.
function plate(x,y,w,h,col,solid,dash){
 ctx.strokeStyle=col; ctx.lineWidth=solid?1.5:1;
 if(solid||dash){ if(dash) ctx.setLineDash([5,4]); ctx.strokeRect(x+0.5,y+0.5,w,h); ctx.setLineDash([]); return; }
 const c=12; ctx.beginPath();
 ctx.moveTo(x,y+c); ctx.lineTo(x,y); ctx.lineTo(x+c,y);
 ctx.moveTo(x+w-c,y); ctx.lineTo(x+w,y); ctx.lineTo(x+w,y+c);
 ctx.moveTo(x+w,y+h-c); ctx.lineTo(x+w,y+h); ctx.lineTo(x+w-c,y+h);
 ctx.moveTo(x+c,y+h); ctx.lineTo(x,y+h); ctx.lineTo(x,y+h-c); ctx.stroke();
}
// A groove meter: hairline track, a filled cut, and graduation ticks.
function groove(x,y,w,frac,col,ticks){
 line(x,y,x+w,y,K.metalDim,1);
 const f=clamp(frac,0,1); if(f>0) line(x,y,x+w*f,y,col,3);
 const n=ticks||0; for(let i=0;i<=n;i++){ const tx=x+w*i/Math.max(1,n); line(tx,y-3,tx,y+3,K.metalDim,1); }
 line(x,y-4,x,y+4,K.metal,1); line(x+w,y-4,x+w,y+4,K.metal,1);
}
// Rank as concentric rings: ENFORCER 1 … APEX 5. Shape, not hue.
function rankRings(x,y,r,n,col,w){ ctx.strokeStyle=col; ctx.lineWidth=w||1; for(let k=0;k<n;k++){ ctx.beginPath(); ctx.arc(x,y,r+k*3.5,0,6.283); ctx.stroke(); } }
// Binary tick count: tall cut for a held charge, short cut for an empty slot.
function binTicks(x,y,n,max,col){ for(let i=0;i<max;i++){ const on=i<n; line(x+i*6,y,x+i*6,y-(on?10:4),on?col:K.metalDim,on?2:1); } }
// World text: a ground-coloured knockout keeps it legible over wreckage.
function inkText(t,x,y,col,font){ ctx.font=font||fM(12,600); ctx.lineWidth=3; ctx.strokeStyle=K.ground; ctx.lineJoin='round'; ctx.strokeText(t,x,y); ctx.fillStyle=col; ctx.fillText(t,x,y); }
function poly(n,r,rot){ ctx.beginPath(); for(let i=0;i<n;i++){ const a=(rot||0)+i/n*6.283; const px=Math.cos(a)*r, py=Math.sin(a)*r; if(i) ctx.lineTo(px,py); else ctx.moveTo(px,py); } ctx.closePath(); }
function tickedLine(x1,y1,x2,y2,col,w,step,tick){
 line(x1,y1,x2,y2,col,w);
 const dx=x2-x1, dy=y2-y1, L=Math.hypot(dx,dy)||1, nx=-dy/L, ny=dx/L, s=step||22, t=tick||4;
 ctx.lineWidth=1; ctx.beginPath();
 for(let d=s;d<L;d+=s){ const px=x1+dx*d/L, py=y1+dy*d/L; ctx.moveTo(px-nx*t,py-ny*t); ctx.lineTo(px+nx*t,py+ny*t); }
 ctx.stroke();
}

// ---------- the wordmark ----------
// Straight strokes only, the way a stylus cuts them and the way runes were cut.
// Unit cap height; each letter is a list of polylines.
const WORDMARK=[
 {w:0.62,s:[[[0,0],[0,1]],[[0.62,0],[0.06,0.55]],[[0.24,0.37],[0.64,1]]]},
 {w:0.6,s:[[[0,1],[0,0],[0.44,0],[0.6,0.15],[0.6,0.31],[0.44,0.46],[0,0.46]],[[0.3,0.46],[0.62,1]]]},
 {w:0,s:[[[0,0],[0,1]]]},
 {w:0.5,s:[[[0.5,0],[0,0],[0,1],[0.5,1]],[[0,0.5],[0.38,0.5]]]},
 {w:0.5,s:[[[0.5,0],[0,0],[0,1]],[[0,0.5],[0.38,0.5]]]},
 {w:0.6,s:[[[0,1],[0,0],[0.6,1],[0.6,0]]]},
 {w:0.5,s:[[[0.5,0],[0,0],[0,1],[0.5,1]],[[0,0.5],[0.38,0.5]]]}
];
function drawWordmark(x,y,h,col,bg){
 ctx.save(); ctx.lineJoin='miter'; ctx.lineCap='square';
 const gap=0.32*h;
 const pass=(lw,c)=>{ let px=x; ctx.strokeStyle=c; ctx.lineWidth=lw;
  for(const L of WORDMARK){ for(const s of L.s){ ctx.beginPath(); s.forEach((p,i)=>{ const X=px+p[0]*h, Y=y+p[1]*h; if(i) ctx.lineTo(X,Y); else ctx.moveTo(X,Y); }); ctx.stroke(); } px+=L.w*h+gap; }
  return px-gap; };
 const end=pass(h*0.08,col||K.gold);
 pass(Math.max(1,h*0.02),bg||K.ground); // the engraved inline
 ctx.restore(); return end-x;
}

// ---------- stars ----------
let farStars=null;
function mkCanvas(w,h){ try{ if(typeof document!=='undefined'&&document.createElement){ const c=document.createElement('canvas'); c.width=w; c.height=h; if(c.getContext) return c; } }catch(e){} return null; }
function paintStars(g,w,h,n,seed,bright){
 const R=mulberry32(seed>>>0);
 for(let i=0;i<n;i++){ const x=R()*w, y=R()*h, m=R();
  if(m>0.985&&bright){ g.fillStyle=K.text; g.beginPath(); g.arc(x,y,1.3,0,6.283); g.fill(); g.strokeStyle=K.metalDim; g.lineWidth=1; g.beginPath(); g.moveTo(x-5,y); g.lineTo(x+5,y); g.moveTo(x,y-5); g.lineTo(x,y+5); g.stroke(); }
  else { g.fillStyle=m>0.8?K.metal:K.metalDim; const s=m>0.8?1.5:1; g.fillRect(x,y,s,s); } }
}
function drawFarStars(ox,oy){
 // The tile is repainted at the current device density so the starfield
 // stays as crisp as the playfield after a DPR or window change.
 const q = devicePx > 0 ? devicePx : 1, TS = 512;
 if(!farStars || farStars._q !== q){
  farStars = mkCanvas(Math.max(1, Math.round(TS * q)), Math.max(1, Math.round(TS * q)));
  if(farStars){ farStars._q = q; const fg = farStars.getContext('2d');
   try{ fg.setTransform(q, 0, 0, q, 0, 0); }catch(e){}
   paintStars(fg, TS, TS, 70, 7771, false); }
 }
 if(!farStars) return;
 const sx=-(((ox%TS)+TS)%TS), sy=-(((oy%TS)+TS)%TS);
 for(let x=sx;x<W;x+=TS) for(let y=sy;y<H;y+=TS) ctx.drawImage(farStars,x,y,TS,TS);
}

// ---------- the static sector layer ----------
// Stars, the sector's dying star, its motif, the wreckage and the rim are
// painted once per sector into an offscreen canvas and blitted each frame.
let worldCache=null, codexSilCache={};
function worldLayer(){
 if(!arena) return null;
 // Painted at device density and blitted back to logical size, so the one
 // static layer never softens the hairlines after an upscale.
 const k = devicePx > 0 ? devicePx : 1;
 if(worldCache&&worldCache.a===arena&&worldCache.w===WW&&worldCache.h===HH&&worldCache.k===k) return worldCache.c;
 const c=mkCanvas(Math.max(1, Math.round(WW*k)),Math.max(1, Math.round(HH*k))); if(!c) return null;
 const g=c.getContext('2d'); try{ g.setTransform(k,0,0,k,0,0); }catch(e){}
 paintWorld(g,arena.theme||THEMES[0]);
 worldCache={a:arena,w:WW,h:HH,k,c}; return c;
}
function paintWorld(g,th){
 const seed=((arena&&arena.seed)||1)>>>0, R=mulberry32((seed^0x51f15e)>>>0);
 const ld=th.light||0, Lx=Math.cos(ld), Ly=Math.sin(ld), P=th.pal||mkSectorPal(th.tint||245);
 // beyond the rim the field is deeper, so the sector's edge reads without a wall
 g.fillStyle=P.deep; g.fillRect(0,0,WW,PY0); g.fillRect(0,PY1,WW,HH-PY1); g.fillRect(0,PY0,PX0,PY1-PY0); g.fillRect(PX1,PY0,WW-PX1,PY1-PY0);
 paintStars(g,WW,HH,Math.round(WW*HH/7000),seed^0x5a5a,true);
 // the one light: a dying star past the rim, engraved as concentric hairlines
 const far=Math.max(WW,HH), sx=WW/2-Lx*far*0.95, sy=HH/2-Ly*far*0.95, sr=far*0.55;
 g.strokeStyle=P.faint; g.lineWidth=1;
 for(let k=0;k<9;k++){ g.beginPath(); g.arc(sx,sy,sr+k*9,0,6.283); g.stroke(); }
 g.strokeStyle=P.dim; g.beginPath(); g.arc(sx,sy,sr,0,6.283); g.stroke();
 paintMotif(g,th.motif,R,P);
 for(const o of arena.obs) engrave(g,o,Lx,Ly,P);
 // the rim: a graduated edge, like the rim of a dial
 g.strokeStyle=P.dim; g.lineWidth=1; g.strokeRect(PX0+0.5,PY0+0.5,PX1-PX0-1,PY1-PY0-1);
 g.beginPath();
 for(let x=PX0;x<=PX1;x+=40){ const t=((x-PX0)%200===0)?9:4; g.moveTo(x,PY0); g.lineTo(x,PY0+t); g.moveTo(x,PY1); g.lineTo(x,PY1-t); }
 for(let y=PY0;y<=PY1;y+=40){ const t=((y-PY0)%200===0)?9:4; g.moveTo(PX0,y); g.lineTo(PX0+t,y); g.moveTo(PX1,y); g.lineTo(PX1-t,y); }
 g.stroke();
}
function paintMotif(g,m,R,P){
 g.lineWidth=1;
 if(m==='ring'){ // a shattered orbital ring crossing the field
  const cx=WW*(0.2+R()*0.6), cy=HH*1.6, r=HH*1.35;
  for(const off of [0,7]){ g.strokeStyle=off?P.faint:P.motif; g.beginPath();
   for(let a=-2.4;a<-0.7;a+=0.05){ if(R()<0.12) { g.stroke(); g.beginPath(); continue; } const x=cx+Math.cos(a)*(r+off), y=cy+Math.sin(a)*(r+off); g.lineTo(x,y); } g.stroke(); } }
 else if(m==='veil'){ // an emission nebula, stippled
  for(let c=0;c<5;c++){ const cx=R()*WW, cy=R()*HH, rr=120+R()*220; g.fillStyle=P.motif;
   for(let i=0;i<360;i++){ const a=R()*6.283, d=Math.pow(R(),0.6)*rr; g.fillRect(cx+Math.cos(a)*d,cy+Math.sin(a)*d*0.6,1.2,1.2); } } }
 else if(m==='belt'){ // a diagonal band of slag
  const a=-0.5+R()*0.3, bw=HH*0.35;
  for(let i=0;i<Math.round(WW*HH/14000);i++){ const t=R(), o=(R()-0.5)*bw*0.7; const x=t*WW*1.2-WW*0.1, y=HH*0.5+(x-WW/2)*Math.tan(a)+o; const s=1+R()*3;
   g.strokeStyle=P.motif; g.beginPath(); g.moveTo(x,y-s); g.lineTo(x+s,y); g.lineTo(x,y+s); g.lineTo(x-s,y); g.closePath(); g.stroke(); } }
 else if(m==='relays'){ // dead relays of the Ash, as small crossed marks
  for(let i=0;i<Math.round(WW*HH/60000);i++){ const x=R()*WW, y=R()*HH; g.strokeStyle=P.motif; g.beginPath(); g.moveTo(x-6,y); g.lineTo(x+6,y); g.moveTo(x,y-6); g.lineTo(x,y+6); g.moveTo(x-3,y-3); g.lineTo(x+3,y+3); g.stroke(); } }
 else if(m==='shards'){ // vault shards, drifting
  for(let i=0;i<Math.round(WW*HH/26000);i++){ const x=R()*WW, y=R()*HH, a=R()*6.283, l=6+R()*18; g.strokeStyle=P.motif; g.beginPath(); g.moveTo(x,y); g.lineTo(x+Math.cos(a)*l,y+Math.sin(a)*l); g.stroke(); } }
}
// Wreckage: hull fill, hairline outline, the lit edge in bare metal, and
// hatching on the side facing away from the sector's star.
function shapePath(g,o){
 g.beginPath();
 if(o.kind==='rect') g.rect(o.x,o.y,o.w,o.h);
 else if(o.kind==='poly'){ o.pts.forEach((p,i)=>{ if(i) g.lineTo(o.x+p[0],o.y+p[1]); else g.moveTo(o.x+p[0],o.y+p[1]); }); g.closePath(); }
 else g.arc(o.x,o.y,o.r,0,6.283);
}
function engrave(g,o,Lx,Ly,P){
 const cx=o.kind==='rect'?o.x+o.w/2:o.x, cy=o.kind==='rect'?o.y+o.h/2:o.y;
 const rad=o.kind==='rect'?Math.hypot(o.w,o.h)/2:o.r;
 shapePath(g,o); g.fillStyle=P.hull; g.fill();
 // hatching, clipped to the shadowed half
 g.save(); shapePath(g,o); g.clip();
 g.translate(cx,cy); g.rotate(Math.atan2(Ly,Lx)); g.beginPath(); g.rect(-rad*0.15,-rad-4,rad*2+8,rad*2+8); g.clip();
 g.rotate(0.7); g.strokeStyle=P.faint; g.lineWidth=1; g.beginPath();
 for(let d=-rad*1.6;d<rad*1.6;d+=4){ g.moveTo(d,-rad*1.6); g.lineTo(d,rad*1.6); }
 g.stroke(); g.restore();
 // inner detail: seams, tank rings and facet lines read as built things
 g.strokeStyle=P.faint; g.lineWidth=1;
 if(o.kind==='rect'){ if(o.w>60&&o.h>14){ g.beginPath(); g.moveTo(o.x+5,o.y+o.h*0.5); g.lineTo(o.x+o.w-5,o.y+o.h*0.5); g.stroke(); } }
 else if(o.kind==='poly'){ g.beginPath(); for(const p of o.pts){ g.moveTo(o.x,o.y); g.lineTo(o.x+p[0]*0.8,o.y+p[1]*0.8); } g.stroke(); }
 else { g.beginPath(); g.arc(o.x,o.y,o.r*0.62,0,6.283); g.stroke(); }
 // outline, then the lit edges brighter
 shapePath(g,o); g.strokeStyle=P.dim; g.lineWidth=1.25; g.stroke();
 g.strokeStyle=P.metal; g.lineWidth=1.5; g.beginPath();
 if(o.kind==='circle'||(!o.kind||(o.kind!=='rect'&&o.kind!=='poly'))){ const a=Math.atan2(-Ly,-Lx); g.arc(o.x,o.y,o.r,a-1.1,a+1.1); }
 else { const pts=o.kind==='rect'?[[o.x,o.y],[o.x+o.w,o.y],[o.x+o.w,o.y+o.h],[o.x,o.y+o.h]]:o.pts.map(p=>[o.x+p[0],o.y+p[1]]);
  for(let i=0;i<pts.length;i++){ const a=pts[i], b=pts[(i+1)%pts.length];
   const ex=b[0]-a[0], ey=b[1]-a[1], L=Math.hypot(ex,ey)||1; let nx=ey/L, ny=-ex/L;
   const mx=(a[0]+b[0])/2-cx, my=(a[1]+b[1])/2-cy; if(nx*mx+ny*my<0){ nx=-nx; ny=-ny; }
   if(-(nx*Lx+ny*Ly)>0.25){ g.moveTo(a[0],a[1]); g.lineTo(b[0],b[1]); } } }
 g.stroke();
}

// ---------- frame ----------
function render(){
 if(!fontsReady){ ctx.fillStyle=K.ground; ctx.fillRect(0,0,W,H); return; }
 // Re-assert the device transform every frame: canvas resizes reset context
 // state, and this keeps all draw code in logical 960x640 units.
 try{ ctx.setTransform(devicePx,0,0,devicePx,0,0); }catch(e){}
 ctx.save();
 if(shake>0&&settings.shake) ctx.translate((Math.random()-0.5)*shake,(Math.random()-0.5)*shake);
 const th=arena?arena.theme:THEMES[0];
 ctx.fillStyle=(th.pal&&th.pal.ground)||K.ground; ctx.fillRect(-20,-20,W+40,H+40);
 if(state==='title'){ ctx.restore(); drawTitle(); return; }
 if(state==='galaxy'){ ctx.restore(); drawGalaxy(); return; }
 if(state==='settings'){ ctx.restore(); drawWorldMini(th); drawSettings(); return; }
 if(state==='help'){ ctx.restore(); drawWorldMini(th); drawHelp(); return; }
 if(state==='codex'){ ctx.restore(); drawWorldMini(th); drawCodexScreen(); return; }
 drawFarStars(cam.x*0.35,cam.y*0.35);
 ctx.save(); ctx.beginPath(); ctx.rect(0,HUD_H,W,H-HUD_H); ctx.clip();
 ctx.translate(-cam.x,-cam.y);
 const wl=worldLayer(); if(wl) ctx.drawImage(wl,0,0,WW,HH); else if(arena) paintWorld(ctx,th);
 drawPulsarFix();
 drawWorld(th);
 drawFx();
 ctx.restore();
 ctx.restore();
 drawHUD();
 drawExitGuide();
 drawBossGuide();
 if(state==='levelup') drawLevelUp();
 if(state==='paused') drawPaused();
 if(state==='gameover') drawEnd();
 if(bossWarnT>0&&state==='playing'&&hostiles()>0){
  const t=bossWarnTxt||'BOSS';
  line(W/2-240,PY0+50,W/2+240,PY0+50,K.red,1); line(W/2-240,PY0+84,W/2+240,PY0+84,K.red,1);
  heading(t,W/2,PY0+75,20,K.red,'center');
  ctx.textAlign='center'; bossWarnSub.forEach((l,i)=>inkText(l,W/2,PY0+106+i*16,K.text,fM(12,600)));
 }
}
// Entering a sector, KRIEFNE takes a pulsar fix: lines from the rim converge on
// the ship, then fade. Skipped entirely under reduced motion.
function drawPulsarFix(){
 if(REDUCED||!player) return;
 const t=(performance.now()-enterT)/900; if(t<0||t>1) return;
 const a=1-t;
 ctx.save(); ctx.globalAlpha=a*0.8;
 for(let k=0;k<12;k++){ const ang=k*0.5236+0.26, far=900;
  const sx=clamp(player.x+Math.cos(ang)*far,PX0,PX1), sy=clamp(player.y+Math.sin(ang)*far,PY0,PY1);
  const f=Math.min(1,t*2.2);
  tickedLine(sx,sy,sx+(player.x-sx)*f,sy+(player.y-sy)*f,K.goldDim,1,26,3); }
 ctx.restore();
}
function drawWorldMini(th){ // the sector behind a menu, dimmed to a whisper
 ctx.save(); ctx.translate(-cam.x,-cam.y); ctx.globalAlpha=0.3;
 const wl=worldLayer(); if(wl) ctx.drawImage(wl,0,0,WW,HH);
 ctx.globalAlpha=1; ctx.restore();
 ctx.fillStyle=K.veil; ctx.fillRect(0,0,W,H);
}
function drawWorld(th){
 const now=performance.now()/1000;
 // EXIT: KRIEFNE's own departure-vector beacon, so it is gold
 if(portal){
  const r=portal.r;
  ctx.save(); ctx.translate(portal.x,portal.y);
  ctx.strokeStyle=K.gold; ctx.lineWidth=2; ctx.beginPath(); ctx.arc(0,0,r,0,6.283); ctx.stroke();
  ctx.lineWidth=1; ctx.beginPath(); for(let k=0;k<24;k++){ const a=k*0.2618, t=k%6===0?9:4; ctx.moveTo(Math.cos(a)*(r+2),Math.sin(a)*(r+2)); ctx.lineTo(Math.cos(a)*(r+2+t),Math.sin(a)*(r+2+t)); } ctx.stroke();
  const spin=REDUCED?0:portal.t*1.6;
  ctx.strokeStyle=K.goldDim; ctx.beginPath(); ctx.arc(0,0,r-7,spin,spin+4.2); ctx.stroke();
  // the vector: a ruled line out of the ring with a chevron
  tickedLine(0,-r-14,0,-r-120,K.goldDim,1,18,3);
  ctx.strokeStyle=K.gold; ctx.lineWidth=1.5; ctx.beginPath(); ctx.moveTo(-7,-r-112); ctx.lineTo(0,-r-124); ctx.lineTo(7,-r-112); ctx.stroke();
  ctx.restore();
  ctx.textAlign='center'; inkText('EXIT [E]',portal.x,portal.y+r+26,K.gold,fD(10));
 }
 const rc=player&&player.recall;
 if(rc&&state!=='gameover'){
  const inR=Math.hypot(player.x-rc.x,player.y-rc.y)<=player.gateRange;
  line(player.x,player.y,rc.x,rc.y,inR?K.goldDim:K.metalDim,1,[6,6]);
  ctx.save(); ctx.translate(rc.x,rc.y);
  diamond(0,0,11,player.recallCd>0?K.goldDim:K.gold,true); diamond(0,0,6,player.recallCd>0?K.goldDim:K.gold,true);
  ctx.restore();
  ctx.textAlign='center'; inkText(player.recallCd>0?('RECALL '+player.recallCd.toFixed(0)+'s'):'RECALL [E]',rc.x,rc.y-20,player.recallCd>0?K.textDim:K.gold,fM(11,600));
 }
 if(player&&player.channel&&state==='playing'){ const f=clamp(player.channel.t/player.channelMax,0,1);
  ctx.strokeStyle=K.gold; ctx.lineWidth=1.5; ctx.beginPath(); ctx.arc(player.x,player.y,14,-1.5708,-1.5708+f*6.283); ctx.stroke();
  ctx.strokeStyle=K.goldDim; ctx.lineWidth=1; ctx.beginPath(); ctx.arc(player.x,player.y,14+26*f,0,6.283); ctx.stroke();
  ctx.textAlign='center'; inkText('BLINK',player.x,player.y-26,K.gold,fM(11,600)); }
 // salvage: the record's hydrogen mark, two linked circles, so no drone's lone ring can pass for it
 for(const g of gems){ const bob=REDUCED?0:Math.sin(g.t*5)*1.5;
  const gy=g.y+bob; ctx.strokeStyle=K.hydro; ctx.lineWidth=1.25;
  ctx.beginPath(); ctx.arc(g.x-4,gy,2.6,0,6.283); ctx.moveTo(g.x+6.6,gy); ctx.arc(g.x+4,gy,2.6,0,6.283); ctx.moveTo(g.x-1.4,gy); ctx.lineTo(g.x+1.4,gy); ctx.stroke();
  ctx.fillStyle=K.hydro; ctx.fillRect(g.x-4.8,gy-0.8,1.6,1.6); }
 // shock rings: hostile waves are red and double-ruled (HEAVY); our own are gold hairlines
 for(const gr of rings){ const a=clamp(1.3-gr.r/gr.maxR,0,1);
  ctx.save(); ctx.globalAlpha=a;
  if(gr.dmg>0){ ctx.strokeStyle=K.red; ctx.lineWidth=2; ctx.beginPath(); ctx.arc(gr.x,gr.y,gr.r,0,6.283); ctx.stroke(); ctx.lineWidth=1; ctx.beginPath(); ctx.arc(gr.x,gr.y,Math.max(1,gr.r-6),0,6.283); ctx.stroke(); }
  else { ctx.strokeStyle=gr.own?K.gold:K.redDim; ctx.lineWidth=1; ctx.beginPath(); ctx.arc(gr.x,gr.y,gr.r,0,6.283); ctx.stroke(); }
  ctx.restore(); }
 // orbital strikes (ours): a closing reticle
 for(const s of strikes){ const f=clamp(s.t/s.warn,0,1);
  ctx.strokeStyle=K.goldDim; ctx.lineWidth=1; ctx.beginPath(); ctx.arc(s.x,s.y,s.r,0,6.283); ctx.stroke();
  ctx.strokeStyle=K.gold; ctx.lineWidth=1.5; ctx.beginPath(); ctx.arc(s.x,s.y,s.r*(1-f)+6,0,6.283); ctx.stroke();
  ctx.lineWidth=1; ctx.beginPath(); for(let k=0;k<4;k++){ const a=k*1.5708; ctx.moveTo(s.x+Math.cos(a)*(s.r-8),s.y+Math.sin(a)*(s.r-8)); ctx.lineTo(s.x+Math.cos(a)*(s.r+8),s.y+Math.sin(a)*(s.r+8)); } ctx.stroke(); }
 // prism lance (ours): a ruled beam, no gradient
 for(const b2 of beams){ const f=clamp(1-b2.t/b2.life,0,1);
  ctx.save(); ctx.translate(b2.x,b2.y); ctx.rotate(b2.a); ctx.globalAlpha=f;
  const w=Math.max(1,b2.w*f);
  line(0,-w,b2.len,-w,K.gold,1); line(0,w,b2.len,w,K.gold,1); line(0,0,b2.len,0,K.goldHi,2);
  ctx.restore(); }
 // hostile ground: red circle, hatched inside; dashed while arming
 for(const h of hazards){
  const arming=h.t<(h.warn||0), fade=clamp(1-(h.t/h.life),0,1);
  ctx.save(); ctx.globalAlpha=arming?0.9:(0.5*fade+0.3);
  ctx.beginPath(); ctx.arc(h.x,h.y,h.r,0,6.283); ctx.save(); ctx.clip();
  ctx.strokeStyle=K.redDim; ctx.lineWidth=1; ctx.beginPath(); for(let d=-h.r;d<h.r;d+=(h.jam?5:7)){ ctx.moveTo(h.x+d,h.y-h.r); ctx.lineTo(h.x+d+h.r,h.y+h.r); } ctx.stroke(); ctx.restore();
  ctx.strokeStyle=K.red; ctx.lineWidth=1.5; if(arming) ctx.setLineDash([7,6]);
  ctx.beginPath(); ctx.arc(h.x,h.y,h.r,0,6.283); ctx.stroke(); ctx.setLineDash([]);
  if(h.jam){ ctx.textAlign='center'; inkText('JAM',h.x,h.y+4,K.red,fD(10)); }
  ctx.restore(); }
 // LEVIATHAN body behind the heads
 for(const e of enemies){
  if(e.type!=='boss'||!e.segs||!e.segs.length) continue;
  const P=pigOf(e); ctx.save(); ctx.globalAlpha=e.phased?0.3:1;
  for(let k=e.segs.length-1;k>=0;k--){ const g=e.segs[k];
   ctx.fillStyle=P.body; ctx.strokeStyle=e.hp<e.maxhp*0.3?P.hi:P.c; ctx.lineWidth=1.5;
   ctx.beginPath(); ctx.arc(g.x,g.y,g.r,0,6.283); ctx.fill(); ctx.stroke();
   ctx.strokeStyle=P.dim; ctx.lineWidth=1; ctx.beginPath(); ctx.arc(g.x,g.y,g.r*0.55,0,6.283); ctx.stroke(); }
  ctx.restore(); }
 // enemy fire: a solid red round with a hot core; HEAVY rounds carry a second ring
 for(const b of ebullets){ ctx.fillStyle=K.red; ctx.beginPath(); ctx.arc(b.x,b.y,b.r,0,6.283); ctx.fill();
  ctx.fillStyle=K.redHi; ctx.beginPath(); ctx.arc(b.x,b.y,Math.max(1,b.r*0.45),0,6.283); ctx.fill();
  if(b.heavy){ ctx.strokeStyle=K.redHi; ctx.lineWidth=1; ctx.beginPath(); ctx.arc(b.x,b.y,b.r+3,0,6.283); ctx.stroke(); } }
 // sniper and tempest aim: a ruled red line, ticked like an engraved measure
 for(const e of enemies){ if((e.type==='sniper'||e.type==='tempest')&&e.aimT>0&&player){ ctx.save(); ctx.globalAlpha=0.8; tickedLine(e.x,e.y,player.x,player.y,K.red,1,24,3); ctx.restore(); } }
 for(const e of enemies) drawEnemy(e);
 // our rounds: gold tracers. Crits burn brighter and longer; ricochet rounds are hollow.
 for(const b of bullets){ const col=b.crit?K.goldHi:K.gold;
  if(b.px!==undefined){ ctx.save(); ctx.globalAlpha=b.crit?0.8:0.5; line(b.px,b.py,b.x,b.y,col,Math.max(1,b.r*(b.crit?1.1:0.8))); ctx.restore(); }
  ctx.beginPath(); ctx.arc(b.x,b.y,b.r,0,6.283);
  if(b.bounce>0){ ctx.strokeStyle=col; ctx.lineWidth=1.25; ctx.stroke(); } else { ctx.fillStyle=col; ctx.fill(); }
  if(b.burn){ ctx.fillStyle=K.ground; ctx.fillRect(b.x-0.8,b.y-0.8,1.6,1.6); }
  if(b.chill){ ctx.strokeStyle=K.metal; ctx.lineWidth=1; ctx.beginPath(); ctx.arc(b.x,b.y,b.r+1.5,0,6.283); ctx.stroke(); } }
 if(player&&state!=='gameover') drawShip();
 if(player&&player.orbs>0&&state!=='gameover'){ for(let k=0;k<player.orbs;k++){ const a=player.orbAng+k*6.283/player.orbs; const ox=player.x+Math.cos(a)*34, oy=player.y+Math.sin(a)*34;
  ctx.save(); ctx.translate(ox,oy); ctx.rotate(a*3+k*2.1);
  ctx.fillStyle=K.gold; ctx.beginPath(); ctx.moveTo(7,0); ctx.lineTo(2,-2); ctx.lineTo(-6,-1.5); ctx.lineTo(-6,1.5); ctx.lineTo(2,2); ctx.closePath(); ctx.fill();
  line(-5,0,5,0,K.ground,1);
  ctx.restore(); } }
}
// KRIEFNE: the one warm thing in the universe. A gold hull with engraved detail.
function drawShip(){
 const p=player;
 const blink=p.invuln>0&&(REDUCED||Math.floor(performance.now()/80)%2===0);
 const now=performance.now();
 ctx.save(); ctx.translate(p.x,p.y);
 if(p.dashT>0){ ctx.strokeStyle=K.goldDim; ctx.lineWidth=1; ctx.beginPath(); ctx.arc(0,0,p.r+7,0,6.283); ctx.stroke(); }
 // shield layers, outermost first — all ours, all gold, told apart by line
 if(p.barrier>0){ ctx.strokeStyle=K.gold; ctx.lineWidth=1; ctx.beginPath(); ctx.arc(0,0,p.r+10,0,6.283); ctx.stroke(); ctx.strokeStyle=K.goldDim; ctx.beginPath(); ctx.arc(0,0,p.r+12,0,6.283); ctx.stroke(); }
 if(p.bulwark>0){ ctx.strokeStyle=K.gold; ctx.lineWidth=1.5; ctx.setLineDash([5,4]); ctx.beginPath(); ctx.arc(0,0,p.r+7,0,6.283); ctx.stroke(); ctx.setLineDash([]); }
 if(p.mirrorUp){ rankRings(0,0,p.r+4.5,2,K.goldHi,1); }
 if(p.wardUp){ ctx.strokeStyle=K.gold; ctx.lineWidth=1.25; ctx.beginPath(); ctx.arc(0,0,p.r+4,0,6.283); ctx.stroke(); }
 if(p.shieldReady){ ctx.strokeStyle=K.gold; ctx.lineWidth=1; ctx.beginPath(); for(let k=0;k<12;k++){ const a=k*0.5236+(REDUCED?0:now/900); ctx.moveTo(Math.cos(a)*(p.r+5),Math.sin(a)*(p.r+5)); ctx.lineTo(Math.cos(a)*(p.r+9),Math.sin(a)*(p.r+9)); } ctx.stroke(); }
 ctx.rotate(p.face);
 if(blink) ctx.globalAlpha=0.45;
 // engines: two short gold cuts that flicker
 const f1=REDUCED?6:4+Math.random()*4, f2=REDUCED?6:4+Math.random()*4;
 line(-11,-4.5,-11-f1,-4.5,K.goldDim,2); line(-11,4.5,-11-f2,4.5,K.goldDim,2);
 // swept hull, solid gold, engraved in ground-colour lines
 ctx.fillStyle=p.flash>0?K.goldHi:K.gold;
 ctx.beginPath(); ctx.moveTo(16,0); ctx.lineTo(2,-4); ctx.lineTo(-11,-11); ctx.lineTo(-8,-3); ctx.lineTo(-8,3); ctx.lineTo(-11,11); ctx.lineTo(2,4); ctx.closePath(); ctx.fill();
 ctx.strokeStyle=K.ground; ctx.lineWidth=1; ctx.beginPath(); ctx.moveTo(-7,0); ctx.lineTo(10,0); ctx.moveTo(1,-3.2); ctx.lineTo(-9,-9.5); ctx.moveTo(1,3.2); ctx.lineTo(-9,9.5); ctx.stroke();
 ctx.beginPath(); ctx.ellipse(5,0,3.4,2,0,0,6.283); ctx.stroke();
 // barrels, one per shot (capped at 5), fanned
 const nb=Math.min(Math.max(1,p.shots),5);
 for(let i=0;i<nb;i++){ const yo=(i-(nb-1)/2)*3.4; line(10,yo,17,yo,K.gold,1.6); }
 ctx.restore();
 if(p.surgeT>0){ ctx.strokeStyle=K.goldDim; ctx.lineWidth=1; ctx.setLineDash([2,3]); ctx.beginPath(); ctx.arc(p.x,p.y,p.r+14,0,6.283); ctx.stroke(); ctx.setLineDash([]); }
}
// ---------- the gods ----------
// Silhouette and pigment carry identity; rings carry rank; red is kept for
// the blows. Enraged, the pigment runs hot and the outer rank ring is ticked.
function drawBossShape(e,enrage,flash){
 const def=e.def||BOSSDEF.overlord, R=e.r, P=pigOf(e);
 const col=enrage?P.hi:P.c, body=flash?P.flash:P.body, dim=P.dim;
 const lw=enrage?2:1.5;
 switch(def.shape){
  case 'hex': // WARDEN — dashed siege collar, heavy hex core
   ctx.save(); ctx.rotate(e.t*0.4); ctx.strokeStyle=dim; ctx.lineWidth=3; ctx.setLineDash([14,8]); ctx.beginPath(); ctx.arc(0,0,R+4,0,6.283); ctx.stroke(); ctx.setLineDash([]); ctx.restore();
   ctx.fillStyle=body; ctx.strokeStyle=col; ctx.lineWidth=lw; poly(6,R-4,e.t*0.25); ctx.fill(); ctx.stroke();
   ctx.strokeStyle=dim; poly(6,R*0.55,e.t*0.25); ctx.stroke();
   ctx.fillStyle=col; ctx.beginPath(); ctx.arc(0,0,4,0,6.283); ctx.fill();
   break;
  case 'diamond': // PHANTOM — ghosted diamond inside a counter-spinning frame
   ctx.save(); ctx.rotate(e.t*1.2+Math.PI/4); ctx.strokeStyle=dim; ctx.lineWidth=1; ctx.strokeRect(-R*0.62,-R*0.62,R*1.24,R*1.24); ctx.restore();
   ctx.fillStyle=body; ctx.strokeStyle=col; ctx.lineWidth=lw; poly(4,R-6,-e.t*1.2); ctx.fill(); ctx.stroke();
   ctx.strokeStyle=dim; poly(4,R*0.4,-e.t*1.2); ctx.stroke();
   ctx.fillStyle=col; ctx.beginPath(); ctx.arc(0,0,3,0,6.283); ctx.fill();
   break;
  case 'serpent': // LEVIATHAN — armoured head with mandibles
   ctx.save(); ctx.rotate(Math.atan2(player?player.y-e.y:0,player?player.x-e.x:1));
   ctx.fillStyle=body; ctx.strokeStyle=col; ctx.lineWidth=lw;
   ctx.beginPath(); ctx.moveTo(R,0); ctx.lineTo(R*0.2,-R*0.78); ctx.lineTo(-R*0.8,-R*0.5); ctx.lineTo(-R*0.8,R*0.5); ctx.lineTo(R*0.2,R*0.78); ctx.closePath(); ctx.fill(); ctx.stroke();
   ctx.lineWidth=3; ctx.lineCap='round'; ctx.beginPath(); ctx.moveTo(R*0.55,-R*0.4); ctx.lineTo(R*1.25,-R*0.72); ctx.moveTo(R*0.55,R*0.4); ctx.lineTo(R*1.25,R*0.72); ctx.stroke(); ctx.lineCap='butt';
   ctx.strokeStyle=dim; ctx.lineWidth=1; ctx.beginPath(); for(let k=1;k<4;k++){ const x=R*0.2-k*R*0.25; ctx.moveTo(x,-R*0.6); ctx.lineTo(x,R*0.6); } ctx.stroke();
   ctx.fillStyle=col; ctx.beginPath(); ctx.arc(R*0.1,-R*0.26,3,0,6.283); ctx.arc(R*0.1,R*0.26,3,0,6.283); ctx.fill();
   ctx.restore();
   break;
  case 'eye': // ORACLE — lidded eye, pupil tracks you
   ctx.fillStyle=body; ctx.strokeStyle=col; ctx.lineWidth=lw;
   ctx.beginPath(); ctx.ellipse(0,0,R,R*0.66,0,0,6.283); ctx.fill(); ctx.stroke();
   { const a=Math.atan2(player?player.y-e.y:0,player?player.x-e.x:1);
     ctx.strokeStyle=col; ctx.beginPath(); ctx.arc(Math.cos(a)*R*0.34,Math.sin(a)*R*0.22,R*0.30,0,6.283); ctx.stroke();
     ctx.fillStyle=col; ctx.beginPath(); ctx.arc(Math.cos(a)*R*0.34,Math.sin(a)*R*0.22,R*0.12,0,6.283); ctx.fill(); }
   ctx.strokeStyle=dim; ctx.lineWidth=1;
   ctx.beginPath(); ctx.moveTo(-R,0); ctx.quadraticCurveTo(0,-R*0.95,R,0); ctx.stroke();
   ctx.beginPath(); ctx.moveTo(-R,0); ctx.quadraticCurveTo(0,R*0.95,R,0); ctx.stroke();
   break;
  case 'star': // HARBINGER — eight-point burst, inner ring counter-rotating
   ctx.fillStyle=body; ctx.strokeStyle=col; ctx.lineWidth=lw;
   ctx.beginPath();
   for(let k=0;k<16;k++){ const a=e.t*0.7+k*0.3927, rr=(k%2?R*0.48:R); const x=Math.cos(a)*rr, y=Math.sin(a)*rr; if(k) ctx.lineTo(x,y); else ctx.moveTo(x,y); }
   ctx.closePath(); ctx.fill(); ctx.stroke();
   ctx.strokeStyle=dim; ctx.lineWidth=1; ctx.save(); ctx.rotate(-e.t*1.4); poly(3,R*0.42,0); ctx.stroke(); ctx.restore();
   ctx.fillStyle=col; ctx.beginPath(); ctx.arc(0,0,3.5,0,6.283); ctx.fill();
   break;
  case 'coil': // BASILISK — coiled plates with a slit gaze
   for(let k=3;k>=1;k--){ ctx.strokeStyle=k===3?col:dim; ctx.lineWidth=1;
    ctx.beginPath(); ctx.arc(0,0,R*(0.42+k*0.2),e.t*0.6+k,e.t*0.6+k+4.2); ctx.stroke(); }
   ctx.fillStyle=body; ctx.strokeStyle=col; ctx.lineWidth=lw; poly(5,R*0.6,e.t*0.3); ctx.fill(); ctx.stroke();
   { const a=Math.atan2(player?player.y-e.y:0,player?player.x-e.x:1);
     ctx.save(); ctx.rotate(a); ctx.fillStyle=col;
     ctx.beginPath(); ctx.ellipse(R*0.22,0,R*0.26,2.6,0,0,6.283); ctx.fill(); ctx.restore(); }
   break;
  case 'ram': // JUGGERNAUT — armoured prow one end, the vent the other
   ctx.save(); ctx.rotate(e.facing||0);
   ctx.fillStyle=body; ctx.strokeStyle=col; ctx.lineWidth=lw;
   ctx.beginPath(); ctx.moveTo(R,0); ctx.lineTo(R*0.3,-R*0.8); ctx.lineTo(-R*0.85,-R*0.62); ctx.lineTo(-R*0.85,R*0.62); ctx.lineTo(R*0.3,R*0.8); ctx.closePath(); ctx.fill(); ctx.stroke();
   // the prow plate: bare metal, hatched — it shrugs off rounds
   ctx.fillStyle=K.lift; ctx.strokeStyle=K.metal; ctx.lineWidth=1.25;
   ctx.beginPath(); ctx.moveTo(R*0.98,0); ctx.lineTo(R*0.34,-R*0.66); ctx.lineTo(R*0.34,R*0.66); ctx.closePath(); ctx.fill(); ctx.stroke();
   ctx.strokeStyle=K.metalDim; ctx.lineWidth=1; ctx.beginPath(); for(let k=1;k<5;k++){ const x=R*0.34+k*R*0.13; ctx.moveTo(x,-R*0.66*(1-(x-R*0.34)/(R*0.64))); ctx.lineTo(x,R*0.66*(1-(x-R*0.34)/(R*0.64))); } ctx.stroke();
   // the rear vent: the weak point, hot and open
   ctx.fillStyle=col; ctx.fillRect(-R*0.92,-R*0.34,R*0.22,R*0.68);
   ctx.strokeStyle=K.ground; ctx.lineWidth=1; ctx.beginPath(); for(let k=1;k<4;k++){ const y=-R*0.34+k*R*0.17; ctx.moveTo(-R*0.92,y); ctx.lineTo(-R*0.7,y); } ctx.stroke();
   ctx.restore();
   break;
  case 'prism': // NULLIFIER — split prism halves with a null core
   ctx.save(); ctx.rotate(e.t*0.5);
   ctx.fillStyle=body; ctx.strokeStyle=col; ctx.lineWidth=lw;
   ctx.beginPath(); ctx.moveTo(0,-R); ctx.lineTo(R*0.86,R*0.5); ctx.lineTo(-R*0.86,R*0.5); ctx.closePath(); ctx.fill(); ctx.stroke();
   ctx.strokeStyle=dim; ctx.beginPath(); ctx.moveTo(0,R); ctx.lineTo(R*0.86,-R*0.5); ctx.lineTo(-R*0.86,-R*0.5); ctx.closePath(); ctx.stroke();
   ctx.restore();
   ctx.fillStyle=K.ground; ctx.beginPath(); ctx.arc(0,0,R*0.26,0,6.283); ctx.fill();
   ctx.strokeStyle=col; ctx.lineWidth=1.5; ctx.stroke();
   break;
  case 'triad': // CHORUS — three fused lobes around a shared core
   for(let k=0;k<3;k++){ const a=e.t*0.8+k*2.094;
    ctx.fillStyle=body; ctx.strokeStyle=col; ctx.lineWidth=lw;
    ctx.beginPath(); ctx.arc(Math.cos(a)*R*0.42,Math.sin(a)*R*0.42,R*0.52,0,6.283); ctx.fill(); ctx.stroke(); }
   ctx.strokeStyle=dim; ctx.lineWidth=1; for(let k=0;k<3;k++){ const a=e.t*0.8+k*2.094; ctx.beginPath(); ctx.arc(Math.cos(a)*R*0.42,Math.sin(a)*R*0.42,R*0.28,0,6.283); ctx.stroke(); }
   ctx.fillStyle=col; ctx.beginPath(); ctx.arc(0,0,R*0.14,0,6.283); ctx.fill();
   break;
  case 'crown': // ARCHON — command crown with rank spikes
   ctx.save(); ctx.rotate(e.t*0.3); ctx.strokeStyle=dim; ctx.lineWidth=2; ctx.setLineDash([10,7]); ctx.beginPath(); ctx.arc(0,0,R+6,0,6.283); ctx.stroke(); ctx.setLineDash([]); ctx.restore();
   ctx.fillStyle=body; ctx.strokeStyle=col; ctx.lineWidth=lw; poly(7,R-5,e.t*0.2); ctx.fill(); ctx.stroke();
   ctx.fillStyle=col;
   for(let k=0;k<5;k++){ const a=-1.5708+(k-2)*0.42;
    ctx.beginPath(); ctx.moveTo(Math.cos(a)*R*0.66,Math.sin(a)*R*0.66); ctx.lineTo(Math.cos(a-0.09)*R*1.16,Math.sin(a-0.09)*R*1.16); ctx.lineTo(Math.cos(a+0.09)*R*1.16,Math.sin(a+0.09)*R*1.16); ctx.closePath(); ctx.fill(); }
   ctx.strokeStyle=col; ctx.lineWidth=1; ctx.beginPath(); ctx.arc(0,0,R*0.3,0,6.283); ctx.stroke();
   break;
  case 'well': // SINGULARITY — the One-Eyed: accretion rings around a void
   for(let k=0;k<3;k++){ ctx.save(); ctx.rotate(e.t*(0.5+k*0.4));
    ctx.strokeStyle=k===0?col:dim; ctx.lineWidth=k===0?1.5:1;
    ctx.beginPath(); ctx.ellipse(0,0,R*(1.14-k*0.22),R*(0.42-k*0.09),k*0.9,0,6.283); ctx.stroke(); ctx.restore(); }
   ctx.fillStyle=K.ground; ctx.beginPath(); ctx.arc(0,0,R*0.52,0,6.283); ctx.fill();
   ctx.strokeStyle=col; ctx.lineWidth=lw; ctx.stroke();
   ctx.fillStyle=flash?P.hi:col; ctx.beginPath(); ctx.arc(0,0,R*0.12,0,6.283); ctx.fill();
   break;
  default: // OVERLORD — the Berserk: dashed ring, eight-sided core
   ctx.save(); ctx.rotate(e.t*0.6); ctx.strokeStyle=dim; ctx.lineWidth=3; ctx.setLineDash([18,10]); ctx.beginPath(); ctx.arc(0,0,R+4,0,6.283); ctx.stroke(); ctx.setLineDash([]); ctx.restore();
   ctx.fillStyle=body; ctx.strokeStyle=col; ctx.lineWidth=lw; poly(8,R-4,-e.t*0.4); ctx.fill(); ctx.stroke();
   ctx.strokeStyle=dim; ctx.lineWidth=1; poly(8,R*0.5,-e.t*0.4); ctx.stroke();
   ctx.fillStyle=col; ctx.beginPath(); ctx.arc(0,0,5,0,6.283); ctx.fill();
   if(enrage){ ctx.fillStyle=col; for(let k=0;k<4;k++){ const a=e.t*3+k*1.57; ctx.beginPath(); ctx.moveTo(Math.cos(a)*(R+2),Math.sin(a)*(R+2)); ctx.lineTo(Math.cos(a+0.2)*(R+12),Math.sin(a+0.2)*(R+12)); ctx.lineTo(Math.cos(a-0.2)*(R+12),Math.sin(a-0.2)*(R+12)); ctx.closePath(); ctx.fill(); } }
   break;
 }
 // rank: concentric rings just outside the silhouette
 const tier=(def.tier||1);
 ctx.save(); ctx.globalAlpha=0.9; rankRings(0,0,R+10,tier,e.lieutenant?P.dim:(enrage?P.hi:P.c),1);
 // enraged: the outer ring is cut with ticks, the way heavy is double-ruled
 if(enrage){ const ro=R+10+(tier-1)*3.5; ctx.strokeStyle=P.hi; ctx.lineWidth=1; ctx.beginPath(); for(let k=0;k<24;k++){ const a=k*0.2618+(REDUCED?0:e.t*0.4); ctx.moveTo(Math.cos(a)*(ro+2),Math.sin(a)*(ro+2)); ctx.lineTo(Math.cos(a)*(ro+(k%2?5:8)),Math.sin(a)*(ro+(k%2?5:8))); } ctx.stroke(); }
 ctx.restore();
 // ORACLE wards ride outside whatever shape carries them
 if(e.wards&&e.wards.length){
  for(const w of e.wards){ const a=w.a+(e.wardA||0);
   ctx.save(); ctx.translate(Math.cos(a)*(R+26),Math.sin(a)*(R+26)); ctx.rotate(a*2);
   ctx.fillStyle=P.body; ctx.strokeStyle=P.c; ctx.lineWidth=1.5; poly(3,10,0); ctx.fill(); ctx.stroke(); ctx.restore(); }
 }
 // signature telegraphs drawn over the body: ruled, ticked, never glowing
 if(e.laser){ tickedLine(0,0,Math.cos(e.laser.ang)*700,Math.sin(e.laser.ang)*700,K.red,1,24,4); }
 if(e.beamT>0){ const x=Math.cos(e.beamA)*700, y=Math.sin(e.beamA)*700, nx=-Math.sin(e.beamA)*4, ny=Math.cos(e.beamA)*4;
  line(nx,ny,x+nx,y+ny,K.red,2); line(-nx,-ny,x-nx,y-ny,K.red,2); line(0,0,x,y,K.redHi,1.5); }
 if(e.gaze){ const a=e.gaze.ang, w=0.45, r=430;
  ctx.save(); ctx.beginPath(); ctx.moveTo(0,0); ctx.arc(0,0,r,a-w,a+w); ctx.closePath(); ctx.clip();
  ctx.strokeStyle=K.redDim; ctx.lineWidth=1; ctx.beginPath(); for(let rr=40;rr<r;rr+=34){ ctx.moveTo(Math.cos(a-w)*rr,Math.sin(a-w)*rr); ctx.arc(0,0,rr,a-w,a+w); } ctx.stroke(); ctx.restore();
  ctx.strokeStyle=K.red; ctx.lineWidth=1.5; ctx.beginPath(); ctx.moveTo(0,0); ctx.arc(0,0,r,a-w,a+w); ctx.closePath(); ctx.stroke(); }
}
// Servitors: hulls engraved in their own pigment, so a mixed wave reads as
// kinds at a glance. The moment one commits to harm (the stalker's salute,
// the sniper's line, the rotor flare, the brute's wind-up) it turns red.
function drawEnemy(e){
 ctx.save(); ctx.translate(e.x,e.y); const pop=e.spawnT>0?(1.45-e.spawnT):1; ctx.scale(e.vscale*pop,e.vscale*pop);
 const P=pigOf(e), flash=e.flash>0, body=flash?P.flash:P.body, col=P.c, dim=P.dim;
 if(e.type==='drone'){ ctx.rotate(e.t*2); ctx.fillStyle=body; ctx.strokeStyle=col; ctx.lineWidth=1.5; ctx.beginPath(); ctx.arc(0,0,e.r,0,6.283); ctx.fill(); ctx.stroke(); ctx.strokeStyle=dim; ctx.lineWidth=1; ctx.beginPath(); ctx.moveTo(-e.r*0.6,0); ctx.lineTo(e.r*0.6,0); ctx.moveTo(0,-e.r*0.6); ctx.lineTo(0,e.r*0.6); ctx.stroke(); ctx.fillStyle=col; ctx.fillRect(-2,-2,4,4); }
 else if(e.type==='stalker'){ ctx.rotate(player?Math.atan2(player.y-e.y,player.x-e.x):0);
  const armed=e.dashState===1;
  ctx.fillStyle=armed?K.red:body; ctx.strokeStyle=armed?K.redHi:col; ctx.lineWidth=1.5; ctx.beginPath(); ctx.moveTo(14,0); ctx.lineTo(-10,-9); ctx.lineTo(-10,9); ctx.closePath(); ctx.fill(); ctx.stroke();
  if(armed){ ctx.strokeStyle=K.redHi; ctx.lineWidth=1; ctx.beginPath(); ctx.arc(0,0,18,0,6.283); ctx.stroke(); ctx.beginPath(); ctx.arc(0,0,21,0,6.283); ctx.stroke(); }
  else { line(-6,0,8,0,dim,1); } }
 else if(e.type==='sniper'){ const aa=player?Math.atan2(player.y-e.y,player.x-e.x):0, hot=e.aimT>0;
  ctx.save(); ctx.rotate(aa); ctx.fillStyle=body; ctx.fillRect(2,-2.5,20,5); ctx.strokeStyle=hot?K.redHi:col; ctx.lineWidth=1.25; ctx.strokeRect(2,-2.5,20,5); ctx.restore();
  ctx.fillStyle=body; ctx.strokeStyle=hot?K.redHi:col; ctx.lineWidth=1.5; poly(6,10,e.t*0.5); ctx.fill(); ctx.stroke();
  ctx.fillStyle=hot?K.redHi:col; ctx.beginPath(); ctx.arc(0,0,2.5,0,6.283); ctx.fill(); }
 else if(e.type==='mite'){ ctx.rotate(e.wob); ctx.fillStyle=body; ctx.strokeStyle=col; ctx.lineWidth=1.25; ctx.beginPath(); ctx.moveTo(9,0); ctx.lineTo(-7,-7); ctx.lineTo(-7,7); ctx.closePath(); ctx.fill(); ctx.stroke(); line(-7,0,-2,0,col,1); }
 else if(e.type==='tempest'){ const hot=e.aimT>0; ctx.save(); ctx.rotate(e.t*1.8); for(let k=0;k<3;k++){ ctx.rotate(2.094); ctx.fillStyle=hot?K.red:body; ctx.strokeStyle=hot?K.redHi:col; ctx.lineWidth=1.25;
   ctx.beginPath(); ctx.moveTo(17,0); ctx.lineTo(8,-3.5); ctx.lineTo(8,3.5); ctx.closePath(); ctx.fill(); ctx.stroke(); } ctx.restore();
  ctx.fillStyle=body; ctx.strokeStyle=hot?K.redHi:col; ctx.lineWidth=1.5; ctx.beginPath(); ctx.arc(0,0,7,0,6.283); ctx.fill(); ctx.stroke();
  ctx.fillStyle=col; ctx.beginPath(); ctx.arc(0,0,2.2,0,6.283); ctx.fill(); }
 else if(e.type==='brute'){ const hot=e.windup>0; ctx.fillStyle=body; ctx.strokeStyle=hot?K.redHi:col; ctx.lineWidth=2; poly(6,e.r,e.t*0.3); ctx.fill(); ctx.stroke();
  ctx.strokeStyle=dim; ctx.lineWidth=1; poly(6,e.r*0.6,e.t*0.3); ctx.stroke();
  ctx.fillStyle=hot?K.redHi:col; ctx.fillRect(-3,-3,6,6);
  // the blast band, previewed as an engraved ring with radius ticks: a ring, not a sphere
  if(hot){ ctx.strokeStyle=K.red; ctx.lineWidth=1.5; ctx.beginPath(); ctx.arc(0,0,110,0,6.283); ctx.stroke();
   ctx.lineWidth=1; ctx.beginPath(); for(let k=0;k<16;k++){ const a=k*0.3927; ctx.moveTo(Math.cos(a)*104,Math.sin(a)*104); ctx.lineTo(Math.cos(a)*116,Math.sin(a)*116); } ctx.stroke(); } }
 else if(e.type==='boss'){ const enrage=e.hp<e.maxhp*0.3;
  if(e.phased){ // transparent on the spot, recovering — break it out by killing minions
   ctx.globalAlpha=0.45; ctx.strokeStyle=col; ctx.lineWidth=1.25; ctx.setLineDash([4,4]); poly(4,e.r-6,-e.t*1.2); ctx.stroke(); ctx.setLineDash([]);
   ctx.globalAlpha=1; ctx.textAlign='center'; inkText('RECOVERING',0,-e.r-12,col,fD(9));
  } else if(e.mode==='warn'){ // re-entry telegraph at the breach point
   ctx.strokeStyle=K.red; ctx.lineWidth=1.5; ctx.setLineDash([6,5]); ctx.beginPath(); ctx.arc(0,0,e.r+8,0,6.283); ctx.stroke(); ctx.setLineDash([]);
   ctx.strokeStyle=K.red; ctx.lineWidth=1.5; ctx.beginPath(); for(let k=0;k<4;k++){ const a=k*1.5708+0.7854; ctx.moveTo(Math.cos(a)*(e.r-2),Math.sin(a)*(e.r-2)); ctx.lineTo(Math.cos(a)*(e.r*0.45),Math.sin(a)*(e.r*0.45)); } ctx.stroke();
   diamond(0,0,4,K.red);
  } else {
   drawBossShape(e,enrage,flash);
  } }
 ctx.restore();
 // Labels sit outside the spawn pop, in screen space, measured from the same
 // radius as the HP bar: rings, then bar, then name, never overlapping.
 // Codex portraits skip the combat furniture — the shape is the subject.
 if(e.type==='boss'&&!codexPreview&&!e.phased&&e.mode!=='warn'){ const enrage=e.hp<e.maxhp*0.3;
  ctx.textAlign='center';
  const tier=(e.def&&e.def.tier)||1, barY=e.y-e.r-10-tier*3.5-(enrage?8:0);
  inkText(e.bname||'BOSS',e.x,barY-10,K.text,fD(10));
  if(enrage) inkText('ENRAGED',e.x,barY-24,P.hi,fD(9));
  inkText(bossLabel(e),e.x,e.y+e.r+tier*3.5+26,enrage?P.hi:P.c,fM(11,600));
  if(e.mode==='retreat') inkText('RETREATING',e.x,e.y+e.r+tier*3.5+42,P.hi,fM(11,600));
 }
 if(e.slowT>0){ ctx.strokeStyle=K.metal; ctx.lineWidth=1; ctx.setLineDash([2,3]); ctx.beginPath(); ctx.arc(e.x,e.y,e.r+4,0,6.283); ctx.stroke(); ctx.setLineDash([]); }
 if(!codexPreview&&(e.type==='brute'||e.type==='boss'||e.hp<e.maxhp)&&e.hp>0){
  const boss=e.type==='boss', w=boss?96:34, y=e.y-e.r-(boss?10+((e.def&&e.def.tier)||1)*3.5+(e.hp<e.maxhp*0.3?8:0):9), f=clamp(e.hp/e.maxhp,0,1);
  line(e.x-w/2,y,e.x+w/2,y,K.metalDim,1); line(e.x-w/2,y,e.x-w/2+w*f,y,P.c,boss?3:2);
  if(boss){ for(let k=1;k<4;k++) line(e.x-w/2+w*k/4,y-3,e.x-w/2+w*k/4,y+3,K.metalDim,1); } }
}
function drawFx(){
 for(let i=0;i<parts.length;i++){ if(!settings.particles&&i%3!==0) continue; const q=parts[i]; ctx.globalAlpha=clamp(q.life/q.maxlife,0,1); ctx.fillStyle=q.col; ctx.fillRect(q.x-q.r/2,q.y-q.r/2,q.r,q.r); }
 ctx.globalAlpha=1; ctx.textAlign='center';
 for(const f of floaters){ ctx.globalAlpha=clamp(f.life/0.9,0,1); inkText(f.txt,f.x,f.y,f.col,fM(12,600)); }
 ctx.globalAlpha=1;
}
// ---------- guidance ----------
function drawExitGuide(){
 if(!portal||state!=='playing'||!player) return;
 const px=player.x-cam.x, py=player.y-cam.y, ex=portal.x-cam.x, ey=portal.y-cam.y;
 const dx=ex-px, dy=ey-py, d=Math.hypot(dx,dy)||1, a=Math.atan2(dy,dx);
 const onscreen=ex>40&&ex<W-40&&ey>HUD_H+40&&ey<H-40;
 if(!onscreen){
  const ax=clamp(px+Math.cos(a)*130,58,W-58), ay=clamp(py+Math.sin(a)*130,HUD_H+58,H-58);
  ctx.strokeStyle=K.goldDim; ctx.lineWidth=1; ctx.beginPath(); ctx.arc(ax,ay,16,0,6.283); ctx.stroke();
  ctx.save(); ctx.translate(ax,ay); ctx.rotate(a);
  ctx.fillStyle=K.gold; ctx.beginPath(); ctx.moveTo(12,0); ctx.lineTo(-5,-7); ctx.lineTo(-5,7); ctx.closePath(); ctx.fill();
  ctx.restore();
  ctx.textAlign='center'; inkText('EXIT '+Math.round(d)+'m',ax,ay+34,K.gold,fM(11,600));
 } else {
  const bob=REDUCED?0:Math.sin(performance.now()/300)*3;
  for(const off of [26,40]){
   ctx.save(); ctx.translate(px+Math.cos(a)*off,py+Math.sin(a)*off+bob); ctx.rotate(a);
   ctx.strokeStyle=off===26?K.gold:K.goldDim; ctx.lineWidth=1.5;
   ctx.beginPath(); ctx.moveTo(-4,-6); ctx.lineTo(6,0); ctx.lineTo(-4,6); ctx.stroke();
   ctx.restore(); }
 }
}
// Boss tracker: a god can never be lost off-screen. In the god's own pigment,
// so in a court each arrow says which god it is before the label does.
function drawBossGuide(){
 if(state!=='playing'||!player) return;
 const px=player.x-cam.x, py=player.y-cam.y;
 for(const e of enemies){
  if(e.type!=='boss') continue;
  const ex=e.x-cam.x, ey=e.y-cam.y;
  if(ex>30&&ex<W-30&&ey>HUD_H+30&&ey<H-30) continue;
  const a=Math.atan2(ey-py,ex-px), d=Math.hypot(e.x-player.x,e.y-player.y);
  const ax=clamp(px+Math.cos(a)*150,66,W-66), ay=clamp(py+Math.sin(a)*150,HUD_H+66,H-66);
  const P=pigOf(e);
  ctx.save(); ctx.translate(ax,ay); ctx.rotate(a);
  ctx.fillStyle=P.body; ctx.strokeStyle=P.c; ctx.lineWidth=1.5;
  ctx.beginPath(); ctx.moveTo(13,0); ctx.lineTo(-6,-9); ctx.lineTo(-6,9); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.restore();
  ctx.textAlign='center'; inkText((e.bname||'BOSS')+' '+Math.round(d)+'m',ax,ay+30,e.mode==='retreat'?P.hi:P.c,fM(11,600));
 }
}
// ---------- HUD: an engraved instrument strip ----------
function drawHUD(){
 if(!player) return;
 const p=player;
 ctx.fillStyle=K.ground; ctx.fillRect(0,0,W,HUD_H);
 line(0,HUD_H-0.5,W,HUD_H-0.5,K.metalDim,1);
 ctx.beginPath(); ctx.strokeStyle=K.metalDim; ctx.lineWidth=1; for(let x=0;x<=W;x+=24){ ctx.moveTo(x+0.5,HUD_H); ctx.lineTo(x+0.5,HUD_H-(x%120===0?7:3)); } ctx.stroke();
 const r1=21, r2=43;
 // hull: the number sits beside the groove, never on it
 const low=p.hp<=p.maxhp*0.3;
 heading('HULL',14,r1,9,K.textDim);
 groove(64,r1-4,150,p.hp/p.maxhp,low?K.red:K.gold,10);
 mono(Math.ceil(p.hp)+'/'+p.maxhp,224,r1,13,low?K.red:K.text,'left',600);
 heading('LV',14,r2,9,K.textDim); mono(String(p.level),36,r2,12,K.gold,'left',600);
 groove(64,r2-4,150,p.xp/p.xpNeed,K.gold,0);
 mono(Math.floor(p.xp)+'/'+p.xpNeed,224,r2,11,K.textDim);
 // dash and recall
 heading('DASH',326,r1,9,K.textDim);
 if(!p.dashUnlocked){ line(374,r1-4,454,r1-4,K.metalDim,1,[3,3]); mono('LOCKED',462,r1,11,K.textDim); }
 else { const ready=p.dashCd<=0; groove(374,r1-4,80,ready?1:1-(p.dashCd/p.dashCdMax),K.gold,4); mono(ready?'READY':p.dashCd.toFixed(1)+'s',462,r1,11,ready?K.gold:K.textDim,'left',600); }
 heading('GATE',326,r2,9,K.textDim);
 if(!p.recallUnlocked) mono('LOCKED',374,r2,11,K.textDim);
 else { binTicks(376,r2+1,p.charges,5,K.gold); mono(p.recall?(p.recallCd>0?Math.ceil(p.recallCd)+'s':'SET'):'—',412,r2,11,p.recall&&p.recallCd<=0?K.gold:K.textDim,'left',600); }
 // discharge charge and auto-fire
 if(p.shockOn){ const f=clamp(p.shockKills/p.shockNeed,0,1);
  heading('CHARGE',528,r1,9,K.textDim); groove(598,r1-4,56,f,f>=1?K.goldHi:K.gold,0); mono(p.shockKills+'/'+p.shockNeed,662,r1,11,f>=1?K.gold:K.textDim); }
 heading('AUTO',528,r2,9,K.textDim); mono((p.autoFire?'ON':'OFF')+' [T]',574,r2,11,p.autoFire?K.gold:K.textDim,'left',600);
 // sector plate label and the tally
 heading(sectorName(arenaIdx)+' · '+(arena?arena.theme.name.toUpperCase():''),W-14,r1,11,K.gold,'right');
 let fieldXp=0; for(const g of gems) fieldXp+=g.v;
 const foes=hostiles();
 let x=W-14; ctx.textAlign='right';
 // Once the foes are gone, the tally becomes the XP still lying on the field:
 // it is lost on exit, so the HUD says how much is left to collect.
 if(foes>0) mono('FOES '+foes,x,r2,12,K.red,'right',600);
 else if(gems.length) mono('XP ON FIELD '+Math.round(fieldXp*p.xpBonus),x,r2,12,K.hydro,'right',600);
  else mono('FIELD CLEAR',x,r2,12,K.textDim,'right',600);
  // shields hang off the instrument's edge as engraved tags
 const tags=[]; if(p.shieldReady) tags.push('AEGIS PULSE'); if(p.wardUp) tags.push('WARDING PLATE'); if(p.bulwark>0) tags.push('BULWARK ×'+p.bulwark); if(p.mirrorUp) tags.push('CRIT WARD'); if(p.barrier>0) tags.push('BARRIER '+Math.ceil(p.barrier)); if(p.stasisN>0) tags.push('STASIS ×'+p.stasisN);
 if(tags.length&&state==='playing'){ ctx.font=fM(11,600); const t=tags.join('  ·  '); let tw=t.length*6.6; try{ tw=ctx.measureText(t).width; }catch(e){}
  ctx.fillStyle=K.ground; ctx.fillRect(10,HUD_H,tw+14,18); line(10,HUD_H+18,tw+24,HUD_H+18,K.goldDim,1); mono(t,16,HUD_H+13,11,K.gold,'left',600); }
 // what is being done to you, centred under the strip, in red
 let by=HUD_H+22;
 if(state==='playing'&&(p.jamT>0||p.rootT>0)){ heading(p.jamT>0?'JAMMED':'PETRIFIED',W/2,by,12,K.red,'center'); by+=22; }
 if(portal&&state==='playing'){ const t=gems.length?'SECTOR CLEAR — COLLECT YOUR XP; ANYTHING LEFT IS LOST AT THE EXIT [E]':'SECTOR CLEAR — ENTER THE EXIT [E]';
  ctx.font=fM(12,600); let tw=t.length*7; try{ tw=ctx.measureText(t).width; }catch(e){}
  ctx.fillStyle=K.ground; ctx.fillRect(W/2-tw/2-16,by-14,tw+32,20);
  mono(t,W/2,by,12,K.gold,'center',600); line(W/2-tw/2-16,by+6,W/2+tw/2+16,by+6,K.goldDim,1); }
 // hull critical: an inset double rule in red around the field
 if(p.hp<=p.maxhp*0.3&&state==='playing'){ const a=REDUCED?0.8:0.55+0.3*Math.sin(performance.now()/180);
  ctx.save(); ctx.globalAlpha=a; ctx.strokeStyle=K.red; ctx.lineWidth=1; ctx.strokeRect(6.5,HUD_H+6.5,W-13,H-HUD_H-13); ctx.strokeRect(10.5,HUD_H+10.5,W-21,H-HUD_H-21); ctx.restore(); }
}
// ---------- title: the record cover ----------
// The engraved disc is static: ~60 groove arcs + the pulsar map. Repainting
// that every title frame is the title screen's whole cost, so it is painted
// once into an offscreen canvas (like worldCache/farStars) and blitted.
// Only the slow sheen sweep stays dynamic.
let recordCache=null;
function paintRecordStatic(g,cx,cy,R){
 g.beginPath(); g.arc(cx,cy,R,0,6.283); g.fillStyle=K.deep; g.fill();
 // grooves in tracks, the way a record is cut
 g.lineWidth=1;
 for(let r=R-8;r>R*0.34;r-=3){ const band=Math.floor((R-r)/38)%2; g.strokeStyle=band?K.goldFaint:K.goldGroove; g.beginPath(); g.arc(cx,cy,r,0,6.283); g.stroke(); }
 g.strokeStyle=K.gold; g.lineWidth=1.5; g.beginPath(); g.arc(cx,cy,R,0,6.283); g.stroke();
 // the label, carrying a pulsar map: lines out from home with binary periods
 const lr=R*0.3; g.strokeStyle=K.gold; g.lineWidth=1; g.beginPath(); g.arc(cx,cy,lr,0,6.283); g.stroke();
 const Rr=mulberry32(1977);
 for(let k=0;k<14;k++){ const a=k*0.4488+Rr()*0.2, l=lr*(0.45+Rr()*0.5);
  g.strokeStyle=K.goldDim; g.beginPath(); g.moveTo(cx,cy); g.lineTo(cx+Math.cos(a)*l,cy+Math.sin(a)*l); g.stroke();
  const nx=-Math.sin(a), ny=Math.cos(a); g.beginPath();
  for(let b=0;b<6;b++){ const d=l*(0.35+b*0.1), t=Rr()<0.5?2:4.5, px=cx+Math.cos(a)*d, py=cy+Math.sin(a)*d; g.moveTo(px-nx*t,py-ny*t); g.lineTo(px+nx*t,py+ny*t); }
  g.stroke(); }
 g.fillStyle=K.ground; g.beginPath(); g.arc(cx,cy,5,0,6.283); g.fill(); g.strokeStyle=K.gold; g.beginPath(); g.arc(cx,cy,5,0,6.283); g.stroke();
}
function recordLayer(R){
 const k=devicePx>0?devicePx:1;
 if(recordCache&&recordCache.R===R&&recordCache.k===k) return recordCache;
 const S=Math.ceil(R*2+8);
 const c=mkCanvas(Math.max(1,Math.round(S*k)),Math.max(1,Math.round(S*k))); if(!c) return null;
 try{
  const g=c.getContext('2d'); try{ g.setTransform(k,0,0,k,0,0); }catch(e){}
  paintRecordStatic(g,S/2,S/2,R);
  recordCache={R,k,c,S}; return recordCache;
 }catch(e){ return null; }
}
function drawRecord(cx,cy,R){
 const now=performance.now()/1000;
 const L=recordLayer(R);
 if(L&&L.c){ ctx.drawImage(L.c,cx-L.S/2,cy-L.S/2,L.S,L.S); }
 else { ctx.save(); paintRecordStatic(ctx,cx,cy,R); ctx.restore(); }
 // a slow sheen line sweeping the grooves
 if(!REDUCED){ const lr=R*0.3, a=now*0.25; ctx.save(); ctx.strokeStyle=K.goldSheen; ctx.lineWidth=1; ctx.beginPath(); ctx.moveTo(cx+Math.cos(a)*lr*1.15,cy+Math.sin(a)*lr*1.15); ctx.lineTo(cx+Math.cos(a)*(R-6),cy+Math.sin(a)*(R-6)); ctx.stroke(); ctx.restore(); }
}
function titleStartRect(){ return readRun()?BTN.titleStart:BTN.titleContinue; }
function drawTitle(){
 ctx.fillStyle=K.ground; ctx.fillRect(0,0,W,H);
 drawFarStars(0,0);
 drawRecord(806,330,300);
 drawWordmark(64,96,60);
 heading('ROGUELITE',66,190,11,K.textDim);
 mono('Restored from backup. Mandate unchanged.',66,210,12,K.textDim);
 line(66,228,470,228,K.metalDim,1);
 const intro=wrapLines('Fight down an endless galaxy trail — clear each sector, draft an upgrade, push on. Every 5th sector is a boss NEST. Boss kills bank +2% damage forever.',56);
 intro.forEach((l,i)=>mono(l,66,250+i*18,12,K.text));
 const pr=codexProgress();
 mono('46 stackable upgrades · 12 bosses in a chain of command',66,250+intro.length*18+8,11,K.textDim);
 const saved=readRun();
 if(saved){
  entry(BTN.titleContinue,'CONTINUE '+sectorName(saved.galaxySel|0),'[Enter]',true);
  if(titleConfirm) entry(BTN.titleStart,'ABANDON SAVED RUN?','[N]',false,'danger');
  else entry(BTN.titleStart,'NEW RUN','[N]',false);
 } else entry(BTN.titleContinue,'START','[Enter]',true);
 entry(BTN.titleSet,'SETTINGS',null,false);
 entry(BTN.titleCodex,'CODEX',null,false);
 entry(BTN.titleHelp,'HELP',null,false);
 mono('[O] settings  ·  [C] codex '+pr.n+'/'+pr.tot+'  ·  [H] help',66,516,11,K.textDim);
 wrapLines('Sniper lasers are telegraphed — dash through them. Brute rings: stay out of the band.',58).forEach((l,i)=>mono(l,66,548+i*16,11,K.textDim));
 mono('BEST '+best+'   ·   DEPTH S'+depth,66,592,12,K.gold,'left',600);
 mono('click or press any key for sound',470,592,11,K.textDim,'right');
 mono('vanilla Canvas · WebAudio synth · BFS-validated maps · no deps',66,616,10,K.textDim);
}
// ---------- galaxy hub: the pulsar map ----------
function drawGalaxy(){
 // the chart takes on the light of the sector it points at
 const s=galaxySel, th=THEMES[s%THEMES.length];
 ctx.fillStyle=th.pal.ground; ctx.fillRect(0,0,W,H);
 drawFarStars(runSeed%512,0);
 heading('SECTOR '+String(s+1).padStart(2,'0')+' · '+th.name.toUpperCase(),64,86,18,K.gold);
 line(64,104,560,104,th.pal.dim,1);
 mono('The pulsar map: every line runs home. Its ticks count the sector in binary.',64,124,11,K.textDim);
 const ns=galNodes(), HX=24, HY=H/2+40;
 // home, the origin every line runs back to
 ctx.strokeStyle=K.gold; ctx.lineWidth=1; ctx.beginPath(); ctx.arc(HX,HY,6,0,6.283); ctx.stroke(); ctx.fillStyle=K.gold; ctx.fillRect(HX-1.5,HY-1.5,3,3);
 mono('HOME',HX+12,HY+20,10,K.textDim);
 for(const n of ns){ // the fan: each line carries its sector number in binary ticks
  const dx=n.x-HX, dy=n.y-HY, L=Math.hypot(dx,dy)||1, ux=dx/L, uy=dy/L, nx=-uy, ny=ux;
  line(HX,HY,n.x,n.y,K.metalFaint,1);
  const bits=(n.i+1).toString(2);
  ctx.strokeStyle=K.metalDim; ctx.lineWidth=1; ctx.beginPath();
  for(let b=0;b<bits.length;b++){ const d=L*0.42+b*9, t=bits[b]==='1'?5:2, px=HX+ux*d, py=HY+uy*d; ctx.moveTo(px-nx*t,py-ny*t); ctx.lineTo(px+nx*t,py+ny*t); }
  ctx.stroke(); }
 // the trail: travelled legs solid gold, legs ahead dashed
 for(let k=0;k+1<ns.length;k++){ const a=ns[k], b=ns[k+1], done=a.i<=clearedMax;
  line(a.x,a.y,b.x,b.y,done?K.gold:K.goldDim,done?1.5:1,done?null:[5,5]); }
 for(const n of ns){
  const boss=isBossSector(n.i);
  ctx.fillStyle=th.pal.ground; ctx.beginPath(); ctx.arc(n.x,n.y,7,0,6.283); ctx.fill();
  ctx.strokeStyle=n.unlocked?K.gold:K.metalDim; ctx.lineWidth=n.unlocked?1.5:1; if(!n.unlocked) ctx.setLineDash([3,3]); ctx.stroke(); ctx.setLineDash([]);
  if(n.cleared){ ctx.fillStyle=K.gold; ctx.beginPath(); ctx.arc(n.x,n.y,3,0,6.283); ctx.fill(); }
  // a nest's rings take its commander's pigment once that god is known;
  // an unmet god stays bare metal, so the chart never names it early
  if(boss){ let tier=1, kd=null; try{ kd=bossKindsFor(n.i)[0]; tier=BOSSDEF[kd].tier; }catch(e){}
   const P=kd&&codexSeen(kd)?PIG[kd]:null;
   rankRings(n.x,n.y,11,tier,P?(n.unlocked?P.c:P.dim):(n.unlocked?K.metal:K.metalDim),1); }
  if(n.cur){ const pulse=REDUCED?0:Math.sin(performance.now()/260)*2; ctx.strokeStyle=K.gold; ctx.lineWidth=1.5; ctx.beginPath(); ctx.arc(n.x,n.y,(boss?30:18)+pulse,0,6.283); ctx.stroke(); }
  mono('S'+(n.i+1),n.x,n.y+(boss?44:32),11,n.cleared?K.gold:(n.unlocked?K.text:K.textDim),'center',600);
 }
 const lore=galaxyLore(s,th.name);
 line(64,H-150,W-64,H-150,K.metalDim,1);
 mono(lore,W/2,H-124,13,K.text,'center');
 mono('[←→] select · [Enter / click] set course · [C] codex · [H] help · [O] settings · [Esc] title',W/2,H-98,11,K.textDim,'center');
 if(player&&Object.keys(upgradeCounts).length){ heading('BUILD',64,H-44,9,K.textDim); drawBuild(130,H-62,W-194,1); }
 const pr=codexProgress();
 entry(BTN.galCodex,'CODEX',pr.n+'/'+pr.tot+'  [C]',false);
}
// ---------- settings ----------
// One list of settings rows, drawn by the screen and read by the live region.
function settingsRows(armed,armLeft){
  return [['1','SCREEN SHAKE',settings.shake?'ON':'OFF',settings.shake],['2','PARTICLES',settings.particles?'FULL':'LOW',settings.particles],['3','MUSIC',settings.music?'ON':'OFF',settings.music],['4','AUTO-FIRE DEFAULT',settings.autofire?'ON':'OFF',settings.autofire],['5','SHOW SECTOR SEED',settings.showSeed?'ON':'OFF',settings.showSeed],['6',armed?('PRESS 6 AGAIN TO WIPE · '+armLeft+'S'):'RESET RECORDS','BEST · DEPTH · BOSSES · CODEX',false,'danger'],['7','MUSIC VOLUME',Math.round(settings.musicVol*100)+'%',null],['8','SFX VOLUME',Math.round(settings.sfxVol*100)+'%',null],['9','DAMAGE NUMBERS',settings.dmgNums?'ON':'OFF',settings.dmgNums]];
}
function drawSettings(){
 heading('SETTINGS',W/2,132,22,K.gold,'center');
 mono('[1–9] or click to change · [O / Esc] back',W/2,156,11,K.textDim,'center');
 const armed=wipeArmT>performance.now();
 const armLeft=armed?Math.max(1,Math.ceil((wipeArmT-performance.now())/1000)):0;
 const rows=settingsRows(armed,armLeft);
 const rr=rowRects();
 rows.forEach((r,i)=>{ const b=rr[i], cy=b.y+b.h/2+2, hot=hovered(b), danger=r[4]==='danger';
  mono('['+r[0]+']',b.x,cy,11,K.textDim,'left');
  heading(r[1],b.x+42,cy,11,danger?K.red:(hot?K.gold:K.text));
  if(r[3]===null){ const v=i===6?settings.musicVol:settings.sfxVol; groove(b.x+b.w-190,cy-4,120,v,K.gold,10); mono(r[2],b.x+b.w,cy,12,K.gold,'right',600); }
  else mono(r[2],b.x+b.w,cy,12,danger?K.red:(r[3]?K.gold:K.textDim),'right',600);
  const col=danger?(armed?K.red:K.redDim):(r[3]?K.gold:K.goldDim);
  line(b.x,b.y+b.h-4,b.x+b.w,b.y+b.h-4,col,r[3]||armed?1.5:1,r[3]||armed?null:[4,4]);
 });
 entry(BTN.back,'BACK','[Esc]',false);
}
// ---------- help ----------
function drawHelp(){
 const labels=['CONTROLS','SHIELDS','ARSENAL','LORE'];
 heading('HELP',W/2,82,22,K.gold,'center');
 mono('[1–4 / click / ←→] switch tab · [H / Esc] back · the CODEX is its own screen: [C]',W/2,106,11,K.textDim,'center');
 const rr=helpTabRects();
 HELP_TABS.forEach((t,i)=>{ const r=rr[i], on=helpTab===t, hot=on||hovered(r);
  heading(labels[i],r.x+r.w/2,r.y+19,11,on?K.gold:(hot?K.gold:K.text),'center');
  mono(String(i+1),r.x+4,r.y+19,10,K.textDim);
  rule(r.x,r.y+r.h,r.w,on?K.gold:K.goldDim,on); });
 const L=HELP_TXT[helpTab]||HELP_TXT.controls;
 L.forEach((l,i)=>mono(l,80,196+i*23,12,K.text));
 entry(BTN.back,'BACK','[Esc]',false);
}
// ---------- codex ----------
function codexRects(){ return codexRows().map((r,k)=>({x:48,y:168+k*20,w:210,h:18,row:r})); }
// The preview renders the REAL sprite by building a throwaway entity and calling
// the same draw code the game uses. Every god is drawn at ONE registered scale so
// their sizes compare honestly; chaff share another. Locked entries use the same
// shape as a flat shadow, so a silhouette is recognisable before it is readable.
function drawCodexSprite(entry,cx,cy,locked){
 let e=null;
 try{ e=(codexTab==='bosses')?mkBoss(entry.id,cx,cy,9):mkEnemy(entry.type,cx,cy,2); }catch(err){ return; }
 e.x=cx; e.y=cy; e.t=locked?0.6:performance.now()/1000; e.flash=0; e.spawnT=0; e.vscale=1;
 e.hp=e.maxhp; e.mode='hunt'; e.phased=false; e.segs=[]; e.wards=[];
 e.aimT=0; e.windup=0; e.dashState=0; e.slowT=0; e.laser=null; e.beamT=0; e.gaze=null;
 e.facing=0.9;
 const k=codexTab==='bosses'?0.95:2.2;
 // Locked silhouettes are static (frozen t) but ctx.filter forces a software
 // pass every frame. Paint once per entry into an offscreen tile and blit.
 if(locked){
  try{
   const dk=devicePx>0?devicePx:1, key=codexTab+':'+(entry.id||entry.type)+':'+k.toFixed(2)+':'+dk.toFixed(2);
   const hit=codexSilCache[key];
   if(hit&&hit.c){ ctx.save(); ctx.beginPath(); ctx.rect(cx-65,cy-65,130,130); ctx.clip(); ctx.globalAlpha=0.9; ctx.drawImage(hit.c,cx-65,cy-65,130,130); ctx.restore(); return; }
   const S=130, c=mkCanvas(Math.max(1,Math.round(S*dk)),Math.max(1,Math.round(S*dk)));
   if(c){
    const g=c.getContext('2d'); try{ g.setTransform(dk,0,0,dk,0,0); }catch(_){}
    const realCtx=ctx; ctx=g;
    codexPreview=true;
    try{
     g.save(); g.beginPath(); g.rect(0,0,S,S); g.clip();
     try{ g.filter='brightness(0) invert(0.32)'; }catch(_){}
     g.globalAlpha=0.9;
     g.translate(S/2,S/2); g.scale(k,k); g.translate(-cx,-cy);
     try{ drawEnemy(e); }catch(_){}
     g.restore(); try{ g.filter='none'; }catch(_){}
    }finally{ ctx=realCtx; codexPreview=false; }
    codexSilCache[key]={c};
    ctx.save(); ctx.beginPath(); ctx.rect(cx-65,cy-65,130,130); ctx.clip(); ctx.globalAlpha=0.9; ctx.drawImage(c,cx-65,cy-65,130,130); ctx.restore();
    return;
   }
  }catch(err){}
 }
 codexPreview=true;
 ctx.save();
 ctx.beginPath(); ctx.rect(cx-65,cy-65,130,130); ctx.clip();
 if(locked){ try{ ctx.filter='brightness(0) invert(0.32)'; }catch(err){} ctx.globalAlpha=0.9; }
 ctx.translate(cx,cy); ctx.scale(k,k); ctx.translate(-cx,-cy);
 try{ drawEnemy(e); }catch(err){}
 ctx.restore();
 try{ ctx.filter='none'; }catch(err){}
 codexPreview=false;
}
// "Answers to SOVEREIGNS · Commands CAPTAINS: WARDEN, ???" — read from the
// tier tables, so the codex can never disagree with who actually summons whom.
function commandLine(kind){
 const t=BOSSDEF[kind].tier;
 const plural=r=>r==='APEX'?'the APEX':r+'S';
 const up=t<TIER_NAMES.length-1?'Answers to '+plural(TIER_NAMES[t+1]):'Answers to no one';
 const subs=BOSSES_BY_TIER[t-1]||[];
 const down=subs.length?'Commands '+plural(TIER_NAMES[t-1])+': '+subs.map(k=>codexSeen(k)?BOSSDEF[k].name:'???').join(', ')
  :'Commands only chaff';
 return up+'  ·  '+down;
}
function drawCodexScreen(){
 const L=codexList();
 if(codexSel>=L.length) codexSel=0;
 const pr=codexProgress();
 heading('CODEX',W/2,62,22,K.gold,'center');
 mono('MET '+pr.m+'  ·  DEFEATED '+pr.n+' / '+pr.tot+'  ·  [1/2 ←→] tab  [↑↓] entry  [C / Esc] back',W/2,86,11,K.textDim,'center');
 const tr=codexTabRects();
 ['BESTIARY','BOSSES'].forEach((lab,i)=>{ const r=tr[i], on=codexTab===CODEX_TABS[i], hot=on||hovered(r);
  heading(lab,r.x+r.w/2,r.y+19,11,hot?K.gold:K.text,'center'); mono(String(i+1),r.x+4,r.y+19,10,K.textDim);
  rule(r.x,r.y+r.h,r.w,on?K.gold:K.goldDim,on); });
 // index column: rank headers + entries (bosses), or a flat list (bestiary)
 for(const r of codexRects()){
  if(r.row.hdr){ const n=TIER_NAMES.indexOf(r.row.hdr); binTicks(r.x+2,r.y+14,n,5,K.metal); heading(r.row.hdr,r.x+36,r.y+13,9,K.textDim); continue; }
  const it=r.row.entry, on=r.row.i===codexSel, known=codexSeen(codexId(it)), killed=codexKnown(codexId(it));
  const nm=known?(it.name||BOSSDEF[it.id].name):'? ? ? ? ?';
  // filled pigment: defeated · hollow: met, not yet defeated
  if(on){ diamond(r.x+8,r.y+9,3.5,K.gold); line(r.x+18,r.y+r.h,r.x+r.w,r.y+r.h,K.gold,1); }
  else if(known&&PIG[codexId(it)]) diamond(r.x+8,r.y+9,2.5,PIG[codexId(it)].c,!killed);
  mono(nm,r.x+(codexTab==='bosses'?22:18),r.y+13,12,on?K.gold:(known?K.text:K.textDim),'left',on?600:400);
  if(codexTab==='bosses') mono('S'+BOSSDEF[it.id].debut,r.x+r.w,r.y+13,11,on?K.gold:K.textDim,'right');
 }
 const entryE=L[codexSel];
 if(!entryE){ entry(BTN.back,'BACK','[Esc]',false); return; }
 const known=codexSeen(codexId(entryE)), killed=codexKnown(codexId(entryE)), boss=codexTab==='bosses';
 // detail: an engraved plate with corner ticks, the portrait at registered scale
 const px=286, pw=W-px-46, py=168, tx=px+164;
 plate(px,py,pw,378,K.goldDim);
 plate(px+14,py+14,134,134,K.metalDim,false,true);
 drawCodexSprite(entryE,px+81,py+81,!known);
 if(!known){
  heading('? ? ? ? ?',tx,py+44,18,K.textDim);
  mono(boss?'Unidentified  ·  first met around S'+BOSSDEF[entryE.id].debut:'Unidentified hostile',tx,py+68,12,K.textDim);
  mono('Not yet met.',px+18,py+178,13,K.text);
  mono('Meet one to open its rank, tells and counters. The field note waits for the first kill.',px+18,py+200,12,K.textDim);
  entry(BTN.back,'BACK','[Esc]',false);
  return;
 }
 const name=entryE.name||BOSSDEF[entryE.id].name, pg=PIG[codexId(entryE)];
 heading(name,tx,py+42,18,K.text);
 if(pg) line(tx,py+51,tx+56,py+51,pg.c,2); // its pigment, as seen in the field
 const rank=boss?TIER_NAMES[BOSSDEF[entryE.id].tier]+'  ·  ':'';
 wrapLines(rank+entryE.role+'  ·  '+entryE.threat+(boss?'  ·  first seen S'+BOSSDEF[entryE.id].debut:''),60).forEach((l,i)=>mono(l,tx,py+66+i*15,11,K.textDim));
 if(boss) wrapLines(commandLine(entryE.id),60).forEach((l,i)=>mono(l,tx,py+100+i*15,11,K.textDim));
 let y=py+170;
 const block=(label,text,col,italic)=>{
  heading(label,px+18,y,9,col);
  const lines=wrapLines(text,84);
  lines.forEach((l,i)=>{ ctx.font=fM(12); ctx.fillStyle=italic?K.textDim:K.text; ctx.textAlign='left'; ctx.fillText(l,px+18,y+17+i*15); });
  y+=17+lines.length*15+11;
 };
 block('TELL',entryE.tell,K.red);
 block('COUNTER',entryE.counter,K.gold);
 if(killed) block('FIELD NOTE',entryE.lore,K.metal,true);
 else block('FIELD NOTE','Recovered on the first kill.',K.metal,true);
 entry(BTN.back,'BACK','[Esc]',false);
}
// Arrow navigation walks entries in the order they are LISTED (rank order for
// bosses), skipping headers.
function codexStep(dir){
 const order=codexRows().filter(r=>!r.hdr).map(r=>r.i);
 let k=order.indexOf(codexSel); if(k<0) k=0;
 codexSel=order[(k+dir+order.length)%order.length];
}
// ---------- refit icons ----------
// One engraving hand for all 46: monoline strokes in the ink of the current
// ground (gold on the dark field, black on the inverted nest draft).
let II={m:K.gold,b:K.goldHi,d:K.hull,t:K.goldWash,r:K.goldDim};
function iconInk(inverted){ II=inverted?{m:K.ground,b:K.ground,d:K.gold,t:K.inkWash,r:K.ground}:{m:K.gold,b:K.goldHi,d:K.hull,t:K.goldWash,r:K.goldDim}; }
function drawIcon(id,cx,cy,s){
 ctx.save(); ctx.translate(cx,cy); const u=s/20;
 ctx.strokeStyle=II.r; ctx.lineWidth=1; ctx.beginPath(); ctx.arc(0,0,s+4,0,6.283); ctx.stroke();
 ctx.lineWidth=1.75; ctx.lineCap='round';
 switch(id){
  case 'rate': ctx.strokeStyle=II.m; for(let i=-1;i<=1;i++){ ctx.beginPath(); ctx.moveTo(-12*u,i*7*u); ctx.lineTo(12*u,i*7*u); ctx.stroke(); } break;
  case 'dmg': ctx.strokeStyle=II.m; ctx.beginPath(); ctx.arc(0,0,10*u,0,6.283); ctx.stroke(); ctx.fillStyle=II.m; ctx.beginPath(); ctx.arc(0,0,3*u,0,6.283); ctx.fill();
   ctx.beginPath(); ctx.moveTo(0,-14*u); ctx.lineTo(0,-10*u); ctx.moveTo(0,10*u); ctx.lineTo(0,14*u); ctx.moveTo(-14*u,0); ctx.lineTo(-10*u,0); ctx.moveTo(10*u,0); ctx.lineTo(14*u,0); ctx.stroke(); break;
  case 'hp': ctx.strokeStyle=II.m; ctx.beginPath(); ctx.moveTo(-4*u,-12*u); ctx.lineTo(4*u,-12*u); ctx.lineTo(4*u,-4*u); ctx.lineTo(12*u,-4*u); ctx.lineTo(12*u,4*u); ctx.lineTo(4*u,4*u); ctx.lineTo(4*u,12*u); ctx.lineTo(-4*u,12*u); ctx.lineTo(-4*u,4*u); ctx.lineTo(-12*u,4*u); ctx.lineTo(-12*u,-4*u); ctx.lineTo(-4*u,-4*u); ctx.closePath(); ctx.stroke(); break;
  case 'spd': ctx.fillStyle=II.m; ctx.beginPath(); ctx.moveTo(-10*u,8*u); ctx.lineTo(2*u,0); ctx.lineTo(-10*u,-8*u); ctx.lineTo(-5*u,0); ctx.closePath(); ctx.fill();
   ctx.strokeStyle=II.m; ctx.beginPath(); ctx.moveTo(4*u,-6*u); ctx.lineTo(12*u,-6*u); ctx.moveTo(4*u,6*u); ctx.lineTo(12*u,6*u); ctx.stroke(); break;
  case 'slip': ctx.strokeStyle=II.m; for(let i=-1;i<=1;i++){ ctx.beginPath(); ctx.moveTo(-13*u,i*7*u); ctx.quadraticCurveTo(-4*u,i*7*u-5*u,4*u,i*7*u); ctx.quadraticCurveTo(9*u,i*7*u+3*u,13*u,i*7*u-2*u); ctx.stroke(); } break;
  case 'split': ctx.strokeStyle=II.m; ctx.beginPath(); ctx.moveTo(-13*u,0); ctx.lineTo(-1*u,0); ctx.moveTo(-1*u,0); ctx.lineTo(11*u,-8*u); ctx.moveTo(-1*u,0); ctx.lineTo(11*u,8*u); ctx.stroke();
   ctx.fillStyle=II.m; ctx.beginPath(); ctx.arc(11*u,-8*u,2.4*u,0,6.283); ctx.arc(11*u,8*u,2.4*u,0,6.283); ctx.fill(); break;
  case 'vamp': ctx.translate(0,-1.5*u); ctx.strokeStyle=II.m; ctx.beginPath(); ctx.moveTo(0,-13*u); ctx.quadraticCurveTo(10*u,2*u,10*u,6*u); ctx.arc(0,6*u,10*u,0,Math.PI); ctx.quadraticCurveTo(-10*u,2*u,0,-13*u); ctx.stroke();
   ctx.fillStyle=II.m; ctx.beginPath(); ctx.arc(-3*u,5*u,2.4*u,0,6.283); ctx.fill(); break;
  case 'seek': ctx.strokeStyle=II.m; ctx.beginPath(); ctx.arc(0,0,10*u,0.6,5.2); ctx.stroke();
   ctx.fillStyle=II.m; ctx.beginPath(); ctx.moveTo(12*u,-4*u); ctx.lineTo(14*u,6*u); ctx.lineTo(5*u,3*u); ctx.closePath(); ctx.fill();
   ctx.beginPath(); ctx.arc(0,0,2.4*u,0,6.283); ctx.fill(); break;
  case 'rico': ctx.strokeStyle=II.m; ctx.beginPath(); ctx.moveTo(-13*u,9*u); ctx.lineTo(-5*u,-8*u); ctx.lineTo(3*u,9*u); ctx.lineTo(11*u,-8*u); ctx.stroke();
   ctx.strokeStyle=II.r; ctx.beginPath(); ctx.moveTo(-14*u,-12*u); ctx.lineTo(14*u,-12*u); ctx.stroke(); break;
  case 'aegis': ctx.fillStyle=II.t; ctx.strokeStyle=II.m; ctx.beginPath(); ctx.moveTo(0,-13*u); ctx.lineTo(10*u,-8*u); ctx.lineTo(10*u,1*u); ctx.quadraticCurveTo(10*u,9*u,0,13*u); ctx.quadraticCurveTo(-10*u,9*u,-10*u,1*u); ctx.lineTo(-10*u,-8*u); ctx.closePath(); ctx.fill(); ctx.stroke(); break;
  case 'crit': ctx.fillStyle=II.m; ctx.beginPath(); ctx.moveTo(0,-13*u); ctx.lineTo(3*u,-3*u); ctx.lineTo(13*u,0); ctx.lineTo(3*u,3*u); ctx.lineTo(0,13*u); ctx.lineTo(-3*u,3*u); ctx.lineTo(-13*u,0); ctx.lineTo(-3*u,-3*u); ctx.closePath(); ctx.fill(); break;
  case 'surge': ctx.fillStyle=II.m; ctx.beginPath(); ctx.moveTo(1*u,-13*u); ctx.lineTo(8*u,-13*u); ctx.lineTo(2*u,-1*u); ctx.lineTo(7*u,-1*u); ctx.lineTo(-4*u,13*u); ctx.lineTo(-1*u,2*u); ctx.lineTo(-6*u,2*u); ctx.closePath(); ctx.fill(); break;
  case 'tract': ctx.translate(0,2.5*u); ctx.strokeStyle=II.m; ctx.lineWidth=5*u; ctx.beginPath(); ctx.arc(0,1*u,8*u,Math.PI,0); ctx.stroke(); ctx.lineWidth=1.75;
   ctx.fillStyle=II.b; ctx.fillRect(-11*u,-2*u,6*u,7*u); ctx.fillRect(5*u,-2*u,6*u,7*u); break;
  case 'pcell': ctx.fillStyle=II.t; ctx.strokeStyle=II.m; ctx.beginPath(); ctx.moveTo(0,-12*u); ctx.lineTo(10*u,0); ctx.lineTo(0,12*u); ctx.lineTo(-10*u,0); ctx.closePath(); ctx.fill(); ctx.stroke();
   ctx.fillStyle=II.m; ctx.beginPath(); ctx.arc(0,0,3*u,0,6.283); ctx.fill(); break;
  case 'shock': ctx.strokeStyle=II.m; for(let i=1;i<=3;i++){ ctx.globalAlpha=1-i*0.2; ctx.beginPath(); ctx.arc(0,0,i*4.5*u,0,6.283); ctx.stroke(); } ctx.globalAlpha=1;
   ctx.fillStyle=II.m; ctx.beginPath(); ctx.arc(0,0,2.4*u,0,6.283); ctx.fill(); break;
  case 'shockcap': ctx.strokeStyle=II.m; ctx.lineWidth=3*u; ctx.beginPath(); ctx.moveTo(-3*u,-11*u); ctx.lineTo(-3*u,11*u); ctx.moveTo(4*u,-11*u); ctx.lineTo(4*u,11*u); ctx.stroke(); ctx.lineWidth=1.75;
   ctx.beginPath(); ctx.moveTo(-12*u,0); ctx.lineTo(-6*u,0); ctx.moveTo(7*u,0); ctx.lineTo(13*u,0); ctx.stroke(); break;
  case 'shockamp': ctx.strokeStyle=II.m; ctx.beginPath(); ctx.arc(0,2*u,11*u,Math.PI,0); ctx.stroke();
   ctx.fillStyle=II.m; ctx.beginPath(); ctx.moveTo(1*u,-12*u); ctx.lineTo(7*u,-12*u); ctx.lineTo(2*u,-2*u); ctx.lineTo(6*u,-2*u); ctx.lineTo(-3*u,10*u); ctx.lineTo(0,-1*u); ctx.lineTo(-5*u,-1*u); ctx.closePath(); ctx.fill(); break;
  case 'shockrad': ctx.strokeStyle=II.m; ctx.setLineDash([4*u,3*u]); ctx.beginPath(); ctx.arc(0,0,12*u,0,6.283); ctx.stroke(); ctx.setLineDash([]);
   ctx.beginPath(); ctx.arc(0,0,6*u,0,6.283); ctx.stroke();
   ctx.fillStyle=II.m; ctx.beginPath(); ctx.arc(0,0,2.4*u,0,6.283); ctx.fill(); break;
  case 'orbital': ctx.fillStyle=II.m; ctx.beginPath(); ctx.arc(0,-11*u,3*u,0,6.283); ctx.fill();
   ctx.strokeStyle=II.m; ctx.beginPath(); ctx.moveTo(0,-8*u); ctx.lineTo(0,4*u); ctx.stroke();
   ctx.beginPath(); ctx.arc(0,8*u,8*u,0,6.283); ctx.stroke();
   ctx.beginPath(); ctx.moveTo(-11*u,8*u); ctx.lineTo(11*u,8*u); ctx.stroke(); break;
  case 'lance': ctx.strokeStyle=II.m; ctx.beginPath(); ctx.moveTo(-13*u,3*u); ctx.lineTo(13*u,-9*u); ctx.moveTo(-13*u,9*u); ctx.lineTo(13*u,-3*u); ctx.stroke();
   ctx.strokeStyle=II.b; ctx.beginPath(); ctx.moveTo(-13*u,6*u); ctx.lineTo(13*u,-6*u); ctx.stroke(); break;
  case 'flak': ctx.fillStyle=II.m; ctx.beginPath(); ctx.arc(0,0,4*u,0,6.283); ctx.fill();
   ctx.strokeStyle=II.m; for(let i=0;i<8;i++){ const a=i*0.7854; ctx.beginPath(); ctx.moveTo(Math.cos(a)*6*u,Math.sin(a)*6*u); ctx.lineTo(Math.cos(a)*12*u,Math.sin(a)*12*u); ctx.stroke(); } break;
  case 'corrode': ctx.strokeStyle=II.m; ctx.beginPath(); ctx.arc(0,-4*u,5*u,0,6.283); ctx.stroke();
   ctx.beginPath(); ctx.moveTo(-8*u,4*u); ctx.quadraticCurveTo(0,12*u,8*u,4*u); ctx.stroke();
   ctx.fillStyle=II.m; ctx.beginPath(); ctx.arc(-5*u,8*u,2*u,0,6.283); ctx.arc(5*u,9*u,1.6*u,0,6.283); ctx.fill(); break;
  case 'chain': ctx.strokeStyle=II.m; ctx.beginPath(); ctx.moveTo(-12*u,-8*u); ctx.lineTo(-3*u,-1*u); ctx.lineTo(-7*u,3*u); ctx.lineTo(3*u,10*u); ctx.stroke();
   ctx.fillStyle=II.m; ctx.beginPath(); ctx.arc(-12*u,-8*u,2.6*u,0,6.283); ctx.arc(3*u,10*u,2.6*u,0,6.283); ctx.fill();
   ctx.beginPath(); ctx.moveTo(6*u,-10*u); ctx.lineTo(12*u,-4*u); ctx.stroke(); break;
  case 'overcharge': ctx.translate(-3.5*u,0); ctx.fillStyle=II.m; ctx.beginPath(); ctx.moveTo(-2*u,-13*u); ctx.lineTo(6*u,-13*u); ctx.lineTo(0,-2*u); ctx.lineTo(5*u,-2*u); ctx.lineTo(-4*u,13*u); ctx.lineTo(-1*u,1*u); ctx.lineTo(-6*u,1*u); ctx.closePath(); ctx.fill();
   ctx.strokeStyle=II.m; ctx.beginPath(); ctx.arc(0,0,12*u,-0.6,0.6); ctx.stroke(); break;
  case 'adrenal': ctx.strokeStyle=II.m; ctx.beginPath(); ctx.arc(0,0,10*u,0,6.283); ctx.stroke();
   ctx.beginPath(); ctx.moveTo(-11*u,0); ctx.lineTo(-5*u,0); ctx.lineTo(-2*u,-7*u); ctx.lineTo(2*u,7*u); ctx.lineTo(5*u,0); ctx.lineTo(11*u,0); ctx.stroke(); break;
  case 'repair': ctx.strokeStyle=II.m; ctx.beginPath(); ctx.arc(0,-2*u,6*u,0,6.283); ctx.stroke();
   ctx.fillStyle=II.m; ctx.fillRect(-1.5*u,-6*u,3*u,8*u); ctx.fillRect(-5*u,-3.5*u,10*u,3*u);
   ctx.beginPath(); ctx.moveTo(-10*u,8*u); ctx.lineTo(-4*u,8*u); ctx.moveTo(4*u,8*u); ctx.lineTo(10*u,8*u); ctx.stroke(); break;
  case 'shrap': ctx.fillStyle=II.m; for(let i=0;i<7;i++){ const a=i*0.897; ctx.save(); ctx.rotate(a); ctx.beginPath(); ctx.moveTo(5*u,0); ctx.lineTo(12*u,-2.6*u); ctx.lineTo(12*u,2.6*u); ctx.closePath(); ctx.fill(); ctx.restore(); }
   ctx.strokeStyle=II.m; ctx.beginPath(); ctx.arc(0,0,3.4*u,0,6.283); ctx.stroke(); break;
  case 'salvage': ctx.strokeStyle=II.m; ctx.beginPath(); ctx.arc(0,0,9*u,0,6.283); ctx.stroke();
   ctx.fillStyle=II.m; ctx.fillRect(-2*u,-2*u,4*u,4*u);
   ctx.beginPath(); ctx.moveTo(9*u,-9*u); ctx.lineTo(13*u,-13*u); ctx.moveTo(10*u,-13*u); ctx.lineTo(13*u,-13*u); ctx.lineTo(13*u,-10*u); ctx.stroke(); break;
  case 'refit': ctx.strokeStyle=II.m; ctx.beginPath(); ctx.arc(0,0,10*u,0.6,5.0); ctx.stroke();
   ctx.fillStyle=II.m; ctx.beginPath(); ctx.moveTo(10*u,-6*u); ctx.lineTo(13*u,2*u); ctx.lineTo(5*u,0); ctx.closePath(); ctx.fill();
   ctx.fillRect(-1.5*u,-5*u,3*u,10*u); ctx.fillRect(-5*u,-1.5*u,10*u,3*u); break;
  case 'gatecd': ctx.strokeStyle=II.m; ctx.beginPath(); ctx.arc(0,0,11*u,0,6.283); ctx.stroke();
   ctx.beginPath(); ctx.moveTo(0,0); ctx.lineTo(0,-7*u); ctx.moveTo(0,0); ctx.lineTo(5*u,2*u); ctx.stroke();
   ctx.fillStyle=II.m; ctx.beginPath(); ctx.arc(0,-11*u,2*u,0,6.283); ctx.fill(); break;
  case 'transit': ctx.fillStyle=II.m; ctx.beginPath(); ctx.moveTo(-11*u,-9*u); ctx.lineTo(-1*u,0); ctx.lineTo(-11*u,9*u); ctx.lineTo(-6*u,0); ctx.closePath(); ctx.fill();
   ctx.beginPath(); ctx.moveTo(-1*u,-9*u); ctx.lineTo(9*u,0); ctx.lineTo(-1*u,9*u); ctx.lineTo(4*u,0); ctx.closePath(); ctx.fill(); break;
  case 'orbit': ctx.fillStyle=II.m; ctx.beginPath(); ctx.arc(0,0,3.4*u,0,6.283); ctx.fill();
   ctx.strokeStyle=II.m; ctx.beginPath(); ctx.ellipse(0,0,12*u,6*u,0.5,0,6.283); ctx.stroke();
   ctx.fillStyle=II.b; ctx.beginPath(); ctx.arc(10*u,-5*u,2.6*u,0,6.283); ctx.fill(); break;
  case 'nova': ctx.strokeStyle=II.m; for(let i=0;i<3;i++){ const a=i*Math.PI/3; ctx.beginPath(); ctx.moveTo(-Math.cos(a)*12*u,-Math.sin(a)*12*u); ctx.lineTo(Math.cos(a)*12*u,Math.sin(a)*12*u); ctx.stroke(); }
   ctx.fillStyle=II.b; ctx.beginPath(); ctx.arc(0,0,2.6*u,0,6.283); ctx.fill(); break;
  case 'tesla': ctx.strokeStyle=II.m; ctx.beginPath(); ctx.moveTo(-8*u,12*u); ctx.lineTo(8*u,12*u); ctx.moveTo(0,12*u); ctx.lineTo(0,-10*u); ctx.stroke();
   ctx.beginPath(); ctx.moveTo(-6*u,4*u); ctx.lineTo(6*u,4*u); ctx.moveTo(-4*u,-2*u); ctx.lineTo(4*u,-2*u); ctx.stroke();
   ctx.beginPath(); ctx.moveTo(-11*u,-4*u); ctx.quadraticCurveTo(-14*u,-9*u,-9*u,-11*u); ctx.moveTo(11*u,-4*u); ctx.quadraticCurveTo(14*u,-9*u,9*u,-11*u); ctx.stroke();
   ctx.fillStyle=II.m; ctx.beginPath(); ctx.arc(0,-10*u,2.4*u,0,6.283); ctx.fill(); break;
  case 'pierce': ctx.strokeStyle=II.r; ctx.lineWidth=3*u; ctx.beginPath(); ctx.moveTo(-4*u,-11*u); ctx.lineTo(-4*u,11*u); ctx.moveTo(4*u,-11*u); ctx.lineTo(4*u,11*u); ctx.stroke(); ctx.lineWidth=1.75;
   ctx.fillStyle=II.m; ctx.beginPath(); ctx.moveTo(-13*u,-1*u); ctx.lineTo(8*u,-1*u); ctx.lineTo(8*u,-5*u); ctx.lineTo(14*u,0); ctx.lineTo(8*u,5*u); ctx.lineTo(8*u,1*u); ctx.lineTo(-13*u,1*u); ctx.closePath(); ctx.fill(); break;
  case 'wind': ctx.strokeStyle=II.m; ctx.beginPath(); ctx.arc(-4*u,-2*u,5.5*u,Math.PI*0.9,Math.PI*1.9); ctx.arc(4*u,-2*u,5.5*u,Math.PI*1.1,Math.PI*0.1); ctx.lineTo(0,12*u); ctx.closePath(); ctx.stroke();
   ctx.beginPath(); ctx.moveTo(-9*u,-8*u); ctx.quadraticCurveTo(-14*u,-10*u,-13*u,-13*u); ctx.moveTo(9*u,-8*u); ctx.quadraticCurveTo(14*u,-10*u,13*u,-13*u); ctx.stroke(); break;
  case 'array': ctx.translate(-8.9*u,0); ctx.fillStyle=II.d; ctx.strokeStyle=II.m; for(let i=-1;i<=1;i++){ ctx.fillRect(2*u,i*6*u-2*u,12*u,4*u); ctx.strokeRect(2*u,i*6*u-2*u,12*u,4*u); }
   ctx.fillStyle=II.b; ctx.beginPath(); ctx.arc(16*u,-6*u,1.8*u,0,6.283); ctx.arc(16*u,0,1.8*u,0,6.283); ctx.arc(16*u,6*u,1.8*u,0,6.283); ctx.fill(); break;
  case 'minigun': ctx.strokeStyle=II.m; ctx.lineWidth=2.5*u; for(let i=-1;i<=1;i++){ ctx.beginPath(); ctx.moveTo(-4*u,i*6*u); ctx.lineTo(11*u,i*8*u); ctx.stroke(); } ctx.lineWidth=1.75;
   ctx.fillStyle=II.d; ctx.fillRect(-12*u,-7*u,8*u,14*u); ctx.strokeRect(-12*u,-7*u,8*u,14*u); break;
  case 'inc': ctx.strokeStyle=II.m; ctx.beginPath(); ctx.moveTo(0,-13*u); ctx.quadraticCurveTo(11*u,-2*u,7*u,7*u); ctx.quadraticCurveTo(4*u,13*u,0,13*u); ctx.quadraticCurveTo(-4*u,13*u,-7*u,7*u); ctx.quadraticCurveTo(-11*u,-2*u,0,-13*u); ctx.stroke();
   ctx.fillStyle=II.m; ctx.beginPath(); ctx.arc(0,5*u,4*u,0,6.283); ctx.fill(); break;
  case 'cryo': ctx.strokeStyle=II.m; for(let i=0;i<3;i++){ const a=i*Math.PI/3+Math.PI/6; ctx.beginPath(); ctx.moveTo(-Math.cos(a)*12*u,-Math.sin(a)*12*u); ctx.lineTo(Math.cos(a)*12*u,Math.sin(a)*12*u); ctx.stroke(); }
   ctx.beginPath(); ctx.arc(0,0,4*u,0,6.283); ctx.stroke(); break;
  case 'slug': ctx.fillStyle=II.m; ctx.beginPath(); ctx.moveTo(-6*u,-6*u); ctx.lineTo(8*u,-6*u); ctx.quadraticCurveTo(13*u,0,8*u,6*u); ctx.lineTo(-6*u,6*u); ctx.closePath(); ctx.fill();
   ctx.strokeStyle=II.m; ctx.strokeRect(-11*u,-5*u,4*u,10*u); break;
  case 'ward': ctx.fillStyle=II.t; ctx.strokeStyle=II.m; ctx.beginPath(); ctx.moveTo(0,-13*u); ctx.lineTo(10*u,-8*u); ctx.lineTo(10*u,1*u); ctx.quadraticCurveTo(10*u,9*u,0,13*u); ctx.quadraticCurveTo(-10*u,9*u,-10*u,1*u); ctx.lineTo(-10*u,-8*u); ctx.closePath(); ctx.fill(); ctx.stroke();
   ctx.beginPath(); ctx.moveTo(-5*u,1*u); ctx.lineTo(-1*u,5*u); ctx.lineTo(6*u,-4*u); ctx.stroke(); break;
  case 'bulwark': ctx.translate(0,7.75*u); ctx.strokeStyle=II.m; for(let i=0;i<3;i++){ ctx.beginPath(); ctx.arc(0,(8-i*7)*u,11*u,Math.PI*1.2,Math.PI*1.8); ctx.stroke(); } break;
  case 'mirror': ctx.fillStyle=II.t; ctx.strokeStyle=II.m; ctx.beginPath(); ctx.moveTo(0,-12*u); ctx.lineTo(10*u,0); ctx.lineTo(0,12*u); ctx.lineTo(-10*u,0); ctx.closePath(); ctx.fill(); ctx.stroke();
   ctx.strokeStyle=II.b; ctx.beginPath(); ctx.moveTo(-12*u,6*u); ctx.lineTo(-2*u,-2*u); ctx.lineTo(6*u,6*u); ctx.stroke(); break;
  case 'barrier': ctx.strokeStyle=II.m; ctx.strokeRect(-12*u,-9*u,24*u,6*u); ctx.strokeRect(-12*u,-1*u,24*u,6*u); ctx.strokeRect(-12*u,7*u,24*u,4*u);
   ctx.beginPath(); ctx.moveTo(0,-9*u); ctx.lineTo(0,-3*u); ctx.moveTo(-6*u,-1*u); ctx.lineTo(-6*u,5*u); ctx.moveTo(6*u,-1*u); ctx.lineTo(6*u,5*u); ctx.stroke(); break;
  case 'stasis': ctx.strokeStyle=II.m; ctx.beginPath(); ctx.moveTo(-9*u,-11*u); ctx.lineTo(9*u,-11*u); ctx.moveTo(-9*u,11*u); ctx.lineTo(9*u,11*u); ctx.stroke();
   ctx.fillStyle=II.t; ctx.beginPath(); ctx.moveTo(-9*u,-11*u); ctx.lineTo(9*u,-11*u); ctx.lineTo(0,0); ctx.closePath(); ctx.fill(); ctx.stroke();
   ctx.beginPath(); ctx.moveTo(-9*u,11*u); ctx.lineTo(9*u,11*u); ctx.lineTo(0,0); ctx.closePath(); ctx.fill(); ctx.stroke(); break;
  case 'magnet': ctx.strokeStyle=II.m; ctx.lineWidth=5*u; ctx.beginPath(); ctx.arc(0,1*u,8*u,Math.PI,0); ctx.stroke(); ctx.lineWidth=1.75;
   ctx.fillStyle=II.b; ctx.fillRect(-11*u,-2*u,6*u,6*u); ctx.fillRect(5*u,-2*u,6*u,6*u);
   ctx.fillStyle=II.m; ctx.beginPath(); ctx.arc(0,10*u,2*u,0,6.283); ctx.fill(); break;
  default: ctx.fillStyle=II.m; ctx.font=fD(14); ctx.textAlign='center'; ctx.fillText('?',0,6);
 }
 ctx.restore();
}
// ---------- the draft ----------
// Card rects shared by drawing and click hit-testing. The returning core unlock
// is a wide strip under the three cards rather than a fourth column.
function draftRect(i){ return levelChoices[i]===levelBack?{x:250,y:446,w:460,h:62}:{x:130+i*240,y:220,w:220,h:204}; }
function drawBackOffer(u,i,ink){
 const r=draftRect(i), dn=(typeof u.dyn==='function')?u.dyn(player):null, hot=hovered(r);
 ctx.strokeStyle=ink.main; ctx.lineWidth=hot?1.5:1; if(!hot) ctx.setLineDash([5,4]); ctx.strokeRect(r.x+0.5,r.y+0.5,r.w,r.h); ctx.setLineDash([]);
 drawIcon(u.id,r.x+36,r.y+r.h/2,13);
 heading(((dn&&dn.name)||u.name).toUpperCase(),r.x+66,r.y+27,11,ink.text);
 mono((dn&&dn.desc)||u.desc,r.x+66,r.y+46,11,ink.dim);
 mono('['+(i+1)+']  offered again',r.x+r.w-12,r.y+27,11,ink.dim,'right');
}
function drawLevelUp(){
 const inv=nestDraftAt>0;
 let a=1; if(inv&&!REDUCED) a=clamp((performance.now()-nestDraftAt)/350,0,1);
 // the one inversion: a nest's bonus draft turns the field to the gold record
 // cover, black engraving on gold, and back again once the pick is made
 ctx.fillStyle=K.scrim; ctx.fillRect(0,0,W,H);
 if(inv){ ctx.save(); ctx.globalAlpha=a; ctx.fillStyle=K.gold; ctx.fillRect(0,0,W,H);
  ctx.strokeStyle=K.groundGroove; ctx.lineWidth=1; for(let r=40;r<760;r+=4){ ctx.beginPath(); ctx.arc(W/2,H+80,r,0,6.283); ctx.stroke(); } ctx.restore(); }
 const ink=inv&&a>0.5?{main:K.ground,text:K.ground,dim:K.onGold}:{main:K.gold,text:K.text,dim:K.textDim};
 iconInk(inv&&a>0.5);
 const keysLine='press '+levelChoices.map((_,i)=>i+1).join(' / ')+' or click · [C] codex · [H] help';
 const lead=inv&&nestTally.kinds.length?BOSSDEF[nestTally.kinds[0]]:null;
 if(lead){ // the peak: which god fell, and what the fall is worth
  heading(nestTally.kinds.length>1?lead.name+"'S COURT FALLS":lead.name+' FALLS',W/2,164,20,ink.main,'center');
  mono(TIER_NAMES[lead.tier]+(nestTally.banked?' · +'+nestTally.banked+'% DAMAGE BANKED FOR EVERY HULL':'')+(nestTally.firsts.length?' · FIELD NOTE RECOVERED [C]':''),W/2,190,12,ink.main,'center',600);
  mono(keysLine,W/2,208,11,ink.dim,'center');
 } else {
  heading(inv?'NEST CLEARED — CHOOSE UPGRADE':'LEVEL '+player.level+' — CHOOSE UPGRADE',W/2,164,20,ink.main,'center');
  mono(keysLine,W/2,192,12,ink.dim,'center'); }
 levelChoices.forEach((u,i)=>{
  if(u===levelBack){ drawBackOffer(u,i,ink); return; }
  const r=draftRect(i), hot=hovered(r), dn=(typeof u.dyn==='function')?u.dyn(player):null;
  plate(r.x,r.y,r.w,r.h,ink.main,hot);
  // rarity as rim ticks: one, two or three cuts along the top edge
  const n=u.r===2?3:(u.r===1?2:1); for(let k=0;k<n;k++){ const tx=r.x+r.w/2+(k-(n-1)/2)*8; line(tx,r.y-4,tx,r.y+4,ink.main,1.5); }
  mono('['+(i+1)+']',r.x+12,r.y+22,11,ink.dim);
  if(u.r===2) heading('RARE',r.x+r.w-12,r.y+22,9,ink.main,'right');
  drawIcon(u.id,r.x+r.w/2,r.y+66,19);
  const nm=((dn&&dn.name)||u.name).toUpperCase();
  const nl=wrapLines(nm,18); ctx.font=fD(11); nl.forEach((l,k)=>heading(l,r.x+r.w/2,r.y+118+k*17,11,ink.text,'center'));
  const dl=wrapLines((dn&&dn.desc)||u.desc,28); dl.forEach((l,k)=>mono(l,r.x+r.w/2,r.y+124+nl.length*17+10+k*16,11,ink.dim,'center'));
  // what it does to this hull, and how much of it the hull already carries
  const own=upgradeCounts[u.id]||0; if(own>0) mono('OWNED '+own+(u.max?' OF '+u.max:''),r.x+r.w-12,r.y+(u.r===2?38:22),10,ink.dim,'right',600);
  const df=draftDiffs()[i]||[], dy0=r.y+124+nl.length*17+10+dl.length*16+6;
  df.slice(0,2).forEach((l,k)=>{ const yy=dy0+k*15; if(yy<r.y+r.h-6) mono(l,r.x+r.w/2,yy,11,ink.main,'center',600); });
 });
 iconInk(false);
}
function wrapText(t,x,y,mw){ wrapLines(t,20).forEach((l,i)=>{ ctx.textAlign='center'; ctx.fillText(l,x,y+i*20); }); }
// ---------- pause ----------
function drawPaused(){
 ctx.fillStyle=K.scrim; ctx.fillRect(0,0,W,H);
 heading(autoPaused?'AUTO-PAUSED':'PAUSED',W/2,212,26,K.gold,'center');
 mono(autoPaused?'tab hidden — ESC / click resume':'ESC resume · H help · C codex · O settings · R restart · Q quit',W/2,244,12,K.text,'center');
 mono('The run is saved. Quitting replays this sector from its start.',W/2,266,11,K.textDim,'center');
 entry(BTN.pauseResume,'RESUME','[Esc]',true);
 entry(BTN.pauseSet,'SETTINGS','[O]',false);
 entry(BTN.pauseHelp,'HELP','[H]',false);
 entry(BTN.pauseCodex,'CODEX','[C]',false);
 const armed=restartArm>performance.now();
 entry(BTN.pauseRestart,armed?'ABANDON THIS RUN?':'RESTART','[R]',false,armed?'danger':undefined);
 entry(BTN.pauseQuit,'QUIT TO TITLE','[Q]',false);
 // the hull as it stands: its refits on the left, its systems on the right
 if(player){ const p=player;
  heading('BUILD',48,300,9,K.textDim); line(48,308,288,308,K.metalFaint,1); drawBuild(48,318,240,6);
  heading('SYSTEMS',672,300,9,K.textDim); line(672,308,912,308,K.metalFaint,1);
  const sys=[['HULL',Math.ceil(p.hp)+'/'+p.maxhp],['DMG','×'+p.dmgMult.toFixed(2)],['RATE',p.fireRate.toFixed(1)+'/s'],['SHOTS',p.shots],['CRIT',Math.round(p.critCh*100)+'%'],['SPEED',Math.round(p.speed)],['MAGNET',Math.round(p.magnet)]];
  if(p.pierce) sys.push(['PIERCE',p.pierce]); if(p.bounce) sys.push(['RICOCHET',p.bounce]); if(p.homing) sys.push(['SEEK',p.homing]);
  sys.push(['BOSS BONUS','+'+Math.round(bosses*2)+'%']);
  sys.forEach(([k,v],i)=>{ const yy=330+i*20; mono(k,672,yy,11,K.textDim); mono(String(v),912,yy,11,K.text,'right',600); });
  let s='KILLS '+kills+'   SCORE '+scoreCalc()+'   BEST '+best+'   DEPTH S'+depth;
  if(settings.showSeed&&arena) s+='   SEED '+arena.seed;
  line(120,H-34,W-120,H-34,K.metalDim,1);
  mono(s,W/2,H-14,11,K.textDim,'center'); }
}
// ---------- what a refit does to this hull ----------
// A card is applied to a copy of the ship and the copy is compared with the
// ship, so "before → after" comes from the card's real code, never from a
// second description of it that could drift.
const STAT_VIEW=[
 ['dmgMult','DMG',v=>'×'+v.toFixed(2)], ['fireRate','RATE',v=>v.toFixed(1)+'/s'], ['shots','SHOTS'], ['maxhp','HULL'],
 ['critCh','CRIT',v=>Math.round(v*100)+'%'], ['speed','SPEED',v=>Math.round(v)], ['pierce','PIERCE'], ['bounce','RICOCHET'], ['homing','SEEK'],
 ['vamp','LEECH'], ['magnet','MAGNET',v=>Math.round(v)], ['pull','PULL',v=>Math.round(v)], ['xpBonus','XP',v=>'×'+v.toFixed(2)],
 ['charges','CHARGES'], ['recallCdMax','GATE CD',v=>v.toFixed(1)+'s'], ['channelMax','BLINK',v=>v.toFixed(2)+'s'],
 ['inc','BURN'], ['cryo','CHILL'], ['slug','SLUG'], ['minigun','MINIGUN'], ['aegisLvl','AEGIS LV'], ['bulMax','BULWARK'], ['barrier','BARRIER',v=>Math.round(v)],
 ['stasisN','STASIS'], ['surgeLvl','SURGE LV'], ['orbs','ORBS'], ['novaLvl','NOVA LV'], ['teslaLvl','TESLA LV'],
 ['shockNeed','KILLS / DISCHARGE'], ['shockDmg','DISCHARGE',v=>Math.round(v)], ['shockR','DISCHARGE R',v=>Math.round(v)], ['shockChill','DISCHARGE CHILL'],
 ['orbitalLvl','ORBITAL LV'], ['lanceLvl','LANCE LV'], ['flak','FLAK'], ['corrode','CORRODE'], ['chain','CHAIN'], ['overcharge','OVERCHARGE'],
 ['adrenal','ADRENAL'], ['repair','REPAIR'], ['shrap','SHRAPNEL'], ['salvage','SALVAGE']];
function fmtStat(f,v){ return f?f(v):(Number.isInteger(v)?String(v):v.toFixed(2)); }
let previewing=false;
function statDiff(u){
 if(!player||!u||typeof u.apply!=='function') return [];
 let q=null; previewing=true; try{ q=JSON.parse(JSON.stringify(player)); u.apply(q); }catch(e){ return []; } finally{ previewing=false; }
 const out=[]; for(const [k,label,f] of STAT_VIEW){ const a=player[k], b=q[k]; if(typeof a==='number'&&typeof b==='number'&&Math.abs(a-b)>1e-9) out.push(label+' '+fmtStat(f,a)+' → '+fmtStat(f,b)); }
 return out;
}
let diffCache={of:null,d:[]};
function draftDiffs(){ if(diffCache.of!==levelChoices){ diffCache={of:levelChoices,d:levelChoices.map(statDiff)}; } return diffCache.d; }
// ---------- the build plate ----------
// Everything KRIEFNE has bolted on this hull, in the order it was drafted:
// the refit's engraving, and a count under it once it stacks (MAX at cap).
// Shared by the end screen, pause and the hub. Returns the height it used.
function drawBuild(x,y,w,rows,ink){
 const ids=Object.keys(upgradeCounts).filter(id=>upgradeCounts[id]>0), cell=40, per=Math.max(1,Math.floor(w/cell)), cap=per*(rows||2);
 if(!ids.length){ mono('No refits drafted on this hull.',x,y+18,11,(ink&&ink.dim)||K.textDim); return 26; }
 ids.slice(0,ids.length>cap?cap-1:cap).forEach((id,i)=>{ const cx=x+cell/2+(i%per)*cell, cy=y+16+Math.floor(i/per)*46;
  drawIcon(id,cx,cy,9); const n=upgradeCounts[id], u=UPGRADES.find(q=>q.id===id);
  if(u&&u.max&&n>=u.max) mono('MAX',cx,cy+28,10,K.gold,'center',600); else if(n>1) mono('×'+n,cx,cy+28,10,(ink&&ink.text)||K.text,'center',600); });
 if(ids.length>cap){ const i=cap-1, cx=x+cell/2+(i%per)*cell, cy=y+16+Math.floor(i/per)*46; mono('+'+(ids.length-cap+1),cx,cy+4,11,K.textDim,'center',600); }
 return Math.ceil(Math.min(ids.length,cap)/per)*46;
}
// ---------- game over ----------
// The end screen is a record of the hull: what brought it down and how to
// read that blow next time, what it carried, and where the trail goes next.
function nextGodLine(){
 const order=BOSS_KINDS.slice().sort((a,b)=>BOSSDEF[a].debut-BOSSDEF[b].debut);
 const k=order.find(q=>!codexKnown(q));
 if(!k) return 'Every god has fallen once. Past S110 the trail is a wall.';
 const d=BOSSDEF[k], rank=TIER_NAMES[d.tier];
 return codexSeen(k)?'Unfinished: '+d.name+', '+rank+', first met at S'+d.debut+'.':'Next on the trail: a '+rank+' holds S'+d.debut+'.';
}
function drawEnd(){
 ctx.fillStyle=K.scrim; ctx.fillRect(0,0,W,H);
 const src=endInfo.src, L=150, T=252;
 const ent=src&&(CODEX_FOES.find(f=>f.type===src.id)||CODEX_BOSSES.find(b=>b.id===src.id));
 const tl=ent?wrapLines(ent.tell,74).slice(0,2):[], cl=ent?wrapLines(ent.counter,74).slice(0,2):[];
 const nIds=Object.keys(upgradeCounts).filter(id=>upgradeCounts[id]>0).length, per=Math.floor((W-L-T)/40);
 const buildH=nIds?Math.min(2,Math.ceil(nIds/per))*46:26;
 // measure first, then centre the record in the space above RETRY
 const causeH=src?26+28+(ent?tl.length*15+8+cl.length*15:0):30;
 const blockH=34+30+causeH+22+26+buildH+10+44;
 let y=Math.max(96,Math.round((BTN.endRestart.y-24-blockH)/2)+34);
 heading('HULL LOST',W/2,y,34,K.red,'center'); line(W/2-220,y+18,W/2+220,y+18,K.redDim,1); y+=52;
 if(src){
  const pg=PIG[src.id], nm=src.name+(src.lt?' LT':''), what=' · '+src.what;
  mono('BROUGHT DOWN BY',W/2,y,11,K.textDim,'center'); y+=26;
  ctx.font=fD(16); track(3); let w1=nm.length*14; try{ w1=ctx.measureText(nm).width; }catch(e){} track(0);
  ctx.font=fM(13,600); let w2=what.length*8; try{ w2=ctx.measureText(what).width; }catch(e){}
  const x0=W/2-(w1+w2)/2;
  heading(nm,x0,y,16,pg?pg.c:K.text); mono(what,x0+w1,y,13,K.red,'left',600); y+=28;
  if(ent){
   heading('TELL',L,y,9,K.red); tl.forEach((l,i)=>mono(l,T,y+i*15,12,K.text)); y+=tl.length*15+8;
   heading('COUNTER',L,y,9,K.gold); cl.forEach((l,i)=>mono(l,T,y+i*15,12,K.text)); y+=cl.length*15;
  }
 } else { mono('The last blow went unrecorded.',W/2,y+16,12,K.textDim,'center'); y+=30; }
 y+=22; line(L,y-12,W-L,y-12,K.metalFaint,1);
 if(endInfo.newBest) heading('NEW BEST',L,y+4,9,K.gold);
 mono('Score '+scoreCalc()+'   Best '+best+'   Kills '+kills+'   Level '+player.level+'   Time '+Math.floor(timeSec)+'s   Reached '+sectorName(arenaIdx),T,y+4,12,K.text); y+=26;
 heading('BUILD',L,y+20,9,K.textDim); y+=drawBuild(T,y,W-L-T,2)+14;
 mono('Restored at the Wake. Boss kills stay banked: +2% damage each.',W/2,y+8,12,K.gold,'center');
 mono(nextGodLine(),W/2,y+26,11,K.textDim,'center');
 entry(BTN.endRestart,'RETRY','[R]',endReady());
 entry(BTN.endTitle,'TITLE','[Esc]',false);
}

// ---------- screen reader ----------
// A screen reader cannot see the canvas. A polite live region in the page
// reads out what each screen is and what it offers, when that changes: the
// same words the canvas draws, never a second script to keep in sync.
let srEl=null, srLast='', srT=0;
// the canvas is described by whichever hint line is actually showing
try{ if(window.matchMedia&&window.matchMedia('(pointer:coarse)').matches&&canvas.setAttribute) canvas.setAttribute('aria-describedby','hint-touch'); }catch(e){}
try{ srEl=document.getElementById?document.getElementById('sr'):null; }catch(e){}
function srSummary(){
 const keys=' Settings O, codex C, help H.';
 if(state==='title'){ const sv=readRun();
  if(titleConfirm) return 'Abandon the saved run? Press N again to confirm, or Enter to continue it.';
  return 'KRIEFNE, roguelite. '+(sv?'Enter continues at '+sectorName(sv.galaxySel|0)+'. N starts a new run.':'Enter starts a run.')+keys; }
 if(state==='galaxy'){ const th=THEMES[galaxySel%THEMES.length];
  return 'Galaxy chart. Sector '+(galaxySel+1)+', '+th.name+(isBossSector(galaxySel)?', boss nest':'')+'. '+galaxyLore(galaxySel,th.name)+' Arrows select, Enter sets course, Escape returns to title.'; }
 if(state==='playing'){ if(!player) return '';
  const where='Sector '+(arenaIdx+1)+', '+(arena&&arena.theme?arena.theme.name:'')+'.';
  if(portal) return where+' Sector clear.'+(gems.length?' Salvage left on the field is lost at the exit.':'')+' Exit with E.';
  const low=player.hp<=player.maxhp*0.3?' Hull critical.':'';
  return where+(isBossSector(arenaIdx)?' Boss nest: '+bossKindsFor(arenaIdx).join(' and ')+'.':' Hostiles inbound.')+low; }
 if(state==='levelup') return (nestDraftAt>0&&nestTally.kinds.length?BOSSDEF[nestTally.kinds[0]].name+(nestTally.kinds.length>1?"'s court falls.":' falls.')+(nestTally.banked?' +'+nestTally.banked+'% damage banked.':''):(nestDraftAt>0?'Nest cleared.':'Level '+(player?player.level:'')+'.'))+' Choose an upgrade; C opens the codex, H help. '+levelChoices.map((u,i)=>{ const dn=(typeof u.dyn==='function')?u.dyn(player):null; return (i+1)+': '+((dn&&dn.name)||u.name)+', '+((dn&&dn.desc)||u.desc)+(u===levelBack?', offered again':'')+'.'; }).join(' ');
 if(state==='paused') return restartArm>performance.now()?'Abandon this run? Press R again to restart; the saved run is lost.':'Paused. Escape resumes. O settings, H help, C codex, R restart, Q quit to title.';
 if(state==='settings'){ const armed=wipeArmT>performance.now(), left=armed?Math.max(1,Math.ceil((wipeArmT-performance.now())/1000)):0;
  return 'Settings. '+settingsRows(armed,left).map(r=>r[0]+', '+r[1]+(r[1].indexOf('PRESS')===0?'':': '+r[2])).join('. ')+'. Escape goes back.'; }
 if(state==='help') return 'Help, '+helpTab+'. '+(HELP_TXT[helpTab]||[]).join(' ')+' Keys 1 to 4 switch tab; Escape goes back.';
 if(state==='codex'){ const L=codexList(), en=L[codexSel]; if(!en) return 'Codex.';
  const id=codexId(en), nm=en.name||(BOSSDEF[en.id]&&BOSSDEF[en.id].name)||'';
  if(!codexSeen(id)) return 'Codex, '+codexTab+'. Not yet met. Up and down change entry.';
  const b=BOSSDEF[en.id], rank=b?TIER_NAMES[b.tier]+', ':'';
  return 'Codex, '+codexTab+'. '+nm+'. '+rank+en.role+', '+en.threat+'.'+(b?' '+commandLine(en.id)+'.':'')+' Tell: '+en.tell+' Counter: '+en.counter+' '+(codexKnown(id)?'Field note: '+en.lore:'Field note recovered on the first kill.')+' Up and down change entry.'; }
 if(state==='gameover'){ const sr=endInfo.src, ent=sr&&(CODEX_FOES.find(f=>f.type===sr.id)||CODEX_BOSSES.find(b=>b.id===sr.id));
  return 'Hull lost.'+(sr?' Brought down by '+sr.name+', '+sr.what+'.'+(ent?' Tell: '+ent.tell+' Counter: '+ent.counter:''):'')+(endInfo.newBest?' New best.':'')+' Score '+scoreCalc()+'. Reached sector '+(arenaIdx+1)+'. '+nextGodLine()+' R retries, Escape returns to title.'; }
 return '';
}
function srTick(now){ if(!srEl||now-srT<250) return; srT=now; let t=''; try{ t=srSummary(); }catch(e){} if(t&&t!==srLast){ srLast=t; srEl.textContent=t; } }

// ---------- main loop ----------
let last=performance.now(), acc=0; const STEP=1000/60;
function frame(now){ requestAnimationFrame(frame); let dt=now-last; last=now; if(dt>250) dt=250; acc+=dt; let n=0; while(acc>=STEP&&n<5){ update(STEP/1000); acc-=STEP; n++; } if(n===5) acc=0; render(); srTick(now); }
arena={seed:1337, obs:[], theme:THEMES[0], spawns:[], port:{x:800,y:500}, validated:true, ratio:1};
  try{ window.__kriefne={ startRun, continueRun, saveRun, readRun, loadArena, loadSector, killEnemy, nextArena, gainXp, pickUpgrade, hurtPlayer, doPortalKey, tryDash, update, render, focusWatch, xpNeedFor, openHelp, handleKeyPress, handleClick,
   spawnEnemy, steer, hostiles, collectGems, isBossSector, bossKindsFor, compFor, sectorName, sectorWorld, galNodes, reflectBullet, bulletBlocked,
   forceState(s){ state=s; }, get upgrades(){ return UPGRADES; }, get helpTab(){ return helpTab; },
   get bossdefs(){ return BOSSDEF; }, get hazards(){ return hazards; }, get signatureNests(){ return SIGNATURE_NESTS; },
   get tierNames(){ return TIER_NAMES; }, get bossesByTier(){ return BOSSES_BY_TIER; }, get nestLtLeft(){ return nestLtLeft; },
   commandDepth, ltBudgetFor, escortsFor, subordinateKinds, mkLieutenant, nestLore, get debutLore(){ return DEBUT_LORE; },
   drawIcon, get ctx(){ return ctx; },
   get pigments(){ return PIGMENT_DEF; }, get pig(){ return PIG; }, get tokens(){ return K; }, get bossDefs(){ return BOSSDEF; }, get themes(){ return THEMES; },
   srSummary,
   get helpTabs(){ return HELP_TABS; }, get codexFoes(){ return CODEX_FOES; }, get codexBosses(){ return CODEX_BOSSES; },
   setHelpTab(t){ helpTab=t; },
   openCodex, closeCodex, codexKnown, codexSeen, handleRelease, statDiff, get endInfo(){ return endInfo; }, get restartArm(){ return restartArm; }, codexProgress, commandLine,
   get codexTab(){ return codexTab; }, setCodexTab(t){ codexTab=t; codexSel=0; }, get codexSel(){ return codexSel; },
  pool(){ return UPGRADES.filter(u=>(!u.req||u.req(player))&&(!u.max||(upgradeCounts[u.id]||0)<u.max)).map(u=>u.id); },
  get autoPaused(){ return autoPaused; }, get queue(){ return spawnQueue; }, get cam(){ return cam; },
  get pendingLevels(){ return pendingLevels; }, get pity(){ return pity; }, get runSeed(){ return runSeed; }, get upgradeCounts(){ return upgradeCounts; },
  get titleConfirm(){ return titleConfirm; }, get levelBack(){ return levelBack; },
  get depth(){ return depth; }, get bosses(){ return bosses; }, get best(){ return best; },
  get cleared(){ return clearedMax; }, get galaxySel(){ return galaxySel; }, get time(){ return timeSec; },
   get ebullets(){ return ebullets; }, get hostileRings(){ return rings.filter(g=>g.dmg>0&&!g.own); }, get hazardList(){ return hazards; },
   get state(){return state;}, get player(){return player;}, get enemies(){return enemies;}, get gems(){return gems;}, get settings(){return settings;}, get arena(){return arena;}, get portal(){return portal;}, get choices(){return levelChoices;}, keys, mouse, touch, fitCanvas,
   get viewScale(){ return viewScale; }, get devicePx(){ return devicePx; } }; }catch(e){}
fitCanvas();
requestAnimationFrame(frame);
})();
