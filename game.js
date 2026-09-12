/* KRIEFNE v2 — Roguelite. Vanilla Canvas, zero deps.
 * v2: sleek ship, HUD-safe playfield, settings/help, 12 upgrades,
 * rule-bound validated procgen (BFS reachability), themed maps/music. */
(() => {
'use strict';
let W = 960, H = 640; const WALL = 24, HUD_H = 56;
// World bounds + size are per-sector (sectors are larger than the viewport and
// grow endlessly). PX0..PY1 double as the camera-clamped playfield rect.
let PX0 = WALL, PY0 = HUD_H + WALL, PX1 = W - WALL, PY1 = H - WALL;
let WW = W, HH = H;
const cam = { x:0, y:0 };
const canvas = document.getElementById('game');
let ctx = canvas.getContext('2d');
try{ ctx.imageSmoothingEnabled = false; }catch(e){}
// ---------- viewport fit + devicePixelRatio scaling ----------
// The canvas fills the window and the layout reflows to its shape: W/H are
// the live viewport in CSS px (not a fixed 960x640), so every draw routine
// that already anchors to W/H (HUD edges, centred menus) follows the window.
// Gameplay, hitboxes and tests never move: world bounds (PX0..PY1, WW/HH)
// are per-sector and independent of the viewport; only the camera's visible
// window (W/H) changes. Backing store renders at device pixels (capped) so
// the engraved hairlines stay crisp on hidpi. Text is drawn in CSS px, so a
// 12px label is always >=12px on screen — nothing ever scales down.
// Touch here is groundwork only: a single touch maps to aim+tap
// so menus already work on a phone; the full touch scheme (sticks and
// gestures) is still undecided and must build on `touch`, not beside it.
let viewScale = 1;  // kept for API compat: logical px == CSS px, so always 1
let devicePx = 1;   // backing px per logical px (= effective DPR)
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
  const headless = !(vw > 0 && vh > 0);
  try{ const hEl = (typeof document !== 'undefined' && document.getElementById) ? document.getElementById('hint') : null;
   if(hEl && hEl.offsetHeight) hintH = hEl.offsetHeight + 22; }catch(e){}
  if(headless){
   // Tests / headless: keep the 960x640 viewport so balance never moves;
   // only ensure a crisp backing store.
   let eff = Math.min(dpr, maxBack / W, maxBack / H);
   if(!(eff > 0)) eff = 1;
   const bw = Math.max(1, Math.round(W * eff));
   const bh = Math.max(1, Math.round(H * eff));
   if(canvas.width !== bw || canvas.height !== bh){
    canvas.width = bw; canvas.height = bh;
    try{ ctx.imageSmoothingEnabled = false; }catch(e){}
    try{ farStars = null; }catch(e){}
    try{ worldCache = null; }catch(e){}
   }
   devicePx = eff; viewScale = 1;
   try{ ctx.setTransform(devicePx, 0, 0, devicePx, 0, 0); }catch(e){}
   try{ if(typeof layoutButtons === 'function') layoutButtons(); }catch(e){}
   return;
  }
  if(!(vw > 0)) vw = W; if(!(vh > 0)) vh = H;
  const availW = Math.max(280, vw - 24);
  const availH = Math.max(320, vh - hintH - 28);
  const cssW = Math.max(1, Math.round(availW));
  const cssH = Math.max(1, Math.round(availH));
  if(cssW !== W || cssH !== H){
   W = cssW; H = cssH;
   try{ mouse.x = clamp(mouse.x, 0, W); mouse.y = clamp(mouse.y, 0, H); }catch(e){}
   try{ touch.x = clamp(touch.x, 0, W); touch.y = clamp(touch.y, 0, H); }catch(e){}
   try{ farStars = null; }catch(e){}
   try{ worldCache = null; }catch(e){}
   try{ recordCache = null; }catch(e){}
   try{ for(const k in codexSilCache) delete codexSilCache[k]; }catch(e){}
  }
  viewScale = 1;
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
  devicePx = eff;
  try{ ctx.setTransform(devicePx, 0, 0, devicePx, 0, 0); }catch(e){}
  // Re-pin centred menus and edge HUD to the new shape.
  try{ if(typeof layoutButtons === 'function') layoutButtons(); }catch(e){}
  try{ cam.x = clamp(cam.x, 0, Math.max(0, WW - W)); cam.y = clamp(cam.y, 0, Math.max(0, HH - H)); }catch(e){}
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
//  * at least 0.09 between any two gods that can share a field, any two
//    servitors, and every god and the servitors it summons.
// Twenty gods cannot all sit 0.09 apart inside this gamut, and with one lead
// per nest they no longer need to: a god only ever fights beside the rungs
// its chain reaches (three below it, spec §2) and the Apex beside the S75-S95
// Sovereigns its Convocation can bring. test.js checks exactly those pairs.
// [hue, lightness, chroma], found by a constrained search that held each god
// as near as it could to its character hue.
const PIGMENT_DEF={
 stalker:[128,0.66,0.06], brute:[176,0.71,0.111], tempest:[160,0.59,0.119],
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
 overlord:[356,0.66,0.075],    // madder       · the Berserk
 revenant:[199,0.70,0.030],    // rime         · the Cold-Sleeper
 hydra:[299,0.74,0.118],       // lilac        · the Three-Throated
 wyvern:[358,0.58,0.042],      // ash-rose     · the Strafing Wing
 sentinel:[238,0.72,0.118],    // glacier blue · the Shield-Wall
 colossus:[0,0.74,0.034],      // pale stone   · the Walled
 progenitor:[177,0.70,0.118],  // brood jade   · the Brood-Hall
 kraken:[240,0.59,0.118],      // deep blue    · the Deep-Grasp
 eclipse:[296,0.66,0.042]      // dusk         · the Dimming
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
// and a star within 20° of red's hue holds every tone to 0.02 chroma, so its
// motif and wreckage stay quieter than hazard hatching.
// v picks one of two lightness variants: 0 is the standard star, 1 a dimmer
// one. The dark tones drop together so wreckage keeps its contrast on the
// ground; the silver edge never moves.
const PAL_DIM=[[0,0,0,0,0,0],[-0.018,-0.014,-0.012,-0.01,-0.01,-0.01]];
function nearRed(H){ return Math.abs(((H-32)%360+540)%360-180)<=20; }
function mkSectorPal(H,v){ const d=PAL_DIM[v?1:0], c=nearRed(H)?(x=>Math.min(x,0.02)):(x=>x);
 return { ground:oklch(0.145+d[0],c(0.018),H), deep:oklch(0.115+d[1],c(0.012),H), hull:oklch(0.205+d[2],c(0.02),H), faint:oklch(0.27+d[3],c(0.024),H), dim:oklch(0.4+d[4],c(0.028),H), metal:oklch(0.56,0.01,H), motif:oklch(0.36+d[5],c(0.04),H) }; }
// Two monoline voices cut by the same stylus: wide engraver's capitals for
// names and titles, a narrow tabular face for numbers and KRIEFNE's voice.
const FONT_D="Michroma, 'Martian Mono', sans-serif", FONT_M="'Martian Mono', ui-monospace, Menlo, Consolas, monospace";
// Large-text bumps every canvas size up one step (9px HUD labels read at 11px)
// so players who need bigger than the HUD minimum get it from one setting.
function SZ(px){ try{ return (settings&&settings.largeText)?px+2:px; }catch(e){ return px; } }
function fD(px){ return SZ(px)+'px '+FONT_D; }
function fM(px,w){ return (w||400)+' '+SZ(px)+'px '+FONT_M; }
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
let settings = { shake:!REDUCED, particles:!REDUCED, music:true, autofire:true, showSeed:false, musicVol:0.8, sfxVol:0.6, dmgNums:!REDUCED, largeText:false };
try{ const s=JSON.parse(lsGet('cfg')||'null'); if(s&&typeof s==='object') settings=Object.assign(settings,s); }catch(e){}
function saveCfg(){ try{ lsSet('cfg',JSON.stringify(settings)); }catch(e){} }

// ---------- audio ----------
let AC=null, master=null, musicBus=null, noiseBuf=null, muted=false, musicTimer=null, musicStep=0, musicPat=[55,0,55,65.41,0,55,49,58.27], musicTempo=190, musicLead=[], musicWave='square';
function ac(){ try{ if(!AC){ const C=window.AudioContext||window.webkitAudioContext; if(!C) return null; AC=new C(); master=AC.createGain(); master.gain.value=muted?0:settings.sfxVol; master.connect(AC.destination); musicBus=AC.createGain(); musicBus.gain.value=(muted||!settings.music)?0:settings.musicVol; musicBus.connect(AC.destination); } if(AC.state==='suspended') AC.resume(); return AC; }catch(e){ return null; } }
function audioUnlocked(){ try{ return !!(AC&&AC.state==='running'); }catch(e){ return false; } }
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
function toPaused(auto){ clearInputs(); floaters=[]; state='paused'; pauseSel=0; autoPaused=!!auto; setMusicCfg(PAUSE_MUS); try{ render(); }catch(e){} }
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
// ash-lilac, rose, then ochre, slate, moss, mauve, indigo, sea-green: every
// step along the trail shifts the light. The six later hues carry no score of
// their own: each borrows the music of the nearest-hued of the first six.
// Order is for contrast, not hue: neighbouring sectors sit far apart.
const THEMES=[
 {name:'Relay Drift', tint:245, light:-0.6, motif:'relays', bass:[55,0,55,65.41,0,55,49,58.27], tempo:190, lwave:'square', lead:[440,0,523.25,0,587.33,0,523.25,392,440,0,523.25,659.25,0,587.33,523.25,0]},
 {name:'Archive Reef', tint:195, light:2.4, motif:'shards', bass:[49,0,49,58.27,0,49,43.65,51.91], tempo:180, lwave:'square', lead:[392,0,440,0,493.88,587.33,0,493.88,440,0,392,0,329.63,0,392,0]},
 {name:'Broken Ring', tint:140, light:0.4, motif:'ring', bass:[65.41,0,65.41,73.42,0,65.41,55,62.23], tempo:200, lwave:'sawtooth', lead:[523.25,659.25,0,783.99,0,659.25,523.25,0,440,523.25,0,659.25,783.99,0,659.25,0]},
 {name:'Slag Belt', tint:50, light:-2.2, motif:'belt', bass:[43.65,0,43.65,49,0,55,43.65,41.2], tempo:175, lwave:'square', lead:[349.23,0,349.23,415.3,0,349.23,311.13,293.66,349.23,0,415.3,0,466.16,415.3,349.23,0]},
 {name:'Hull Ossuary', tint:295, light:1.6, motif:'none', bass:[36.71,0,36.71,43.65,0,36.71,34.65,38.89], tempo:205, lwave:'sawtooth', lead:[369.99,0,440,0,554.37,0,493.88,440,369.99,0,415.3,440,0,493.88,440,0]},
 {name:'Rose Veil', tint:350, light:-1.2, motif:'veil', bass:[55,55,0,65.41,55,0,49,58.27], tempo:185, lwave:'square', lead:[440,440,0,523.25,0,587.33,0,659.25,587.33,0,523.25,440,392,440,0,0]},
 {name:'Ochre Shoal', tint:80, light:0.9, motif:'belt'},
 {name:'Slate Wake', tint:222, light:-2.7, motif:'relays'},
 {name:'Moss Keels', tint:112, light:2.0, motif:'ring'},
 {name:'Mauve Shroud', tint:324, light:-0.2, motif:'veil'},
 {name:'Indigo Hollow', tint:272, light:2.9, motif:'none'},
 {name:'Drowned Array', tint:168, light:-1.7, motif:'shards'}
];
const hueGap=(a,b)=>Math.abs(((a-b)%360+540)%360-180);
for(const th of THEMES) if(!th.bass){ let best=null;
 for(const o of THEMES) if(o.bass&&(!best||hueGap(o.tint,th.tint)<hueGap(best.tint,th.tint))) best=o;
 Object.assign(th,{bass:best.bass,tempo:best.tempo,lwave:best.lwave,lead:best.lead,scoreOf:best.name}); }
for(const th of THEMES) th.pal=mkSectorPal(th.tint);
// A sector's light: its hue stop, a fixed jitter of up to ±8° from the sector
// number, and one of two lightness variants (the second lap of the trail
// through the stops runs under dimmer stars than the first). Derived from the
// sector alone, never the run seed, so the hub and the sector always agree.
const SECTOR_TH={};
function sectorTheme(i){
 i=Math.max(0,i|0); if(SECTOR_TH[i]) return SECTOR_TH[i];
 const base=THEMES[i%THEMES.length], R=mulberry32((i*2654435761^0x7a1d)>>>0);
 const tint=((base.tint+(R()*2-1)*8)%360+360)%360, v=((i/THEMES.length)|0)%2;
 return (SECTOR_TH[i]=Object.assign({},base,{tint,baseTint:base.tint,variant:v,pal:mkSectorPal(tint,v)}));
}
const TITLE_MUS={ bass:[110,0,0,0,130.81,0,0,0,98,0,0,0,146.83,0,0,0], tempo:300, lwave:'sine', lead:[220,0,0,261.63,0,0,329.63,0,0,293.66,0,261.63,0,246.94,0,0] };
const PAUSE_MUS={ bass:[110,0,0,0,0,0,0,0,98,0,0,0,0,0,0,0], tempo:340, lwave:'triangle', lead:[220,0,0,0,174.61,0,0,0,196,0,0,0,164.81,0,0,0] };
// ---------- endless sectors ----------
// The run never ends: sectors grow larger, denser and meaner forever.
// Every 5th sector is a boss NEST held by exactly ONE god, the one debuting
// there (spec §1), so the ladder below IS the schedule. A second god enters a
// fight only by being summoned, and a god calls the rung directly beneath it:
// S(n) calls S(n-5) (spec §2). No courts, no escorts, nothing random, so the
// codex, the hub lore and the tests all read one table.
// Past S100 comes the Second Winter: the ladder repeats as RETURNED gods. The
// lead of S(100+k) is ladder level k and it calls level k-5, so the chain
// restarts with the loop and the returned OVERLORD at S105 calls nobody.
const LADDER=['overlord','warden','phantom','revenant','leviathan','hydra','wyvern','oracle','sentinel','archon',
 'colossus','basilisk','progenitor','harbinger','kraken','juggernaut','eclipse','nullifier','chorus','singularity'];
function isBossSector(s){ return ((s+1)%5)===0; }
// The ladder level (1..100) a sector plays: itself to S100, then the winter loop.
function ladderLevel(n){ return n<=100?n:((n-101)%100)+1; }
function leadFor(n){ return LADDER[clamp(Math.round(ladderLevel(n)/5)-1,0,LADDER.length-1)]; }
// Kept for every caller that asks for a nest's roster: one lead, always.
function bossKindsFor(s){ return [leadFor(s+1)]; }
// Who a god calls when wounded: the rung directly beneath it, unless its kit
// names its own (ORACLE's two WYVERNs, SINGULARITY's Convocation). OVERLORD,
// the bottom rung, calls ordinary enemies only.
function summonsOf(kind){ const k=BOSS_KITS[kind]; if(k&&k.calls) return k.calls.slice(); const i=LADDER.indexOf(kind); return i>0?[LADDER[i-1]]:[]; }
function callersOf(kind){ return LADDER.filter(k=>summonsOf(k).indexOf(kind)>=0); }
// A nest's callable gods: the lead's summons, never one before its own debut.
function nestSummons(s){ const n=s+1; return summonsOf(leadFor(n)).filter(k=>BOSSDEF[k]&&BOSSDEF[k].debut<=n); }
// Chain depth (spec §2): how many links deep a nest's summons may reach. The
// lead's own call is link 1; a summoned god may add one beneath itself only
// while its link is shallower than this. S5-S45 one link, S50-S95 two, the
// Apex three; a returned god reaches one deeper than at its debut.
function chainExtra(n){ if(n>100) return Math.min(3,chainExtra(ladderLevel(n))+1); return n<=45?0:(n<=95?1:2); }
function maxChainDepth(n){ return 1+chainExtra(n); }
// Nest-wide budget of summoned gods, every link of every chain included. A
// kit can widen it for a bespoke call (ORACLE re-arms its pair).
function summonBudgetFor(n){ const lvl=ladderLevel(n), k=BOSS_KITS[leadFor(n)];
 let b=(k&&k.summons&&k.summons.budget!=null)?k.summons.budget:(lvl<10?0:lvl<=20?1:lvl<=45?2:lvl<=95?4:7);
 if(n>100&&b>0) b+=2;
 return b; }
// HP fractions at which a lead calls (spec §2 bands by its debut), unless its
// kit sets its own: ARCHON 75/25, ORACLE's Call and the Convocation at 50%.
function summonAt(kind){ const k=BOSS_KITS[kind]; if(k&&k.summons&&k.summons.at) return k.summons.at.slice();
 const d=BOSSDEF[kind]?BOSSDEF[kind].debut:5; return d<=5?[]:d<=20?[0.5]:d<=45?[0.6,0.3]:d<=95?[0.7,0.35]:[0.5]; }
function sectorName(s){ return 'S'+String(s+1).padStart(2,'0'); }
// galaxy hub flavor: lore that builds the trail instead of restating mechanics.
// Nest lines name the nightmare; sector lines rotate with the run seed.
// Each god's debut line lives in its own boss block (kit.lore), names its RANK
// so the hub teaches the ladder one rung at a time, and the hub adds whom it
// calls. Codex field notes are separate and longer; these are the headline.
function callNames(kinds){ const c={}; for(const k of kinds) c[k]=(c[k]||0)+1; return Object.keys(c).map(k=>BOSSDEF[k].name+(c[k]>1?' ×'+c[k]:'')).join(', '); }
function nestLore(s){
 const n=s+1, lead=leadFor(n), d=BOSSDEF[lead], calls=nestSummons(s);
 const tail=calls.length?' Calls '+callNames(calls)+'.':'';
 if(n<=100) return (DEBUT_LORE[lead]||(TIER_NAMES[d.tier]+' — '+d.name+' holds this nest.'))+tail;
 const rank=TIER_NAMES[d.tier], who=rank==='APEX'?'THE APEX':(/^[AEIOU]/.test(rank)?'AN ':'A ')+rank;
 return 'THE SECOND WINTER — '+d.name+', '+who+', returns.'+tail;
}
function galaxyLore(s,thName){
 if(isBossSector(s)) return nestLore(s);
 if(s<=clearedMax) return 'Sector pacified. Fly it again as a drill, or push deeper.';
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
// normal-sector composition (spec §7): the total keeps growing with depth —
// about 12 + 2.2 per sector, bounded by the world's area (one hostile per 18k
// px², which only bites past S90) — instead of flatlining at 48 by S12. Each
// species unlocks where it always has, then holds a fixed share; the split is
// largest-remainder, so the counts always sum to the total.
const COMP_W={ drone:[0,8], stalker:[0,4], mite:[1,3], tempest:[1,2.6], sniper:[2,2.6], brute:[3,1.8] }; // [first sector idx, share]
function compTotal(s){ const w=sectorWorld(s); return Math.round(Math.min(12+2.2*(s+1),w.w*w.h/18000)); }
function compFor(s){
 const tot=compTotal(s), out={}, rem=[];
 let wsum=0, used=0;
 for(const k in COMP_W) if(s>=COMP_W[k][0]) wsum+=COMP_W[k][1];
 for(const k in COMP_W){
  if(s<COMP_W[k][0]){ out[k]=0; continue; }
  const x=tot*COMP_W[k][1]/wsum; out[k]=Math.floor(x); used+=out[k]; rem.push([x-out[k],k]);
 }
 rem.sort((a,b)=>b[0]-a[0]);
 for(let i=0;used<tot;i++,used++) out[rem[i%rem.length][1]]++;
 return out;
}
// XP per normal sector is held where the old flat-lining roster put it: the
// spec changes the PACE of a sector, not how many drafts it funds (the whole
// balance model assumes ~1.15 picks per sector). So each foe pays its base XP
// times old-roster-size / new-roster-size — more than before early, where the
// new roster is smaller, and less deep down, where it is up to 4x larger.
function compXpScale(s){
 const old=11+Math.min(8,s)+Math.min(6,((s+1)/2)|0)+(s>=1?5+Math.min(4,s)+Math.min(4,(s/2)|0):0)
  +(s>=2?2+Math.min(4,((s-1)/2)|0):0)+(s>=3?1+Math.min(3,((s-2)/2)|0):0);
 return old/compTotal(s);
}
// Normal-sector wave plan (spec §7). The opening pack is small; the rest of the
// roster streams in from 700-1000px out, a pack at a time, released evenly over
// a planned window, so a strong ship is paced by the stream rather than by how
// fast it can melt a static field. The alive cap rises with depth; a ship too
// weak to keep up is paced by the cap instead and simply takes longer.
//   win     seconds over which the queue is released (tune: fight sim, §10)
//   pack    hostiles per release; every = win / releases
const WAVE_WIN=[56,84,110]; // S1-S9, S11-S49, S51+ (the spec §7 bands)
const _wavePlans={};
function wavePlan(s){
 if(_wavePlans[s]) return _wavePlans[s];
 const n=s+1, tot=compTotal(s);
 const initial=Math.min(tot,4+Math.min(8,(s/6)|0));
 const pack=Math.min(7,1+(((s+3)/10)|0));
 const win=n<=9?WAVE_WIN[0]:(n<=49?WAVE_WIN[1]:WAVE_WIN[2]);
 const every=win/Math.max(1,Math.ceil((tot-initial)/pack));
 return (_wavePlans[s]={ initial, pack, every, cap:10+Math.min(24,(s/3)|0), win });
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
 {id:'vamp', name:'Vampire Chip', desc:'Heal 1 HP per kill', max:5, dyn(p){ return p.vamp>0?{name:'Vampire Chip',desc:'Feed harder: +1 HP per kill (now '+p.vamp+')'}:null; }, apply(p){ p.vamp=(p.vamp||0)+1; }},
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
let pendingNest=0;       // nest bonus drafts queued behind an open draft (see killEnemy)
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
let nestDraftAt=0;   // set when a nest's bonus draft opens: dark ground + gold disc

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
   status:statusFresh(),
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
// Every poly carries `sh`, the name of its form, so a map can be audited for
// what it is built from.
function rotPts(pts,rot){ const c=Math.cos(rot), s=Math.sin(rot); return pts.map(q=>[q[0]*c-q[1]*s,q[0]*s+q[1]*c]); }
function shTag(o,sh){ o.sh=sh; return o; }
// local points re-centred on their vertex mean, so the bounding radius stays tight
function ctrPts(pts){ let mx=0, my=0; for(const q of pts){ mx+=q[0]; my+=q[1]; } mx/=pts.length; my/=pts.length; return pts.map(q=>[q[0]-mx,q[1]-my]); }
function ngonPts(cx,cy,r,n,rot){ const p=[]; for(let i=0;i<n;i++){ const a=rot+i*6.283/n; p.push([cx+Math.cos(a)*r,cy+Math.sin(a)*r]); } return p; }
function boxPts(x0,y0,x1,y1){ return [[x0,y0],[x1,y0],[x1,y1],[x0,y1]]; }
const NGON_SH={3:'tri-eq',4:'quad',5:'pent',6:'hex',7:'hept',8:'oct',9:'non',10:'dec'};
function shapeNGon(x,y,r,n,rot){ return shTag(mkPoly(x,y,ngonPts(0,0,r,n,rot)),NGON_SH[n]||'ngon'); }
function shapeBar(x,y,w,h,rot){ const hw=w/2, hh=h/2; return shTag(mkPoly(x,y,rotPts(boxPts(-hw,-hh,hw,hh),rot)),'bar'); } // girder, rotatable — rects can only sit axis-aligned
function shapeWedge(x,y,r,rot){ return shTag(mkPoly(x,y,rotPts([[r,0],[-r*0.5,-r*0.8],[-r*0.75,0],[-r*0.5,r*0.8]],rot)),'wedge'); } // kite: convex, reads as a prow
function shapeTrap(x,y,w,h,rot){ const hw=w/2, hh=h/2; return shTag(mkPoly(x,y,rotPts([[-hw,hh],[hw,hh],[hw*0.55,-hh],[-hw*0.55,-hh]],rot)),'trap'); }
// Triangles: 'eq' equilateral, 'iso' a long shard, 'right' a cut corner plate.
function triPts(r,form){
 return form==='iso'?[[r,0],[-r*0.6,-r*0.42],[-r*0.6,r*0.42]]
  :(form==='right'?[[-r*0.75,-r*0.6],[r*0.75,-r*0.6],[-r*0.75,r*0.6]]:[[r,0],[-r*0.5,-r*0.866],[-r*0.5,r*0.866]]);
}
function shapeTri(x,y,r,rot,form){ form=form||'eq'; return shTag(mkPoly(x,y,rotPts(ctrPts(triPts(r,form)),rot)),'tri-'+form); }
function shapeSquare(x,y,s,rot){ return shTag(shapeBar(x,y,s,s,rot),'square'); }
function shapeRhombus(x,y,a,b,rot){ return shTag(mkPoly(x,y,rotPts([[a,0],[0,b],[-a,0],[0,-b]],rot)),'rhombus'); }
// girder with raked ends: k shifts the top edge along, the bottom edge back
function shapePara(x,y,w,h,k,rot){ const hw=w/2, hh=h/2; return shTag(mkPoly(x,y,rotPts([[-hw+k,-hh],[hw+k,-hh],[hw-k,hh],[-hw-k,hh]],rot)),'para'); }
// kite: the long point along +x, so rot aims it
function shapeKite(x,y,r,rot){ return shTag(mkPoly(x,y,rotPts(ctrPts([[r,0],[0,-r*0.5],[-r*0.45,0],[0,r*0.5]]),rot)),'kite'); }
// ---------- compound wreckage ----------
// Two or three convex pieces placed as one group. Pieces may overlap inside
// their group (obsClash skips a shared `grp`), collision stays per piece, and
// engraveGroup paints the group as one hull. `gk` names the group's form.
// gPiece takes points in the group's local frame (origin at x,y, unrotated)
// and turns them into a poly centred on its own vertex mean.
function gPiece(x,y,rot,pts,sh){ let mx=0, my=0; for(const q of pts){ mx+=q[0]; my+=q[1]; } mx/=pts.length; my/=pts.length;
 const c=Math.cos(rot), s=Math.sin(rot);
 return shTag(mkPoly(x+mx*c-my*s,y+mx*s+my*c,rotPts(pts.map(q=>[q[0]-mx,q[1]-my]),rot)),sh); }
function asGroup(gk,pieces){ for(const o of pieces) o.gk=gk; return pieces; }
// L-block: two girders sharing a corner square, arms a and b long, t thick.
function shapeL(x,y,a,b,t,rot){ const ox=-a/2, oy=-b/2;
 return asGroup('L',[gPiece(x,y,rot,boxPts(ox,oy,ox+a,oy+t),'bar'),gPiece(x,y,rot,boxPts(ox,oy,ox+t,oy+b),'bar')]); }
// cross: one girder laid over another; off slides the crossing along the first
function shapeCross(x,y,a,b,t,off,rot){
 return asGroup('cross',[gPiece(x,y,rot,boxPts(-a/2,-t/2,a/2,t/2),'bar'),gPiece(x,y,rot,boxPts(off-t/2,-b/2,off+t/2,b/2),'bar')]); }
function turnPts(pts,a){ return rotPts(pts,a); }
const CMP_KINDS=['capped','pierced','star','finned','stack'];
// r is the group's rough radius, matched to the singles it stands among.
function shapeCompound(R,x,y,r,rot,kind){
 kind=kind||CMP_KINDS[(R()*CMP_KINDS.length)|0];
 if(kind==='capped') // a triangle over a square: a block with its prow still on
  return asGroup('cmp',[gPiece(x,y,rot,boxPts(-r*0.6,-r*0.35,r*0.6,r*0.85),'square'),
   gPiece(x,y,rot,[[0,-r*1.05],[r*0.55,-r*0.1],[-r*0.55,-r*0.1]],'tri-iso')]);
 if(kind==='pierced'){ // a rhombus run through a bunker
  const n=[6,7,9][(R()*3)|0], a=R()*6.283;
  return asGroup('cmp',[gPiece(x,y,rot,ngonPts(0,0,r*0.72,n,a),NGON_SH[n]),
   gPiece(x,y,rot,[[r*1.3,0],[0,r*0.26],[-r*1.3,0],[0,-r*0.26]],'rhombus')]); }
 if(kind==='star') // two plates crossed at 45°: an eight-point star
  return asGroup('cmp',[gPiece(x,y,rot,boxPts(-r*0.6,-r*0.6,r*0.6,r*0.6),'square'),
   gPiece(x,y,rot,turnPts(boxPts(-r*0.6,-r*0.6,r*0.6,r*0.6),0.7854),'square')]);
 if(kind==='finned'){ // a core with a fin either side: a station hub
  const n=R()<0.5?7:9;
  return asGroup('cmp',[gPiece(x,y,rot,ngonPts(0,0,r*0.62,n,R()*6.283),NGON_SH[n]),
   gPiece(x,y,rot,[[r*1.15,0],[r*0.3,r*0.36],[r*0.3,-r*0.36]],'tri-iso'),
   gPiece(x,y,rot,[[-r*1.15,0],[-r*0.3,-r*0.36],[-r*0.3,r*0.36]],'tri-iso')]); }
 // stack: slabs slumped on one another
 return asGroup('cmp',[gPiece(x,y,rot,boxPts(-r*0.75,-r*0.55,r*0.15,r*0.35),'square'),
  gPiece(x,y,rot,turnPts(boxPts(-r*0.4,-r*0.4,r*0.4,r*0.4),0.42).map(q=>[q[0]+r*0.3,q[1]+r*0.25]),'square'),
  gPiece(x,y,rot,[[-r*0.2,-r*0.35],[r*0.8,-r*0.35],[-r*0.2,-r*0.95]],'tri-right')]);
}
function obsCX(o){ return o.kind==='rect'?o.x+o.w/2:o.x; }
function obsCY(o){ return o.kind==='rect'?o.y+o.h/2:o.y; }
function obsRadius(o){ return o.kind==='rect'?Math.hypot(o.w,o.h)/2:o.r; }
// Spacing test for a candidate against what is already placed. Rect-vs-rect gets
// an exact AABB test so long girders can sit near blocks instead of being
// rejected by an oversized bounding radius; everything else uses bounding circles.
// Pieces of one compound share `grp` and may overlap each other.
function obsClash(cand,obs,pad){
 const cr=obsRadius(cand), cx=obsCX(cand), cy=obsCY(cand);
 for(const b of obs){
  if(cand.grp!==undefined&&b.grp===cand.grp) continue;
  if(cand.kind==='rect'&&b.kind==='rect'){
   if(cand.x<b.x+b.w+pad&&cand.x+cand.w+pad>b.x&&cand.y<b.y+b.h+pad&&cand.y+cand.h+pad>b.y) return true;
   continue;
  }
  const dx=cx-obsCX(b), dy=cy-obsCY(b), rr=cr+obsRadius(b)+pad;
  if(dx*dx+dy*dy<rr*rr) return true;
 }
 return false;
}
// cand is one obstacle or a compound's piece list; a compound goes in whole
// or not at all, and every piece passes the same tests a single would.
function place(obs,C,cand,pad){
 const list=Array.isArray(cand)?cand:[cand];
 for(const o of list){ const cx=obsCX(o), cy=obsCY(o), cr=obsRadius(o);
  if(!C.inBounds(cx,cy,cr+8)) return false;
  if(C.clearOfSpawn(cx,cy,cr)) return false;
  if(obsClash(o,obs,pad===undefined?24:pad)) return false; }
 if(list.length>1){ const id=(C.grp=(C.grp||0)+1); for(const o of list) o.grp=id; }
 for(const o of list) obs.push(o);
 return true;
}
// ---------- layout archetypes ----------
// Six recognisable layout types instead of one grid and one scatter, so two
// sectors at the same depth no longer look like the same map with the blocks
// shuffled. Every one is still BFS-validated downstream. Each keeps its own
// shape palette so it reads the same at any depth: debris is shards and
// rhombi, corridors are raked girders, bastion is heptagon and nonagon
// bunkers, spokes are kites and bars, the arena is a ring of mixed polygons,
// and scatter draws from everything.
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
   const jx=PX0+cx*cw+R()*cw, jy=PY0+cy*ch+R()*ch, roll=R(), rot=R()*6.283;
   let cand;
   if(roll<0.14) cand={kind:'circle',x:jx,y:jy,r:(22+R()*30)*sz};             // comm tower
   else if(roll<0.32) cand=shapeTri(jx,jy,(34+R()*30)*sz,rot,'iso');         // shard
   else if(roll<0.42) cand=shapeTri(jx,jy,(28+R()*22)*sz,rot,'right');       // cut plate
   else if(roll<0.56){ const ra=(34+R()*30)*sz; cand=shapeRhombus(jx,jy,ra,ra*(0.38+R()*0.24),rot); } // diamond shard
   else if(roll<0.64) cand=shapeNGon(jx,jy,(26+R()*26)*sz,6,rot);            // hex pylon
   else if(roll<0.72) cand=shapeBar(jx,jy,(70+R()*90)*sz,(20+R()*16)*sz,rot); // barricade
   else if(roll<0.78) cand=shapeWedge(jx,jy,(30+R()*26)*sz,rot);             // prow
   else if(roll<0.90){ const w=(50+R()*80)*sz, h=(50+R()*80)*sz; cand={kind:'rect',x:jx-w/2,y:jy-h/2,w,h}; }
   else cand=shapeCompound(R,jx,jy,(30+R()*18)*sz,rot,R()<0.6?'pierced':(R()<0.5?'capped':'stack')); // shards fused
   if(place(obs,C,cand,24)) break;
  }
 }
 // landmark: a 3-pylon avenue far from spawn — reads as intentional architecture
 for(let t=0;t<12;t++){
  const ax=R()*6.283, lx=C.px+Math.cos(ax)*(340+R()*300), ly=C.py+Math.sin(ax)*(260+R()*220);
  if(!C.inBounds(lx,ly,120)) continue;
  const tilt=R()*6.283, lr=(26+R()*12)*sz, step=Math.max(92,lr*2+12); // pylons never touch: deep sectors grow them
  const trio=[0,1,2].map(k=>shapeNGon(lx+Math.cos(tilt)*step*k,ly+Math.sin(tilt)*step*k,lr,6,tilt));
  if(trio.every(o=>C.inBounds(o.x,o.y,o.r+8)&&!C.clearOfSpawn(o.x,o.y,o.r)&&!obsClash(o,obs,24))){ for(const o of trio) obs.push(o); break; }
 }
}
// A pillar of the arena ring: round-ish polygons of several orders, so the
// ring reads as salvage gathered in a circle rather than one cast repeated.
const RING_N=[6,7,9,10,8,4,3,5];
function ringPillar(R,x,y,r,a){
 const n=RING_N[(R()*RING_N.length)|0];
 if(n===4) return shapeSquare(x,y,r*1.45,a+R()*1.57);
 if(n===3) return shapeTri(x,y,r*1.2,a+R()*2.09,'eq');
 return shapeNGon(x,y,r,n,a);
}
function layoutArena(R,obs,C,idx){
 // Open duelling floor: a pillar ring outside the clearing, heavy bunkers on the
 // rim, nothing in the middle. Boss nests use this — a large body cannot wedge
 // itself on terrain that simply is not there.
 const sz=C.sizeJ, span=Math.min(PX1-PX0,PY1-PY0)*0.5;
 const ringR=Math.min(C.clearR+90+R()*70,span-60);
 const n=6+((R()*5)|0);
 for(let k=0;k<n;k++){ const a=k/n*6.283+R()*0.3;
  place(obs,C,ringPillar(R,C.px+Math.cos(a)*ringR,C.py+Math.sin(a)*ringR,(24+R()*16)*sz,a),26); }
 const m=5+((R()*5)|0)+Math.min(6,idx>>1);
 for(let k=0;k<m;k++) for(let t=0;t<22;t++){
  const a=R()*6.283, rad=ringR+80+R()*300;
  const x=C.px+Math.cos(a)*rad, y=C.py+Math.sin(a)*rad, roll=R(), r=(34+R()*30)*sz, rot=R()*6.283;
  const cand=roll<0.3?shapeNGon(x,y,r,R()<0.5?10:9,rot)
   :(roll<0.44?shapeBar(x,y,(90+R()*110)*sz,(22+R()*16)*sz,rot)
   :(roll<0.58?shapePara(x,y,(90+R()*110)*sz,(22+R()*16)*sz,(12+R()*14)*sz*(R()<0.5?-1:1),rot)
   :(roll<0.72?{kind:'rect',x:x-r,y:y-r*0.7,w:r*2,h:r*1.4}
   :(roll<0.86?shapeCompound(R,x,y,r*0.95,rot,['star','finned','capped'][(R()*3)|0])
   :shapeNGon(x,y,r*0.9,7,rot)))));
  if(place(obs,C,cand,28)) break;
 }
}
function layoutCorridors(R,obs,C,idx){
 // Lanes of girders with deliberate gaps, sometimes diagonal. Fights here are
 // about corners and firing angles rather than open-field circling. Girders
 // are raked parallelograms; now and then a lane turns a corner in an L.
 const sz=C.sizeJ, diag=R()<0.4, lanes=3+((R()*3)|0);
 for(let k=0;k<lanes;k++){
  const horiz=R()<0.5, segs=2+((R()*3)|0);
  const rot=diag?(R()<0.5?0.7854:-0.7854):(horiz?0:1.5708);
  for(let sN=0;sN<segs;sN++) for(let t=0;t<16;t++){
   const x=PX0+60+R()*(PX1-PX0-120), y=PY0+60+R()*(PY1-PY0-120), roll=R();
   const w=(150+R()*220)*sz, h=(22+R()*14)*sz;
   const cand=roll<0.68?shapePara(x,y,w,h,h*(0.5+R()*0.7)*(R()<0.5?-1:1),rot)
    :(roll<0.88?shapeBar(x,y,w,h,rot)
    :shapeL(x,y,w*0.62,(90+R()*90)*sz,h,rot+((R()*4)|0)*1.5708));
   if(place(obs,C,cand,30)) break;
  }
 }
 const p=4+((R()*4)|0);
 for(let k=0;k<p;k++) for(let t=0;t<16;t++){
  const x=PX0+50+R()*(PX1-PX0-100), y=PY0+50+R()*(PY1-PY0-100), r=(24+R()*20)*sz;
  if(place(obs,C,R()<0.6?{kind:'circle',x,y,r}:shapeSquare(x,y,r*1.5,R()*6.283),26)) break;
 }
}
function layoutBastion(R,obs,C,idx){
 // Heavy heptagon and nonagon bunkers with lighter scatter filling the gaps.
 const sz=C.sizeJ, big=3+((R()*3)|0);
 for(let k=0;k<big;k++) for(let t=0;t<24;t++){
  const x=PX0+90+R()*(PX1-PX0-180), y=PY0+90+R()*(PY1-PY0-180), roll=R(), rot=R()*6.283;
  const cand=roll<0.84?shapeNGon(x,y,(58+R()*36)*sz,roll<0.42?7:9,rot)
   :shapeCompound(R,x,y,(56+R()*26)*sz,rot,'finned');
  if(place(obs,C,cand,34)) break;
 }
 const small=9+((R()*7)|0)+Math.min(10,idx);
 for(let k=0;k<small;k++) for(let t=0;t<20;t++){
  const x=PX0+50+R()*(PX1-PX0-100), y=PY0+50+R()*(PY1-PY0-100), roll=R();
  const cand=roll<0.3?shapeNGon(x,y,(22+R()*20)*sz,6,R()*6.283)
   :(roll<0.5?shapeNGon(x,y,(22+R()*18)*sz,7,R()*6.283)
   :(roll<0.72?{kind:'circle',x,y,r:(20+R()*18)*sz}
   :(roll<0.88?shapeTrap(x,y,(56+R()*46)*sz,(40+R()*30)*sz,R()*6.283)
   :shapeSquare(x,y,(34+R()*22)*sz,R()*6.283))));
  if(place(obs,C,cand,24)) break;
 }
}
function layoutSpokes(R,obs,C,idx){
 // Radial avenues running out of the clearing, gaps between the arms. Each
 // arm ends in a kite pointing outward, and kites drift in the gaps.
 const sz=C.sizeJ, arms=4+((R()*4)|0), base=R()*6.283, start=C.clearR+70;
 for(let k=0;k<arms;k++){
  const a=base+k/arms*6.283, segs=2+((R()*3)|0);
  for(let sN=0;sN<segs;sN++){
   const rad=start+sN*(130+R()*90);
   place(obs,C,shapeBar(C.px+Math.cos(a)*rad,C.py+Math.sin(a)*rad,(120+R()*110)*sz,(22+R()*14)*sz,a+1.5708),28);
  }
  const rad2=start+segs*(140+R()*60);
  place(obs,C,shapeKite(C.px+Math.cos(a)*rad2,C.py+Math.sin(a)*rad2,(38+R()*22)*sz,a),26);
 }
 const fill=5+((R()*5)|0);
 for(let k=0;k<fill;k++) for(let t=0;t<16;t++){
  const x=PX0+60+R()*(PX1-PX0-120), y=PY0+60+R()*(PY1-PY0-120);
  if(place(obs,C,R()<0.5?{kind:'circle',x,y,r:(22+R()*22)*sz}:shapeKite(x,y,(34+R()*26)*sz,R()*6.283),26)) break;
 }
}
// Scatter draws from the whole vocabulary: every single form, both built
// blocks (L and cross) and every compound.
function layoutScatter(R,obs,C,idx){
 const sz=C.sizeJ, n=10+((R()*6)|0)+Math.min(10,idx);
 for(let i=0;i<n;i++) for(let t=0;t<24;t++){
  const x=PX0+50+R()*(PX1-PX0-100), y=PY0+50+R()*(PY1-PY0-100), roll=R(), rot=R()*6.283;
  let cand;
  if(roll<0.12) cand={kind:'circle',x,y,r:(26+R()*40)*sz};
  else if(roll<0.26) cand=shapeNGon(x,y,(28+R()*32)*sz,[5,6,7,9,10][(R()*5)|0],rot);
  else if(roll<0.36) cand=shapeTri(x,y,(34+R()*28)*sz,rot,['eq','iso','right'][(R()*3)|0]);
  else if(roll<0.42) cand=shapeSquare(x,y,(44+R()*40)*sz,rot);
  else if(roll<0.48){ const ra=(38+R()*30)*sz; cand=shapeRhombus(x,y,ra,ra*(0.4+R()*0.25),rot); }
  else if(roll<0.54) cand=shapeKite(x,y,(38+R()*30)*sz,rot);
  else if(roll<0.60) cand=shapeWedge(x,y,(32+R()*28)*sz,rot);
  else if(roll<0.68){ const w=(80+R()*120)*sz, h=(24+R()*18)*sz; cand=R()<0.5?shapeBar(x,y,w,h,rot):shapePara(x,y,w,h,h*(0.5+R()*0.7),rot); }
  else if(roll<0.76){ const w=(50+R()*110)*sz, h=(50+R()*110)*sz; cand={kind:'rect',x:x-w/2,y:y-h/2,w,h}; }
  else if(roll<0.82){ const t2=(24+R()*14)*sz; cand=shapeL(x,y,(90+R()*80)*sz,(70+R()*70)*sz,t2,rot); }
  else if(roll<0.88){ const t2=(22+R()*12)*sz, a2=(90+R()*80)*sz; cand=shapeCross(x,y,a2,(70+R()*60)*sz,t2,(R()-0.5)*a2*0.5,rot); }
  else cand=shapeCompound(R,x,y,(36+R()*22)*sz,rot);
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
 unsealGroups(obs,C);
}
// A compound is concave where its pieces meet. Against the rim or another
// hull that notch can close off floor nothing can reach, and a hostile
// wedged there would hold a sector open. On the validator's grid, any group
// beside an open cell the drop cannot reach is lifted out whole.
function unsealGroups(obs,C){
 if(!obs.some(o=>o.grp!==undefined)) return;
 const cols=Math.floor((PX1-PX0)/CELL), rows=Math.floor((PY1-PY0)/CELL), N=cols*rows;
 const blocked=new Uint8Array(N), seen=new Uint8Array(N);
 for(let k=0;k<N;k++) blocked[k]=pointBlocked(PX0+(k%cols)*CELL+CELL/2,PY0+((k/cols)|0)*CELL+CELL/2,16,obs)?1:0;
 const s=clamp(Math.floor((C.py-PY0)/CELL),0,rows-1)*cols+clamp(Math.floor((C.px-PX0)/CELL),0,cols-1);
 if(blocked[s]) return;
 const q=[s]; seen[s]=1;
 while(q.length){ const c=q.pop(), cx=c%cols, cy=(c/cols)|0;
  if(cx>0&&!seen[c-1]&&!blocked[c-1]){ seen[c-1]=1; q.push(c-1); }
  if(cx<cols-1&&!seen[c+1]&&!blocked[c+1]){ seen[c+1]=1; q.push(c+1); }
  if(cy>0&&!seen[c-cols]&&!blocked[c-cols]){ seen[c-cols]=1; q.push(c-cols); }
  if(cy<rows-1&&!seen[c+cols]&&!blocked[c+cols]){ seen[c+cols]=1; q.push(c+cols); } }
 const lift={}, pieces=obs.filter(o=>o.grp!==undefined);
 for(let k=0;k<N;k++){ if(blocked[k]||seen[k]) continue;
  const x=PX0+(k%cols)*CELL+CELL/2, y=PY0+((k/cols)|0)*CELL+CELL/2;
  for(const o of pieces) if(!lift[o.grp]&&pointBlocked(x,y,16+CELL,[o])) lift[o.grp]=1; }
 for(let k=obs.length-1;k>=0;k--) if(obs[k].grp!==undefined&&lift[obs[k].grp]) obs.splice(k,1);
}
function genArenaValidated(baseSeed, idx, spawnTypes){
 const theme=sectorTheme(idx);
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
// Ordinary enemies get their own HP curve on top of eHpScale (spec §7), fitted
// by the fight simulator (test.js --only fightsim). eHpScale itself is the boss
// engine's and stays put. S1-S9 are left alone (the early sectors are already
// paced by a thin gun); from S9 a linear lift of `ramp` per sector, steepening
// by `late` from S60, up to +`cap`: x1.44 at S46, x1.96 at S71, x2.86 at S99. A
// multi-barrel build is still paced by the stream, not by the HP; the lift is
// what keeps a mixed build from strolling through deep sectors, and it stops
// short of walling one through the S31-S61 stretch (the sim's Balanced build).
const FOE_HP={ ramp:0.012, from:8, late:0.02, lateFrom:59, cap:2.2 };
function eHpScaleFoe(a){ const f=FOE_HP; return eHpScale(a)*(1+Math.min(f.cap,f.ramp*Math.max(0,a-f.from)+f.late*Math.max(0,a-f.lateFrom))); }
let uidC=1;
function mkEnemy(type,x,y,a){
 const boss=type==='boss';
 const hm=boss?eHpScale(a):eHpScaleFoe(a), dm=eDmgScale(a);
 const b=EBASE[type];
 const j=0.9+Math.random()*0.2;
  return { type, kind:null, x, y, r:b.r, hp:b.hp*hm, maxhp:b.hp*hm, sp:b.sp*j*(1+Math.min(0.25,0.02*a)), dmg:Math.round(b.dmg*dm),
   xp:(boss||isBossSector(a))?b.xp:b.xp*compXpScale(a), uid:uidC++, orbCd:0, slowT:0, burnT:0, burnDps:0, lastHit:timeSec, t:Math.random()*10, fireCd:1+Math.random()*1.5, slamCd:1.5, windup:0,
  dashState:0, strafeT:0.8+Math.random()*0.8, dashT:0, dashDx:0, dashDy:0, strafeDir:Math.random()<0.5?1:-1,
  aimT:0, flash:0, contactCd:0, phase:0, phaseT:0, burstT:0, charging:false, chargeDx:0, chargeDy:0, teleCd:2, spirT:0,
  mode:'hunt', modeT:8, warnT:0, warnX:0, warnY:0, phased:false, spawned:[], spdMul:1, bname:'',
  canRecover:false, desperate:false, retreatHp:0, laser:null, laserT:3, beamT:0, beamA:0, wave2:false,
   wob:Math.random()*6.28, vscale:0.92+Math.random()*0.16, spawnT:0.5 };
}
// ---------- boss roster ----------
// Twenty gods, one per nest (LADDER). Each god's whole definition (stats, kit,
// signature, recovery, phases, drawing, hit shape, codex note and debut line)
// lives in its own delimited block in the ladder section below, registered in
// BOSS_KITS. BOSSDEF is derived from those blocks, so there is one copy of
// every number. A kit's `def`:
//   name, epithet, tier : rank on the ladder (TIER_NAMES). Debut is NOT typed:
//               it is the god's rung, 5 x (LADDER index + 1).
//   hp        : pre-scale base, multiplied by eHpScale(sector)
//   r, spd    : hull radius and speed multiplier
//   pt        : seconds per slot of the kit's attack `cycle`
//   sig       : the signature's tag (read by combat code: 'vent' is the prow)
//   chaff     : the ordinary enemies its 'summon' attack throws in
const TIER_NAMES=['CHAFF','ENFORCER','CAPTAIN','LORD','SOVEREIGN','APEX'];
const BOSS_KITS={}; // kind -> kit, filled by the ladder blocks
const BOSSDEF={};   // kind -> def, derived from BOSS_KITS once the blocks have run
// Summoned gods (spec §2): tough enough to justify the sector they appear in,
// never a copy of the lead. (tune) — the fight simulator sets these.
const SUMMON_HP=0.45;   // of that kind's lead HP AT THIS SECTOR, again per link
const SUMMON_DMG=0.85, SUMMON_SIZE=0.85;
const SUMMON_LIVE_CAP=2; // alive at once, except a kit that calls past it (the Convocation)
// The recovery economy (RECOV_OPEN, RECOV_POOL, RELENTLESS) lives with the
// recovery framework in the boss engine below.
// Phase thresholds (spec §3.7): a kit's own `phases` list (one entry per
// phase, phase I first, later entries carry `at`), else its debut band's:
// one phase to S20, two to S45 (at 50%), three to S95 (66% and 33%).
function phaseAt(kind){ const k=BOSS_KITS[kind];
 if(k&&Array.isArray(k.phases)) return k.phases.slice(1).map(q=>q.at).filter(v=>v>0);
 const d=BOSSDEF[kind]?BOSSDEF[kind].debut:5; return d<=20?[]:d<=45?[0.5]:d<=95?[0.66,0.33]:[]; }
// One constructor for leads and summoned gods, so the two can never drift.
function bossCore(kind,x,y,s,chain){
 const kn=BOSS_KITS[kind]?kind:'overlord', kit=BOSS_KITS[kn], d=kit.def;
 const e=mkEnemy('boss',x,y,s);
 e.kind=kn; e.def=d; e.kit=kit; e.bname=d.name; e.r=d.r;
 // Shared scaling, not a second inline copy of the formula. One lead per nest,
 // so a lead is always a whole god: the old court divisor is gone.
 e.maxhp=e.hp=d.hp*eHpScale(s);
 e.dmg=Math.round(15*eDmgScale(s));
 e.mode='hunt'; e.modeT=8;
 // Recovery is the kit's own (kit.recover), threshold-armed, pool-capped.
 e.recLeft=kit.recover&&kit.recover.at?kit.recover.at.slice():[]; e.rec=null; e.healPool=0;
 e.fightT=0; e.hardEnrage=false; e.hunger=0; e.relentlessT=relentlessFor(s+1);
 e.beatT=0; e.hpSeen=e.hp; e.armor=1;
 e.stuckT=0; e.sampleT=0.5; e.lastX=x; e.lastY=y; e.intent=0; e.surgeT=0; e.path=null; e.wedgeT=0;
 e.spdMul=d.spd; e.sp*=d.spd;
 e.phase=0; e.phaseT=0; e.atk=null; e.segs=[]; e.wards=[]; e.split=0; e.parts=[]; e.hitParts=[];
 e.gazeT=2.5+Math.random(); e.zoneT=2; e.ramT=1; e.wellT=2;
 e.ph=1; e.phAt=phaseAt(kn);
 e.depth=0; e.summoned=false; e.lead=false; e.sumLeft=summonAt(kn); e.sumRetry=0;
 e.px=x; e.py=y; e.blinkAt=-1;
 if(chain){
  // A summoned god (spec §2): SUMMON_HP of that kind's lead HP at THIS sector,
  // again for every link, SUMMON_DMG of its damage at SUMMON_SIZE. It never
  // recovers, never banks the permanent bonus, runs its Phase-1 kit only, and
  // calls once, at 50%, only while the nest's chain depth allows another link.
  chain=Math.max(1,chain|0);
  e.maxhp=e.hp=d.hp*eHpScale(s)*Math.pow(SUMMON_HP,chain);
  e.dmg=Math.round(15*eDmgScale(s)*SUMMON_DMG);
  e.r=d.r*SUMMON_SIZE;
  e.summoned=true; e.depth=chain;
  e.recLeft=[]; e.phAt=[]; e.hpSeen=e.hp;
  e.sumLeft=(chain<maxChainDepth(s+1)&&summonsOf(kn).length)?[0.5]:[];
 }
 if(kit.init) kit.init(e);
 return e;
}
function mkBoss(kind,x,y,s){ return bossCore(kind,x,y,s,0); }
function mkSummoned(kind,x,y,s,chain){ return bossCore(kind,x,y,s,Math.max(1,chain|0)); }
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
 bullets=[]; ebullets=[]; gems=[]; parts=[]; floaters=[]; rings=[]; hazards=[]; strikes=[]; beams=[]; portal=null; clearBossState();
 spawnQueue=[]; spawnT=0;
 upgradeCounts={};
 player=newPlayer(1+0.02*bosses);
 starterOffered=false; pendingLevels=0; pendingNest=0; pity={spd:0,pcell:0};
 replaySnap=null; hubNote=null;
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
const RUN_V=2;
// v1 -> v2 (the ladder, spec §4.5). Level, cards and cleared sectors carry over
// untouched. No nest roster was ever saved, so every nest is rebuilt from the
// ladder on entry, and a save sitting inside a nest (galaxySel on it) simply
// restarts that nest from the hub.
function migrateRun(r){ if(r&&typeof r==='object'&&r.v===1) return Object.assign({},r,{v:2}); return r; }
function runSnap(){
 return { v:RUN_V, runSeed, arenaIdx, kills, arenasCleared, timeSec, upgradeCounts,
   starterOffered, pendingLevels, pendingNest, clearedMax, galaxySel, pity,
  player:Object.assign({},player,{recall:null,channel:null,status:statusFresh()}) };
}
// A replay saves the hull as it went in, never what happens inside it, so a
// reload mid-replay resumes on exactly the same state the replay restores.
function saveRun(){
 if(!player) return;
 lsSet('run',JSON.stringify(replaySnap||runSnap()));
}
// Shared by CONTINUE and the end of a replay: the run exactly as snapshotted.
function applySnap(r){
 runSeed=r.runSeed>>>0;
 kills=r.kills|0; arenasCleared=r.arenasCleared|0; timeSec=+r.timeSec||0;
 upgradeCounts=Object.assign({},r.upgradeCounts);
 // Merge onto fresh defaults, so a save written before a field existed still loads.
 player=Object.assign(newPlayer(1),r.player,{recall:null,channel:null,status:statusFresh()});
 starterOffered=!!r.starterOffered; pendingLevels=r.pendingLevels|0; pendingNest=r.pendingNest|0;
 pity=Object.assign({spd:0,pcell:0},r.pity);
 clearedMax=Math.max(-1,r.clearedMax|0); galaxySel=clamp(r.galaxySel|0,0,clearedMax+1);
 arenaIdx=r.arenaIdx|0;
}
// ---------- replays ----------
// A cleared sector can be flown again, but only as a drill. The hull goes in
// exactly as it is and comes back exactly as it went in: HP, level, XP,
// shields, stasis and every card are restored on the way out, whether the
// replay ends at the EXIT, by quitting, or by losing the hull. Inside, no gems
// drop, XP never banks, nothing levels, no draft opens and a boss banks no
// damage — so sitting on an early sector can never farm a run overpowered.
// Codex entries still unlock: knowing a foe is not power.
let replaySnap=null;   // the run as it entered the replay; null outside one
let hubNote=null;      // {txt, at}: the hub says what a finished replay restored
function inReplay(){ return !!replaySnap; }
function endReplay(lost){
 const r=replaySnap; if(!r) return;
 replaySnap=null; applySnap(r);
 bullets=[]; ebullets=[]; gems=[]; rings=[]; hazards=[]; strikes=[]; beams=[]; portal=null; spawnQueue=[]; enemies=[]; floaters=[]; parts=[];
 clearBossState(); // nothing a god made inside the replay survives it
 exitArm=0; nestDraftAt=0;
 galaxySel=clearedMax+1; // back at the frontier: the way on is the next new sector
 const hull=Math.ceil(player.hp)+'/'+player.maxhp;
 hubNote={txt:lost?'HULL LOST IN REPLAY — restored from backup at '+hull+'. Nothing carried over.':'REPLAY OVER — hull back at '+hull+'. Nothing carried over.', at:performance.now()};
 setMusicCfg(TITLE_MUS); state='galaxy'; autoPaused=false;
 saveRun();
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
  const r=migrateRun(JSON.parse(raw));
  const ok=r&&r.v===RUN_V&&r.player&&typeof r.player==='object'&&isFinite(r.player.hp)&&r.player.hp>0&&isFinite(r.clearedMax)&&isFinite(r.galaxySel);
  runCacheRaw=raw; runCacheVal=ok?r:null; runCacheHit=true;
  return runCacheVal;
 }catch(e){ try{ runCacheRaw=lsGet('run')||'null'; }catch(_){ runCacheRaw='null'; } runCacheVal=null; runCacheHit=true; return null; }
}
function continueRun(){
 const r=readRun(); if(!r){ startRun(); return; }
 titleMusOk=false; replaySnap=null; hubNote=null;
 bullets=[]; ebullets=[]; gems=[]; parts=[]; floaters=[]; rings=[]; hazards=[]; strikes=[]; beams=[]; portal=null; clearBossState();
 spawnQueue=[]; spawnT=0;
 applySnap(r);
 loadArena(0); // live world behind the hub, as in startRun
 arenaIdx=r.arenaIdx|0;
 setMusicCfg(TITLE_MUS);
 state='galaxy'; autoPaused=false; titleConfirm=false;
 saveRun(); // a migrated save is written back at the current version
}
let titleConfirm=false, titleConfirmT=0; // NEW RUN over a saved run asks twice
let endInfo={src:null,newBest:false,at:0}; // what ended the last hull, for the end screen
let restartArm=0; // pause ABANDON asks twice, like NEW RUN
let exitArm=0; // EXIT with XP on the field asks twice, like NEW RUN
// ---------- S1 coach: three contextual callouts, each once ----------
// No first-run onboarding: the title intro is the only teaching prose, and
// touch stays a disclaimer (see #hint-touch). In S1 three moments get one
// quiet line each — move/aim at the start, what the first unlock did, and
// the gate/exit once the sector clears. Each is dismissed by Enter or by
// doing the thing it names, then never shown again (kriefne_coach).
let coachSeenMap={};
try{ const cc=JSON.parse(lsGet('coach')||'{}'); if(cc&&typeof cc==='object') coachSeenMap=cc; }catch(e){}
function coachSeen(id){ return !!coachSeenMap[id]; }
function markCoach(id){ if(!id||coachSeenMap[id]) return; coachSeenMap[id]=true; try{ lsSet('coach',JSON.stringify(coachSeenMap)); }catch(e){} }
function coachIsCoarse(){ try{ return !!(window.matchMedia&&window.matchMedia('(pointer:coarse)').matches); }catch(e){ return false; } }
function coachStep(){
 try{
  if(!player||state!=='playing'||arenaIdx!==0) return null;
  if(!coachSeenMap.move&&!player.dashUnlocked&&!player.recallUnlocked&&!portal) return 'move';
  if(!coachSeenMap.dash&&(player.dashUnlocked||player.recallUnlocked)&&!portal) return 'dash';
  if(!coachSeenMap.gate&&portal) return 'gate';
 }catch(e){}
 return null;
}
function coachLines(step){
 if(step==='move'){
  if(coachIsCoarse()) return ['TOUCH TO AIM · TAP MENUS — KEYBOARD + MOUSE FOR FULL RUNS'];
  return ['WASD MOVE · MOUSE AIM — CLEAR THE SECTOR'];
 }
 if(step==='dash'){
  const d=player&&player.dashUnlocked, g=player&&player.recallUnlocked;
  if(d&&g) return ['DASH + GATE READY — SPACE DASHES · E SETS GATE'];
  if(d) return ['DASH READY — SPACE (I-FRAMES)'];
  return ['GATE READY — E SETS GATE · E AGAIN BLINKS'];
 }
 if(step==='gate') return ['EXIT TAKES YOU OUT — GRAB XP FIRST · [E] TO LEAVE'];
 return [];
}
function dismissCoach(){ const s=coachStep(); if(s){ markCoach(s); SFX.click(); return true; } return false; }
function updateCoach(){
 try{
  if(!player||state!=='playing') return;
  if(arenaIdx!==0) return;
  if((player.dashUnlocked||player.recallUnlocked||portal)&&!coachSeenMap.move&&coachStep()!=='move') markCoach('move');
  if(portal&&!coachSeenMap.dash&&coachStep()!=='dash'&&(player.dashUnlocked||player.recallUnlocked)) markCoach('dash');
 }catch(e){}
}
function drawCoach(){
 const step=coachStep(); if(!step) return;
 const lines=coachLines(step); if(!lines.length) return;
 const cy=H-34;
 ctx.font=fM(12,600); let tw=0;
 for(const t of lines){ let w=t.length*7; try{ w=ctx.measureText(t).width; }catch(e){} tw=Math.max(tw,w); }
 tw=Math.min(tw,W-32);
 ctx.fillStyle=K.ground; ctx.fillRect(W/2-tw/2-16,cy-14,tw+32,20*lines.length+2);
 lines.forEach((t,i)=>mono(t,W/2,cy+i*18,12,K.text,'center',600));
 line(W/2-tw/2-16,cy+(lines.length-1)*18+6,W/2+tw/2+16,cy+(lines.length-1)*18+6,K.goldDim,1);
 mono('[Enter] dismiss',W/2,cy+(lines.length-1)*18+22,11,K.textDim,'center');
}
// Arrow selection rides alongside the number/letter shortcuts: every menu
// answers both. Indices reset when the menu opens.
let titleSel=0, titleRowCol=0, pauseSel=0, settingsSel=5, draftSel=0, endSel=0;
const ARM_MS=3000; // every destructive confirm drains over the same window
function confirmFrac(armT){ return clamp((armT-performance.now())/ARM_MS,0,1); }
function drainBar(x0,x1,y,frac){ if(frac<=0) return; line(x0,y,x0+(x1-x0)*clamp(frac,0,1),y,K.red,2); }
let draftAt=0, draftPress=-1; const DRAFT_GRACE=300; // a draft ignores the mouse briefly after opening: clicks meant as shots must not pick
function handleRelease(x,y){ if(state!=='levelup'||draftPress<0) return; const i=draftPress; draftPress=-1; const r=draftRect(i); if(levelChoices[i]&&x>r.x&&x<r.x+r.w&&y>r.y&&y<r.y+r.h) pickUpgrade(levelChoices[i]); }
function loadArena(i){
 arenaIdx=i;
 const s=i, boss=isBossSector(s);
 // larger worlds deeper down the trail
 const wz=sectorWorld(s); WW=wz.w; HH=wz.h;
 PX0=WALL; PY0=HUD_H+WALL; PX1=WW-WALL; PY1=HH-WALL;
 clearBossState(); // beams, marks, discs, zones, currents, grasps, boulders, ship status
 bullets=[]; ebullets=[]; gems=[]; rings=[]; hazards=[]; strikes=[]; beams=[]; portal=null; spawnQueue=[]; spawnT=1.4; sectorCleared=false; exitArm=0;
 nestSummonLeft=boss?summonBudgetFor(s+1):0;
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
 // The opening pack stays small (spec §7): the sector is the stream, not the first screen.
 const initial=boss?types.length:Math.min(types.length,wavePlan(s).initial);
 types.forEach((ty,k)=>{
  if(k<initial){
   const sp=g.spawns[k]||{x:PX0+80,y:PY0+80};
   const en=ty.indexOf('boss:')===0?mkBoss(ty.slice(5),sp.x,sp.y,s):mkEnemy(ty,sp.x,sp.y,s);
   if(en.type==='boss') en.lead=true; // the nest's one god; everything else it fields is summoned
   enemies.push(en);
  } else spawnQueue.push(ty);
 });
 if(boss){ bossWarnT=3.2; const kinds=bossKindsFor(s), lead=BOSSDEF[kinds[0]];
   // the arrival names the god and whom it will call, the same line the hub gave
   bossWarnTxt=lead.name+(s+1>100?' RETURNS':'');
   const ln=nestLore(s), tail=ln.indexOf(' — ')>=0?ln.slice(ln.indexOf(' — ')+3):ln;
   const sub=TIER_NAMES[lead.tier]+' · '+tail; bossWarnSub=sub.length<=86?[sub]:wrapLines(sub,Math.ceil(sub.length/2)+6).slice(0,2);
   nestTally={kinds:kinds.slice(),banked:0,firsts:[]}; SFX.alarm(); }
  setMusicCfg(g.theme);
  addFloater(player.x,player.y-30,sectorName(s)+' · '+g.theme.name.toUpperCase(),K.gold); enterT=performance.now();
}
// hostiles remaining this sector (alive + queued)
function hostiles(){ return enemies.length+spawnQueue.length; }
// Spawn point far from the player and out of walls. Called bare (boss code) it
// keeps its old 560-780px ring. Reinforcements pass a band (700-1000px, spec
// §7) and then also want to be OFF-SCREEN, so a pack is seen flying in rather
// than popping up beside the ship; a world too small to hide one (S1 fits on a
// big monitor) settles for the farthest free point found.
function spawnEdgePos(lo,hi){
 const p=player, m=36, band=lo!==undefined;
 if(!band){ lo=560; hi=780; }
 let best=null, bd=0;
 for(let t=0;t<(band?20:12);t++){
  const a=Math.random()*6.283, d=lo+Math.random()*(hi-lo);
  const x=clamp(p.x+Math.cos(a)*d,PX0+m,PX1-m), y=clamp(p.y+Math.sin(a)*d,PY0+m,PY1-m);
  const dx=x-p.x, dy=y-p.y, d2=dx*dx+dy*dy;
  if(d2<=380*380||pointBlocked(x,y,24,arena.obs)) continue;
  if(!band) return {x,y};
  const off=x<cam.x-40||x>cam.x+W+40||y<cam.y-40||y>cam.y+H+40;
  if(off&&d2>=lo*lo*0.64) return {x,y};
  if(d2>bd){ bd=d2; best={x,y}; }
 }
 if(best) return best;
 const fx=p.x<(PX0+PX1)/2?PX1-m-40:PX0+m+40, fy=p.y<(PY0+PY1)/2?PY1-m-40:PY0+m+40;
 return {x:clamp(fx,PX0+m,PX1-m), y:clamp(fy,PY0+m,PY1-m)};
}
// q: where to put it (a pack shares one point, jittered); default a fresh far point
function spawnEnemy(type,q){
 q=q||spawnEdgePos(700,1000);
 if(q.pack){ const a=Math.random()*6.283, r=18+Math.random()*44, x=clamp(q.x+Math.cos(a)*r,PX0+36,PX1-36), y=clamp(q.y+Math.sin(a)*r,PY0+36,PY1-36);
  if(!pointBlocked(x,y,20,arena.obs)) q={x,y}; }
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
 if(replaySnap) return; // a replay never banks XP, so it never levels or drafts
 player.xp+=v*player.xpBonus; SFX.pickup();
 while(player.xp>=player.xpNeed){
  player.xp-=player.xpNeed; player.level++; player.xpNeed=xpNeedFor(player.level); pendingLevels++;
  // Passive frame growth. Without it, deep sectors are only survivable by a
  // build that spends most of its draft picks on Nanoweave, which punishes
  // every interesting build. Enemy damage is tuned against this line.
  player.maxhp+=3; player.hp=Math.min(player.maxhp,player.hp+3);
 }
 if(pendingLevels>0&&state==='playing'){ pendingLevels--; openLevelUp(); }
 else if(pendingNest>0&&state==='playing'){ pendingNest--; openLevelUp(); nestDraftAt=performance.now(); }
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
  levelChoices=picks; floaters=[]; state='levelup'; draftAt=performance.now(); draftPress=-1; draftSel=0; SFX.levelup();
}
function pickUpgrade(u){
 if(!u) return;
 nestDraftAt=0;
 upgradeCounts[u.id]=(upgradeCounts[u.id]||0)+1; u.apply(player);
 addFloater(player.x,player.y-24,u.name,K.gold);
 if(u.r===2) SFX.rare(); else SFX.upgrade();
 state='playing';
 // A queued nest bonus still opens as the nest draft: disc, with its FALLS header.
 if(pendingNest>0){ pendingNest--; openLevelUp(); nestDraftAt=performance.now(); }
 else if(pendingLevels>0){ pendingLevels--; openLevelUp(); } // drain queued level-ups
}
function scoreCalc(){ return kills*50+arenasCleared*250+player.level*100+Math.max(0,1800-Math.floor(timeSec)*5); }
function die(){ state='gameover'; floaters=[]; clearRun(); const s=scoreCalc(); endInfo={src:player.lastSrc||null, newBest:s>best&&s>0, at:performance.now()}; if(endInfo.src) markSeen(endInfo.src.id); if(s>best) best=s; depth=Math.max(depth,arenaIdx+1); saveMeta(); SFX.lose(); stopMusic(); spawnBurst(player.x,player.y,40,K.gold,260,0.8,4); }

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
// ---------- boss engine ----------
// Every god runs through one dispatcher that reads its kit from BOSS_KITS, so a
// kit written in one boss block can never change another god's fight. The
// engine owns what every god shares: the attack cycle, summoning down the
// ladder, the phase count, the anti-stuck SURGE and the teleport policy.
// Global caps (spec §4.1): at a cap a spawn is skipped, never thrown.
const CAP={eb:420, haz:260, marks:16, beams:8, tempObs:6, parts:8, enemies:40};
// DevX lab: freezes every god's thinking. The lab also sets window.devAiFreeze.
let devAiFreeze=false;
function aiFrozen(){ try{ return !!(devAiFreeze||(typeof window!=='undefined'&&window&&window.devAiFreeze)); }catch(e){ return !!devAiFreeze; } }
let nestSummonLeft=0; // summoned gods this nest may still field, every link of every chain
const ROMAN=['','I','II','III','IV','V'];
function eshot(e,a,spd,r,dmgMul,life){ if(ebullets.length>=CAP.eb) return null; const b={x:e.x,y:e.y,vx:Math.cos(a)*spd,vy:Math.sin(a)*spd,r:r||6,dmg:Math.round(e.dmg*(dmgMul||1)),life:life||3.4,heavy:true}; ebullets.push(b); return b; }
// A round from a point other than the hull centre (a head, a flank, a rim).
function eshotAt(e,x,y,a,spd,r,dmgMul,life){ const b=eshot(e,a,spd,r,dmgMul,life); if(b){ b.x=x; b.y=y; } return b; }
// Ordinary enemies a boss throws into the fight. Flavour per boss, no hierarchy.
function summonChaff(e,n,cap){
 const kinds=(e.def&&e.def.chaff)||['drone'];
 let made=0;
 for(let i=0;i<n;i++){
  if(enemies.length>=Math.min(cap||9,CAP.enemies)) break;
  const s2=nearSpot(player.x,player.y,260,400,26);
  const m=mkEnemy(kinds[i%kinds.length],s2.x,s2.y,arenaIdx); m.spawnT=0.9; enemies.push(m);
  made++;
 }
 if(made) addFloater(e.x,calloutY(e),'SUMMON',K.red);
}
// ---------- the chain of command (spec §2) ----------
// A wounded god calls the god of the nest directly beneath it, at HP
// thresholds (summonAt), never on a timer. Four limits must all allow a call:
// the debut gate (never a god before its own solo nest), the nest budget, the
// live cap (a call waits for a free slot instead of stacking) and the chain
// depth (a summoned god calls again only while its link is shallow enough).
function liveSummoned(){ let c=0; for(const o of enemies) if(o.summoned&&!o.dead) c++; return c; }
function bossSummonCheck(e){
 if(!e.sumLeft||!e.sumLeft.length||e.echo) return;
 if(e.hp/e.maxhp>e.sumLeft[0]||e.sumRetry>0) return;
 const n=arenaIdx+1;
 let kinds=summonsOf(e.kind).filter(k=>BOSSDEF[k]&&BOSSDEF[k].debut<=n);
 if(e.summoned) kinds=kinds.slice(0,1); // a link below the lead calls one god, once
 if(!kinds.length||nestSummonLeft<=0){ e.sumLeft.shift(); return; }
 kinds=kinds.slice(0,nestSummonLeft);
 const pastCap=!e.summoned&&e.kit&&e.kit.summons&&e.kit.summons.pastCap;
 if((!pastCap&&liveSummoned()+kinds.length>SUMMON_LIVE_CAP)||enemies.length+kinds.length>CAP.enemies){ e.sumRetry=1; return; }
 e.sumLeft.shift();
 for(const k of kinds) summonBoss(e,k);
 addFloater(e.x,calloutY(e),e.bname+' CALLS '+callNames(kinds),K.red); SFX.alarm();
}
function summonBoss(e,kind){
 const s2=nearSpot(e.x,e.y,200,330,(BOSSDEF[kind].r||30)+10);
 const m=mkSummoned(kind,s2.x,s2.y,arenaIdx,(e.depth||0)+1);
 m.caller=e.uid; m.spawnT=0.9; enemies.push(m); nestSummonLeft--;
 rings.push({x:s2.x,y:s2.y,r:10,maxR:120,spd:300,dmg:0,hit:true});
 return m;
}
// ---------- teleport policy (spec §3.5) ----------
// A god changes position only by moving. The allow-list below is the whole of
// the exceptions: PHANTOM's blink is its kit, ECLIPSE and NULLIFIER may step
// only inside their own recovery, CHORUS may swap its echoes. Every jump goes
// through bossBlink, which refuses anything else and stamps the ones it allows,
// so the no-illegal-jump test can tell a legal blink from a bug.
const TELEPORT_OK={phantom:'always',eclipse:'recovery',nullifier:'recovery',chorus:'swap'};
function canBlink(e,why){ const r=TELEPORT_OK[e.kind]; if(!r) return false; if(r==='always') return true;
 if(r==='recovery') return e.mode==='recover'; return r==='swap'&&why==='swap'; }
function bossBlink(e,x,y,why){
 if(!canBlink(e,why)) return false;
 rings.push({x:e.x,y:e.y,r:8,maxR:70,spd:300,dmg:0,hit:true});
 e.x=clamp(x,PX0+e.r,PX1-e.r); e.y=clamp(y,PY0+e.r,PY1-e.r); resolveObstacles(e);
 e.blinkAt=timeSec; rings.push({x:e.x,y:e.y,r:8,maxR:70,spd:300,dmg:0,hit:true}); SFX.portal();
 return true;
}
// The fastest a god may legally travel (the no-teleport test's yardstick):
// enraged and hungry while surging, or its fastest committed charge.
const SURGE_MUL=1.9, SURGE_T=1.6;
function bossMaxSpeed(e){ const k=e.kit||{}; return Math.max(e.sp*1.35*1.35*SURGE_MUL+60,k.vmax||0,420); }
// Anti-stuck, without ever jumping. A god that is TRYING to move but goes
// nowhere (its intent, summed by mv/orbit/charges, far outruns its travel),
// or one that has drifted far from the fight, SURGES: a visible speed burst
// along a BFS path through open cells toward the ship. One wedged for over
// 4 s eases out along the nearest obstacle's normal. The old blink back to the
// player is gone, and so is the DESPERATE relocation (its minion surge stays).
function bossWatchdog(e,C){
 e.sampleT-=C.dt;
 if(e.sampleT<=0){ e.sampleT=0.5;
  const moved=Math.hypot(e.x-e.lastX,e.y-e.lastY); e.lastX=e.x; e.lastY=e.y;
  const hold=e.mode!=='hunt'; // a recovery beat holds its ground on purpose
  if(!hold&&e.intent>24&&moved<e.intent*0.35) e.stuckT+=0.5; else { e.stuckT=0; e.wedgeT=0; }
  e.intent=0;
  if(e.surgeT<=0&&!hold&&(e.stuckT>=1.5||C.d>900)) bossSurge(e,C.p);
 }
 if(e.stuckT>=4) bossSlide(e,C.dt);
}
function bossSurge(e,p){
 e.surgeT=SURGE_T; e.chargeOn=false; e.ramLx=undefined;
 e.path=bossPath(e,p.x,p.y);
 rings.push({x:e.x,y:e.y,r:e.r,maxR:e.r+46,spd:160,dmg:0,hit:true});
 addFloater(e.x,calloutY(e),(e.bname||'BOSS')+' SURGES',K.red); SFX.dash();
}
function bossSurgeMove(e,C){
 let tx=C.p.x, ty=C.p.y;
 if(e.path&&e.path.length){ if(Math.hypot(e.path[0].x-e.x,e.path[0].y-e.y)<30) e.path.shift(); if(e.path.length){ tx=e.path[0].x; ty=e.path[0].y; } }
 if(C.d<140){ e.surgeT=0; return; }
 const dx=tx-e.x, dy=ty-e.y, l=len(dx,dy), sv=steer(e,dx/l,dy/l), v=e.sp*SURGE_MUL*C.sF*(1+0.35*e.hunger);
 e.x+=sv[0]*v*C.dt; e.y+=sv[1]*v*C.dt; e.intent+=v*C.dt;
}
// BFS over the 40px grid from the god to (tx,ty); world waypoints, or null.
const NB4=[[1,0],[-1,0],[0,1],[0,-1]];
function bossPath(e,tx,ty){
 const obs=arena&&arena.obs; if(!obs) return null;
 const cols=Math.max(1,Math.floor((PX1-PX0)/CELL)), rows=Math.max(1,Math.floor((PY1-PY0)/CELL)), N=cols*rows;
 const cell=(x,y)=>clamp(Math.floor((y-PY0)/CELL),0,rows-1)*cols+clamp(Math.floor((x-PX0)/CELL),0,cols-1);
 const a=cell(e.x,e.y), b=cell(tx,ty); if(a===b) return null;
 const m=Math.min(e.r*0.7,CELL*0.6), st=new Uint8Array(N), prev=new Int32Array(N).fill(-1);
 const free=c=>{ if(!st[c]) st[c]=pointBlocked(PX0+(c%cols)*CELL+CELL/2,PY0+((c/cols)|0)*CELL+CELL/2,m,obs)?2:1; return st[c]===1; };
 prev[a]=a; const q=[a];
 for(let h=0;h<q.length&&prev[b]<0;h++){ const c=q[h], cx=c%cols, cy=(c/cols)|0;
  for(const d of NB4){ const nx=cx+d[0], ny=cy+d[1]; if(nx<0||ny<0||nx>=cols||ny>=rows) continue;
   const nc=ny*cols+nx; if(prev[nc]>=0) continue; if(nc!==b&&!free(nc)) continue; prev[nc]=c; q.push(nc); } }
 if(prev[b]<0) return null;
 const out=[]; for(let c=b;c!==a;c=prev[c]) out.push({x:PX0+(c%cols)*CELL+CELL/2,y:PY0+((c/cols)|0)*CELL+CELL/2});
 return out.reverse();
}
// Closest point of an obstacle's surface to (x,y).
function obsNearest(o,x,y){
 if(o.kind==='rect') return [clamp(x,o.x,o.x+o.w),clamp(y,o.y,o.y+o.h)];
 if(o.kind==='poly'){ const P=o.pts, n=P.length; let bd=1e18, bx=o.x, by=o.y;
  for(let i=0;i<n;i++){ const ax=o.x+P[i][0], ay=o.y+P[i][1], ex=o.x+P[(i+1)%n][0]-ax, ey=o.y+P[(i+1)%n][1]-ay, L2=ex*ex+ey*ey;
   let t=L2>0?((x-ax)*ex+(y-ay)*ey)/L2:0; t=clamp(t,0,1); const qx=ax+ex*t, qy=ay+ey*t, d=(qx-x)*(qx-x)+(qy-y)*(qy-y); if(d<bd){ bd=d; bx=qx; by=qy; } }
  return [bx,by]; }
 const dx=x-o.x, dy=y-o.y, l=len(dx,dy); return [o.x+dx/l*o.r,o.y+dy/l*o.r];
}
function bossSlide(e,dt){
 let bd=1e9, nx=0, ny=0, ox=0, oy=0;
 for(const o of arena.obs){ const q=obsNearest(o,e.x,e.y), d=Math.hypot(e.x-q[0],e.y-q[1]); if(d<bd){ bd=d; nx=e.x-q[0]; ny=e.y-q[1]; ox=obsCX(o); oy=obsCY(o); } }
 const wall=Math.min(e.x-PX0,PX1-e.x,e.y-PY0,PY1-e.y);
 if(wall<bd){ nx=(PX0+PX1)/2-e.x; ny=(PY0+PY1)/2-e.y; }
 else if(Math.hypot(nx,ny)<0.5){ nx=e.x-ox; ny=e.y-oy; } // inside it: straight out from its centre
 const l=len(nx,ny), v=120*dt; e.x+=nx/l*v; e.y+=ny/l*v;
 e.wedgeT+=dt; if(e.wedgeT>1.5){ e.stuckT=0; e.wedgeT=0; }
}
// ---------- recovery (spec §3.6) ----------
// "A god may mend only in the manner its makers built, only when wounded, and
// never once the contest has run too long." Each kit owns its recovery (the
// block's `recover`); the engine owns the rules every one obeys:
//   * triggered only by HP thresholds (recover.at, e.g. [0.55] or [0.55,0.3])
//   * never in the opening RECOV_OPEN seconds; never a summoned god or an echo
//   * every heal (bossHeal) draws on a pool of recover.pool x max HP (default
//     RECOV_POOL) granted per recovery, so a long one heals no more than a short
//   * RELENTLESS, at RELENTLESS_MUL x the band's target fight length, ends any
//     recovery in progress and switches every later one off
// recover={at, pool, label, hold, max, start(e,C), update(e,C) -> truthy when it
// ends (a string names why), end(e,why)}. `hold` keeps the anti-stuck watchdog
// off a god that stays put on purpose; `max` (s) is a hard stop.
const RECOV_OPEN=12, RECOV_POOL=0.08;
// Spec §6 targets, the top of each band (S5-S10 "as now"). (tune) per band.
const FIGHT_TARGET=[[10,90],[20,80],[45,105],[95,150],[100,210]], RELENTLESS_MUL=2;
function relentlessFor(n){ const L=ladderLevel(n); for(const q of FIGHT_TARGET) if(L<=q[0]) return q[1]*RELENTLESS_MUL; return 420; }
function bossHeal(e,amt){ if(e.healPool<=0) return; const h=Math.min(amt,e.healPool,e.maxhp-e.hp); if(h<=0) return; e.hp+=h; e.healPool-=h; }
function recoveryCheck(e,C){
 const R=e.kit&&e.kit.recover; if(!R||!e.recLeft||!e.recLeft.length||e.hardEnrage||e.summoned||e.echo) return false;
 if(e.fightT<RECOV_OPEN||e.hp/e.maxhp>e.recLeft[0]) return false;
 e.recLeft.shift();
 e.rec={t:0,label:R.label||'RECOVERING',hold:!!R.hold}; e.mode='recover';
 e.healPool=e.maxhp*(R.pool!=null?R.pool:RECOV_POOL);
 e.charging=false; e.chargeOn=false; e.laser=null; e.gaze=null;
 if(R.start) R.start(e,C);
 return true;
}
function recoveryTick(e,C){ const R=e.kit.recover; e.rec.t+=C.dt;
 let done=R.update?R.update(e,C):true; if(!done&&e.rec.t>=(R.max||8)) done='timeout';
 if(done) recoveryEnd(e,done===true?'broken':done); }
function recoveryEnd(e,why){ const R=e.kit&&e.kit.recover; if(e.rec&&R&&R.end) R.end(e,why); e.rec=null; e.mode='hunt'; e.phased=false; e.healPool=0; }
// ---------- phases (spec §3.7) ----------
// A phase change is a readable beat: PHASE_BEAT s in which the god holds still
// and is invulnerable (its only invulnerable window; the bar goes dashed), a
// ring pulse, the banner "<NAME> — PHASE II", and a tick on the bar for every
// phase passed. One beat per phase: a burst through two thresholds plays II
// then III. The kit's phases[i].enter(e) runs as phase i+1 begins; e.ph is the
// number a kit reads. Summoned gods and echoes never phase. The lab's
// e.forcedPhase steps forward through the beats, or back without one.
const PHASE_BEAT=0.8;
function bossPhaseCheck(e){
 if(e.summoned||e.echo||e.rec) return false;
 const max=1+e.phAt.length, f=e.hp/e.maxhp;
 let want=e.ph; while(want<max&&f<=e.phAt[want-1]) want++;
 const forced=(typeof e.forcedPhase==='number'&&e.forcedPhase>0)?clamp(e.forcedPhase|0,1,max):0;
 if(forced&&forced<e.ph){ e.ph=forced; return false; }
 if(forced>want) want=forced;
 if(want<=e.ph) return false;
 e.ph++; phaseBeat(e); return true;
}
function phaseBeat(e){
 e.mode='beat'; e.beatT=PHASE_BEAT; e.charging=false; e.chargeOn=false; e.ramLx=undefined; e.gaze=null; e.laser=null;
 rings.push({x:e.x,y:e.y,r:e.r,maxR:e.r+160,spd:260,dmg:0,hit:true});
 bossWarnT=1.6; bossWarnTxt=(e.bname||'BOSS')+' — PHASE '+(ROMAN[e.ph]||e.ph); bossWarnSub=[]; SFX.alarm();
 const P=Array.isArray(e.kit.phases)?e.kit.phases[e.ph-1]:null; if(P&&P.enter) P.enter(e);
}
// Damage that must not land is handed back once a frame, whatever dealt it:
// all of it during a phase beat, and (1 - e.armor) of it while a kit's armour
// is up (kit.armor(e) -> 0..1 of damage taken; HYDRA's heads, a closed wall).
function bossArmour(e){
 if(e.hpSeen===undefined) e.hpSeen=e.hp;
 if(e.hp<e.hpSeen&&e.hp>0){ const m=e.mode==='beat'?0:(e.armor!=null?e.armor:1); if(m<1) e.hp+=(e.hpSeen-e.hp)*(1-m); }
 e.hpSeen=e.hp;
}
// ---------- the dispatcher ----------
// Movement helpers every kit attack and recovery gets on C.
function bossCtx(e,C){
 const dt=C.dt;
 // hunger: disengaging makes it hunt harder, so running away never pays
 const spdM=(C.enrage?1.35:1)*(1+0.35*e.hunger);
 C.spdM=spdM; C.aim=Math.atan2(C.dy,C.dx);
 C.mv=f=>{ const sv=steer(e,C.nx,C.ny), v=e.sp*f*spdM*C.sF; e.x+=sv[0]*v*dt; e.y+=sv[1]*v*dt; e.intent+=v*dt; };
 C.orbit=f=>{ const t=e.sp*f*spdM*C.sF, r=C.d>320?60:-30; e.x+=(-C.ny*t+C.nx*r)*dt; e.y+=(C.nx*t+C.ny*r)*dt; e.intent+=Math.hypot(t,r)*dt; };
}
// Once a frame for every god in the hunt: the signature, then the kit's attack
// cycle, one slot every def.pt seconds. The DevX lab can pin an attack
// (e.forcedAttack loops it) or freeze all thought (devAiFreeze).
function bossThink(e,C){
 const kit=e.kit||BOSS_KITS.overlord, dt=C.dt;
 e.charging=false;
 if(kit.signature) kit.signature(e,C);
 if(e.surgeT>0){ bossSurgeMove(e,C); return; }
 e.phaseT+=dt;
 let name=null;
 if(e.forcedAttack&&kit.attacks[e.forcedAttack]) name=e.forcedAttack;
 else { const cyc=kit.cycle, pt=kit.def.pt||3;
  e.phase=Math.floor(e.phaseT/pt)%cyc.length;
  if(e.phaseT>=pt*cyc.length) e.phaseT=0;
  name=cyc[e.phase]; }
 // A charge, ram or gaze cut off by the slot change is dropped, not carried
 // over: a stale gaze would keep drawing its cone through other attacks.
 if(name!==e.atk){ e.chargeOn=false; e.ramLx=undefined; e.gaze=null; e.atk=name; }
 const fn=kit.attacks[name]; if(fn) fn(e,C);
 if(e.wave2){ e.burstT-=dt; if(e.burstT<=0){ e.wave2=false; rings.push({x:e.x,y:e.y,r:20,maxR:200,spd:340,dmg:e.dmg,hit:false,heavy:true}); SFX.ring(); } }
}
// One god, one frame, from the enemy loop in update().
function bossUpdate(e,C){
 const dt=C.dt;
 bossArmour(e);
 C.enrage=e.hp<e.maxhp*0.3||e.hardEnrage;
 if(e.beamT>0) e.beamT-=dt;
 if(e.surgeT>0) e.surgeT-=dt;
 if(e.sumRetry>0) e.sumRetry-=dt;
 e.fightT+=dt;
 // RELENTLESS: past twice its band's target length a fight stops offering outs
 if(!e.hardEnrage&&e.fightT>e.relentlessT){ e.hardEnrage=true; e.recLeft=[]; if(e.rec) recoveryEnd(e,'relentless'); e.healPool=0;
  addFloater(e.x,calloutY(e),(e.bname||'BOSS')+' RELENTLESS',K.red); SFX.alarm(); }
 // disengagement ramp: backing off never pays, the boss only hunts harder
 e.hunger=clamp((timeSec-e.lastHit-8)/12,0,1);
 if(aiFrozen()) return;
 if(e.mode==='beat'){ e.beatT-=dt; if(e.beatT<=0) e.mode='hunt'; return; }
 bossCtx(e,C);
 bossWatchdog(e,C);
 // desperation: first time below 30%, a minion surge. The god itself stays put:
 // the old relocation to a far edge was a jump, and a god moves only by moving.
 if(!e.desperate&&e.hp<e.maxhp*0.3){
  e.desperate=true;
  for(let k=0;k<3&&enemies.length<Math.min(16,CAP.enemies);k++){ const s2=spawnEdgePos(); const m=mkEnemy(['drone','stalker','mite'][k%3],s2.x,s2.y,arenaIdx); m.spawnT=0.9; enemies.push(m); }
  rings.push({x:e.x,y:e.y,r:10,maxR:110,spd:320,dmg:0,hit:true});
  addFloater(e.x,calloutY(e),(e.bname||'BOSS')+' DESPERATE',K.red); SFX.alarm();
 }
 if(e.rec){ recoveryTick(e,C); return; }
 if(bossPhaseCheck(e)) return;
 bossSummonCheck(e);
 if(recoveryCheck(e,C)) return;
 bossThink(e,C);
}
// After movement and collision: the pieces a kit hangs off the hull follow it
// exactly (LEVIATHAN's body, parts), the mirror refills its reflect budget, the
// kit's armour is read, and the world-space hit circles the round sweep reads
// are refreshed (e.hitParts from kit.hitParts {rot(e), c:[[x,y,r],..]} in
// units of the drawn r).
function bossPost(e,dt){
 const kit=e.kit; if(!kit) return;
 if(kit.post) kit.post(e,dt);
 if(e.parts&&e.parts.length){ placeParts(e); for(const q of e.parts) if(q.flash>0) q.flash-=dt; }
 if(e.mirror){ const cap=e.mirror.cap||6; e.mirror.budget=Math.min(cap,(e.mirror.budget||0)+cap*dt); }
 e.armor=kit.armor?clamp(kit.armor(e),0,1):1;
 const h=kit.hitParts;
 if(h){ const a=h.rot?h.rot(e):0, c=Math.cos(a), s=Math.sin(a), R=e.r*(e.vscale||1), out=e.hitParts; out.length=h.c.length;
  for(let i=0;i<h.c.length;i++){ const q=h.c[i], lx=q[0]*R, ly=q[1]*R, o=out[i]||(out[i]={x:0,y:0,r:0}); o.x=e.x+lx*c-ly*s; o.y=e.y+lx*s+ly*c; o.r=q[2]*R; } }
 e.px=e.x; e.py=e.y;
}
function bossLabel(e){
 if(e.mode==='beat') return 'PHASE '+(ROMAN[e.ph]||e.ph);
 if(e.rec) return e.rec.label;
 if(e.surgeT>0) return 'SURGE';
 const kit=e.kit;
 if(kit&&kit.label){ const l=kit.label(e); if(l) return l; }
 const n=e.atk||(kit&&kit.cycle&&kit.cycle[e.phase]);
 return String(n||e.bname||'BOSS').toUpperCase();
}
// ---------- the shared attack library ----------
// Attacks several gods share. A kit picks them by name (atk('burst','fan')) and
// adds its own beside them; the name is what the boss label shows and what
// the DevX lab forces. C: {p,d,nx,ny,dx,dy,dt,sF,enrage,aim,spdM,mv,orbit}.
// Radial volleys (burst, spiral, spiralwall) are rationed (spec §3.9): new
// kits must not reach for them.
const ATK={
 burst(e,C){ // radial ring — walk out of the gaps
  C.mv(0.5); e.burstT-=C.dt;
  if(e.burstT<=0){ e.burstT=C.enrage?0.75:1.1; const n=C.enrage?12:8;
   for(let k=0;k<n;k++) eshot(e,k/n*6.283+e.t,230,6);
   SFX.eshoot(); } },
 summon(e,C){ C.mv(0.3); e.burstT-=C.dt; if(e.burstT<=0){ e.burstT=2.6; summonChaff(e,2,8); } },
 muster(e,C){ // a slow call to the ranks: ordinary enemies only, gods come by threshold
  C.mv(0.35); e.burstT-=C.dt; if(e.burstT<=0){ e.burstT=7; summonChaff(e,2,10); } },
 charge(e,C){
  if(!e.chargeOn){ e.chargeOn=true; e.chargeDx=C.nx; e.chargeDy=C.ny; addFloater(e.x,calloutY(e),'CHARGE',K.red); }
  e.charging=true; const v=C.enrage?340:300;
  e.x+=e.chargeDx*v*C.dt; e.y+=e.chargeDy*v*C.dt; e.intent+=v*C.dt; },
 sweep(e,C){ // fan tracking across an arc — keep moving, don't stand in it
  C.mv(0.4); e.spirT-=C.dt;
  if(e.spirT<=0){ e.spirT=C.enrage?0.11:0.14; eshot(e,C.aim+Math.sin(e.phaseT*2.2)*1.1,250,5); } },
 spiral(e,C){
  C.mv(0.4); e.spirT-=C.dt;
  if(e.spirT<=0){ e.spirT=C.enrage?0.14:0.2; const a0=e.t*2.2;
   for(let k=0;k<3;k++) eshot(e,a0+k*2.094,210,6);
   SFX.eshoot(); } },
 spiralwall(e,C){ // dense rotating wall with ONE safe gap — find it and hold it
  C.mv(0.3); e.spirT-=C.dt;
  if(e.spirT<=0){ e.spirT=C.enrage?0.30:0.42; const n=13, gap=(e.t*0.9)%6.283;
   for(let k=0;k<n;k++){ const a=k/n*6.283;
    let da=Math.abs(((a-gap+Math.PI)%6.283)-Math.PI);
    if(da<0.55) continue; // the gap
    eshot(e,a+e.t*0.5,190,5,0.85,4); }
   SFX.eshoot(); } },
 fan(e,C){
  C.orbit(1.0); e.burstT-=C.dt;
  if(e.burstT<=0){ e.burstT=C.enrage?1.1:1.7;
   for(let k=-2;k<=2;k++) eshot(e,C.aim+k*0.16,260,5);
   SFX.eshoot(); } },
 slam(e,C){
  C.mv(0.7); e.slamCd-=C.dt;
  if(C.d<150&&e.slamCd<=0){ e.slamCd=C.enrage?1.6:2.4;
   rings.push({x:e.x,y:e.y,r:20,maxR:175,spd:300,dmg:e.dmg,hit:false,heavy:true});
   SFX.ring(); if(settings.shake) shake=Math.min(10,shake+4); spawnBurst(e.x,e.y,14,K.red,220,0.5,3); } },
 twinwave(e,C){ // two staggered rings — dodge, then dodge again
  C.mv(0.5); e.slamCd-=C.dt;
  if(e.slamCd<=0){ e.slamCd=C.enrage?2.0:2.8;
   rings.push({x:e.x,y:e.y,r:20,maxR:150,spd:280,dmg:e.dmg,hit:false,heavy:true});
   e.wave2=true; e.burstT=0.4; SFX.ring(); if(settings.shake) shake=Math.min(10,shake+3); } },
 mines(e,C){ // drop lingering hazards, then leave — the floor becomes the threat
  C.mv(0.6); e.burstT-=C.dt;
  if(e.burstT<=0){ e.burstT=1.4;
   if(hazards.length<CAP.haz) hazards.push({x:e.x+(Math.random()-0.5)*90,y:e.y+(Math.random()-0.5)*90,r:52,t:0,life:6,dmg:Math.round(e.dmg*0.5),tick:0});
   SFX.click(); } },
 zone(e,C){ // a damaging field parked on you — move house
  C.mv(0.35); e.zoneT-=C.dt;
  if(e.zoneT<=0){ e.zoneT=2.6;
   if(hazards.length<CAP.haz) hazards.push({x:C.p.x,y:C.p.y,r:78,t:0,life:4.5,dmg:Math.round(e.dmg*0.45),tick:0,warn:0.7});
   SFX.click(); } },
 gaze(e,C){ // telegraphed cone that roots you where you stand
  const p=C.p; C.mv(0.4); e.gazeT-=C.dt;
  if(e.gaze){ e.gaze.t-=C.dt;
   if(e.gaze.t<=0){ const a=e.gaze.ang;
    let da=Math.abs(((C.aim-a+Math.PI)%6.283)-Math.PI);
    if(da<0.45&&C.d<430){ applyStatus('root',1.0); hurtPlayer(Math.round(e.dmg*0.8),true,srcOf(e,'GAZE')); addFloater(p.x,p.y-30,'PETRIFIED',K.red); }
    for(let k=0;k<9;k++) pushPart({x:e.x+Math.cos(a)*k*46,y:e.y+Math.sin(a)*k*46,vx:0,vy:0,life:0.3,maxlife:0.3,col:K.red,r:5});
    e.gaze=null; e.gazeT=C.enrage?2.6:4; SFX.eshoot(); } }
  else if(e.gazeT<=0){ e.gaze={t:0.75,ang:C.aim}; SFX.click(); } },
 linecharge(e,C){ // commits along a straight line, leaving spikes behind
  if(!e.chargeOn){ e.chargeOn=true; e.chargeDx=C.nx; e.chargeDy=C.ny; addFloater(e.x,calloutY(e),'LUNGE',K.red); }
  e.charging=true;
  e.x+=e.chargeDx*320*C.dt; e.y+=e.chargeDy*320*C.dt; e.intent+=320*C.dt;
  e.burstT-=C.dt;
  if(e.burstT<=0){ e.burstT=0.22; if(hazards.length<CAP.haz) hazards.push({x:e.x,y:e.y,r:30,t:0,life:4,dmg:Math.round(e.dmg*0.35),tick:0}); } },
 spikes(e,C){
  C.mv(0.5); e.burstT-=C.dt;
  if(e.burstT<=0){ e.burstT=1.0;
   for(let k=0;k<3&&hazards.length<CAP.haz;k++){ const a=C.aim+(k-1)*0.7, rr=140+Math.random()*130;
    hazards.push({x:e.x+Math.cos(a)*rr,y:e.y+Math.sin(a)*rr,r:36,t:0,life:4.5,dmg:Math.round(e.dmg*0.4),tick:0,warn:0.5}); } } },
 ram(e,C){ // repeated commits, shockwave on wall impact
  e.ramT-=C.dt;
  if(!e.chargeOn&&e.ramT<=0){ e.chargeOn=true; e.chargeDx=C.nx; e.chargeDy=C.ny; e.facing=Math.atan2(C.ny,C.nx); addFloater(e.x,calloutY(e),'RAM',K.red); SFX.alarm(); }
  if(e.chargeOn){ e.charging=true;
   // Obstacles are resolved AFTER the think step, so a pinned ram still takes
   // its full step here. Judge "stuck" by net travel since last frame's step
   // instead: a pylon keeps pushing it back to the same spot.
   const step=(C.enrage?400:340)*C.dt;
   const stuck=e.ramLx!==undefined&&Math.hypot(e.x-e.ramLx,e.y-e.ramLy)<step*0.25;
   e.ramLx=e.x; e.ramLy=e.y;
   e.x+=e.chargeDx*step; e.y+=e.chargeDy*step;
   const hitWall=e.x<=PX0+e.r+1||e.x>=PX1-e.r-1||e.y<=PY0+e.r+1||e.y>=PY1-e.r-1;
   if(hitWall||stuck){
    e.chargeOn=false; e.ramT=C.enrage?1.4:2.2; e.ramLx=undefined;
    rings.push({x:e.x,y:e.y,r:16,maxR:200,spd:330,dmg:e.dmg,hit:false,heavy:true});
    if(settings.shake) shake=Math.min(12,shake+6); spawnBurst(e.x,e.y,22,K.red,260,0.6,4); SFX.ring(); }
  } else C.mv(0.45); },
 debris(e,C){ // orbital junk flung outward on a lazy arc
  C.mv(0.4); e.burstT-=C.dt;
  if(e.burstT<=0){ e.burstT=C.enrage?0.5:0.8;
   for(let k=0;k<4;k++) eshot(e,e.t*1.4+k*1.5708,170+Math.random()*90,7,0.8,4.5);
   SFX.eshoot(); } },
 clockbeam(e,C){ // a slow rotating hand — walk with it, not into it
  C.mv(0.25); e.spirT-=C.dt;
  if(e.spirT<=0){ e.spirT=0.10; const a=e.phaseT*1.5;
   eshot(e,a,240,5,0.7,2.6); eshot(e,a+3.1416,240,5,0.7,2.6); } },
 crossbeam(e,C){ // a rotating cross, four arms, wide safe wedges
  C.mv(0.3); e.spirT-=C.dt;
  if(e.spirT<=0){ e.spirT=0.13; const a=e.phaseT*1.1;
   for(let k=0;k<4;k++) eshot(e,a+k*1.5708,225,5,0.75,3); } },
 disrupt(e,C){ // a field that jams one system while you stand in it
  C.mv(0.45); e.burstT-=C.dt;
  if(e.burstT<=0){ e.burstT=3.4;
   if(hazards.length<CAP.haz) hazards.push({x:C.p.x,y:C.p.y,r:96,t:0,life:4,dmg:0,tick:0,warn:0.6,jam:true});
   addFloater(e.x,calloutY(e),'DISRUPTOR FIELD',K.red); SFX.alarm(); } },
 gravity(e,C){ // drags you in — thrust away or get crushed
  const p=C.p; C.mv(0.2);
  if(C.d>40){ const pull=(C.enrage?150:110)*C.dt; p.x-=C.nx*pull; p.y-=C.ny*pull; } // n points boss→player, so subtract to drag inward
  e.burstT-=C.dt;
  if(e.burstT<=0){ e.burstT=1.2;
   for(let k=0;k<6;k++) eshot(e,k/6*6.283-e.t*1.2,200,6,0.85);
   SFX.eshoot(); } }
};
function atk(){ const o={}; for(const n of arguments) o[n]=ATK[n]; return o; }
function polyPts(pts){ ctx.beginPath(); pts.forEach((q,i)=>{ if(i) ctx.lineTo(q[0],q[1]); else ctx.moveTo(q[0],q[1]); }); ctx.closePath(); }

// ---------- status on the ship (spec §3.3-3.4) ----------
// One block, one loop, one HUD tag each. Every status a god can put on KRIEFNE
// lives here so the rules that keep a fight winnable hold in one place: freeze
// leaves FREEZE_IMMUNE seconds of immunity so it can never chain, a tether and
// every pull lose to a dash, and nothing here ever touches the guns (the
// holmgang clause: being unable to shoot is not a mechanic, it is waiting).
//   applyStatus(kind,dur,o) -> true if it took hold.
//     'root'      no movement (a dash is also refused while rooted)
//     'freeze'    no movement, no dash; dur clamped to 0.8-1.2 s, then immunity
//     'jam'       dash and blink off
//     'slow'      speed x o.mul (default 0.6)
//     'knockback' an impulse o.{x,y} in px/s that decays; a dash cancels it
//     'tether'    pulled toward o.owner at o.pull px/s; a dash breaks it
const FREEZE_MIN=0.8, FREEZE_MAX=1.2, FREEZE_IMMUNE=1.5, PULL_CAP=0.85; // pulls never exceed 85% of ship speed
function statusFresh(){ return {root:0,freeze:0,freezeImm:0,jam:0,slow:0,slowMul:1,tether:null,kbx:0,kby:0,discCd:0}; }
function pStatus(){ const p=player; if(!p) return null; return p.status||(p.status=statusFresh()); }
function applyStatus(kind,dur,o){
 const p=player, S=pStatus(); if(!S||!p) return false; o=o||{};
 switch(kind){
  case 'freeze':
   if(S.freeze>0||S.freezeImm>0||p.dashT>0) return false;
   S.freeze=clamp(dur||1,FREEZE_MIN,FREEZE_MAX); S.kbx=0; S.kby=0;
   addFloater(p.x,p.y-30,'FROZEN',K.red); SFX.brk(); return true;
  case 'root': S.root=Math.max(S.root,dur||1); return true;
  case 'jam': S.jam=Math.max(S.jam,dur||0.6); if(p.channel){ p.channel=null; addFloater(p.x,p.y-24,'BLINK JAMMED',K.red); } return true;
  case 'slow': S.slowMul=S.slow>0?Math.min(S.slowMul,clamp(o.mul||0.6,0.3,1)):clamp(o.mul||0.6,0.3,1); S.slow=Math.max(S.slow,dur||1); return true;
  case 'knockback': if(p.dashT>0) return false; S.kbx+=o.x||0; S.kby+=o.y||0; return true;
  case 'tether':
   if(p.dashT>0||!o.owner) return false;
   S.tether={owner:o.owner,pull:Math.min(o.pull||180,p.speed*PULL_CAP),t:dur||2.5,src:o.src||null};
   addFloater(p.x,p.y-30,'TETHERED — DASH',K.red); return true;
 }
 return false;
}
// The one status loop, run before the ship moves. Returns what movement may do.
function statusTick(p,dt){
 const S=pStatus(), out={lock:false,mul:1,fx:0,fy:0};
 if(S.discCd>0) S.discCd-=dt;
 if(S.root>0){ S.root-=dt; out.lock=true; }
 if(S.freeze>0){ S.freeze-=dt; out.lock=true; if(S.freeze<=0){ S.freeze=0; S.freezeImm=FREEZE_IMMUNE; } }
 else if(S.freezeImm>0) S.freezeImm-=dt;
 if(S.jam>0) S.jam-=dt;
 if(S.slow>0){ S.slow-=dt; out.mul=S.slowMul; } else S.slowMul=1;
 const dashing=p.dashT>0;
 if(dashing){ S.kbx=0; S.kby=0; }
 else if(S.kbx||S.kby){ out.fx+=S.kbx; out.fy+=S.kby; const k=Math.exp(-6*dt); S.kbx*=k; S.kby*=k; if(Math.abs(S.kbx)+Math.abs(S.kby)<6){ S.kbx=0; S.kby=0; } }
 let px=0, py=0;
 const T=S.tether;
 if(T){ const own=T.owner;
  if(dashing){ S.tether=null; addFloater(p.x,p.y-24,'TETHER BROKEN',K.gold); }
  else if(!own||own.dead||enemies.indexOf(own)<0||(T.t-=dt)<=0) S.tether=null;
  else { const dx=own.x-p.x, dy=own.y-p.y, l=len(dx,dy); if(l>own.r+p.r+8){ px+=dx/l*T.pull; py+=dy/l*T.pull; } } }
 if(!dashing) for(const c of bossCurrents){ if(c.t<c.warn) continue;
  const dx=c.x-p.x, dy=c.y-p.y, l=len(dx,dy); if(l>c.r) continue;
  const f=1-0.5*l/c.r; px+=(dx/l*c.pull-dy/l*c.swirl)*f; py+=(dy/l*c.pull+dx/l*c.swirl)*f; }
 // every pull together stays beatable on foot, and a dash always beats it
 const pl=Math.hypot(px,py), cap=p.speed*PULL_CAP; if(pl>cap){ px*=cap/pl; py*=cap/pl; }
 out.fx+=px; out.fy+=py;
 return out;
}
function statusTags(p){ const S=p&&p.status, t=[]; if(!S) return t;
 if(S.freeze>0) t.push('FROZEN'); if(S.root>0) t.push('PETRIFIED'); if(S.jam>0) t.push('JAMMED');
 if(S.slow>0) t.push('SLOWED'); if(S.tether) t.push('TETHERED'); if(Math.abs(S.kbx)+Math.abs(S.kby)>60) t.push('KNOCKED BACK');
 return t; }

// ---------- boss primitives (spec §3.2) ----------
// Shared, telegraphed building blocks for every kit. Each owns its update, its
// draw and its cleanup, draws against CAP (at a cap the spawn is skipped,
// never thrown), and stamps its maker with srcOf so a hit is always named.
// Every pool entry carries its `owner`: when that god dies (or the lab clears
// it) its beams, marks, discs, zones, currents, grasps and boulders go too.
// Pool names `marks`, `discs` and `bossBeams` are the DevX overlay's.
let bossBeams=[], marks=[], discs=[], bossZones=[], bossCurrents=[], bossGrasps=[];
function angDiff(a,b){ let d=(a-b)%6.283185; if(d>Math.PI) d-=6.283185; if(d<-Math.PI) d+=6.283185; return d; }
function ownerGone(o){ return !!(o&&(o.dead||o.hp<=0)); }
function hzRoom(){ return hazards.length+discs.length<CAP.haz; }
function ebPush(b){ if(ebullets.length>=CAP.eb) return false; ebullets.push(b); return true; }
function tempObsCount(){ let n=0; if(arena&&arena.obs) for(const o of arena.obs) if(o.temp) n++; return n; }
// Distance along a ray to the first obstacle or the rim (beams stop at cover).
function rayObs(x,y,dx,dy,maxL){
 let best=maxL;
 if(dx>1e-6) best=Math.min(best,(PX1-x)/dx); else if(dx<-1e-6) best=Math.min(best,(PX0-x)/dx);
 if(dy>1e-6) best=Math.min(best,(PY1-y)/dy); else if(dy<-1e-6) best=Math.min(best,(PY0-y)/dy);
 const obs=arena&&arena.obs; if(!obs) return Math.max(0,best);
 for(const o of obs){
  const cx=obsCX(o), cy=obsCY(o), rr=obsRadius(o), fx=cx-x, fy=cy-y, tc=fx*dx+fy*dy;
  if(tc<-rr||tc-rr>best) continue; if(fx*fx+fy*fy-tc*tc>rr*rr) continue;
  let t=-1;
  if(o.kind==='rect'){ let t0=0, t1=best, hit=true;
   for(const [p0,d,lo,hi] of [[x,dx,o.x,o.x+o.w],[y,dy,o.y,o.y+o.h]]){
    if(Math.abs(d)<1e-9){ if(p0<lo||p0>hi) hit=false; }
    else { let a=(lo-p0)/d, b=(hi-p0)/d; if(a>b){ const s=a; a=b; b=s; } t0=Math.max(t0,a); t1=Math.min(t1,b); } }
   if(hit&&t0<=t1) t=t0; }
  else if(o.kind==='poly'){ const P=o.pts, n=P.length;
   if(polyDist(x,y,o)===0) t=0;
   else for(let i=0;i<n;i++){ const ax=o.x+P[i][0], ay=o.y+P[i][1], ex=o.x+P[(i+1)%n][0]-ax, ey=o.y+P[(i+1)%n][1]-ay, den=dx*ey-dy*ex;
    if(Math.abs(den)<1e-9) continue; const u=((ax-x)*ey-(ay-y)*ex)/den, v=((ax-x)*dy-(ay-y)*dx)/den; if(u>=0&&v>=0&&v<=1&&(t<0||u<t)) t=u; } }
  else if(o.r>0){ const pd=Math.sqrt(Math.max(0,o.r*o.r-(fx*fx+fy*fy-tc*tc))); t=tc-pd; if(t<0&&tc+pd>=0) t=0; }
  if(t>=0&&t<best) best=t;
 }
 return Math.max(0,best);
}
function segDist2(px,py,ax,ay,bx,by){ const ex=bx-ax, ey=by-ay, L2=ex*ex+ey*ey; let t=L2>0?((px-ax)*ex+(py-ay)*ey)/L2:0; t=clamp(t,0,1); const qx=ax+ex*t-px, qy=ay+ey*t-py; return qx*qx+qy*qy; }

// BEAM. bossBeam(e,{a, arms:1|2|4, rot, flip, w, len, warn, live, dmg, off, follow, what, erase})
// A ray from the god (arms spread evenly: 2 = both ends, 4 = a cross) that
// stops at the first obstacle, so cover works. `warn` s of ticked telegraph
// (never under 0.5), then `live` s during which it turns at `rot` rad/s
// (reversing once `flip` s in) and ticks dmg every 0.2 s on the ship. `off`
// starts it that far out (a rim); `erase` also deletes the ship's rounds
// crossing it (NULLIFIER's Null Lance). Returns the beam, or null at the cap.
function bossBeam(e,o){ o=o||{}; if(bossBeams.length>=CAP.beams) return null;
 const b={owner:e,x:e.x,y:e.y,a:o.a||0,arms:o.arms||1,rot:o.rot||0,flip:o.flip||0,w:o.w||10,len:o.len||1600,off:o.off||0,
  warn:Math.max(0.5,o.warn||0.8),live:o.live||1.2,dmg:o.dmg!=null?o.dmg:Math.round(e.dmg*0.35),t:0,tick:0,follow:o.follow!==false,erase:!!o.erase,ends:[],src:srcOf(e,o.what||'BEAM')};
 bossBeams.push(b); beamEnds(b); return b; }
function beamArm(b,k){ return b.a+k*6.283185/b.arms; }
function beamEnds(b){ for(let k=0;k<b.arms;k++){ const a=beamArm(b,k), dx=Math.cos(a), dy=Math.sin(a); b.ends[k]=b.off+rayObs(b.x+dx*b.off,b.y+dy*b.off,dx,dy,b.len); } }
function beamTick(b,dt,p){
 b.t+=dt; if(b.follow&&b.owner){ b.x=b.owner.x; b.y=b.owner.y; }
 if(b.t>b.warn){ b.a+=b.rot*dt; if(b.flip&&!b.flipped&&b.t>=b.warn+b.flip){ b.rot=-b.rot; b.flipped=true; } }
 beamEnds(b);
 if(b.t<b.warn) return;
 b.tick-=dt;
 for(let k=0;k<b.arms;k++){ const a=beamArm(b,k), dx=Math.cos(a), dy=Math.sin(a), sx=b.x+dx*b.off, sy=b.y+dy*b.off, ex=b.x+dx*b.ends[k], ey=b.y+dy*b.ends[k];
  if(b.tick<=0&&segDist2(p.x,p.y,sx,sy,ex,ey)<(b.w*0.5+p.r)*(b.w*0.5+p.r)){ b.tick=0.2; hurtPlayer(b.dmg,true,b.src); }
  if(b.erase) for(const q of bullets) if(segDist2(q.x,q.y,sx,sy,ex,ey)<(b.w*0.5+q.r)*(b.w*0.5+q.r)) q.dead=true; }
}

// MARKS. bossMarks(e,[{x,y,r}],{r, warn, dmg, what, fx, dur, pull}) -> placed marks
// Telegraphed circles that fill over `warn` s (never under 0.5) and all
// detonate together. The escape solver guarantees a way out: on a ring
// MARK_RING px round the ship there is always a gap of at least MARK_GAP x the
// ship's diameter, reachable in a straight line; marks that close it are
// dropped. `fx` ('freeze'|'jam'|'knockback') rides the blast, `pull` drags the
// ship toward the mark while it fills (a Tidal Mark; a dash beats it).
const MARK_RING=180, MARK_GAP=2.2;
function markBlocked(pts,px,py,a,pr,terrain){
 for(const rho of [60,100,140,MARK_RING]){ const x=px+Math.cos(a)*rho, y=py+Math.sin(a)*rho;
  if(terrain&&(x<PX0+pr||x>PX1-pr||y<PY0+pr||y>PY1-pr||pointBlocked(x,y,pr,arena.obs))) return true;
  for(const m of pts){ if(m.own) continue; const dx=x-m.x, dy=y-m.y, rr=m.r+pr; if(dx*dx+dy*dy<rr*rr) return m; } }
 return false; }
// Widest straight-line way out of the marks, as arc length on the ring (px).
function markEscapeGap(pts,px,py,terrain){ const pr=player?player.r:11, N=120, st=6.283185/N;
 for(const m of pts) if(m.own===undefined) m.own=Math.hypot(m.x-px,m.y-py)<m.r+pr;
 const bl=[]; for(let i=0;i<N;i++) bl.push(!!markBlocked(pts,px,py,i*st,pr,terrain));
 let best=0, run=0; for(let i=0;i<2*N;i++){ if(!bl[i%N]){ run++; best=Math.max(best,Math.min(run,N)); } else run=0; }
 return best*st*MARK_RING; }
function solveMarks(pts,px,py){
 const pr=player?player.r:11, need=MARK_GAP*2*pr, N=120, st=6.283185/N, w=Math.ceil(need/(st*MARK_RING))+1;
 for(const m of pts) m.own=Math.hypot(m.x-px,m.y-py)<m.r+pr;
 const pass=terrain=>{
  if(markEscapeGap(pts,px,py,terrain)>=need) return pts;
  // the window of the needed width that the fewest marks close: drop those
  let bestSet=null;
  for(let i=0;i<N;i++){ const set=new Set(); let wall=false;
   for(let j=0;j<w&&!wall;j++){ const a=(i+j)*st;
    for(const rho of [60,100,140,MARK_RING]){ const x=px+Math.cos(a)*rho, y=py+Math.sin(a)*rho;
     if(terrain&&(x<PX0+pr||x>PX1-pr||y<PY0+pr||y>PY1-pr||pointBlocked(x,y,pr,arena.obs))){ wall=true; break; }
     for(const m of pts){ if(m.own) continue; const dx=x-m.x, dy=y-m.y, rr=m.r+pr; if(dx*dx+dy*dy<rr*rr) set.add(m); } } }
   if(!wall&&(!bestSet||set.size<bestSet.size)) bestSet=set; }
  if(!bestSet) return null;
  const out=pts.filter(m=>!bestSet.has(m));
  return markEscapeGap(out,px,py,terrain)>=need?out:null; };
 return pass(true)||pass(false)||pts.filter(m=>m.own);
}
function bossMarks(e,pts,o){ o=o||{}; const p=player; if(!p) return [];
 const room=CAP.marks-marks.length; if(room<=0) return [];
 let list=pts.map(q=>({x:clamp(q.x,PX0+8,PX1-8),y:clamp(q.y,PY0+8,PY1-8),r:q.r||o.r||56}));
 list=solveMarks(list,p.x,p.y).slice(0,room);
 const g={hit:false,boom:false}, warn=Math.max(0.5,o.warn||1.1), src=srcOf(e,o.what||'STRIKE'), dmg=o.dmg!=null?o.dmg:e.dmg;
 for(const m of list) marks.push({owner:e,x:m.x,y:m.y,r:m.r,t:0,warn,dmg,src,g,fx:o.fx||null,dur:o.dur||1,pull:o.pull||0});
 if(list.length) SFX.click();
 return list; }
function markTick(m,dt,p){ m.t+=dt;
 if(m.pull&&p.dashT<=0&&m.t<m.warn){ const dx=m.x-p.x, dy=m.y-p.y, l=len(dx,dy); if(l<m.r*3&&l>4){ const v=Math.min(m.pull,p.speed*PULL_CAP)*dt; p.x+=dx/l*v; p.y+=dy/l*v; } }
 if(m.t<m.warn) return false;
 if(!m.g.hit&&Math.hypot(p.x-m.x,p.y-m.y)<m.r+p.r*0.6){ m.g.hit=true; hurtPlayer(m.dmg,true,m.src);
  if(m.fx==='knockback'){ const dx=p.x-m.x, dy=p.y-m.y, l=len(dx,dy); applyStatus('knockback',0,{x:dx/l*380,y:dy/l*380}); } else if(m.fx) applyStatus(m.fx,m.dur); }
 spawnBurst(m.x,m.y,10,K.red,220,0.45,3); rings.push({x:m.x,y:m.y,r:m.r*0.4,maxR:m.r*1.15,spd:m.r*4,dmg:0,hit:true});
 if(!m.g.boom){ m.g.boom=true; SFX.ring(); if(settings.shake) shake=Math.min(10,shake+3); }
 return true; }

// TRAIL DISCS. dropDisc(e,x,y,r,{life, safe, dmg, what, src}) -> disc|null
// A disc that shrinks to nothing over `life` s (3.5), harmless for its first
// `safe` s (0.25), then hurts on touch, one tick per 0.5 s however many
// overlap. Shares the hazard cap. Pass a shared `src` when dropping many.
function dropDisc(e,x,y,r,o){ o=o||{}; if(!hzRoom()) return null;
 const d={owner:e,x,y,r0:r,r,t:0,life:o.life||3.5,safe:o.safe!=null?o.safe:0.25,dmg:o.dmg!=null?o.dmg:Math.round(e.dmg*0.3),src:o.src||srcOf(e,o.what||'WAKE')};
 discs.push(d); return d; }

// SHOCKWAVE. shockwave(e,x,y,{maxR, spd, r0, dmg, fx, dur, kb, w, warn, what}) -> ring|null
// An expanding ring that acts once on contact: damage and/or fx 'freeze' |
// 'knockback' (kb px/s outward) | 'jam'. `warn` s (default 0.5) of a dashed
// preview at its full reach before it rolls; pass warn:0 only when the ring is
// itself the payoff of a telegraph already shown (a landing, a detonation).
function shockwave(e,x,y,o){ o=o||{}; if(rings.length>=160) return null;
 const g={x,y,r:o.r0||16,maxR:o.maxR||200,spd:o.spd||320,dmg:o.dmg||0,hit:false,heavy:true,fx:(o.fx&&o.fx!=='damage')?o.fx:null,fxDur:o.dur||1,kb:o.kb||380,w:o.w||14,delay:o.warn!=null?o.warn:0.5,src:srcOf(e,o.what||'SHOCKWAVE'),owner:e};
 rings.push(g); return g; }
function ringEffect(g,p){ if(p.dashT>0) return;
 if(g.fx==='knockback'){ const dx=p.x-g.x, dy=p.y-g.y, l=len(dx,dy); applyStatus('knockback',0,{x:dx/l*g.kb,y:dy/l*g.kb}); }
 else if(g.fx) applyStatus(g.fx,g.fxDur); }

// BOUNCING ROUNDS. eshotB(e,a,spd,r,dmgMul,life,bounces) -> round|null
// An enemy round that reflects off walls and obstacles `bounces` times (the
// ship's own ricochet rule). Any enemy round may also carry freeze:s or
// slow:s, applied when it lands.
function eshotB(e,a,spd,r,dmgMul,life,bounces){ const b=eshot(e,a,spd,r,dmgMul,life||4.5); if(b) b.bounce=bounces||1; return b; }

// REFLECT ARC. e.mirror={arcs:[{a,half}], cap, dmgMul}; the kit turns the arcs.
// A ship round striking inside an arc is mirrored off the shield's normal and
// comes back as an enemy round. At most `cap` rounds a second are returned
// (default 6); the rest are absorbed, so a 12-barrel build cannot delete
// itself in a frame. mirror.stored sums what it took (a Riposte's charge).
function bossDeflect(e,b,hx,hy){
 const m=e&&e.mirror; if(!m||m.off||!m.arcs||!m.arcs.length||e.dead) return false;
 const a=Math.atan2(hy-e.y,hx-e.x); let hit=false; for(const q of m.arcs) if(Math.abs(angDiff(a,q.a))<=q.half){ hit=true; break; }
 if(!hit) return false;
 b.dead=true; m.stored=(m.stored||0)+(b.dmg||0);
 if((m.budget||0)>=1){ m.budget-=1;
  const nx=Math.cos(a), ny=Math.sin(a), dot=b.vx*nx+b.vy*ny; let vx=b.vx-2*dot*nx, vy=b.vy-2*dot*ny; const l=len(vx,vy), sp=clamp(l*0.5,200,360);
  ebPush({x:hx+nx*6,y:hy+ny*6,vx:vx/l*sp,vy:vy/l*sp,r:4,dmg:Math.max(1,Math.round(e.dmg*(m.dmgMul||0.45))),life:2.4,heavy:false,src:m.src||(m.src=srcOf(e,'MIRROR'))}); }
 spawnBurst(hx,hy,3,pigOf(e).c,160,0.25,2); SFX.click();
 return true; }

// PARTS. addPart(e,{id, lx, ly, r, hp, block, dmgMul, kind}) -> part|null
// A destructible child circle at local offset (lx,ly) px, turned with the god
// by e.partRot each frame and written to world x,y for the round sweep. hp is
// absolute (use e.maxhp*f). block:false lets a round that struck it fly on.
// On break: kit.onPartBreak(e,part). At most CAP.parts per god. The engine
// draws a plain plate in the god's pigment unless the kit has drawPart(e,q,g).
function addPart(e,o){ o=o||{}; if(!e.parts) e.parts=[]; if(e.parts.length>=CAP.parts) return null;
 const q={id:o.id||('p'+e.parts.length),lx:o.lx||0,ly:o.ly||0,r:o.r||10,hp:o.hp||1,maxhp:o.hp||1,block:o.block!==false,dmgMul:o.dmgMul!=null?o.dmgMul:1,kind:o.kind||'plate',x:e.x,y:e.y,flash:0,dead:false};
 e.parts.push(q); placeParts(e); return q; }
function placeParts(e){ const a=e.partRot||0, c=Math.cos(a), s=Math.sin(a); for(const q of e.parts){ if(q.lx===undefined) continue; q.x=e.x+q.lx*c-q.ly*s; q.y=e.y+q.lx*s+q.ly*c; } }
// Bullet hook: a round struck a part. True when the round is spent.
function hitBossPart(e,part,b,hx,hy){
 if(!e||!part||part.dead||part.hp<=0||e.dead) return false;
 const dmg=(b.dmg||0)*(part.dmgMul!=null?part.dmgMul:1)*corrodeMul(e);
 part.hp-=dmg; part.flash=0.08; e.lastHit=timeSec;
 if(settings.dmgNums) addFloater(hx,hy-14,Math.round(dmg),K.metal);
 spawnBurst(hx,hy,3,K.metal,150,0.25,2); SFX.hit();
 if(part.hp<=0) breakPart(e,part);
 return part.block!==false; }
function breakPart(e,q){ if(q.dead) return; q.dead=true; q.hp=0; const i=e.parts.indexOf(q); if(i>=0) e.parts.splice(i,1);
 spawnBurst(q.x,q.y,12,pigOf(e).c,220,0.5,3); SFX.brk();
 if(e.kit&&e.kit.onPartBreak) e.kit.onPartBreak(e,q); }

// TEMPORARY OBSTACLES. placeTempObs(e,x,y,r,life) -> obstacle|null
// A boulder pushed into arena.obs and removed after `life` s. Refused within
// 120 px of the ship, the exit or another boulder, on top of any hull, past
// CAP.tempObs, or when the BFS says it would seal off open ground.
function placeTempObs(e,x,y,r,life){
 if(!arena||!arena.obs||!player||tempObsCount()>=CAP.tempObs) return null;
 r=r||30; x=clamp(x,PX0+r+8,PX1-r-8); y=clamp(y,PY0+r+8,PY1-r-8);
 if(Math.hypot(x-player.x,y-player.y)<120+r) return null;
 if(portal&&Math.hypot(x-portal.x,y-portal.y)<120+r) return null;
 for(const o of arena.obs) if(o.temp&&Math.hypot(x-o.x,y-o.y)<120+r+o.r) return null;
 for(const q of enemies) if(Math.hypot(x-q.x,y-q.y)<r+q.r+6) return null;
 const o={kind:'circle',x,y,r,temp:true,t:0,life:life||8,owner:e};
 const before=bfsCheck(player.x,player.y,[],arena.obs), after=bfsCheck(player.x,player.y,portal?[portal]:[],arena.obs.concat([o]));
 if(!after.ok||after.ratio<before.ratio-1e-6) return null;
 arena.obs.push(o); return o; }

// TETHER. bossGrasp(e,{warn, life, pull, range, what}) -> grasp|null
// A ticked red line from the god to the ship for `warn` s (0.6), then a
// tether that drags the ship toward it at `pull` px/s for `life` s. A dash
// breaks it, during the telegraph or after; so does the god's death.
function bossGrasp(e,o){ o=o||{}; if(bossGrasps.length>=4) return null;
 const g={owner:e,t:0,warn:Math.max(0.5,o.warn||0.6),life:o.life||2.5,pull:o.pull||180,range:o.range||520,src:srcOf(e,o.what||'GRASP')};
 bossGrasps.push(g); SFX.click(); return g; }

// BULLET-ERASE ZONE. eraseZone(e,x,y,r,{life, warn, follow}) -> zone|null
// A field that deletes ship rounds entering it once armed. Capped at 160 px,
// and never allowed to cover its maker's whole body: it shrinks until part of
// the hull is always outside, so the god can always be hit.
function eraseZone(e,x,y,r,o){ o=o||{}; if(bossZones.length>=10) return null;
 const z={owner:e,x,y,r:Math.min(r||90,160),t:0,life:o.life||4,warn:Math.max(0.5,o.warn||0.5),follow:!!o.follow,ox:x-e.x,oy:y-e.y};
 bossZones.push(z); return z; }
function zoneR(z){ const e=z.owner; if(!e) return z.r; return Math.min(z.r,Math.max(0,Math.hypot(z.x-e.x,z.y-e.y)+e.r*0.4)); }
// Bullet hook: true deletes the round.
function bulletErased(b){ for(const z of bossZones){ if(z.t<z.warn) continue; const R=zoneR(z), dx=b.x-z.x, dy=b.y-z.y;
  if(dx*dx+dy*dy<R*R){ spawnBurst(b.x,b.y,2,K.metalDim,90,0.2,2); return true; } } return false; }

// CURRENTS AND PULL. addCurrent(e,{x, y, r, pull, swirl, life, warn, follow}) -> current|null
// A movement force on the ship inside r: `pull` px/s toward the centre and
// `swirl` px/s around it. Every pull together is capped at PULL_CAP of ship
// speed and switched off while dashing, so walking beats it and a dash always does.
function addCurrent(e,o){ o=o||{}; if(bossCurrents.length>=6) return null;
 const c={owner:e,x:o.x!=null?o.x:e.x,y:o.y!=null?o.y:e.y,r:o.r||260,pull:o.pull||120,swirl:o.swirl||0,life:o.life||3,warn:o.warn!=null?o.warn:0.5,t:0,follow:o.follow!==false&&o.x==null};
 bossCurrents.push(c); return c; }

// LENSING. e.lens={r, k}: the ship's rounds inside r of the god are turned
// away from it (k rad/s at the core, fading to 0 at r), so a hose curves round
// a lensing god (SINGULARITY's Phase 2). Bullet hook, run before a round moves.
function bulletField(b,dt){
 for(const e of enemies){ const L=e.lens; if(!L||e.dead) continue;
  const dx=e.x-b.x, dy=e.y-b.y, d=Math.hypot(dx,dy); if(d>L.r||d<1) continue;
  const side=(b.vx*dy-b.vy*dx)>0?-1:1, ang=side*(L.k||2)*(1-d/L.r)*dt, c=Math.cos(ang), s=Math.sin(ang);
  const vx=b.vx*c-b.vy*s; b.vy=b.vx*s+b.vy*c; b.vx=vx; } }

// ---------- primitive lifecycle ----------
function updateBossPrims(dt,p){
 for(let i=bossBeams.length-1;i>=0;i--){ const b=bossBeams[i]; if(ownerGone(b.owner)||b.t>=b.warn+b.live){ bossBeams.splice(i,1); continue; } beamTick(b,dt,p); }
 for(let i=marks.length-1;i>=0;i--){ const m=marks[i]; if(ownerGone(m.owner)||markTick(m,dt,p)) marks.splice(i,1); }
 const S=pStatus();
 for(let i=discs.length-1;i>=0;i--){ const d=discs[i]; d.t+=dt; d.r=d.r0*Math.max(0,1-d.t/d.life);
  if(d.t>=d.life||ownerGone(d.owner)){ discs.splice(i,1); continue; }
  if(d.t>=d.safe&&S.discCd<=0&&dist2(p.x,p.y,d.x,d.y)<(d.r+p.r*0.5)*(d.r+p.r*0.5)){ S.discCd=0.5; hurtPlayer(d.dmg,false,d.src); } }
 for(let i=bossZones.length-1;i>=0;i--){ const z=bossZones[i]; z.t+=dt; if(z.t>=z.life||ownerGone(z.owner)){ bossZones.splice(i,1); continue; } if(z.follow&&z.owner){ z.x=z.owner.x+z.ox; z.y=z.owner.y+z.oy; } }
 for(let i=bossCurrents.length-1;i>=0;i--){ const c=bossCurrents[i]; c.t+=dt; if(c.t>=c.life||ownerGone(c.owner)){ bossCurrents.splice(i,1); continue; } if(c.follow&&c.owner){ c.x=c.owner.x; c.y=c.owner.y; } }
 for(let i=bossGrasps.length-1;i>=0;i--){ const g=bossGrasps[i]; g.t+=dt;
  if(ownerGone(g.owner)||p.dashT>0){ bossGrasps.splice(i,1); continue; }
  if(g.t>=g.warn){ bossGrasps.splice(i,1); if(Math.hypot(p.x-g.owner.x,p.y-g.owner.y)<=g.range) applyStatus('tether',g.life,{owner:g.owner,pull:g.pull,src:g.src}); } }
 if(arena&&arena.obs) for(let i=arena.obs.length-1;i>=0;i--){ const o=arena.obs[i]; if(!o.temp) continue; o.t+=dt; if(o.t>=o.life){ arena.obs.splice(i,1); spawnBurst(o.x,o.y,10,K.metal,160,0.5,3); } }
}
// Everything boss-made, gone: sector load, replay end, continue, a new run.
function clearBossState(){
 bossBeams=[]; marks=[]; discs=[]; bossZones=[]; bossCurrents=[]; bossGrasps=[];
 if(arena&&arena.obs) for(let i=arena.obs.length-1;i>=0;i--) if(arena.obs[i].temp) arena.obs.splice(i,1);
 if(player) player.status=statusFresh();
 nestChaffT=NEST_CHAFF_FIRST; nestLeadDown=false;
}
// One god, gone: what it owned goes with it, including a tether on the ship.
function bossDied(e){
 const mine=o=>o.owner!==e;
 bossBeams=bossBeams.filter(mine); marks=marks.filter(mine); discs=discs.filter(mine);
 bossZones=bossZones.filter(mine); bossCurrents=bossCurrents.filter(mine); bossGrasps=bossGrasps.filter(mine);
 if(arena&&arena.obs) for(let i=arena.obs.length-1;i>=0;i--) if(arena.obs[i].temp&&arena.obs[i].owner===e) arena.obs.splice(i,1);
 const S=player&&player.status; if(S&&S.tether&&S.tether.owner===e) S.tether=null;
 if(e.parts) e.parts.length=0;
}
// ---------- primitive drawing (world space) ----------
// All harm is red: ruled, ticked, hatched, never glowing. Dashed = arming.
function drawBossUnder(th){
 const P=th&&th.pal?th.pal:null;
 if(arena&&arena.obs&&P){ const ld=th.light||0, Lx=Math.cos(ld), Ly=Math.sin(ld); for(const o of arena.obs) if(o.temp){ ctx.save(); ctx.globalAlpha=clamp((o.life-o.t)*2,0,1); engrave(ctx,o,Lx,Ly,P); ctx.restore(); } }
 for(const d of discs){ if(d.r<1) continue; const safe=d.t<d.safe;
  ctx.save(); ctx.globalAlpha=safe?0.25:0.16; ctx.fillStyle=K.red; ctx.beginPath(); ctx.arc(d.x,d.y,d.r,0,6.283); ctx.fill();
  ctx.globalAlpha=safe?0.35:0.5; ctx.strokeStyle=K.red; ctx.lineWidth=1; if(safe) ctx.setLineDash([4,4]); ctx.stroke(); ctx.setLineDash([]); ctx.restore(); }
 for(const z of bossZones){ const R=zoneR(z), arming=z.t<z.warn; if(R<2) continue;
  ctx.save(); ctx.globalAlpha=arming?0.7:0.85; ctx.beginPath(); ctx.arc(z.x,z.y,R,0,6.283); ctx.save(); ctx.clip();
  ctx.strokeStyle=K.redDim; ctx.lineWidth=1; ctx.beginPath(); for(let d=-R;d<R;d+=6){ ctx.moveTo(z.x+d,z.y-R); ctx.lineTo(z.x+d-R,z.y+R); } ctx.stroke(); ctx.restore();
  ctx.strokeStyle=K.red; ctx.lineWidth=1.5; if(arming) ctx.setLineDash([7,6]); ctx.beginPath(); ctx.arc(z.x,z.y,R,0,6.283); ctx.stroke(); ctx.setLineDash([]);
  ctx.textAlign='center'; inkText('NULL',z.x,z.y+4,K.red,fD(10)); ctx.restore(); }
 for(const c of bossCurrents){ const spin=REDUCED?0:c.t*(c.swirl>=0?1.2:-1.2), arming=c.t<c.warn;
  ctx.save(); ctx.globalAlpha=arming?0.4:0.6; ctx.strokeStyle=K.red; ctx.lineWidth=1; if(arming) ctx.setLineDash([6,6]);
  for(let k=1;k<=3;k++){ const rr=c.r*k/3; ctx.beginPath(); ctx.arc(c.x,c.y,rr,spin+k,spin+k+2.2); ctx.stroke(); ctx.beginPath(); ctx.arc(c.x,c.y,rr,spin+k+3.14,spin+k+5.34); ctx.stroke(); }
  ctx.setLineDash([]); ctx.restore(); }
 for(const m of marks){ const f=clamp(m.t/m.warn,0,1);
  ctx.save(); ctx.strokeStyle=K.red; ctx.lineWidth=1.5; ctx.setLineDash([6,5]); ctx.beginPath(); ctx.arc(m.x,m.y,m.r,0,6.283); ctx.stroke(); ctx.setLineDash([]);
  ctx.beginPath(); ctx.arc(m.x,m.y,Math.max(1,m.r*f),0,6.283); ctx.save(); ctx.clip(); ctx.strokeStyle=K.redDim; ctx.lineWidth=1; ctx.beginPath();
  for(let d=-m.r;d<m.r;d+=5){ ctx.moveTo(m.x+d,m.y-m.r); ctx.lineTo(m.x+d+m.r,m.y+m.r); } ctx.stroke(); ctx.restore();
  ctx.lineWidth=1; ctx.beginPath(); for(let k=0;k<4;k++){ const a=k*1.5708; ctx.moveTo(m.x+Math.cos(a)*(m.r-6),m.y+Math.sin(a)*(m.r-6)); ctx.lineTo(m.x+Math.cos(a)*(m.r+6),m.y+Math.sin(a)*(m.r+6)); } ctx.stroke(); ctx.restore(); }
 for(const b of bossBeams){ const live=b.t>=b.warn;
  for(let k=0;k<b.arms;k++){ const a=beamArm(b,k), c=Math.cos(a), s=Math.sin(a), sx=b.x+c*b.off, sy=b.y+s*b.off, ex=b.x+c*b.ends[k], ey=b.y+s*b.ends[k];
   if(!live){ ctx.save(); ctx.globalAlpha=0.8; tickedLine(sx,sy,ex,ey,K.red,1,24,3); ctx.restore(); }
   else { const nx=-s*b.w*0.5, ny=c*b.w*0.5; line(sx+nx,sy+ny,ex+nx,ey+ny,K.red,1.5); line(sx-nx,sy-ny,ex-nx,ey-ny,K.red,1.5); line(sx,sy,ex,ey,K.redHi,1.5);
    ctx.strokeStyle=K.red; ctx.lineWidth=1; ctx.beginPath(); ctx.arc(ex,ey,b.w*0.6,0,6.283); ctx.stroke(); } } }
}
function drawBossOver(){
 const p=player; if(!p) return;
 for(const g of bossGrasps){ const o=g.owner; if(!o) continue; ctx.save(); ctx.globalAlpha=0.85; tickedLine(o.x,o.y,p.x,p.y,K.red,1,18,3); ctx.restore(); }
 const S=p.status; if(!S) return;
 if(S.tether&&S.tether.owner){ const o=S.tether.owner; line(o.x,o.y,p.x,p.y,K.red,2); line(o.x,o.y,p.x,p.y,K.redHi,1); }
 if(S.freeze>0){ // a frost rim on the hull; still under reduced motion
  const spin=REDUCED?0:performance.now()/900; ctx.save(); ctx.translate(p.x,p.y); ctx.strokeStyle=K.red; ctx.lineWidth=1;
  ctx.beginPath(); ctx.arc(0,0,p.r+6,0,6.283); ctx.stroke(); ctx.beginPath(); ctx.arc(0,0,p.r+9,0,6.283); ctx.stroke();
  ctx.lineWidth=1.5; ctx.beginPath(); for(let k=0;k<6;k++){ const a=spin+k*1.0472; ctx.moveTo(Math.cos(a)*(p.r+9),Math.sin(a)*(p.r+9)); ctx.lineTo(Math.cos(a)*(p.r+15),Math.sin(a)*(p.r+15)); } ctx.stroke(); ctx.restore(); }
 else if(S.slow>0){ ctx.save(); ctx.strokeStyle=K.red; ctx.lineWidth=1; ctx.setLineDash([2,4]); ctx.beginPath(); ctx.arc(p.x,p.y,p.r+7,0,6.283); ctx.stroke(); ctx.setLineDash([]); ctx.restore(); }
}
// Parts in the god's local frame (drawn with its hull, so the codex has them).
function drawBossParts(e,g){ if(!e.parts||!e.parts.length) return; const a=e.partRot||0, c=Math.cos(a), s=Math.sin(a), kit=e.kit;
 for(const q of e.parts){ if(q.lx===undefined) continue; ctx.save(); ctx.translate(q.lx*c-q.ly*s,q.lx*s+q.ly*c);
  if(kit&&kit.drawPart) kit.drawPart(e,q,g);
  else { ctx.fillStyle=q.flash>0?g.P.flash:g.body; ctx.strokeStyle=g.col; ctx.lineWidth=1.5; poly(6,q.r,a); ctx.fill(); ctx.stroke();
   const f=clamp(q.hp/(q.maxhp||q.hp||1),0,1); ctx.strokeStyle=g.dim; ctx.lineWidth=2; ctx.beginPath(); ctx.arc(0,0,q.r*0.55,-1.5708,-1.5708+f*6.283); ctx.stroke(); }
  ctx.restore(); } }

// ---------- nest chaff stream (spec §7.4) ----------
// Ordinary enemies keep arriving while a nest's god lives: a pack from the
// sector's own pool every 6-10 s (sooner with depth) under an alive cap, from
// off-screen so it is seen flying in. It stops when the god dies; whatever is
// left must still be cleared. The god is the flagged lead, or, when nothing on
// the field is flagged (a lab-spawned god), any god that was not summoned.
const NEST_CHAFF_FIRST=8;
let nestChaffT=NEST_CHAFF_FIRST, nestLeadDown=false; // set once the nest's lead is killed
function nestHead(){ let any=null; for(const e of enemies){ if(e.type!=='boss'||e.dead) continue; if(e.lead) return e; if(!e.summoned&&!e.echo&&!any) any=e; }
 return nestLeadDown?null:any; }
function nestChaff(dt){
 if(!isBossSector(arenaIdx)||!player||!nestHead()) return;
 nestChaffT-=dt; if(nestChaffT>0) return;
 const n=arenaIdx+1, f=Math.min(1,n/100);
 nestChaffT=10-4*f+(Math.random()-0.5)*1.5;
 let alive=0; for(const e of enemies) if(e.type!=='boss') alive++;
 const cap=8+Math.min(10,(n/10)|0), pack=2+Math.min(3,(n/25)|0);
 const c=compFor(arenaIdx), pool=[]; for(const k in c) for(let i=0;i<Math.min(4,c[k]);i++) pool.push(k);
 if(!pool.length) return;
 const q=spawnEdgePos(700,1000);
 for(let k=0;k<pack&&alive<cap&&enemies.length<CAP.enemies;k++){ spawnEnemy(pool[(Math.random()*pool.length)|0],{x:q.x,y:q.y,pack:true}); alive++; }
}

// ========================================================================
//  THE LADDER — one block per god, in ladder order (S5 ... S100)
// ========================================================================
// Block format (BOSS_KITS[kind]) — the one reference for wave-2 kit work. Only
// def, lore, codex, cycle, attacks and draw are required:
//   def       : name, epithet, tier, hp, r, spd, pt, shape, sig, chaff (debut is derived)
//   lore      : the hub's debut line, naming its rank (the hub appends " Calls X.")
//   codex     : {role, threat, tell, counter, lore}
//   cycle     : attack names, one per def.pt-second slot (the lab can force any)
//   attacks   : {name(e,C)} — atk(...) from the shared library plus its own
//   signature : (e,C) every hunting frame, before the attack
//   init      : (e) once, when the god is built (lead or summoned; e.summoned says which)
//   post      : (e,dt) after movement and collision, every frame
//   under     : (e) world-space drawing beneath every hull (a trailing body)
//   draw      : (e,g) silhouette in local space; g={R,P,col,body,dim,lw,enrage,flash}
//   drawTop   : (e,g) local-space extras over the rank rings
//   drawPart  : (e,q,g) one part in its own local frame (default: a hex plate)
//   hitParts  : {rot(e), c:[[x,y,r],..]} extra body circles, units of drawn r
//   phases    : [{},{at:0.5,enter(e)},..] one entry per phase, phase I first; e.ph
//               is the phase a kit reads. Default by debut band (§3.7).
//   recover   : {at:[0.55], pool:0.08, label, hold, max, start(e,C), update(e,C)->done, end(e,why)}
//               threshold-armed, pool-capped (bossHeal draws on e.healPool); see §3.6 above
//   armor     : (e) -> 0..1 of damage taken this frame (e.g. 0.5 while heads live)
//   onPartBreak: (e,part)
//   calls     : kinds it summons, overriding the rung below
//   summons   : {at:[fractions], budget, pastCap}
//   vmax      : fastest legal travel if above the engine's default (the no-jump test)
//   label     : (e) -> string, overriding the attack name under the hull
// C (attacks, signature, recover): {p,d,nx,ny,dx,dy,dt,sF,enrage,aim,spdM,mv(f),orbit(f)}.
// Shared tools: eshot, eshotAt, eshotB (bouncing), summonChaff, bossBlink (allow-
// listed gods only), and the primitives above — bossBeam, bossMarks, dropDisc,
// shockwave, e.mirror (bossDeflect), addPart (hitBossPart), placeTempObs,
// bossGrasp, eraseZone, addCurrent, e.lens (bulletField), applyStatus. Every
// primitive telegraphs itself for at least 0.5 s and is capped and cleaned up by
// the engine; a kit never splices the pools itself. Radial volleys (burst,
// spiral, spiralwall) are rationed to WARDEN, HARBINGER and SINGULARITY (§3.9).
// Wave 2 fills these kits in; each group edits only its own blocks.

// ===== BOSS: OVERLORD =====
BOSS_KITS.overlord={
 def:{name:'OVERLORD',epithet:'the Berserk',tier:1,hp:985,r:30,spd:1.00,shape:'octa',pt:3.0,sig:null,chaff:['drone','stalker']},
 lore:'AN ENFORCER BARS THE TRAIL — OVERLORD, the Berserk, has never yielded a holmgang. End the saga.',
 codex:{role:'Brawler', threat:'Never recovers',
  tell:'Cycles BURST / SUMMON / CHARGE / SWEEP on a three-second clock.',
  counter:'Pure aggression with no escape. Learn the cycle and out-damage it.',
  lore:'The Berserk. The youngest of the gods, which out here means a few hundred million years old. Its makers built it to win rather than to hold, and it has never yielded a holmgang. They called this discipline. There is no one left to call it anything.'},
 cycle:['burst','summon','charge','sweep'],
 attacks:atk('burst','summon','charge','sweep'),
 draw(e,g){ // the Berserk: dashed ring, eight-sided core
  const R=g.R;
  ctx.save(); ctx.rotate(e.t*0.6); ctx.strokeStyle=g.dim; ctx.lineWidth=3; ctx.setLineDash([18,10]); ctx.beginPath(); ctx.arc(0,0,R+4,0,6.283); ctx.stroke(); ctx.setLineDash([]); ctx.restore();
  ctx.fillStyle=g.body; ctx.strokeStyle=g.col; ctx.lineWidth=g.lw; poly(8,R-4,-e.t*0.4); ctx.fill(); ctx.stroke();
  ctx.strokeStyle=g.dim; ctx.lineWidth=1; poly(8,R*0.5,-e.t*0.4); ctx.stroke();
  ctx.fillStyle=g.col; ctx.beginPath(); ctx.arc(0,0,5,0,6.283); ctx.fill();
  if(g.enrage){ ctx.fillStyle=g.col; for(let k=0;k<4;k++){ const a=e.t*3+k*1.57; ctx.beginPath(); ctx.moveTo(Math.cos(a)*(R+2),Math.sin(a)*(R+2)); ctx.lineTo(Math.cos(a+0.2)*(R+12),Math.sin(a+0.2)*(R+12)); ctx.lineTo(Math.cos(a-0.2)*(R+12),Math.sin(a-0.2)*(R+12)); ctx.closePath(); ctx.fill(); } }
 }
};
// ===== END BOSS: OVERLORD =====

// ===== BOSS: WARDEN =====
BOSS_KITS.warden={
 def:{name:'WARDEN',epithet:'Bridge-Warden',tier:2,hp:1250,r:34,spd:0.80,shape:'hex',pt:3.5,sig:null,chaff:['drone','stalker']},
 lore:'A CAPTAIN HOLDS THE BRIDGE — WARDEN guards a lane that leads nowhere now.',
 codex:{role:'Siege fortress', threat:'Retreats once or twice',
  tell:'Slow. Spirals, guards, seismic slams, twin staggered waves.',
  counter:'Stay off the rings. When it RETREATS, chase — damage stops its healing.',
  lore:'Bridge-Warden. Lane authority, built to stand at the one crossing between two dead empires. It was never meant to advance, only to make advancing expensive, and it has kept that contract long after the lane stopped leading anywhere.'},
 cycle:['spiral','summon','slam','twinwave'],
 attacks:atk('spiral','summon','slam','twinwave'),
 draw(e,g){ // dashed siege collar, heavy hex core
  const R=g.R;
  ctx.save(); ctx.rotate(e.t*0.4); ctx.strokeStyle=g.dim; ctx.lineWidth=3; ctx.setLineDash([14,8]); ctx.beginPath(); ctx.arc(0,0,R+4,0,6.283); ctx.stroke(); ctx.setLineDash([]); ctx.restore();
  ctx.fillStyle=g.body; ctx.strokeStyle=g.col; ctx.lineWidth=g.lw; poly(6,R-4,e.t*0.25); ctx.fill(); ctx.stroke();
  ctx.strokeStyle=g.dim; poly(6,R*0.55,e.t*0.25); ctx.stroke();
  ctx.fillStyle=g.col; ctx.beginPath(); ctx.arc(0,0,4,0,6.283); ctx.fill();
 }
};
// ===== END BOSS: WARDEN =====

// ===== BOSS: PHANTOM =====
BOSS_KITS.phantom={
 def:{name:'PHANTOM',epithet:'the Undelivered',tier:2,hp:760,r:26,spd:1.35,shape:'diamond',pt:9,sig:'laser',chaff:['drone','mite']},
 // Ghost Form, once (spec §5), the reference recovery: translucent on the
 // spot, rounds land at 30% (e.phased), knitting from its pool while the
 // escorts it raised live. Killing them breaks it; so does RELENTLESS.
 recover:{ at:[0.55], pool:0.08, label:'GHOST FORM', hold:true, max:4.5,
  start(e){ e.phased=true; e.beamT=0; e.spawned=[];
   const nm=2+(arenaIdx>=15?1:0);
   for(let k=0;k<nm&&enemies.length<CAP.enemies;k++){ const s2=nearSpot(player.x,player.y,200,330,26); const m=mkEnemy(k?'mite':'drone',s2.x,s2.y,arenaIdx); m.spawnT=0.9; enemies.push(m); e.spawned.push(m.uid); }
   rings.push({x:e.x,y:e.y,r:10,maxR:120,spd:320,dmg:0,hit:true});
   addFloater(e.x,calloutY(e),'PHANTOM — GHOST FORM · kill the escorts',K.red); SFX.portal(); },
  update(e,C){ bossHeal(e,e.maxhp*0.02*C.dt); e.spawned=e.spawned.filter(u=>enemies.some(o=>o.uid===u&&!o.dead)); return e.spawned.length===0; },
  end(e,why){ e.phased=false; rings.push({x:e.x,y:e.y,r:10,maxR:90,spd:300,dmg:0,hit:true});
   addFloater(e.x,calloutY(e),why==='broken'?'GHOST FORM BROKEN':'PHANTOM RE-FORMS',why==='broken'?K.gold:K.red); }
 },
 lore:'A CAPTAIN WITHOUT A POST — PHANTOM carries a reply no one is left to read.',
 codex:{role:'Skirmisher', threat:'Ghost Form, once',
  tell:'A locked RED LINE that holds still — the beam comes down exactly there.',
  counter:'Step off the line. In GHOST FORM it still takes 30% damage — kill its escorts to break it.',
  lore:'The Undelivered. A courier that learned its cargo was itself. It crossed eleven thousand years to deliver a reply and arrived at an empty star. The blink hardware was for outrunning interdiction; the beam was improvised later, from the part that did the outrunning.'},
 cycle:['skirmish'],
 attacks:{
  skirmish(e,C){ // weave, fan, blink
   C.orbit(1.1); e.burstT-=C.dt;
   if(e.burstT<=0){ e.burstT=C.enrage?1.1:1.7;
    for(let k=-2;k<=2;k++) eshot(e,C.aim+k*0.16,260,5);
    SFX.eshoot(); }
   e.teleCd-=C.dt;
   // Blink to a VALIDATED spot 190-300px out: on screen, out of obstacles, off
   // the walls. PHANTOM is the one god the teleport policy lets blink freely.
   if(e.teleCd<=0){ e.teleCd=C.enrage?3:4.5;
    const tp=nearSpot(C.p.x,C.p.y,190,300,e.r+16); bossBlink(e,tp.x,tp.y,'blink'); } }
 },
 signature(e,C){ // locks a line, telegraphs, then fires down it
  const p=C.p; e.laserT-=C.dt;
  if(e.laser){ e.laser.t-=C.dt;
   if(e.laser.t<=0){ const a=e.laser.ang, dx2=Math.cos(a), dy2=Math.sin(a);
    const tt=clamp((p.x-e.x)*dx2+(p.y-e.y)*dy2,0,700), cx=e.x+dx2*tt, cy=e.y+dy2*tt;
    e.beamA=a; e.beamT=0.25; e.laser=null; e.laserT=C.enrage?3.5:5;
    for(let k=0;k<=10;k++) pushPart({x:e.x+dx2*k*70,y:e.y+dy2*k*70,vx:0,vy:0,life:0.25,maxlife:0.25,col:K.red,r:5});
    SFX.eshoot();
    if(Math.hypot(p.x-cx,p.y-cy)<16) hurtPlayer(e.dmg+8,true,srcOf(e)); } }
  else if(e.laserT<=0){ e.laser={t:0.7,ang:C.aim}; SFX.click(); }
 },
 draw(e,g){ // ghosted diamond inside a counter-spinning frame
  const R=g.R;
  ctx.save(); ctx.rotate(e.t*1.2+Math.PI/4); ctx.strokeStyle=g.dim; ctx.lineWidth=1; ctx.strokeRect(-R*0.62,-R*0.62,R*1.24,R*1.24); ctx.restore();
  ctx.fillStyle=g.body; ctx.strokeStyle=g.col; ctx.lineWidth=g.lw; poly(4,R-6,-e.t*1.2); ctx.fill(); ctx.stroke();
  ctx.strokeStyle=g.dim; poly(4,R*0.4,-e.t*1.2); ctx.stroke();
  ctx.fillStyle=g.col; ctx.beginPath(); ctx.arc(0,0,3,0,6.283); ctx.fill();
 }
};
// ===== END BOSS: PHANTOM =====

// ===== BOSS: REVENANT =====
// Placeholder kit (wave 2 builds the full one, spec §5): Rime Bolts only.
BOSS_KITS.revenant={
 def:{name:'REVENANT',epithet:'the Cold-Sleeper',tier:2,hp:900,r:28,spd:0.95,shape:'pods',pt:3.4,sig:'rime',chaff:['drone','mite']},
 lore:'A CAPTAIN WHO SLEPT THROUGH THE COLD — REVENANT wakes for you, and only you.',
 codex:{role:'Cryo skirmisher', threat:'Slow rounds that bite',
  tell:'Its pods pale before a volley of three slow RIME BOLTS down your line.',
  counter:'Slow rounds are easy to sidestep. Keep moving across the volley, never along it.',
  lore:'The Cold-Sleeper. A sleeper ship whose crew never woke, and whose pods decided, somewhere in the dark, to keep the ship instead. It wakes only for a visitor. The cold it carries is not a weapon, exactly; it is simply what the inside of the pods is like.'},
 cycle:['rime','fan'],
 attacks:Object.assign(atk('fan'),{
  rime(e,C){ // three slow pale rounds down your line, 0.35s aimed tell
   C.mv(0.45); e.burstT-=C.dt;
   if(e.aimT>0){ e.aimT-=C.dt; if(e.aimT<=0){ for(let k=-1;k<=1;k++){ const b=eshot(e,C.aim+k*0.12,150,7,0.9,5); if(b) b.freeze=1.0; } SFX.eshoot(); } }
   else if(e.burstT<=0){ e.burstT=C.enrage?1.3:1.9; e.aimT=0.35; } }
 }),
 draw(e,g){ // three overlapping cryo capsules in a Y
  const R=g.R;
  for(let k=0;k<3;k++){ ctx.save(); ctx.rotate(-1.5708+k*2.094+e.t*0.15);
   const L=R*0.95, w=R*0.34; polyPts([[w*0.2,-w],[L-w,-w],[L,0],[L-w,w],[w*0.2,w],[-w*0.4,0]]);
   ctx.fillStyle=g.body; ctx.fill(); ctx.strokeStyle=g.col; ctx.lineWidth=g.lw; ctx.stroke();
   ctx.strokeStyle=g.dim; ctx.lineWidth=1; ctx.beginPath(); ctx.moveTo(R*0.3,0); ctx.lineTo(L-w,0); ctx.stroke(); ctx.restore(); }
  ctx.fillStyle=e.aimT>0?K.redHi:g.col; ctx.beginPath(); ctx.arc(0,0,4,0,6.283); ctx.fill();
 }
};
// ===== END BOSS: REVENANT =====

// ===== BOSS: LEVIATHAN =====
BOSS_KITS.leviathan={
 def:{name:'LEVIATHAN',epithet:'the Lane-Wyrm',tier:3,hp:1700,r:36,spd:0.85,shape:'serpent',pt:4.0,sig:'segments',chaff:['mite','drone']},
 lore:'A LORD OF THE DEEP LANE — LEVIATHAN leaves a ghost of itself in the lane.',
 codex:{role:'Serpent', threat:'Body damages on contact',
  tell:'The head sweeps twin streams as the whole body wheels after it, leaving a fading red WAKE the shape of its tail.',
  counter:'Watch the body, not the head. Segments and the wake hurt — cross the trail where it has faded.',
  lore:'The Lane-Wyrm. Lane-boring infrastructure that kept growing after the contract lapsed, tunnelling debris fields for a trade that ended before home\'s star was lit. The segments are not armour; they are the original boring string, still following the head out of habit.'},
 // burrow is gone (spec §3.5): LEVIATHAN never leaves the surface
 cycle:['tailsweep','mines','spiral'],
 attacks:Object.assign(atk('mines','spiral'),{
  tailsweep(e,C){ // the body itself is the attack
   C.orbit(0.85); e.spirT-=C.dt;
   if(e.spirT<=0){ e.spirT=0.5; const a=e.t*1.6;
    for(let k=0;k<2;k++) eshot(e,a+k*3.14,200,7,0.9); } }
 }),
 // Phase II (spec §5): the wake lingers 5 s instead of 3.5 — the phase framework's proof
 phases:[{},{at:0.5,enter(e){ e.wakeLife=5; }}],
 init(e){ e.segs=[]; for(let k=0;k<5;k++) e.segs.push({x:e.x,y:e.y,r:e.r*(0.72-k*0.08)}); e.wakeLife=3.5; },
 signature(e,C){ // a trailing body that also hurts to touch
  const p=C.p;
  for(const g of e.segs) if(!e.phased&&e.contactCd<=0&&dist2(p.x,p.y,g.x,g.y)<(g.r+p.r)*(g.r+p.r)){ e.contactCd=0.7; hurtPlayer(Math.round(e.dmg*0.6),true,srcOf(e,'BODY')); }
 },
 // The body moves as one piece: every move of the head, forced or not, drags
 // each segment after it, so nothing can leave a segment behind.
 post(e){ let prev=e; const want=e.r*0.82;
  for(const g of e.segs){ const vx=prev.x-g.x, vy=prev.y-g.y, l=len(vx,vy); if(l>want){ g.x+=vx/l*(l-want); g.y+=vy/l*(l-want); } prev=g; }
  // Wake Trail (the signature): the head and every segment leave a disc their
  // own size each time they move most of a width, so a fading copy of the tail
  // lies behind it. Discs are harmless for their first 0.25 s.
  const life=e.wakeLife||3.5, src=e.wakeSrc||(e.wakeSrc=srcOf(e,'WAKE')), dmg=Math.round(e.dmg*0.3);
  const drop=(q,r)=>{ if(q.wx===undefined||Math.hypot(q.x-q.wx,q.y-q.wy)>=r*0.8){ q.wx=q.x; q.wy=q.y; dropDisc(e,q.x,q.y,r,{life,dmg,src}); } };
  drop(e,e.r*0.8); for(const g of e.segs) drop(g,g.r); },
 under(e){ // the body behind the head
  const P=pigOf(e); ctx.save(); ctx.globalAlpha=e.phased?0.3:1;
  for(let k=e.segs.length-1;k>=0;k--){ const g=e.segs[k];
   ctx.fillStyle=P.body; ctx.strokeStyle=e.hp<e.maxhp*0.3?P.hi:P.c; ctx.lineWidth=1.5;
   ctx.beginPath(); ctx.arc(g.x,g.y,g.r,0,6.283); ctx.fill(); ctx.stroke();
   ctx.strokeStyle=P.dim; ctx.lineWidth=1; ctx.beginPath(); ctx.arc(g.x,g.y,g.r*0.55,0,6.283); ctx.stroke(); }
  ctx.restore(); },
 draw(e,g){ // armoured head with mandibles
  const R=g.R;
  ctx.save(); ctx.rotate(Math.atan2(player?player.y-e.y:0,player?player.x-e.x:1));
  ctx.fillStyle=g.body; ctx.strokeStyle=g.col; ctx.lineWidth=g.lw;
  ctx.beginPath(); ctx.moveTo(R,0); ctx.lineTo(R*0.2,-R*0.78); ctx.lineTo(-R*0.8,-R*0.5); ctx.lineTo(-R*0.8,R*0.5); ctx.lineTo(R*0.2,R*0.78); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.lineWidth=3; ctx.lineCap='round'; ctx.beginPath(); ctx.moveTo(R*0.55,-R*0.4); ctx.lineTo(R*1.25,-R*0.72); ctx.moveTo(R*0.55,R*0.4); ctx.lineTo(R*1.25,R*0.72); ctx.stroke(); ctx.lineCap='butt';
  ctx.strokeStyle=g.dim; ctx.lineWidth=1; ctx.beginPath(); for(let k=1;k<4;k++){ const x=R*0.2-k*R*0.25; ctx.moveTo(x,-R*0.6); ctx.lineTo(x,R*0.6); } ctx.stroke();
  ctx.fillStyle=g.col; ctx.beginPath(); ctx.arc(R*0.1,-R*0.26,3,0,6.283); ctx.arc(R*0.1,R*0.26,3,0,6.283); ctx.fill();
  ctx.restore();
 },
 // the mandibles reach past the head's circle
 hitParts:{ rot:e=>Math.atan2(player?player.y-e.y:0,player?player.x-e.x:1), c:[[1.05,-0.62,0.2],[1.05,0.62,0.2]] }
};
// ===== END BOSS: LEVIATHAN =====

// ===== BOSS: HYDRA =====
// Placeholder kit (wave 2 builds the full one, spec §5): three throats firing in turn.
BOSS_KITS.hydra={
 def:{name:'HYDRA',epithet:'the Three-Throated',tier:3,hp:1500,r:34,spd:0.85,shape:'hepta',pt:3.6,sig:'throats',chaff:['stalker','mite']},
 lore:'A LORD WITH THREE THROATS — HYDRA argues with itself, and every voice is aimed.',
 codex:{role:'Many-headed', threat:'Three angles of fire',
  tell:'Each neck flares in turn, then throws a short fan from where that head points.',
  counter:'The heads fire one after another: move after each flare, not before.',
  lore:'The Three-Throated. A council ship, built when its makers could not agree on a captain and so installed three. They still cannot agree. Everything it fires is the loser of an argument that has run for four hundred million years.'},
 cycle:['throats','slam'],
 attacks:Object.assign(atk('slam'),{
  throats(e,C){ // the heads fire in turn, each a short fan from its own neck
   C.mv(0.4); e.burstT-=C.dt;
   if(e.burstT<=0){ e.burstT=C.enrage?0.5:0.75; e.head=((e.head||0)+1)%3;
    const hp=hydraHead(e,e.head), a=Math.atan2(C.p.y-hp.y,C.p.x-hp.x);
    for(let k=-1;k<=1;k++) eshotAt(e,hp.x,hp.y,a+k*0.14,240,5,0.8);
    SFX.eshoot(); } }
 }),
 draw(e,g){ // a heptagon body with three lobed necks
  const R=g.R, face=Math.atan2(player?player.y-e.y:0,player?player.x-e.x:1);
  for(let k=0;k<3;k++){ const a=face+(k-1)*0.8, hx=Math.cos(a)*R*1.05, hy=Math.sin(a)*R*1.05;
   ctx.strokeStyle=g.dim; ctx.lineWidth=3; ctx.beginPath(); ctx.moveTo(Math.cos(a)*R*0.5,Math.sin(a)*R*0.5); ctx.lineTo(hx,hy); ctx.stroke();
   // the next throat flares red before it fires
   ctx.fillStyle=(((e.head||0)+1)%3===k&&e.burstT<0.35)?K.red:g.body; ctx.strokeStyle=g.col; ctx.lineWidth=1.5; ctx.save(); ctx.translate(hx,hy); poly(5,R*0.26,a); ctx.fill(); ctx.stroke(); ctx.restore(); }
  ctx.fillStyle=g.body; ctx.strokeStyle=g.col; ctx.lineWidth=g.lw; poly(7,R*0.78,e.t*0.2); ctx.fill(); ctx.stroke();
  ctx.strokeStyle=g.dim; ctx.lineWidth=1; poly(7,R*0.42,e.t*0.2); ctx.stroke();
 },
 hitParts:{ rot:e=>Math.atan2(player?player.y-e.y:0,player?player.x-e.x:1), c:[[1.05*Math.cos(-0.8),1.05*Math.sin(-0.8),0.28],[1.05,0,0.28],[1.05*Math.cos(0.8),1.05*Math.sin(0.8),0.28]] }
};
function hydraHead(e,k){ const face=Math.atan2(player?player.y-e.y:0,player?player.x-e.x:1), a=face+(k-1)*0.8; return {x:e.x+Math.cos(a)*e.r*1.05,y:e.y+Math.sin(a)*e.r*1.05}; }
// ===== END BOSS: HYDRA =====

// ===== BOSS: WYVERN =====
// Placeholder kit (wave 2 builds the full one, spec §5): a telegraphed Strafing Run.
BOSS_KITS.wyvern={
 def:{name:'WYVERN',epithet:'the Strafing Wing',tier:3,hp:1300,r:30,spd:1.15,shape:'delta',pt:3.2,sig:'strafe',chaff:['drone','tempest']},
 lore:'A LORD ON THE WING — WYVERN strafes the lane it lit for you. Leave the lane.',
 codex:{role:'Strafer', threat:'High-speed dives',
  tell:'A RED LANE lights across the field, then it dives straight down it.',
  counter:'The lane is the whole attack. Step out of it sideways while it lights.',
  lore:'The Strafing Wing. A picket fighter from a war fought at such speed that the pilots were removed to save weight. The wing learned the war by itself. It still lights its run before it makes it, a courtesy from an age when the other side had to see it coming.'},
 vmax:720,
 cycle:['strafe','fan'],
 attacks:Object.assign(atk('fan'),{
  strafe(e,C){ // lane lights 0.9 s, then a straight dive down it
   const s=e.run;
   if(!s){ C.orbit(0.8); e.burstT-=C.dt;
    if(e.burstT<=0){ e.burstT=C.enrage?1.6:2.4; const a=Math.atan2(C.p.y-e.y,C.p.x-e.x); e.run={t:0,a,x:e.x,y:e.y}; SFX.click(); } return; }
   s.t+=C.dt;
   if(s.t<0.9) return; // the lane is lit: hold still and let it read
   if(s.t<1.8){ const v=700; e.x+=Math.cos(s.a)*v*C.dt; e.y+=Math.sin(s.a)*v*C.dt; e.intent+=v*C.dt; e.charging=true;
    const hitWall=e.x<=PX0+e.r+1||e.x>=PX1-e.r-1||e.y<=PY0+e.r+1||e.y>=PY1-e.r-1; if(hitWall) s.t=1.8; return; }
   e.run=null; }
 }),
 label(e){ return e.run&&e.run.t<0.9?'STRAFING RUN':''; },
 drawTop(e,g){ const s=e.run; if(!s||s.t>=0.9) return; const L=900, w=e.r*0.9;
  ctx.save(); ctx.translate(s.x-e.x,s.y-e.y); ctx.rotate(s.a);
  ctx.globalAlpha=0.8; tickedLine(0,-w,L,-w,K.red,1,24,3); tickedLine(0,w,L,w,K.red,1,24,3); ctx.restore(); },
 draw(e,g){ // a swept delta of triangles and parallelograms
  const R=g.R; ctx.save(); ctx.rotate(e.run?e.run.a:Math.atan2(player?player.y-e.y:0,player?player.x-e.x:1));
  ctx.fillStyle=g.body; ctx.strokeStyle=g.col; ctx.lineWidth=g.lw;
  polyPts([[R,0],[-R*0.55,-R*0.95],[-R*0.25,0],[-R*0.55,R*0.95]]); ctx.fill(); ctx.stroke();
  ctx.strokeStyle=g.dim; ctx.lineWidth=1; polyPts([[R*0.55,0],[-R*0.1,-R*0.42],[-R*0.1,R*0.42]]); ctx.stroke();
  ctx.fillStyle=e.run&&e.run.t<0.9?K.redHi:g.col; ctx.beginPath(); ctx.arc(R*0.2,0,3,0,6.283); ctx.fill(); ctx.restore();
 }
};
// ===== END BOSS: WYVERN =====

// ===== BOSS: ORACLE =====
BOSS_KITS.oracle={
 def:{name:'ORACLE',epithet:'the Rememberer',tier:3,hp:1150,r:30,spd:0.90,shape:'eye',pt:3.6,sig:'wards',chaff:['tempest','drone']},
 lore:'A LORD WHO KEEPS THE LEDGER — ORACLE has already calculated this fight.',
 codex:{role:'Zone controller', threat:'Warded until broken',
  tell:'Three shards orbit it. Rotating twin beams; damaging fields parked on you.',
  counter:'Break all three WARDS first — until then it soaks 75% of every round.',
  lore:'The Rememberer. It computes where you will be, which is a harder problem than it sounds and a cheaper one than aiming. It has run the same sum on every species it ever heard, and kept the answers. The wards are its working memory, and it cannot afford to lose them mid-calculation.'},
 // The Call (decided, spec §2/§5): two WYVERNs at 50%. Wave 2 builds its heal
 // and re-arm on top; the budget already leaves room for two re-arms.
 calls:['wyvern','wyvern'], summons:{at:[0.5], budget:6},
 cycle:['clockbeam','zone','summon','burst'],
 attacks:atk('clockbeam','zone','summon','burst'),
 signature(e,C){ // orbiting shields — break them or it takes 25% damage
  if(!e.wards.length&&!e.wardsBroken){ for(let k=0;k<3;k++) e.wards.push({a:k*2.094,hp:1}); e.wardsBroken=false; }
  e.wardA=(e.wardA||0)+C.dt*1.1;
  e.shielded=e.wards.length>0;
 },
 draw(e,g){ // lidded eye, pupil tracks you
  const R=g.R;
  ctx.fillStyle=g.body; ctx.strokeStyle=g.col; ctx.lineWidth=g.lw;
  ctx.beginPath(); ctx.ellipse(0,0,R,R*0.66,0,0,6.283); ctx.fill(); ctx.stroke();
  { const a=Math.atan2(player?player.y-e.y:0,player?player.x-e.x:1);
    ctx.strokeStyle=g.col; ctx.beginPath(); ctx.arc(Math.cos(a)*R*0.34,Math.sin(a)*R*0.22,R*0.30,0,6.283); ctx.stroke();
    ctx.fillStyle=g.col; ctx.beginPath(); ctx.arc(Math.cos(a)*R*0.34,Math.sin(a)*R*0.22,R*0.12,0,6.283); ctx.fill(); }
  ctx.strokeStyle=g.dim; ctx.lineWidth=1;
  ctx.beginPath(); ctx.moveTo(-R,0); ctx.quadraticCurveTo(0,-R*0.95,R,0); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(-R,0); ctx.quadraticCurveTo(0,R*0.95,R,0); ctx.stroke();
 },
 drawTop(e,g){ // the wards ride outside the eye
  for(const w of e.wards){ const a=w.a+(e.wardA||0);
   ctx.save(); ctx.translate(Math.cos(a)*(g.R+26),Math.sin(a)*(g.R+26)); ctx.rotate(a*2);
   ctx.fillStyle=g.P.body; ctx.strokeStyle=g.P.c; ctx.lineWidth=1.5; poly(3,10,0); ctx.fill(); ctx.stroke(); ctx.restore(); }
 }
};
// ===== END BOSS: ORACLE =====

// ===== BOSS: SENTINEL =====
// Placeholder kit (wave 2 builds the full one, spec §5): Spear Line only.
BOSS_KITS.sentinel={
 def:{name:'SENTINEL',epithet:'the Shield-Wall',tier:3,hp:1400,r:32,spd:0.80,shape:'shield',pt:3.4,sig:'mirror',chaff:['stalker','sniper']},
 lore:'A LORD BEHIND A MIRROR — SENTINEL has held its wall for longer than walls.',
 codex:{role:'Shield-bearer', threat:'Lances in a line',
  tell:'The shield lowers and a SPEAR LINE of rounds runs straight at you, one behind another.',
  counter:'A line is narrow. Step off it and circle toward its flank.',
  lore:'The Shield-Wall. A gatehouse given engines, from a people who believed a wall that could follow you was a kinder thing than a gun. It has never started a fight. It has also never let one end on any terms but its own.'},
 cycle:['spearline','slam'],
 attacks:Object.assign(atk('slam'),{
  spearline(e,C){ // a straight lance volley: one line, staggered speeds
   C.mv(0.35); e.burstT-=C.dt;
   if(e.aimT>0){ e.aimT-=C.dt; if(e.aimT<=0){ for(let k=0;k<5;k++) eshot(e,e.spear,210+k*38,5,0.8,3.6); SFX.eshoot(); } }
   else if(e.burstT<=0){ e.burstT=C.enrage?1.2:1.7; e.aimT=0.5; e.spear=C.aim; } }
 }),
 draw(e,g){ // a tall trapezoid shield in front of a square core
  const R=g.R, a=Math.atan2(player?player.y-e.y:0,player?player.x-e.x:1);
  ctx.fillStyle=g.body; ctx.strokeStyle=g.col; ctx.lineWidth=g.lw; ctx.save(); ctx.rotate(e.t*0.2); ctx.fillRect(-R*0.5,-R*0.5,R,R); ctx.strokeRect(-R*0.5,-R*0.5,R,R); ctx.restore();
  ctx.save(); ctx.rotate(a); polyPts([[R*0.55,-R*0.95],[R*0.95,-R*0.6],[R*0.95,R*0.6],[R*0.55,R*0.95]]);
  ctx.fillStyle=e.aimT>0?K.red:g.body; ctx.fill(); ctx.strokeStyle=g.col; ctx.stroke();
  ctx.strokeStyle=g.dim; ctx.lineWidth=1; ctx.beginPath(); ctx.moveTo(R*0.75,-R*0.7); ctx.lineTo(R*0.75,R*0.7); ctx.stroke(); ctx.restore();
  if(e.aimT>0){ tickedLine(0,0,Math.cos(e.spear)*600,Math.sin(e.spear)*600,K.red,1,24,3); }
 }
};
// ===== END BOSS: SENTINEL =====

// ===== BOSS: ARCHON =====
BOSS_KITS.archon={
 def:{name:'ARCHON',epithet:'the Lawspeaker',tier:4,hp:1800,r:34,spd:0.90,shape:'crown',pt:3.8,sig:'command',chaff:['stalker','sniper']},
 lore:'THE FIRST SOVEREIGN — ARCHON the Lawspeaker wrote the holmgang you fight under.',
 codex:{role:'Commander', threat:'Calls SENTINEL twice',
  tell:'Rotating cross-beams, and "ARCHON CALLS SENTINEL" as its bar crosses three quarters and one quarter.',
  counter:'Deep down the trail its SENTINEL calls ORACLE in turn. Kill the ARCHON to stop the calls.',
  lore:'The Lawspeaker. Rank, rendered as a machine. It wrote the holmgang every god fights under, it has never fired the first shot in any holmgang it has won, and it regards this as the entire point of the office.'},
 summons:{at:[0.75,0.25]}, // decided timing (spec §2)
 cycle:['crossbeam','muster','burst','slam'],
 attacks:atk('crossbeam','muster','burst','slam'),
 draw(e,g){ // command crown with rank spikes
  const R=g.R;
  ctx.save(); ctx.rotate(e.t*0.3); ctx.strokeStyle=g.dim; ctx.lineWidth=2; ctx.setLineDash([10,7]); ctx.beginPath(); ctx.arc(0,0,R+6,0,6.283); ctx.stroke(); ctx.setLineDash([]); ctx.restore();
  ctx.fillStyle=g.body; ctx.strokeStyle=g.col; ctx.lineWidth=g.lw; poly(7,R-5,e.t*0.2); ctx.fill(); ctx.stroke();
  ctx.fillStyle=g.col;
  for(let k=0;k<5;k++){ const a=-1.5708+(k-2)*0.42;
   ctx.beginPath(); ctx.moveTo(Math.cos(a)*R*0.66,Math.sin(a)*R*0.66); ctx.lineTo(Math.cos(a-0.09)*R*1.16,Math.sin(a-0.09)*R*1.16); ctx.lineTo(Math.cos(a+0.09)*R*1.16,Math.sin(a+0.09)*R*1.16); ctx.closePath(); ctx.fill(); }
  ctx.strokeStyle=g.col; ctx.lineWidth=1; ctx.beginPath(); ctx.arc(0,0,R*0.3,0,6.283); ctx.stroke();
 }
};
// ===== END BOSS: ARCHON =====

// ===== BOSS: COLOSSUS =====
// Placeholder kit (wave 2 builds the full one, spec §5): Triple Stomp only.
BOSS_KITS.colossus={
 def:{name:'COLOSSUS',epithet:'the Walled',tier:4,hp:1900,r:40,spd:0.70,shape:'fortress',pt:3.8,sig:'plates',chaff:['brute','stalker']},
 lore:'A SOVEREIGN THAT IS A WALL — COLOSSUS walks, and the ground takes notice.',
 codex:{role:'Fortress', threat:'Three rings per stomp',
  tell:'It rears, a ring is ruled around it, then three concentric SHOCKWAVES roll out one after another.',
  counter:'Count to three. The rings are bands, not discs: step over each one, or dash all three.',
  lore:'The Walled. A city that was told to leave and took itself. Its makers could not find a world to put it on and so never stopped walking. Everything it does is slow, because everything it is was built to stand still.'},
 cycle:['stomp','fan'],
 attacks:Object.assign(atk('fan'),{
  stomp(e,C){ // a 0.6 s rear, then three staggered rings
   C.mv(0.4); e.slamCd-=C.dt;
   if(e.windup>0){ e.windup-=C.dt; if(e.windup<=0){ e.stompN=3; e.stompT=0; } }
   else if(e.slamCd<=0&&C.d<420){ e.slamCd=C.enrage?3.2:4.4; e.windup=0.6; SFX.click(); }
   if(e.stompN>0){ e.stompT-=C.dt; if(e.stompT<=0){ e.stompN--; e.stompT=0.45;
    rings.push({x:e.x,y:e.y,r:24,maxR:230,spd:260,dmg:Math.round(e.dmg*0.8),hit:false,heavy:true}); SFX.ring(); if(settings.shake) shake=Math.min(10,shake+3); } } }
 }),
 draw(e,g){ // a stacked octagon and square fortress
  const R=g.R;
  ctx.fillStyle=g.body; ctx.strokeStyle=g.col; ctx.lineWidth=g.lw; poly(8,R-3,0.3927); ctx.fill(); ctx.stroke();
  ctx.save(); ctx.rotate(0.7854+e.t*0.1); ctx.strokeStyle=g.dim; ctx.lineWidth=1.5; ctx.strokeRect(-R*0.5,-R*0.5,R,R); ctx.restore();
  ctx.strokeStyle=g.dim; ctx.lineWidth=1; poly(8,R*0.8,0.3927); ctx.stroke();
  ctx.fillStyle=e.windup>0?K.redHi:g.col; ctx.fillRect(-4,-4,8,8);
  if(e.windup>0){ ctx.strokeStyle=K.red; ctx.lineWidth=1.5; ctx.beginPath(); ctx.arc(0,0,230,0,6.283); ctx.stroke(); }
 }
};
// ===== END BOSS: COLOSSUS =====

// ===== BOSS: BASILISK =====
BOSS_KITS.basilisk={
 def:{name:'BASILISK',epithet:'Keeper of the Held',tier:4,hp:1350,r:31,spd:1.10,shape:'coil',pt:3.4,sig:'petrify',chaff:['stalker','mite']},
 lore:'A SOVEREIGN OF QUARANTINE — its last visitor is still held in BASILISK\'s eye.',
 codex:{role:'Controller', threat:'Roots you in place',
  tell:'A ruled CONE opens before the gaze fires. Lunges leave spikes behind.',
  counter:'Leave the cone — being PETRIFIED next to a lunge is how this fight ends.',
  lore:'Keeper of the Held. A dying world built it to keep visitors away, so that whatever was killing them would not leave. It does not kill so much as hold you pending review. The reviewers ended nine hundred million years ago. The queue has not moved.'},
 cycle:['gaze','linecharge','spikes','fan'],
 attacks:atk('gaze','linecharge','spikes','fan'),
 draw(e,g){ // coiled plates with a slit gaze
  const R=g.R;
  for(let k=3;k>=1;k--){ ctx.strokeStyle=k===3?g.col:g.dim; ctx.lineWidth=1;
   ctx.beginPath(); ctx.arc(0,0,R*(0.42+k*0.2),e.t*0.6+k,e.t*0.6+k+4.2); ctx.stroke(); }
  ctx.fillStyle=g.body; ctx.strokeStyle=g.col; ctx.lineWidth=g.lw; poly(5,R*0.6,e.t*0.3); ctx.fill(); ctx.stroke();
  { const a=Math.atan2(player?player.y-e.y:0,player?player.x-e.x:1);
    ctx.save(); ctx.rotate(a); ctx.fillStyle=g.col;
    ctx.beginPath(); ctx.ellipse(R*0.22,0,R*0.26,2.6,0,0,6.283); ctx.fill(); ctx.restore(); }
 }
};
// ===== END BOSS: BASILISK =====

// ===== BOSS: PROGENITOR =====
// Placeholder kit (wave 2 builds the full one, spec §5): Broadside only.
BOSS_KITS.progenitor={
 def:{name:'PROGENITOR',epithet:'the Brood-Hall',tier:4,hp:1600,r:36,spd:0.80,shape:'hull',pt:3.6,sig:'bays',chaff:['drone','mite']},
 lore:'A SOVEREIGN THAT IS A HANGAR — PROGENITOR never flies alone for long.',
 codex:{role:'Carrier', threat:'Fire from both flanks',
  tell:'Its flanks flare, then a BROADSIDE of two parallel lines rakes past its sides.',
  counter:'The lines run along its flanks. Take its nose or its tail, never its side.',
  lore:'The Brood-Hall. A carrier whose air wing was grown, not built, and grew until the hall and the brood were one thing. It launches as a reflex. It no longer remembers which of its children were meant to come home.'},
 cycle:['broadside','summon'],
 attacks:Object.assign(atk('summon'),{
  broadside(e,C){ // paired line volleys from both flanks, 0.5 s flare
   C.mv(0.35); e.burstT-=C.dt;
   if(e.aimT>0){ e.aimT-=C.dt; if(e.aimT<=0){ const a=e.side, nx=-Math.sin(a), ny=Math.cos(a);
     for(const sd of [-1,1]) for(let k=0;k<4;k++){ const ox=e.x+nx*sd*e.r, oy=e.y+ny*sd*e.r; eshotAt(e,ox,oy,a+sd*0.02*k,230+k*20,5,0.75,3.4); }
     SFX.eshoot(); } }
   else if(e.burstT<=0){ e.burstT=C.enrage?1.5:2.1; e.aimT=0.5; e.side=C.aim; } }
 }),
 draw(e,g){ // a long hull of parallelograms with bay notches
  const R=g.R; ctx.save(); ctx.rotate(e.aimT>0?e.side:Math.atan2(player?player.y-e.y:0,player?player.x-e.x:1));
  ctx.fillStyle=g.body; ctx.strokeStyle=g.col; ctx.lineWidth=g.lw;
  polyPts([[R,-R*0.3],[R*0.2,-R*0.62],[-R,-R*0.62],[-R*0.7,-R*0.1],[-R*0.7,R*0.1],[-R,R*0.62],[R*0.2,R*0.62],[R,R*0.3]]); ctx.fill(); ctx.stroke();
  ctx.strokeStyle=g.dim; ctx.lineWidth=1; for(const sd of [-1,1]) for(let k=0;k<2;k++){ ctx.strokeRect(-R*0.6+k*R*0.55,sd*R*0.62-(sd>0?R*0.2:0),R*0.35,R*0.2); }
  if(e.aimT>0){ ctx.strokeStyle=K.red; ctx.lineWidth=1.5; line(-R,-R*0.7,R,-R*0.7,K.red,1.5); line(-R,R*0.7,R,R*0.7,K.red,1.5); }
  ctx.restore();
 }
};
// ===== END BOSS: PROGENITOR =====

// ===== BOSS: HARBINGER =====
BOSS_KITS.harbinger={
 def:{name:'HARBINGER',epithet:'the Horn',tier:4,hp:1100,r:29,spd:1.00,shape:'star',pt:3.2,sig:null,chaff:['tempest','mite']},
 lore:'A SOVEREIGN WHO SOUNDS THE HORN — HARBINGER wants you to see it coming.',
 codex:{role:'Bullet-hell caster', threat:'Never recovers',
  tell:'Dense rotating walls with ONE gap, plus targeted meteors.',
  counter:'Find the gap and travel with it. Do not try to out-run the wall.',
  lore:'The Horn. An announcement, not a warship: it was built so that a species could be seen from far away. Everything it does is legible from a distance, because the point was always that you would see it coming and understand what it meant.'},
 cycle:['spiralwall','meteor','fan','spiral'],
 attacks:Object.assign(atk('spiralwall','fan','spiral'),{
  meteor(e,C){ // telegraphed impact marks down your heading (spec §5)
   C.mv(0.35); e.burstT-=C.dt;
   if(e.burstT<=0){ e.burstT=C.enrage?1.7:2.3;
    const p=C.p, v=Math.hypot(p.mvx||0,p.mvy||0), hx=v>30?p.mvx/v:Math.cos(C.aim), hy=v>30?p.mvy/v:Math.sin(C.aim);
    const n=3+Math.min(2,((arenaIdx+1)/40)|0), pts=[];
    for(let k=0;k<n;k++){ const d=40+k*95, j=(Math.random()-0.5)*60; pts.push({x:p.x+hx*d-hy*j,y:p.y+hy*d+hx*j,r:54}); }
    bossMarks(e,pts,{warn:1.1,dmg:Math.round(e.dmg*0.9),what:'METEOR'}); } }
 }),
 draw(e,g){ // eight-point burst, inner ring counter-rotating
  const R=g.R;
  ctx.fillStyle=g.body; ctx.strokeStyle=g.col; ctx.lineWidth=g.lw;
  ctx.beginPath();
  for(let k=0;k<16;k++){ const a=e.t*0.7+k*0.3927, rr=(k%2?R*0.48:R); const x=Math.cos(a)*rr, y=Math.sin(a)*rr; if(k) ctx.lineTo(x,y); else ctx.moveTo(x,y); }
  ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.strokeStyle=g.dim; ctx.lineWidth=1; ctx.save(); ctx.rotate(-e.t*1.4); poly(3,R*0.42,0); ctx.stroke(); ctx.restore();
  ctx.fillStyle=g.col; ctx.beginPath(); ctx.arc(0,0,3.5,0,6.283); ctx.fill();
 }
};
// ===== END BOSS: HARBINGER =====

// ===== BOSS: KRAKEN =====
// Placeholder kit (wave 2 builds the full one, spec §5): two sweeping arms.
BOSS_KITS.kraken={
 def:{name:'KRAKEN',epithet:'the Deep-Grasp',tier:4,hp:1600,r:36,spd:0.85,shape:'mantle',pt:3.6,sig:'arms',chaff:['mite','tempest']},
 lore:'A SOVEREIGN FROM UNDER THE LANE — KRAKEN reaches for what floats past.',
 codex:{role:'Grappler', threat:'Two sweeping arms',
  tell:'Two arms sweep slow arcs of rounds out of its mantle, crossing as they turn.',
  counter:'The arms turn slowly. Slip through the gap between them, then stay on the far side.',
  lore:'The Deep-Grasp. A salvage hull built to haul wrecks out of gravity wells, from a people who were very good at wrecks. It has reached into the dark for longer than there has been anything to pull out. It is not angry. It is simply still working.'},
 cycle:['lash','fan'],
 attacks:Object.assign(atk('fan'),{
  lash(e,C){ // two arms sweep counter-rotating arcs of rounds
   C.mv(0.35); e.spirT-=C.dt;
   if(e.spirT<=0){ e.spirT=C.enrage?0.12:0.17; const a=C.aim+Math.sin(e.phaseT*1.3)*1.2;
    eshot(e,a,200,6,0.75,3.2); eshot(e,2*C.aim-a+3.1416,200,6,0.75,3.2); } }
 }),
 draw(e,g){ // a nonagon mantle with limbs
  const R=g.R;
  ctx.strokeStyle=g.dim; ctx.lineWidth=2.5; for(let k=0;k<6;k++){ const a=k*1.047+Math.sin(e.t*1.5+k)*0.2; ctx.beginPath(); ctx.moveTo(Math.cos(a)*R*0.6,Math.sin(a)*R*0.6); ctx.quadraticCurveTo(Math.cos(a+0.3)*R*0.95,Math.sin(a+0.3)*R*0.95,Math.cos(a+0.1)*R*1.15,Math.sin(a+0.1)*R*1.15); ctx.stroke(); }
  ctx.fillStyle=g.body; ctx.strokeStyle=g.col; ctx.lineWidth=g.lw; poly(9,R*0.72,e.t*0.15); ctx.fill(); ctx.stroke();
  ctx.strokeStyle=g.dim; ctx.lineWidth=1; poly(9,R*0.4,e.t*0.15); ctx.stroke();
  ctx.fillStyle=g.col; ctx.beginPath(); ctx.arc(0,0,4,0,6.283); ctx.fill();
 }
};
// ===== END BOSS: KRAKEN =====

// ===== BOSS: JUGGERNAUT =====
BOSS_KITS.juggernaut={
 def:{name:'JUGGERNAUT',epithet:'the Unsteered',tier:4,hp:1700,r:38,spd:0.95,shape:'ram',pt:3.0,sig:'vent',chaff:['brute','drone']},
 lore:'A SOVEREIGN THAT CANNOT STEER — JUGGERNAUT commands by momentum alone.',
 codex:{role:'Ram', threat:'Armoured prow',
  tell:'RAM, then a straight commit, shockwave on impact. Facing LOCKS while charging.',
  counter:'The prow takes 40%, the REAR VENT takes 190%. Flank every charge.',
  lore:'The Unsteered. A colony ark built around one engine too large to be steered and too valuable to be wasted. The colonists never boarded. They put armour on the prow and filed the exhaust problem as acceptable.'},
 vmax:420,
 cycle:['ram','slam','debris','ram'],
 attacks:atk('ram','slam','debris'),
 // armoured front, exposed rear: facing locks during a ram (the window to get behind it)
 signature(e,C){ if(!e.charging&&!e.chargeOn) e.facing=Math.atan2(C.p.y-e.y,C.p.x-e.x); },
 draw(e,g){ // armoured prow one end, the vent the other
  const R=g.R;
  ctx.save(); ctx.rotate(e.facing||0);
  ctx.fillStyle=g.body; ctx.strokeStyle=g.col; ctx.lineWidth=g.lw;
  ctx.beginPath(); ctx.moveTo(R,0); ctx.lineTo(R*0.3,-R*0.8); ctx.lineTo(-R*0.85,-R*0.62); ctx.lineTo(-R*0.85,R*0.62); ctx.lineTo(R*0.3,R*0.8); ctx.closePath(); ctx.fill(); ctx.stroke();
  // the prow plate: bare metal, hatched — it shrugs off rounds
  ctx.fillStyle=K.lift; ctx.strokeStyle=K.metal; ctx.lineWidth=1.25;
  ctx.beginPath(); ctx.moveTo(R*0.98,0); ctx.lineTo(R*0.34,-R*0.66); ctx.lineTo(R*0.34,R*0.66); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.strokeStyle=K.metalDim; ctx.lineWidth=1; ctx.beginPath(); for(let k=1;k<5;k++){ const x=R*0.34+k*R*0.13; ctx.moveTo(x,-R*0.66*(1-(x-R*0.34)/(R*0.64))); ctx.lineTo(x,R*0.66*(1-(x-R*0.34)/(R*0.64))); } ctx.stroke();
  // the rear vent: the weak point, hot and open
  ctx.fillStyle=g.col; ctx.fillRect(-R*0.92,-R*0.34,R*0.22,R*0.68);
  ctx.strokeStyle=K.ground; ctx.lineWidth=1; ctx.beginPath(); for(let k=1;k<4;k++){ const y=-R*0.34+k*R*0.17; ctx.moveTo(-R*0.92,y); ctx.lineTo(-R*0.7,y); } ctx.stroke();
  ctx.restore();
 }
};
// ===== END BOSS: JUGGERNAUT =====

// ===== BOSS: ECLIPSE =====
// Placeholder kit (wave 2 builds the full one, spec §5): Corona from the rim.
BOSS_KITS.eclipse={
 def:{name:'ECLIPSE',epithet:'the Dimming',tier:4,hp:1400,r:32,spd:0.90,shape:'ringmoon',pt:3.6,sig:'moon',chaff:['sniper','drone']},
 lore:'A SOVEREIGN THAT TAKES THE LIGHT — ECLIPSE turns, and the field goes dim.',
 codex:{role:'Rim caster', threat:'Streams from its rim',
  tell:'Two CORONA streams pour from opposite points of its rim and turn slowly around it.',
  counter:'Walk with the streams, not against them, and fire through the gap between.',
  lore:'The Dimming. A sunshade built to cool a star-lit world, left in orbit after the world went dark on its own. It still passes between you and the light out of habit. The makers thought of it as a parasol. Everyone since has thought of it as the end of the day.'},
 cycle:['corona','fan'],
 attacks:Object.assign(atk('fan'),{
  corona(e,C){ // twin streams from opposite points of the rim, slowly turning
   C.mv(0.3); e.spirT-=C.dt;
   if(e.spirT<=0){ e.spirT=C.enrage?0.09:0.12; const a=e.phaseT*0.9;
    for(const o of [0,3.1416]){ const q=a+o; eshotAt(e,e.x+Math.cos(q)*e.r,e.y+Math.sin(q)*e.r,q+0.6,230,5,0.7,2.8); } } }
 }),
 draw(e,g){ // a ring with a crescent moon
  const R=g.R;
  ctx.fillStyle=g.body; ctx.strokeStyle=g.col; ctx.lineWidth=g.lw; ctx.beginPath(); ctx.arc(0,0,R*0.8,0,6.283); ctx.fill(); ctx.stroke();
  ctx.fillStyle=K.ground; ctx.beginPath(); ctx.arc(0,0,R*0.46,0,6.283); ctx.fill(); ctx.strokeStyle=g.dim; ctx.lineWidth=1; ctx.stroke();
  const m=e.t*0.8, mx=Math.cos(m)*R*0.95, my=Math.sin(m)*R*0.95;
  ctx.fillStyle=g.col; ctx.beginPath(); ctx.arc(mx,my,R*0.24,0,6.283); ctx.fill();
  ctx.fillStyle=g.body; ctx.beginPath(); ctx.arc(mx+Math.cos(m)*R*0.1,my+Math.sin(m)*R*0.1,R*0.2,0,6.283); ctx.fill();
 }
};
// ===== END BOSS: ECLIPSE =====

// ===== BOSS: NULLIFIER =====
BOSS_KITS.nullifier={
 def:{name:'NULLIFIER',epithet:'the Silent',tier:4,hp:1250,r:30,spd:1.00,shape:'prism',pt:3.4,sig:'jam',chaff:['sniper','stalker']},
 lore:'A SOVEREIGN OF SILENCE — NULLIFIER needs you ordinary for four seconds.',
 codex:{role:'Disruptor', threat:'Jams your abilities',
  tell:'A hatched DISRUPTOR FIELD drops on your position.',
  counter:'Walk out. It locks dash and recall — never your guns. Sniper escorts punish standing still.',
  lore:'The Silent. Counter-insurgency hardware from a war against ships that relied on their gear. It cannot shoot especially well. It does not need to; it only needs you to be ordinary for four seconds. The holmgang lets it take your wings, never your guns, and it resents the clause.'},
 cycle:['disrupt','fan','summon','burst'],
 attacks:atk('disrupt','fan','summon','burst'),
 draw(e,g){ // split prism halves with a null core
  const R=g.R;
  ctx.save(); ctx.rotate(e.t*0.5);
  ctx.fillStyle=g.body; ctx.strokeStyle=g.col; ctx.lineWidth=g.lw;
  ctx.beginPath(); ctx.moveTo(0,-R); ctx.lineTo(R*0.86,R*0.5); ctx.lineTo(-R*0.86,R*0.5); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.strokeStyle=g.dim; ctx.beginPath(); ctx.moveTo(0,R); ctx.lineTo(R*0.86,-R*0.5); ctx.lineTo(-R*0.86,-R*0.5); ctx.closePath(); ctx.stroke();
  ctx.restore();
  ctx.fillStyle=K.ground; ctx.beginPath(); ctx.arc(0,0,R*0.26,0,6.283); ctx.fill();
  ctx.strokeStyle=g.col; ctx.lineWidth=1.5; ctx.stroke();
 }
};
// ===== END BOSS: NULLIFIER =====

// ===== BOSS: CHORUS =====
BOSS_KITS.chorus={
 def:{name:'CHORUS',epithet:'the Norn-Choir',tier:4,hp:1400,r:28,spd:1.05,shape:'triad',pt:3.0,sig:'split',chaff:['mite','drone']},
 lore:'A SOVEREIGN IN THREE VOICES — CHORUS was a people once. Every echo is true.',
 codex:{role:'Splitter', threat:'Fractures twice',
  tell:'At 66% and 33% it FRACTURES into smaller synced echoes.',
  counter:'Burst through the thresholds fast, or fight three at once. Echoes are fragile.',
  lore:'The Norn-Choir. Not built by a people; it is one: the last of a species that copied itself into machines so it would not end. Three copies were made, to be safe. Each echo believes it is the original and is, in every sense that has ever been tested, correct.'},
 // its splits are its phases (spec §5)
 phases:[{},{at:0.66},{at:0.33}],
 cycle:['fan','spiral','summon','burst'],
 attacks:atk('fan','spiral','summon','burst'),
 signature(e,C){ // fractures into synced copies at 66% and 33%
  const f=e.hp/e.maxhp;
  if(!e.summoned&&!e.echo&&((e.split===0&&f<=0.66)||(e.split===1&&f<=0.33))){
   e.split++;
   for(let k=0;k<2&&enemies.length<14;k++){
    const s2=nearSpot(e.x,e.y,120,220,e.r+14);
    const c=mkBoss('chorus',s2.x,s2.y,arenaIdx);
    c.maxhp=c.hp=c.hpSeen=e.maxhp*0.22; c.r=e.r*0.72; c.dmg=Math.round(e.dmg*0.6);
    // echoes are CHORUS's own mechanic, not a summon: they neither spend the
    // nest's summon budget nor call anyone themselves
    c.echo=true; c.recLeft=[]; c.split=2; c.sumLeft=[]; c.phAt=[]; c.bname='CHORUS ECHO';
    c.spawnT=0.6; enemies.push(c);
    rings.push({x:s2.x,y:s2.y,r:8,maxR:90,spd:300,dmg:0,hit:true});
   }
   addFloater(e.x,calloutY(e),'CHORUS FRACTURES',K.red); SFX.brk();
  }
 },
 draw(e,g){ // three fused lobes around a shared core
  const R=g.R;
  for(let k=0;k<3;k++){ const a=e.t*0.8+k*2.094;
   ctx.fillStyle=g.body; ctx.strokeStyle=g.col; ctx.lineWidth=g.lw;
   ctx.beginPath(); ctx.arc(Math.cos(a)*R*0.42,Math.sin(a)*R*0.42,R*0.52,0,6.283); ctx.fill(); ctx.stroke(); }
  ctx.strokeStyle=g.dim; ctx.lineWidth=1; for(let k=0;k<3;k++){ const a=e.t*0.8+k*2.094; ctx.beginPath(); ctx.arc(Math.cos(a)*R*0.42,Math.sin(a)*R*0.42,R*0.28,0,6.283); ctx.stroke(); }
  ctx.fillStyle=g.col; ctx.beginPath(); ctx.arc(0,0,R*0.14,0,6.283); ctx.fill();
 }
};
// ===== END BOSS: CHORUS =====

// ===== BOSS: SINGULARITY =====
BOSS_KITS.singularity={
 def:{name:'SINGULARITY',epithet:'the One-Eyed',tier:5,hp:1950,r:40,spd:0.85,shape:'well',pt:4.0,sig:'wellpull',chaff:['tempest','brute']},
 lore:'THE APEX — SINGULARITY, the One-Eyed. Every rank answers to it.',
 codex:{role:'Apex', threat:'The Convocation',
  tell:'GRAVITY drags you inward while debris arcs outward. At half its bar it calls three SOVEREIGNS at once.',
  counter:'Thrust against the pull. Burn it down fast once the Convocation lands, or fight four gods at once.',
  lore:'The One-Eyed. The first machine any species ever sent into the dark. It gave its eye to a black hole and lives at the lip of it, where time runs slow: the oldest thing in the universe, and the one that has lived through the least of it. Everything you have fought since the first sector was, in some documented sense, subcontracted from here.'},
 // The Convocation (decided): CHORUS, NULLIFIER and ECLIPSE together at 50%,
 // past the live cap. Absorption and Phase 2 are wave 2's.
 calls:['chorus','nullifier','eclipse'], summons:{at:[0.5], pastCap:true},
 cycle:['gravity','debris','muster','spiralwall'],
 attacks:atk('gravity','debris','muster','spiralwall'),
 draw(e,g){ // accretion rings around a void
  const R=g.R;
  for(let k=0;k<3;k++){ ctx.save(); ctx.rotate(e.t*(0.5+k*0.4));
   ctx.strokeStyle=k===0?g.col:g.dim; ctx.lineWidth=k===0?1.5:1;
   ctx.beginPath(); ctx.ellipse(0,0,R*(1.14-k*0.22),R*(0.42-k*0.09),k*0.9,0,6.283); ctx.stroke(); ctx.restore(); }
  ctx.fillStyle=K.ground; ctx.beginPath(); ctx.arc(0,0,R*0.52,0,6.283); ctx.fill();
  ctx.strokeStyle=g.col; ctx.lineWidth=g.lw; ctx.stroke();
  ctx.fillStyle=g.flash?g.P.hi:g.col; ctx.beginPath(); ctx.arc(0,0,R*0.12,0,6.283); ctx.fill();
 }
};
// ===== END BOSS: SINGULARITY =====

// ---------- derived from the ladder ----------
// Debut is the god's rung; nothing else types it.
for(let i=0;i<LADDER.length;i++){ const k=LADDER[i], kit=BOSS_KITS[k]; kit.kind=k; kit.def.debut=5*(i+1); BOSSDEF[k]=kit.def; }
const BOSS_KINDS=LADDER.slice();
const BOSSES_BY_TIER=(()=>{ const t=[]; for(const k of BOSS_KINDS){ const n=BOSSDEF[k].tier; (t[n]=t[n]||[]).push(k); } return t; })();
const DEBUTS=(()=>{ const m={}; for(const k of BOSS_KINDS) m[BOSSDEF[k].debut]=k; return m; })();
const DEBUT_LORE=(()=>{ const m={}; for(const k of BOSS_KINDS) m[k]=BOSS_KITS[k].lore; return m; })();
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
// SEEKER guidance. At range a round turns at its card rate b.turn (2.2 rad/s +1.6
// per Seeker level), a 120-170px turning radius at 640px/s. A target that falls inside that
// circle (a near miss, a close off-aim shot) can never be reached: the round
// orbits it for its whole life. So inside two turning radii the limit rises as
// (2R/d)^2: continuous with the card rate at the boundary, 4x at one radius, a
// near-snap point-blank. That keeps the effective radius under d/2, and with it
// the heading error shrinks every frame, so every approach converges.
// Foes already in hitUid are skipped: a pierced target is behind the round, and
// chasing it back made Lance rounds loop through a boss they could not hit again.
// With no other foe in reach the round flies straight.
const SEEK_SNAP=40; // rad/s ceiling: ~0.67 rad a frame at 60Hz, a visible hook rather than a teleport of heading
function seekSteer(b,dt){
 let bd=420*420, be=null;
 for(const e of enemies){ if(b.hitUid&&b.hitUid.indexOf(e.uid)>=0) continue; const d=dist2(b.x,b.y,e.x,e.y); if(d<bd){ bd=d; be=e; } }
 if(!be) return;
 const want=Math.atan2(be.y-b.y,be.x-b.x), cur=Math.atan2(b.vy,b.vx);
 let dA=want-cur; while(dA>Math.PI)dA-=6.283; while(dA<-Math.PI)dA+=6.283;
 const sp=len(b.vx,b.vy), d=Math.max(1,Math.sqrt(bd)), R2=2*sp/b.turn;
 const lim=d<R2?Math.min(SEEK_SNAP,b.turn*(R2/d)*(R2/d)):b.turn;
 const na=cur+clamp(dA,-lim*dt,lim*dt); b.vx=Math.cos(na)*sp; b.vy=Math.sin(na)*sp;
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
 return { id, name:e.def?e.def.name:(f?f.name:String(id).toUpperCase()), lt:!!(e.summoned||e.echo), what:w }; }
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
 if(__dev&&__dev.hurt(dmg,heavy,src)) return; // DevX lab only: god mode / damage log
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
 if(p.hp<=0){ if(p.stasisN>0){ p.stasisN--; p.hp=p.stasisTier>=3?p.maxhp:(p.stasisTier===2?Math.ceil(p.maxhp*0.25):1); p.invuln=2.5; rings.push({x:p.x,y:p.y,r:20,maxR:260,spd:420,dmg:0,hit:true,own:true}); spawnBurst(p.x,p.y,40,K.goldHi,300,0.9,4); addFloater(p.x,p.y-28,'STASIS ('+p.stasisN+' left)',K.goldHi); SFX.stasis(); return; } if(p.secondWind){ p.secondWind=false; p.hp=Math.ceil(p.maxhp*0.5); p.invuln=2; rings.push({x:p.x,y:p.y,r:20,maxR:200,spd:380,dmg:0,hit:true,own:true}); spawnBurst(p.x,p.y,30,K.goldHi,260,0.8,4); addFloater(p.x,p.y-28,'SECOND WIND',K.goldHi); SFX.levelup(); return; } p.hp=0; if(replaySnap){ SFX.lose(); endReplay(true); return; } die(); }
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
  if(!replaySnap) for(let k=0;k<n;k++) gems.push({x:e.x+(Math.random()-0.5)*24,y:e.y+(Math.random()-0.5)*24,v:gemV,t:0});
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
  bossDied(e); // its beams, marks, discs, zones, boulders and any tether go with it
  if(e.lead) nestLeadDown=true; // and the nest's chaff stream stops with its lead
  // Summoned gods are somebody else's minions: they do not bank the permanent
  // +2% damage, or an ARCHON nest would be a damage-meta farm.
  // A replayed nest banks nothing either: the +2% is for a god felled on the trail.
  if(!e.summoned&&!e.echo&&!replaySnap){ bosses++; saveMeta(); nestTally.banked+=2; }
  if(over) return;
  player.hp=Math.min(player.maxhp,player.hp+((e.summoned||e.echo)?10:30));
  const left=enemies.filter(o=>o.type==='boss').length;
  if(left>0){ addFloater(player.x,player.y-34,'BOSS DOWN — '+left+' LEFT',K.gold); SFX.win(); }
  else if(replaySnap){ addFloater(player.x,player.y-34,'NEST CLEARED · REPLAY — NO DRAFT',K.gold); SFX.win(); }
  else { addFloater(player.x,player.y-34,'NEST CLEARED · bonus draft',K.goldHi); SFX.win();
   // A draft already on screen must not be replaced by the bonus: queue it
   // as its own entry behind the open one and pickUpgrade opens it inverted.
   if(state==='levelup') pendingNest++; else { openLevelUp(); nestDraftAt=performance.now(); } }
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
function nextArena(){ if(state!=='playing') return; SFX.portal(); exitArm=0; if(replaySnap){ endReplay(false); return; } try{ if(arenaIdx===0){ markCoach('move'); markCoach('dash'); markCoach('gate'); } }catch(e){} arenasCleared=Math.max(arenasCleared,arenaIdx+1); clearedMax=Math.max(clearedMax,arenaIdx); galaxySel=arenaIdx+1; setMusicCfg(TITLE_MUS); state='galaxy'; saveRun(); }
function loadSector(i){
 hubNote=null;
 // a cleared sector is a replay: snapshot the run (deep, so nothing inside can
 // reach it) before the sector touches the hull
 replaySnap=null;
 if(i<=clearedMax){ replaySnap=JSON.parse(JSON.stringify(runSnap())); replaySnap.galaxySel=i; }
 loadArena(i); galaxySel=i; state='playing'; autoPaused=false; saveRun();
 if(replaySnap) addFloater(player.x,player.y-30,'REPLAY · NO XP · NOTHING CARRIES OVER',K.textDim);
}
function galaxyConfirm(){ if(galaxySel<=clearedMax+1){ SFX.click(); loadSector(galaxySel); } else SFX.brk(); }
// node layout shared by draw + click hit-testing: 9-node scrolling window.
// Node y is clamped to a band so the S-labels (drawn below each node) can
// never collide with the description / hint lines at the bottom of the hub.
function galNodes(){
 const out=[], start=Math.max(0,galaxySel-2);
 const margin = Math.max(24, Math.min(110, W * 0.115));
 const step = (W - margin * 2) / 8;
 const lo = Math.max(140, H * 0.39), hi = Math.max(lo + 40, H - 220);
 for(let k=0;k<9;k++){ const i=start+k;
  out.push({i,x:margin+k*step,y:clamp(H/2+40+Math.sin(i*0.9+(runSeed%7))*110,lo,hi),unlocked:i<=clearedMax+1,cleared:i<=clearedMax,cur:i===galaxySel});
 }
 return out;
}
// E key / recall-gate click: EXIT ring has priority; recall is a charged item with
// cast channel, max range and cooldown. E never stops a blink — Space does, so
// start (E: drop gate / channel blink / exit) and stop (Space: cancel blink)
// are never the same key.
function nearExit(){ return portal&&player&&Math.hypot(player.x-portal.x,player.y-portal.y)<player.r+portal.r+34; }
function fieldXpAtRisk(){ let s=0; for(const g of gems) s+=g.v; return Math.round(s*(player?player.xpBonus:1)); }
function exitArmed(){ return exitArm>performance.now()&&portal&&gems.length>0; }
// EXIT with XP on the field is irreversible (loadArena clears the field), so it
// asks twice like every other destructive confirm: the first E arms for ARM_MS
// with a red label naming the XP at risk, the second E inside the window exits.
function tryExitPortal(){
 if(!portal||!player||state!=='playing') return false;
 if(!gems.length){ exitArm=0; nextArena(); return true; }
 const now=performance.now();
 if(exitArm>now){ exitArm=0; nextArena(); return true; }
 exitArm=now+ARM_MS; SFX.click();
 addFloater(player.x,player.y-24,'LOSE '+fieldXpAtRisk()+' XP? [E] AGAIN',K.red);
 return false;
}
function cancelBlink(){
 const p=player; if(!p||!p.channel) return false;
 p.channel=null; addFloater(p.x,p.y-24,'BLINK OFF',K.textDim); SFX.click(); return true;
}
function doPortalKey(){
 const p=player; if(!p||state!=='playing') return;
 if(nearExit()){ tryExitPortal(); return; }
 if(!p.recallUnlocked){ if(p.lockMsgCd<=0){ p.lockMsgCd=1; addFloater(p.x,p.y-24,'RECALL LOCKED: Portal Cell',K.textDim); } return; }
 if(pStatus().jam>0){ if(p.lockMsgCd<=0){ p.lockMsgCd=1; addFloater(p.x,p.y-24,'SYSTEMS JAMMED',K.red); } return; }
 if(p.channel){ if(p.lockMsgCd<=0){ p.lockMsgCd=1; addFloater(p.x,p.y-24,'BLINK: [Space] TO CANCEL',K.textDim); } return; }
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
// ---------- hit shapes ----------
// One swept test for every way a round can touch an enemy, so the sweep, the
// boss engine and the hitbox overlay all agree on what a hit is:
//   body     : e.r at the DRAWN scale. Hulls render at vscale 0.92-1.08, and
//              testing the bare e.r left a rim of silhouette rounds crossed clean.
//   hitParts : world-space {x,y,r} circles a non-circular boss keeps current;
//              striking one is a body hit.
//   parts    : world-space {x,y,r,hp} destructible children, resolved by the
//              engine's hitBossPart. Dead parts (hp<=0 or .dead) and any in
//              `skip` (parts this round already passed) are ignored.
//   segs     : LEVIATHAN's trailing body. Real hits; SEG_PASS of the damage
//              reaches the boss, so the tail is a target, not a free shield.
// Returns the earliest entry t in [0,1] or -1. What was struck is left in HIT
// (module scratch: this runs per round per enemy per frame, so it never allocates).
// Ties go to parts and segments, which sit on top of the body they belong to.
const SEG_PASS=0.6, HIT={kind:null,ref:null};
function enemyHitT(e,px,py,x,y,br,skip){
 let bt=segCircleT(px,py,x,y,e.x,e.y,e.r*(e.vscale||1)+br), t;
 HIT.kind='body'; HIT.ref=null;
 const hp=e.hitParts;
 if(hp) for(let i=0;i<hp.length;i++){ const c=hp[i]; t=segCircleT(px,py,x,y,c.x,c.y,c.r+br); if(t>=0&&(bt<0||t<bt)){ bt=t; HIT.kind='body'; HIT.ref=null; } }
 const sg=e.segs;
 if(sg) for(let i=0;i<sg.length;i++){ const g=sg[i]; t=segCircleT(px,py,x,y,g.x,g.y,g.r+br); if(t>=0&&(bt<0||t<=bt)){ bt=t; HIT.kind='seg'; HIT.ref=g; } }
 const pt=e.parts;
 if(pt) for(let i=0;i<pt.length;i++){ const c=pt[i]; if(c.hp<=0||c.dead||(skip&&skip.indexOf(c)>=0)) continue;
  t=segCircleT(px,py,x,y,c.x,c.y,c.r+br); if(t>=0&&(bt<0||t<=bt)){ bt=t; HIT.kind='part'; HIT.ref=c; } }
 return bt;
}
// ---------- bullet impact ----------
// Resolve one bullet against one enemy at the contact point. Returns true when
// the round is spent, so it is removed rather than continuing out the far side.
// `mul` scales the round's damage for indirect hits (a LEVIATHAN segment).
function applyBulletHit(e,b,hx,hy,mul){
 const phased=!!e.phased;
 let dmg=b.dmg*(mul||1)*(phased?0.30:1)*corrodeMul(e);
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
// Boss-engine hooks, each optional (typeof-guarded, so this runs without them):
//   bossDeflect(e,b,hx,hy) -> true : the round was reflected. No damage, and it
//     is NOT removed here; the engine converts or kills it (b.dead=true).
//   hitBossPart(e,part,b,hx,hy) -> true : the part took the round; it is spent.
//     false lets it fly on, remembered in b.hitPart so it cannot re-hit that
//     part every frame it overlaps. Without the hook a part hit is a body hit.
function bulletSweep(b){
 let hits=null;
 for(let j=0;j<enemies.length;j++){ const e=enemies[j];
  if(b.hitUid&&b.hitUid.indexOf(e.uid)>=0) continue;
  const t=enemyHitT(e,b.px,b.py,b.x,b.y,b.r,b.hitPart);
  if(t>=0){ if(!hits) hits=[]; hits.push({t,e,kind:HIT.kind,ref:HIT.ref}); }
 }
 if(!hits) return false;
 if(hits.length>1) hits.sort((p,q)=>p.t-q.t);
 for(const h of hits){
  if(enemies.indexOf(h.e)<0) continue; // already died to an earlier hit this pass
  const hx=b.px+(b.x-b.px)*h.t, hy=b.py+(b.y-b.py)*h.t;
  if(typeof bossDeflect==='function'&&bossDeflect(h.e,b,hx,hy)) return false; // the engine owns it now
  if(h.kind==='part'&&typeof hitBossPart==='function'){
   if(hitBossPart(h.e,h.ref,b,hx,hy)) return true;
   (b.hitPart=b.hitPart||[]).push(h.ref); continue; }
  if(applyBulletHit(h.e,b,hx,hy,h.kind==='seg'?SEG_PASS:1)) return true;
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
  // Every status a god can put on the ship runs through one loop (root, freeze,
  // jam, slow, knockback, tether, currents). None of them ever takes away your
  // guns — being unable to shoot is not a mechanic, it is just waiting.
  const st=statusTick(p,dt);
  if(st.lock){ ax=0; ay=0; }
  const al=len(ax,ay); if(al>1){ ax/=al; ay/=al; }
  if(ax||ay) p.face=Math.atan2(ay,ax); // hull nose follows movement; turret (p.aim) still tracks the mouse/target
  const spd=p.speed*(p.surgeT>0?1.25:1)*st.mul;
  const ox0=p.x, oy0=p.y;
  if(p.dashT>0){ p.x+=p.dashDx*1050*dt; p.y+=p.dashDy*1050*dt; pushPart({x:p.x,y:p.y,vx:0,vy:0,life:0.3,maxlife:0.3,col:K.goldDim,r:5}); }
  else { p.x+=(ax*spd+st.fx)*dt; p.y+=(ay*spd+st.fy)*dt; }
  p.mvx=(p.x-ox0)/dt; p.mvy=(p.y-oy0)/dt; // the ship's heading, for gods that lead their shots
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
  // Boss-engine hooks, typeof-guarded so the loop runs without them:
  //   bulletField(b,dt)  bends the round before it moves (gravity, currents)
  //   bulletErased(b)    true deletes it (NULLIFIER's erase zone)
  const bField=typeof bulletField==='function'?bulletField:null, bErase=typeof bulletErased==='function'?bulletErased:null;
  for(let i=bullets.length-1;i>=0;i--){ const b=bullets[i];
   if(b.turn>0&&enemies.length) seekSteer(b,dt);
   if(bField) bField(b,dt);
   b.px=b.x; b.py=b.y;
   b.x+=b.vx*dt; b.y+=b.vy*dt; b.life-=dt;
   let dead=b.life<=0||b.dead||(bErase!==null&&!!bErase(b));
   if(!dead&&(b.x<PX0+b.r||b.x>PX1-b.r)){ if(b.bounce>0){ b.bounce--; if(b.x<PX0+b.r){b.x=PX0+b.r;b.vx=Math.abs(b.vx);} else {b.x=PX1-b.r;b.vx=-Math.abs(b.vx);} b.px=b.x; b.py=b.y; } else dead=true; }
   if(!dead&&(b.y<PY0+b.r||b.y>PY1-b.r)){ if(b.bounce>0){ b.bounce--; if(b.y<PY0+b.r){b.y=PY0+b.r;b.vy=Math.abs(b.vy);} else {b.y=PY1-b.r;b.vy=-Math.abs(b.vy);} b.px=b.x; b.py=b.y; } else dead=true; }
   if(!dead&&bulletPathBlocked(b)){
    if(b.bounce>0){ b.bounce--; if(reflectBullet(b,dt)){ spawnBurst(b.x,b.y,3,K.gold,120,0.3,2); SFX.click(); b.px=b.x; b.py=b.y; } else dead=true; }
    else { spawnBurst(b.x,b.y,3,K.metal,120,0.3,2); dead=true; }
   }
   if(!dead&&bulletSweep(b)) dead=true;
   // b.dead: the engine killed a round it deflected. Splice only if it is still
   // at i, in case the engine already moved it out of the array itself.
   if((dead||b.dead)&&bullets[i]===b) bullets.splice(i,1);
  }
  // enemy bullets
  for(let i=ebullets.length-1;i>=0;i--){ const b=ebullets[i];
   b.px=b.x; b.py=b.y; b.x+=b.vx*dt; b.y+=b.vy*dt; b.life-=dt;
   let dead=b.life<=0;
   // bouncing rounds (the boss primitive) reflect off the rim and off cover
   if(!dead&&(b.x<PX0||b.x>PX1||b.y<PY0||b.y>PY1)){ if(b.bounce>0){ b.bounce--; if(b.x<PX0||b.x>PX1){ b.vx=-b.vx; b.x=clamp(b.x,PX0,PX1); } if(b.y<PY0||b.y>PY1){ b.vy=-b.vy; b.y=clamp(b.y,PY0,PY1); } b.px=b.x; b.py=b.y; } else dead=true; }
   if(!dead&&bulletPathBlocked(b)){ if(b.bounce>0){ b.bounce--; if(reflectBullet(b,dt)){ b.px=b.x; b.py=b.y; } else dead=true; } else dead=true; }
   // swept against the ship too, so a fast bolt can never straddle the hitbox
   if(!dead&&segCircleT(b.px,b.py,b.x,b.y,p.x,p.y,p.r+b.r)>=0){ const lh=p.lastHurt; hurtPlayer(b.dmg,b.heavy,b.src); dead=true;
    if(p.lastHurt!==lh){ if(b.freeze) applyStatus('freeze',b.freeze); if(b.slow) applyStatus('slow',b.slow); } } // only a hit that landed carries its status
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
    if(h.jam) applyStatus('jam',0.6);
    if(h.dmg>0){ h.tick-=dt; if(h.tick<=0){ h.tick=0.6; hurtPlayer(h.dmg,false,h.src); } }
   }
   if(h.t>=h.life) hazards.splice(i,1);
  }
  // shock rings (brute, and the boss shockwave: a `delay` preview, then an
  // effect on contact as well as damage)
   for(let i=rings.length-1;i>=0;i--){ const g=rings[i]; if(g.delay>0){ g.delay-=dt; continue; } g.r+=g.spd*dt;
    if((g.dmg>0||g.fx)&&!g.hit){ const d=Math.hypot(p.x-g.x,p.y-g.y); if(Math.abs(d-g.r)<(g.w||14)){ g.hit=true; if(g.dmg>0) hurtPlayer(g.dmg,g.heavy,g.src); if(g.fx) ringEffect(g,p); } }
   if(g.r>=g.maxR) rings.splice(i,1);
  }
  updateBossPrims(dt,p); // beams, marks, trail discs, zones, currents, grasps, boulders
  // enemies
  const esnap=enemies.slice(); stampReset();
  for(let j=esnap.length-1;j>=0;j--){ const e=esnap[j]; stampNext(e); if(e.dead) continue; if(!codexSeenMap[e.kind||e.type]) markSeen(e.kind||e.type); e.t+=dt; e.flash-=dt; e.contactCd-=dt; if(e.orbCd>0)e.orbCd-=dt; if(e.spawnT>0)e.spawnT-=dt;
   if(e.burnT>0){ e.burnT-=dt; if(!e.phased){ e.hp-=e.burnDps*dt; e.lastHit=timeSec; e.flash=Math.max(e.flash,0.05); if(Math.random()<dt*10) pushPart({x:e.x+(Math.random()-0.5)*10,y:e.y+(Math.random()-0.5)*10,vx:0,vy:-40,life:0.3,maxlife:0.3,col:K.gold,r:3}); if(e.hp<=0){ killEnemy(enemies.indexOf(e)); continue; } } }
   if(__dev&&__dev.frz) continue; // DevX lab only: AI freeze
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
     if(e.aimT>0){ e.aimT-=dt; e.aimX=nx; e.aimY=ny; if(e.aimT<=0){ ebPush({x:e.x,y:e.y,vx:nx*300,vy:ny*300,r:5,dmg:e.dmg,life:3,heavy:true}); SFX.eshoot(); e.fireCd=Math.max(arenaIdx>=39?1.15:1.4,2.0-arenaIdx*0.1); e.reloc=0.5; } }
     else { const ms=e.sp*sF; if(d<280){ e.x-=nx*ms*dt; e.y-=ny*ms*dt; } else if(d>430){ e.x+=nx*ms*dt; e.y+=ny*ms*dt; } else { e.x+=Math.cos(e.t*1.5)*30*dt; e.y+=Math.sin(e.t*1.5)*30*dt; }
      if(e.reloc>0){ e.reloc-=dt; e.x+=-ny*ms*dt; e.y+=nx*ms*0.5*dt; }
      e.fireCd-=dt; if(e.fireCd<=0&&d<580){ e.aimT=arenaIdx>=39?0.28:(arenaIdx>=5?0.35:0.5); } }
    }
    else if(e.type==='tempest'){ // weaver: holds ~340 range, telegraphed bolt spread —
     // 5-wide past S6, cycling faster with depth
     if(e.aimT>0){ e.aimT-=dt; if(e.aimT<=0){ const base=Math.atan2(dy,dx); const fan=arenaIdx>=49?3:(arenaIdx>=6?2:1); for(let k=-fan;k<=fan;k++){ const a=base+k*0.18; ebPush({x:e.x,y:e.y,vx:Math.cos(a)*280,vy:Math.sin(a)*280,r:5,dmg:e.dmg,life:3,heavy:true}); } SFX.eshoot(); e.fireCd=Math.max(1.8,2.6-arenaIdx*0.12); } }
     else { const ms=e.sp*sF; if(d<280){ e.x-=nx*ms*dt; e.y-=ny*ms*dt; } else if(d>400){ e.x+=nx*ms*dt; e.y+=ny*ms*dt; } else { e.x+=-ny*ms*0.8*dt; e.y+=nx*ms*0.8*dt; }
      e.fireCd-=dt; if(e.fireCd<=0&&d<560){ e.aimT=arenaIdx>=5?0.28:0.35; } }
    }
    else if(e.type==='brute'){
     // deep brutes slam more often with wider rings — stay out of the band
     if(e.windup>0){ e.windup-=dt; if(e.windup<=0){ rings.push({x:e.x,y:e.y,r:20,maxR:110+Math.min(60,arenaIdx*6)+(arenaIdx>=59?30:0),spd:260,dmg:e.dmg,hit:false,heavy:true}); SFX.ring(); if(settings.shake) shake=Math.min(10,shake+3); spawnBurst(e.x,e.y,12,K.red,200,0.5,3); } }
     else { const sv=steer(e,nx,ny); e.x+=sv[0]*e.sp*sF*dt; e.y+=sv[1]*e.sp*sF*dt; e.slamCd-=dt; if(d<95&&e.slamCd<=0){ e.windup=0.6; e.slamCd=Math.max(arenaIdx>=59?1.3:1.6,2.6-arenaIdx*0.12); } }
    }
   else if(e.type==='boss') bossUpdate(e,{p,dx,dy,d,nx,ny,dt,sF});
   e.x=clamp(e.x,PX0+e.r,PX1-e.r); e.y=clamp(e.y,PY0+e.r,PY1-e.r);
   resolveObstacles(e);
   if(e.type==='boss') bossPost(e,dt);
   if(!e.phased&&circleHit(e,p)&&e.contactCd<=0){ e.contactCd=0.6; if(e.type!=='brute'||e.windup<=0) hurtPlayer(e.dmg,(e.type==='boss'||e.type==='brute'),srcOf(e,e.type==='boss'?null:({drone:'RAM',mite:'RAM',stalker:'LUNGE'}[e.type]||'CONTACT'))); }
  }
  stampNext(null);
  nestChaff(dt);
  // gems
  for(let i=gems.length-1;i>=0;i--){ const g=gems[i]; g.t+=dt; const d2=dist2(p.x,p.y,g.x,g.y);
   if(d2<p.magnet*p.magnet){ const d=Math.sqrt(d2)||1; const pull=p.pull||430; g.x+=(p.x-g.x)/d*pull*dt; g.y+=(p.y-g.y)/d*pull*dt; }
   if(d2<22*22){ gems.splice(i,1);
    if(p.salvage>0&&p.hp<p.maxhp) p.hp=Math.min(p.maxhp,p.hp+p.salvage);
    gainXp(g.v); if(state!=='playing') break; }
  }
  // wave director: reinforcements stream in from off-screen as the round progresses.
  // One pack per release, all from one far point (wavePlan: pack size, cadence,
  // alive cap). A release held by the cap goes out the moment there is room.
  if(spawnQueue.length>0&&!(__dev&&__dev.spawnsOff)){ // DevX lab only: spawns off
   spawnT-=dt;
   const wp=wavePlan(arenaIdx);
   if(spawnT<=0&&enemies.length<wp.cap){
    spawnT=wp.every;
    const q=spawnEdgePos(700,1000); q.pack=true;
    let n=wp.pack;
    while(n-->0&&spawnQueue.length>0&&enemies.length<wp.cap) spawnEnemy(spawnQueue.shift(),q);
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
   if(portal){ portal.t+=dt; if(dist2(p.x,p.y,portal.x,portal.y)<(p.r+portal.r)*(p.r+portal.r)){
    // Walking into the ring with XP on the field only arms the exit — it never
    // exits by touch. The second confirming E inside the window is what leaves.
    if(gems.length>0){ const now=performance.now(); if(exitArm<=now){ exitArm=now+ARM_MS; addFloater(p.x,p.y-24,'LOSE '+fieldXpAtRisk()+' XP? [E] AGAIN',K.red); SFX.click(); } }
    else { exitArm=0; nextArena(); }
   } }
   try{ updateCoach(); }catch(e){}
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
    if(titleConfirm&&titleConfirmT<=performance.now()){ titleConfirm=false; titleConfirmT=0; }
    const saved=!!readRun(), nT=saved?5:4;
    titleSel=clamp(titleSel,0,nT-1);
    // The menu is a column (CONTINUE / NEW RUN) over a row (SETTINGS · CODEX ·
    // HELP), so the arrows move the way the entries sit: ←→ walk the row,
    // ↑↓ step the column and drop into / climb out of the row, which
    // remembers the column it was left on.
    const rowStart=nT-3, inRow=titleSel>=rowStart;
    if(code==='ArrowLeft'||code==='ArrowRight'){
     if(inRow){ titleRowCol=(titleSel-rowStart+(code==='ArrowRight'?1:2))%3; titleSel=rowStart+titleRowCol; SFX.click(); }
     return;
    }
    if(code==='ArrowDown'||code==='ArrowUp'){
     const down=code==='ArrowDown';
     if(inRow){ titleRowCol=titleSel-rowStart; titleSel=down?0:rowStart-1; }
     else if(down) titleSel=titleSel<rowStart-1?titleSel+1:rowStart+titleRowCol;
     else titleSel=titleSel>0?titleSel-1:rowStart+titleRowCol;
     SFX.click(); return;
    }
    if(code==='Space'){ SFX.click(); if(saved) continueRun(); else startRun(); return; }
    if(code==='Enter'){
     SFX.click();
     if(saved){
      if(titleSel===0) continueRun();
      else if(titleSel===1) titleNewRun();
      else if(titleSel===2) openSettings('title');
      else if(titleSel===3) openCodex('title');
      else openHelp('title');
     } else {
      if(titleSel===0){ if(readRun()) continueRun(); else startRun(); }
      else if(titleSel===1) openSettings('title');
      else if(titleSel===2) openCodex('title');
      else openHelp('title');
     }
     return;
    }
    if(code==='KeyN'){ SFX.click(); titleSel=saved?1:0; titleNewRun(); return; }
    titleConfirm=false; titleConfirmT=0;
   if(code==='KeyO'){ titleSel=saved?2:1; openSettings('title'); }
   if(code==='KeyH'||code==='F1'){ titleSel=nT-1; openHelp('title'); }
   if(code==='KeyC'){ titleSel=nT-2; openCodex('title'); }
   return;
  }
 if(state==='codex'){
   if(code==='Digit1'||code==='Digit2'){ codexTab=CODEX_TABS[code==='Digit1'?0:1]; codexSel=0; codexPage=0; SFX.click(); }
   else if(code==='ArrowLeft'||code==='ArrowRight'){ codexTab=codexTab==='bosses'?'bestiary':'bosses'; codexSel=0; codexPage=0; SFX.click(); }
   else if(code==='ArrowDown'||code==='ArrowUp'){ codexStep(code==='ArrowDown'?1:-1); codexPage=0; SFX.click(); }
   else if(code==='PageDown'||code==='Space'){ if(codexPagerRect){ codexPage++; SFX.click(); } }
   else if(code==='PageUp'||code==='Backspace'){ if(codexPage>0){ codexPage--; SFX.click(); } }
   else if(code==='Escape'||code==='KeyC'||code==='Enter') closeCodex();
   return;
  }
   // Space is dash: a player mashing it as the hull goes must still see the end screen
   if(state==='gameover'){
    if(code==='ArrowDown'||code==='ArrowUp'){ endSel=(endSel+(code==='ArrowDown'?1:1))%2; SFX.click(); return; }
    if(code==='Enter'&&endReady()){ SFX.click(); if(endSel===0) startRun(); else { state='title'; ensureTitleMusic(); } return; }
    if(code==='KeyR'&&endReady()){ SFX.click(); startRun(); return; }
    if(code==='Escape'){ state='title'; titleSel=0; ensureTitleMusic(); } return; }
   if(state==='settings'){ settingsKey(code); return; }
  if(state==='help'){
   const dig=['Digit1','Digit2','Digit3','Digit4'].indexOf(code);
   if(dig>=0){ helpTab=HELP_TABS[dig]; helpPage=0; SFX.click(); }
   else if(code==='ArrowRight'||code==='ArrowLeft'){
    let i=HELP_TABS.indexOf(helpTab);
    i=(i+(code==='ArrowRight'?1:HELP_TABS.length-1))%HELP_TABS.length;
    helpTab=HELP_TABS[i]; helpPage=0; SFX.click();
   }
   else if(code==='ArrowDown'||code==='PageDown'){ if(helpPagerRect){ helpPage++; SFX.click(); } }
   else if(code==='ArrowUp'||code==='PageUp'){ if(helpPage>0){ helpPage--; SFX.click(); } }
   else if(code==='Escape'||code==='KeyH'||code==='Enter') closeHelp();
   return; }
   if(state==='levelup'){
    if(code==='KeyC'){ openCodex('levelup'); return; }
    if(code==='KeyH'){ openHelp('levelup'); return; }
    const n=levelChoices.length;
    if(code==='ArrowLeft'||code==='ArrowUp'||code==='ArrowRight'||code==='ArrowDown'){ draftSel=((draftSel+((code==='ArrowLeft'||code==='ArrowUp')?n-1:1))%Math.max(1,n)); SFX.click(); return; }
    if((code==='Enter'||code==='Space')&&levelChoices[draftSel]){ pickUpgrade(levelChoices[draftSel]); return; }
    const d=['Digit1','Digit2','Digit3','Digit4'].indexOf(code); if(d>=0&&levelChoices[d]){ draftSel=d; pickUpgrade(levelChoices[d]); } return; }
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
   if(code==='Enter'){ try{ if(dismissCoach()) return; }catch(e){} return; }
    // Space stops a blink; E starts one. They are never the same key, so a
    // gate/blink/exit press can never be read as a cancel.
    if(code==='Space'||code==='ShiftLeft'||code==='ShiftRight'){ if(player&&player.channel){ cancelBlink(); return; } tryDash(); return; }
    if(code==='KeyE'){ doPortalKey(); return; }
   return;
  }
  if(state==='paused'){
   pauseSel=clamp(pauseSel,0,5);
   if(code==='ArrowDown'||code==='ArrowUp'){ pauseSel=(pauseSel+(code==='ArrowDown'?1:5))%6; SFX.click(); return; }
   if(code==='Enter'){
    SFX.click();
    if(pauseSel===0) toPlaying();
    else if(pauseSel===1) openSettings('paused');
    else if(pauseSel===2) openHelp('paused');
    else if(pauseSel===3) openCodex('paused');
    else if(pauseSel===4){ pauseRestart(); }
    else quitToTitle();
    return;
   }
   if(code==='Escape'||code==='KeyP'){ toPlaying(); SFX.click(); return; }
   if(code==='KeyR'){ pauseSel=4; pauseRestart(); return; }
   if(code==='KeyQ'){ pauseSel=5; quitToTitle(); return; }
   if(code==='KeyO'){ pauseSel=1; openSettings('paused'); }
   if(code==='KeyH'){ pauseSel=2; openHelp('paused'); }
   if(code==='KeyC'){ pauseSel=3; openCodex('paused'); }
   return; }
}
// ABANDON from pause throws away the saved run, so it asks twice, like NEW
// RUN — and it lands on the title, never straight into sector 1. A fresh run
// always starts from the title menu, never from a stray keypress.
function pauseRestart(){ SFX.click(); if(restartArm>performance.now()){ restartArm=0; clearRun(); state='title'; autoPaused=false; titleConfirm=false; titleConfirmT=0; titleSel=0; pauseSel=0; ensureTitleMusic(); } else restartArm=performance.now()+ARM_MS; }
function endReady(){ return performance.now()-endInfo.at>=600; }
function tryDash(){
 const p=player; if(!p||state!=='playing') return;
 if(!p.dashUnlocked){ if(p.lockMsgCd<=0){ p.lockMsgCd=1; addFloater(p.x,p.y-24,'DASH LOCKED: Ion Thrusters',K.textDim); } return; }
 const S=pStatus();
 if(S.jam>0){ if(p.lockMsgCd<=0){ p.lockMsgCd=1; addFloater(p.x,p.y-24,'SYSTEMS JAMMED',K.red); } return; }
 if(S.freeze>0){ if(p.lockMsgCd<=0){ p.lockMsgCd=1; addFloater(p.x,p.y-24,'FROZEN',K.red); } return; }
 if(S.root>0){ if(p.lockMsgCd<=0){ p.lockMsgCd=1; addFloater(p.x,p.y-24,'PETRIFIED',K.red); } return; }
 if(p.dashCd>0||p.dashT>0) return;
 let ax=((keys.KeyD||keys.ArrowRight)?1:0)-((keys.KeyA||keys.ArrowLeft)?1:0);
 let ay=((keys.KeyS||keys.ArrowDown)?1:0)-((keys.KeyW||keys.ArrowUp)?1:0);
 if(ax===0&&ay===0){ ax=Math.cos(p.aim); ay=Math.sin(p.aim); }
 const l=len(ax,ay); p.dashDx=ax/l; p.dashDy=ay/l;
 p.dashT=0.16; p.dashCd=p.dashCdMax; p.invuln=Math.max(p.invuln,0.25);
 SFX.dash(); spawnBurst(p.x,p.y,7,K.goldDim,160,0.4,2.5);
}
function openSettings(from){ settingsFrom=from; prevPause=(state==='playing'||state==='paused')?state:null; state='settings'; settingsSel=clamp(settingsSel,0,9); if(from!=='title') setMusicCfg(PAUSE_MUS); SFX.click(); }
let prevPause=null;
function settingsKey(code){
  if(code==='Escape'||code==='KeyO'){ SFX.click(); const ap=autoPaused; if(settingsFrom==='playing') toPlaying(); else if(settingsFrom==='title'||settingsFrom==='galaxy') state=settingsFrom; else toPaused(ap);
   if(state==='title'||state==='galaxy') setMusicCfg(TITLE_MUS); else if(state==='playing'&&arena) setMusicCfg(arena.theme); else setMusicCfg(PAUSE_MUS); return; }
  settingsSel=clamp(settingsSel,0,9);
  if(code==='ArrowDown'||code==='ArrowUp'){ settingsSel=(settingsSel+(code==='ArrowDown'?1:9))%10; SFX.click(); return; }
  // Volume rows step both ways: left turns it down, right turns it up. Every
  // other row treats all four as a press.
  if(settingsSel===6||settingsSel===7){
   const key=settingsSel===6?'musicVol':'sfxVol';
   if(code==='ArrowLeft'){ settingsSel=settingsSel; settings[key]=Math.round((settings[key]-0.1)*10)/10; if(settings[key]<0) settings[key]=0; saveCfg(); applyVol(); SFX.click(); return; }
   if(code==='ArrowRight'){ settingsSel=settingsSel; settings[key]=Math.round((settings[key]+0.1)*10)/10; if(settings[key]>1) settings[key]=1; saveCfg(); applyVol(); SFX.click(); return; }
  }
  if(code==='Enter'||code==='Space'||code==='ArrowLeft'||code==='ArrowRight'){ code=settingsSel===9?'Digit0':'Digit'+(settingsSel+1); }
  if(code==='Digit1'){ settingsSel=0; settings.shake=!settings.shake; saveCfg(); }
  if(code==='Digit2'){ settingsSel=1; settings.particles=!settings.particles; saveCfg(); }
   if(code==='Digit3'){ settingsSel=2; settings.music=!settings.music; saveCfg(); applyVol(); if(settings.music){ if(settingsFrom==='title'||settingsFrom==='galaxy') setMusicCfg(TITLE_MUS); else if(state==='playing'&&arena) setMusicCfg(arena.theme); else setMusicCfg(PAUSE_MUS); } }
  if(code==='Digit4'){ settingsSel=3; settings.autofire=!settings.autofire; saveCfg(); if(player) player.autoFire=settings.autofire; }
  if(code==='Digit5'){ settingsSel=4; settings.showSeed=!settings.showSeed; saveCfg(); }
   if(code==='Digit6'){ settingsSel=5; if(wipeArmT>performance.now()){ wipeArmT=0; best=0; depth=0; bosses=0; saveMeta(); codexKills={}; saveCodex(); codexSeenMap={}; try{ lsDel('seen'); }catch(e){} coachSeenMap={}; try{ lsDel('coach'); }catch(e){} } else wipeArmT=performance.now()+ARM_MS; }
  if(code==='Digit7'){ settingsSel=6; settings.musicVol=Math.min(1,Math.round((settings.musicVol+0.1)*10)/10); saveCfg(); applyVol(); }
  if(code==='Digit8'){ settingsSel=7; settings.sfxVol=Math.min(1,Math.round((settings.sfxVol+0.1)*10)/10); saveCfg(); applyVol(); }
  if(code==='Digit9'){ settingsSel=8; settings.dmgNums=!settings.dmgNums; saveCfg(); }
  if(code==='Digit0'){ settingsSel=9; settings.largeText=!settings.largeText; saveCfg(); }
 SFX.click();
}
let helpTab='controls'; // controls | shields | arsenal | lore
let helpPage=0; // help body pager: which overflow page is shown
let helpPagerRect=null; // clickable MORE rect while help overflows, else null
let codexPreview=false; // suppresses HP bars and combat labels in codex portraits
let codexSilhouette=false; // locked entries draw their real shape as a flat shadow
const HELP_TABS=['controls','shields','arsenal','lore'];
function helpTabRects(){
 const fullW = 170, g = 10;
 let w = fullW;
 if(W < fullW * 4 + g * 3 + 32) w = Math.max(64, Math.floor((W - 32 - g * 3) / 4));
 const x0 = Math.round((W - (w * 4 + g * 3)) / 2);
 const y = Math.max(110, 132 + Math.min(0, H - 640));
 const a = [];
 for(let i=0;i<4;i++) a.push({x:x0+i*(w+g),y,w,h:30});
 return a;
}
// ---------- codex screen ----------
// Its own screen, reachable from the title, the galaxy hub and pause (key C).
let codexFrom='title', codexTab='bosses', codexSel=0;
let codexPage=0; // codex detail pager: which overflow page is shown
let codexPagerRect=null; // clickable MORE rect while the detail overflows
let codexIdxPagerRect=null; // clickable index ▲▼ rect while the index overflows
const CODEX_TABS=['bestiary','bosses'];
function openCodex(from){ codexFrom=from; codexSel=0; codexPage=0; codexPagerRect=null; codexIdxPagerRect=null; state='codex'; if(from==='paused'||from==='playing-paused') setMusicCfg(PAUSE_MUS); SFX.click(); }
function closeCodex(){ SFX.click(); if(codexFrom==='paused'||codexFrom==='playing-paused') toPaused(autoPaused); else if(codexFrom==='galaxy') state='galaxy'; else if(codexFrom==='levelup') state='levelup'; else state='title'; }
function codexTabRects(){
 let w = 200; const g = 12;
 if(W < w * 2 + g + 32) w = Math.max(80, Math.floor((W - 32 - g) / 2));
 const x0 = Math.round((W - (w * 2 + g)) / 2);
 const y = Math.max(100, 120 + Math.min(0, H - 640));
 return [0,1].map(i=>({x:x0+i*(w+g),y,w,h:30}));
}
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
// Each god's entry lives in its own boss block (kit.codex), listed in ladder order.
const CODEX_BOSSES=LADDER.map(k=>Object.assign({id:k},BOSS_KITS[k].codex));
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
// The last line never strands a single word: a lone orphan is folded back so
// it joins the previous line instead of dangling.
function wrapLines(t,maxChars){
 const words=String(t).split(' '), out=[]; let line='';
 for(const w of words){
  if(line&&(line+' '+w).length>maxChars){ out.push(line); line=w; }
  else line=line?line+' '+w:w;
 }
 if(line) out.push(line);
 if(out.length>=2){
  const last=out[out.length-1];
  if(last.indexOf(' ')<0){
   const prev=out[out.length-2].split(' ');
   if(prev.length>1){ const w=prev.pop(); out[out.length-2]=prev.join(' '); out[out.length-1]=w+' '+last; }
  }
 }
 return out;
}
const HELP_TXT={
controls:[
'MOVE: WASD / Arrows — your nose follows movement, guns track the mouse.',
'FIRE: hold click, or leave AUTO-FIRE on (T) and just fly.',
'DASH: locked until Ion Thrusters — then Space / Shift (i-frames).',
'EXIT: walk into the ring or press E. With XP on the field, E again confirms — the field is lost.',
'GALAXY: START drops you on the hub — pick a lit sector, clear it, pick the next.',
'SECTORS: an opening pack loads in; reinforcements stream from off-screen.',
'RECALL: Portal Cell cards grant charges (max 5).',
'  E drops a gate (1 charge). E again channels a blink (520px, cooldown).',
'  Overdrive cuts cooldown, Transit cuts channel time. Space cancels the blink.',
'PICK: 1 / 2 / 3 or click a card. PAUSE: Esc / P. MUTE: M. SETTINGS: O. CODEX: C.',
'STATUS: PETRIFIED roots you; JAMMED locks dash + recall. Neither stops your guns.',
'TIP: first draft offers dash + recall — take one, then build damage.'],
shields:[
'Warding Plate: blocks the 1st hit of EVERY sector. Refreshes per sector.',
'Bulwark Matrix: blocks 2+ hits per sector. Refreshes per sector.',
'Crit Ward (rare): blocks 1 HEAVY hit per sector. Refreshes per sector.',
'Aegis Pulse: a shield that recharges mid-fight and blocks hits.',
'Ablative Barrier (rare): ONE-TIME pool absorbs 50 damage — never comes back.',
'Stasis Protocol (rare): cheat death up to 3 times — revival grows 1 HP → 25% → FULL.',
'Second Wind (rare): one revive at 50% HP.',
'Block order: Crit Ward (heavy only) → Warding → Bulwark → Barrier → Aegis.',
'Live shields hang under your HUD: AEGIS PULSE · WARDING PLATE · BULWARK ×2 · CRIT WARD · BARRIER 50 · STASIS ×1.',
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
'MAPS: every sector is validated — all spawns and the EXIT are always reachable,',
'  and at least 45% of the field is open. Six layout types, six themes.'],
lore:[
'You are KRIEFNE: an exploration ship sent from home, long ago, to find life.',
'Home has not answered once in all that time.',
'Out here are machines older than stars, ranked like the old northern gods.',
'They catch every signal that crosses their space — even the ones meant for you.',
'',
'Every fifth sector is a NEST, held by one god. The gods keep a chain of command:',
'  APEX  >  SOVEREIGN  >  LORD  >  CAPTAIN  >  ENFORCER  >  chaff.',
'Twenty gods stand on one ladder, a rung every five sectors. Wounded, a god',
'CALLS the god directly beneath it: a weaker copy of the nest before.',
'They fight by holmgang: every blow shown first, your guns never taken.',
'',
'Past S50 a called god can call one of its own; from the Apex, two deep.',
'Kill the one giving orders and the calls stop.',
'',
'Lose your ship and the Wake restores you. Each god slain: +2% damage, for good.']
};
function openHelp(from){ helpFrom=from; helpTab='controls'; helpPage=0; helpPagerRect=null; state='help'; if(from==='paused'||from==='playing-paused') setMusicCfg(PAUSE_MUS); SFX.click(); }
function closeHelp(){ SFX.click(); if(helpFrom==='levelup'){ state='levelup'; } else if(helpFrom==='paused'){ toPaused(autoPaused); } else if(helpFrom==='playing-paused'){ toPaused(autoPaused); } else if(helpFrom==='galaxy'){ state='galaxy'; } else { state='title'; } }
function inBtn(x,y,b){ return x>b.x&&x<b.x+b.w&&y>b.y&&y<b.y+b.h; }
// Starting over while a run is saved throws that run away, so it takes a
// second press: the first only arms the button for one shared window.
function titleNewRun(){ const sv=readRun(); if(sv&&(!titleConfirm||titleConfirmT<=performance.now())){ titleConfirm=true; titleConfirmT=performance.now()+ARM_MS; return; } titleConfirm=false; titleConfirmT=0; startRun(); }
function quitToTitle(){ state='title'; autoPaused=false; titleConfirm=false; titleConfirmT=0; exitArm=0; titleSel=0; pauseSel=0; parts=[]; floaters=[]; clearInputs(); ensureTitleMusic(); SFX.click(); }
const BTN={ titleContinue:{x:64,y:346,w:400,h:44}, titleStart:{x:64,y:398,w:400,h:44}, titleSet:{x:64,y:462,w:126,h:34}, titleCodex:{x:201,y:462,w:126,h:34}, titleHelp:{x:338,y:462,w:126,h:34},
 pauseResume:{x:330,y:290,w:300,h:42}, pauseSet:{x:330,y:338,w:300,h:42}, pauseHelp:{x:330,y:386,w:300,h:42}, pauseCodex:{x:330,y:434,w:300,h:42}, pauseRestart:{x:330,y:482,w:300,h:42}, pauseQuit:{x:330,y:530,w:300,h:42},
 galCodex:{x:W-236,y:60,w:180,h:34},
 endRestart:{x:330,y:532,w:300,h:44}, endTitle:{x:330,y:584,w:300,h:36},
 back:{x:330,y:560,w:300,h:44} };
// Re-pin buttons to the live viewport: centred menus, edge-pinned HUD-adjacent
// entries. At 960x640 this reproduces the exact shipped rects above, so the
// headless balance suite never moves; on any other window it reflows.
// Optical centre. A block reads as centred a little above the geometric
// middle, and the bottom of the field is the part a player never reads, so
// every self-centred overlay splits its free space 42 : 58, top : bottom.
const OPTICAL = 0.42;
function opticalTop(top, bottom, h){ return top + Math.max(0, Math.round((bottom - top - h) * OPTICAL)); }
// Pause: the block (PAUSED, its two lines, six entries, and the hull record
// when it stacks beneath) is sized, then set on the optical centre of the
// field between the HUD and the stats rule. Wide windows hang BUILD and
// SYSTEMS beside the entries; narrower ones stack them under it, and what
// does not fit yields — SYSTEMS first, then BUILD — instead of running into
// the stats rule. Re-run every pause frame, since the build grows.
let pauseRecord = 'side'; // 'side' | 'stack' | 'build' | 'none'
function pauseSysRows(){ const p = player; return p ? 8 + (p.pierce?1:0) + (p.bounce?1:0) + (p.homing?1:0) : 0; }
function layoutPause(){
 const cW = Math.min(300, Math.max(200, W - 32)), cX = Math.round((W - cW) / 2);
 const pShort = H < 560, ph = pShort ? 30 : 42, pitch = pShort ? 34 : 48;
 const pHead = pShort ? 78 : 98; // heading cap to RESUME's top edge
 const pBlock = pHead + 5 * pitch + ph;
 const top = HUD_H, bottom = H - (pShort ? 24 : 34);
 let extra = 0; pauseRecord = 'none';
 if(!pShort && player){
  if(W >= 700 && cX >= 48 + 240 + 40 && W - 48 - 240 >= cX + cW + 40) pauseRecord = 'side';
  else {
   const bw = Math.min(420, W - 32), per = Math.max(1, Math.floor(bw / 40));
   const n = Object.keys(upgradeCounts).filter(id => upgradeCounts[id] > 0).length;
   const buildH = 24 + 18 + (n ? Math.ceil(Math.min(n, per * 2) / per) * 46 : 26);
   const sysH = 12 + 20 + Math.ceil(pauseSysRows() / 2) * 18;
   const room = bottom - top - 8;
   if(pBlock + buildH + sysH <= room){ pauseRecord = 'stack'; extra = buildH + sysH; }
   else if(pBlock + buildH <= room){ pauseRecord = 'build'; extra = buildH; }
  }
 }
 const sy = opticalTop(top, bottom, pBlock + extra) + pHead;
 ['pauseResume','pauseSet','pauseHelp','pauseCodex','pauseRestart','pauseQuit'].forEach((k,i)=>{
  BTN[k].x = cX; BTN[k].w = cW; BTN[k].h = ph; BTN[k].y = Math.round(sy + i * pitch); });
}
function layoutButtons(){
 try{
  const tMargin = W < 600 ? 16 : 64;
  const tW = Math.min(400, W - tMargin * 2);
  if(H < 560){
   BTN.titleContinue.x = tMargin; BTN.titleContinue.y = 108; BTN.titleContinue.w = tW; BTN.titleContinue.h = 36;
   BTN.titleStart.x = tMargin; BTN.titleStart.y = 148; BTN.titleStart.w = tW; BTN.titleStart.h = 36;
   const sW = Math.max(44, Math.floor((tW - 22) / 3));
   BTN.titleSet.x = tMargin; BTN.titleSet.y = 188; BTN.titleSet.w = sW; BTN.titleSet.h = 28;
   BTN.titleCodex.x = tMargin + sW + 11; BTN.titleCodex.y = 188; BTN.titleCodex.w = sW; BTN.titleCodex.h = 28;
   BTN.titleHelp.x = tMargin + 2 * (sW + 11); BTN.titleHelp.y = 188; BTN.titleHelp.w = Math.max(44, tW - 2 * (sW + 11)); BTN.titleHelp.h = 28;
  } else {
  const tShift = Math.min(0, H - 640);
  BTN.titleContinue.x = tMargin; BTN.titleContinue.y = 346 + tShift; BTN.titleContinue.w = tW; BTN.titleContinue.h = 44;
  BTN.titleStart.x = tMargin; BTN.titleStart.y = 398 + tShift; BTN.titleStart.w = tW; BTN.titleStart.h = 44;
  const sW = Math.max(44, Math.floor((tW - 22) / 3));
  BTN.titleSet.x = tMargin; BTN.titleSet.y = 462 + tShift; BTN.titleSet.w = sW; BTN.titleSet.h = 34;
  BTN.titleCodex.x = tMargin + sW + 11; BTN.titleCodex.y = 462 + tShift; BTN.titleCodex.w = sW; BTN.titleCodex.h = 34;
  BTN.titleHelp.x = tMargin + 2 * (sW + 11); BTN.titleHelp.y = 462 + tShift; BTN.titleHelp.w = Math.max(44, tW - 2 * (sW + 11)); BTN.titleHelp.h = 34;
  }
  const cW = Math.min(300, Math.max(200, W - 32)), cX = Math.round((W - cW) / 2);
  layoutPause();
  const gW = Math.min(180, Math.max(120, W - 32)), gM = W < 600 ? 16 : 56;
  // phones lift CODEX above the sector heading so the two never share a line
  BTN.galCodex.w = W < 600 ? Math.min(gW, 150) : gW; BTN.galCodex.x = W - BTN.galCodex.w - gM; BTN.galCodex.y = W < 600 ? 20 : 60;
  BTN.endRestart.x = cX; BTN.endRestart.w = cW; BTN.endRestart.y = H - 108;
  BTN.endTitle.x = cX; BTN.endTitle.w = cW; BTN.endTitle.y = H - 56;
  BTN.back.x = cX; BTN.back.w = cW; BTN.back.y = H - 80;
 }catch(e){}
}
function handleClick(x,y){
  if(state==='title'){
   ensureTitleMusic();
   const saved=readRun();
   if(saved&&inBtn(x,y,BTN.titleContinue)){ titleSel=0; SFX.click(); continueRun(); }
   else if(inBtn(x,y,titleStartRect())){ titleSel=saved?1:0; SFX.click(); if(saved) titleNewRun(); else startRun(); }
   else if(inBtn(x,y,BTN.titleSet)){ titleSel=saved?2:1; openSettings('title'); }
   else if(inBtn(x,y,BTN.titleCodex)){ titleSel=saved?3:2; openCodex('title'); }
   else if(inBtn(x,y,BTN.titleHelp)){ titleSel=saved?4:3; openHelp('title'); }
   return;
  }
  if(state==='codex'){
   if(codexPagerRect&&inBtn(x,y,codexPagerRect)){ codexPage++; SFX.click(); return; }
   if(codexIdxPagerRect&&inBtn(x,y,codexIdxPagerRect)){ codexIdxPage(codexIdxPagerRect.dir||1); SFX.click(); return; }
   const tr=codexTabRects();
   for(let i=0;i<tr.length;i++){ if(inBtn(x,y,tr[i])){ codexTab=CODEX_TABS[i]; codexSel=0; codexPage=0; SFX.click(); return; } }
   for(const r of codexRects()){ if(!r.row.hdr&&inBtn(x,y,r)){ if(codexSel!==r.row.i) codexPage=0; codexSel=r.row.i; SFX.click(); return; } }
   if(inBtn(x,y,BTN.back)) closeCodex();
  return;
 }
 if(state==='settings'){
  const rows=rowRects();
  for(let i=0;i<rows.length;i++){ if(x>rows[i].x&&x<rows[i].x+rows[i].w&&y>rows[i].y&&y<rows[i].y+rows[i].h){
   // Volume rows: the left half turns down, the right half turns up.
   if(i===6||i===7){ settingsSel=i; settingsKey(x<rows[i].x+rows[i].w/2?'ArrowLeft':'ArrowRight'); return; }
   settingsKey(i===9?'Digit0':'Digit'+(i+1)); return; } }
  if(inBtn(x,y,BTN.back)){ settingsKey('Escape'); }
  return;
 }
   if(state==='help'){ const tr=helpTabRects();
    if(helpPagerRect&&inBtn(x,y,helpPagerRect)){ helpPage++; SFX.click(); return; }
    for(let i=0;i<tr.length;i++){ if(inBtn(x,y,tr[i])){ helpTab=HELP_TABS[i]; helpPage=0; SFX.click(); return; } }
    if(inBtn(x,y,BTN.back)) closeHelp(); return; }
   if(state==='gameover'){
    if(inBtn(x,y,BTN.endRestart)){ endSel=0; if(endReady()){ SFX.click(); startRun(); } }
    else if(inBtn(x,y,BTN.endTitle)){ endSel=1; state='title'; titleSel=0; ensureTitleMusic(); }
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
    if(inBtn(x,y,BTN.pauseResume)){ pauseSel=0; toPlaying(); SFX.click(); }
   else if(inBtn(x,y,BTN.pauseSet)){ pauseSel=1; openSettings('paused'); }
   else if(inBtn(x,y,BTN.pauseHelp)){ pauseSel=2; openHelp('paused'); }
   else if(inBtn(x,y,BTN.pauseCodex)){ pauseSel=3; openCodex('paused'); }
   else if(inBtn(x,y,BTN.pauseRestart)){ pauseSel=4; pauseRestart(); }
   else if(inBtn(x,y,BTN.pauseQuit)){ pauseSel=5; quitToTitle(); }
   return;
  }
  if(state==='playing'){
   const wx=x+cam.x, wy=y+cam.y; // clicks arrive in screen space; the world is camera-offset
   if(portal&&dist2(wx,wy,portal.x,portal.y)<50*50){ tryExitPortal(); return; }
   const rc=player.recall;
   if(rc&&dist2(wx,wy,rc.x,rc.y)<40*40){ doPortalKey(); }
  }
}
function rowRects(){
 if(H < 560){
  // Short landscape: two columns so all ten rows stay on-screen.
  const w2 = Math.max(200, Math.min(360, Math.floor((W - 48) / 2)));
  const x0 = Math.round((W - (w2 * 2 + 16)) / 2);
  const y0 = 96, pitch = 26, h = 24;
  const a = [];
  for(let i=0;i<10;i++){ const col = i < 5 ? 0 : 1, row = i < 5 ? i : i - 5;
   a.push({x:x0+col*(w2+16),y:y0+row*pitch,w:w2,h}); }
  return a;
 }
 const w = Math.min(500, Math.max(240, W - 32));
 const x = Math.round((W - w) / 2);
 const shift = Math.min(0, H - 640);
 const a = [];
 // Ten rows at a tighter pitch so the list still ends above BACK.
 for(let i=0;i<10;i++) a.push({x,y:168+i*38+shift,w,h:34});
 return a;
}

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
// Engraved menu entry. `on` is the keyboard-selected choice: a 3px focus ring
// plus the solid rule and filled marker, so position never rests on text
// colour alone. Hover alone gets the solid rule without the ring.
function entry(b,label,key,on,tone){
 const hot=on||hovered(b), danger=tone==='danger';
 const col=danger?K.red:(hot?K.gold:K.goldDim), cy=b.y+b.h/2-2;
 if(on){ ctx.save(); ctx.strokeStyle=danger?K.red:K.gold; ctx.lineWidth=3; ctx.strokeRect(b.x-4.5,b.y-4.5,b.w+9,b.h+9); ctx.restore(); }
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
 ctx.save(); ctx.lineJoin='bevel'; ctx.lineCap='square';
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
 // boulders a god throws (temp:true) are drawn live, never baked into the layer
 const keep=arena.obs; if(keep&&keep.some(o=>o.temp)) arena.obs=keep.filter(o=>!o.temp);
 try{ paintWorld(g,arena.theme||THEMES[0]); } finally{ arena.obs=keep; }
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
 paintObstacles(g,arena.obs,Lx,Ly,P);
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
function polyPath(g,o){ o.pts.forEach((p,i)=>{ if(i) g.lineTo(o.x+p[0],o.y+p[1]); else g.moveTo(o.x+p[0],o.y+p[1]); }); g.closePath(); }
function shapePath(g,o){
 g.beginPath();
 if(o.kind==='rect') g.rect(o.x,o.y,o.w,o.h);
 else if(o.kind==='poly') polyPath(g,o);
 else g.arc(o.x,o.y,o.r,0,6.283);
}
// hatching at 4px, clipped to whatever path is current and to the half of
// (cx,cy,rad) facing away from the star
function hatchShadow(g,cx,cy,rad,Lx,Ly,P){
 g.clip();
 g.translate(cx,cy); g.rotate(Math.atan2(Ly,Lx)); g.beginPath(); g.rect(-rad*0.15,-rad-4,rad*2+8,rad*2+8); g.clip();
 g.rotate(0.7); g.strokeStyle=P.faint; g.lineWidth=1; g.beginPath();
 for(let d=-rad*1.6;d<rad*1.6;d+=4){ g.moveTo(d,-rad*1.6); g.lineTo(d,rad*1.6); }
 g.stroke();
}
function polySpokes(g,o){ g.beginPath(); for(const p of o.pts){ g.moveTo(o.x,o.y); g.lineTo(o.x+p[0]*0.8,o.y+p[1]*0.8); } g.stroke(); }
function paintObstacles(g,obs,Lx,Ly,P){
 const groups={};
 for(const o of obs) if(o.grp!==undefined&&o.kind==='poly') (groups[o.grp]||(groups[o.grp]=[])).push(o);
 for(const o of obs){ const G=o.grp!==undefined?groups[o.grp]:null;
  if(G&&G.length>1){ if(G[0]===o) engraveGroup(g,G,Lx,Ly,P); }
  else engrave(g,o,Lx,Ly,P); }
}
function engrave(g,o,Lx,Ly,P){
 const cx=o.kind==='rect'?o.x+o.w/2:o.x, cy=o.kind==='rect'?o.y+o.h/2:o.y;
 const rad=o.kind==='rect'?Math.hypot(o.w,o.h)/2:o.r;
 shapePath(g,o); g.fillStyle=P.hull; g.fill();
 // hatching, clipped to the shadowed half
 g.save(); shapePath(g,o); hatchShadow(g,cx,cy,rad,Lx,Ly,P); g.restore();
 // inner detail: seams, tank rings and facet lines read as built things
 g.strokeStyle=P.faint; g.lineWidth=1;
 if(o.kind==='rect'){ if(o.w>60&&o.h>14){ g.beginPath(); g.moveTo(o.x+5,o.y+o.h*0.5); g.lineTo(o.x+o.w-5,o.y+o.h*0.5); g.stroke(); } }
 else if(o.kind==='poly') polySpokes(g,o);
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
// Compound wreckage is painted as one hull. Pieces fill in order, each laid
// over the last with its own facet lines; the hatching and its shadow side
// come from the whole group; the outline and the lit silver edge run only
// round the union. Where a later piece's edge lies over an earlier piece it
// stays as a faint seam, the only sign the hull was ever two.
// segInPoly: the span [t0,t1] of segment a->b strictly inside convex poly q
// (inset half a pixel, so a border two pieces share counts as outside), or null.
function segInPoly(ax,ay,bx,by,q){
 let t0=0, t1=1; const p=q.pts, n=p.length, dx=bx-ax, dy=by-ay;
 for(let i=0;i<n;i++){
  const px=q.x+p[i][0], py=q.y+p[i][1], ex=q.x+p[(i+1)%n][0]-px, ey=q.y+p[(i+1)%n][1]-py;
  const num=ex*(ay-py)-ey*(ax-px)-0.5*Math.hypot(ex,ey), den=ex*dy-ey*dx;
  if(Math.abs(den)<1e-9){ if(num<0) return null; continue; }
  const t=-num/den; if(den>0){ if(t>t0) t0=t; } else if(t<t1) t1=t;
  if(t0>=t1) return null;
 }
 return [t0,t1];
}
// the spans of a->b (within `from`, default all of it) outside every poly in qs
function segOutside(ax,ay,bx,by,qs,from){
 let segs=from||[[0,1]];
 for(const q of qs){ const iv=segInPoly(ax,ay,bx,by,q); if(!iv) continue; const out=[];
  for(const s of segs){ if(iv[1]<=s[0]||iv[0]>=s[1]){ out.push(s); continue; } if(iv[0]>s[0]) out.push([s[0],iv[0]]); if(iv[1]<s[1]) out.push([iv[1],s[1]]); }
  segs=out; if(!segs.length) break; }
 return segs;
}
// Every edge span of the group, sorted into outline (on the union's rim) and
// seam (a piece's edge lying over an earlier piece, not under a later one).
// Each span carries its piece's outward normal for the light test.
function groupEdges(G){
 const rim=[], seam=[];
 for(let i=0;i<G.length;i++){ const o=G[i], n=o.pts.length, lower=G.slice(0,i), upper=G.slice(i+1);
  for(let k=0;k<n;k++){
   const ax=o.x+o.pts[k][0], ay=o.y+o.pts[k][1], bx=o.x+o.pts[(k+1)%n][0], by=o.y+o.pts[(k+1)%n][1];
   const L=Math.hypot(bx-ax,by-ay)||1, nx=(by-ay)/L, ny=-(bx-ax)/L; // outward: mkPoly fixes the winding
   const shown=segOutside(ax,ay,bx,by,upper), out=segOutside(ax,ay,bx,by,lower,shown);
   for(const s of out) rim.push([ax+(bx-ax)*s[0],ay+(by-ay)*s[0],ax+(bx-ax)*s[1],ay+(by-ay)*s[1],nx,ny]);
   // seam = shown minus out
   for(const s of shown){ let lo=s[0];
    for(const u of out){ if(u[1]<=s[0]||u[0]>=s[1]) continue; if(u[0]>lo+1e-6) seam.push([ax+(bx-ax)*lo,ay+(by-ay)*lo,ax+(bx-ax)*u[0],ay+(by-ay)*u[0]]); lo=Math.max(lo,u[1]); }
    if(s[1]>lo+1e-6) seam.push([ax+(bx-ax)*lo,ay+(by-ay)*lo,ax+(bx-ax)*s[1],ay+(by-ay)*s[1]]); }
  }
 }
 return {rim,seam};
}
function engraveGroup(g,G,Lx,Ly,P){
 let x0=1e9, y0=1e9, x1=-1e9, y1=-1e9;
 for(const o of G) for(const p of o.pts){ const x=o.x+p[0], y=o.y+p[1]; if(x<x0) x0=x; if(x>x1) x1=x; if(y<y0) y0=y; if(y>y1) y1=y; }
 const cx=(x0+x1)/2, cy=(y0+y1)/2, rad=Math.hypot(x1-x0,y1-y0)/2;
 g.strokeStyle=P.faint; g.lineWidth=1;
 for(const o of G){ shapePath(g,o); g.fillStyle=P.hull; g.fill(); g.strokeStyle=P.faint; g.lineWidth=1; polySpokes(g,o); }
 // one shadow for the whole hull: every piece winds the same way, so the
 // nonzero clip of all of them is their union
 g.save(); g.beginPath(); for(const o of G) polyPath(g,o); hatchShadow(g,cx,cy,rad,Lx,Ly,P); g.restore();
 const E=groupEdges(G);
 g.strokeStyle=P.faint; g.lineWidth=1; g.beginPath();
 for(const s of E.seam){ g.moveTo(s[0],s[1]); g.lineTo(s[2],s[3]); } g.stroke();
 g.strokeStyle=P.dim; g.lineWidth=1.25; g.beginPath();
 for(const s of E.rim){ g.moveTo(s[0],s[1]); g.lineTo(s[2],s[3]); } g.stroke();
 g.strokeStyle=P.metal; g.lineWidth=1.5; g.beginPath();
 for(const s of E.rim) if(-(s[4]*Lx+s[5]*Ly)>0.25){ g.moveTo(s[0],s[1]); g.lineTo(s[2],s[3]); }
 g.stroke();
}

// ---------- frame ----------
function render(){
 if(!fontsReady){ ctx.fillStyle=K.ground; ctx.fillRect(0,0,W,H); return; }
 // Re-assert the device transform every frame: canvas resizes reset context
 // state, and this keeps all draw code in live viewport (W/H) units.
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
 if(state==='playing'){ try{ drawCoach(); }catch(e){} }
 if(state==='levelup') drawLevelUp();
 if(state==='paused') drawPaused();
 if(state==='gameover') drawEnd();
 if(bossWarnT>0&&state==='playing'&&hostiles()>0){
  const t=bossWarnTxt||'BOSS';
  const hw=Math.min(240,W/2-16);
  line(W/2-hw,PY0+50,W/2+hw,PY0+50,K.red,1); line(W/2-hw,PY0+84,W/2+hw,PY0+84,K.red,1);
  heading(t,W/2,PY0+75,Math.min(20,Math.max(14,Math.floor((hw*2-32)/Math.max(4,t.length)))),K.red,'center');
  ctx.textAlign='center'; bossWarnSub.forEach((l,i)=>inkText(l,W/2,PY0+106+i*16,K.text,fM(12,600)));
 }
 if(__dev) __dev.draw(); // DevX lab only: hitbox / meter overlay
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
   ctx.restore();
  if(exitArmed()){ ctx.textAlign='center'; inkText('LOSE '+fieldXpAtRisk()+' XP? [E] AGAIN',portal.x,portal.y+r+26,K.red,fD(10)); }
  else ctx.textAlign='center', inkText(gems.length?('EXIT [E] · '+fieldXpAtRisk()+' XP AT RISK'):'EXIT [E]',portal.x,portal.y+r+26,K.gold,fD(10));
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
  if(gr.delay>0){ ctx.restore(); ctx.save(); ctx.globalAlpha=0.7; ctx.strokeStyle=K.red; ctx.lineWidth=1; ctx.setLineDash([6,6]); ctx.beginPath(); ctx.arc(gr.x,gr.y,gr.maxR,0,6.283); ctx.stroke(); ctx.setLineDash([]); }
  else if(gr.dmg>0||gr.fx){ ctx.strokeStyle=K.red; ctx.lineWidth=2; ctx.beginPath(); ctx.arc(gr.x,gr.y,gr.r,0,6.283); ctx.stroke(); ctx.lineWidth=1; ctx.beginPath(); ctx.arc(gr.x,gr.y,Math.max(1,gr.r-6),0,6.283); ctx.stroke(); }
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
 drawBossUnder(th); // boulders, trail discs, erase zones, currents, marks, beams
 // what a god trails behind its hull (LEVIATHAN's body), beneath every hull
 for(const e of enemies) if(e.type==='boss'&&e.kit&&e.kit.under) e.kit.under(e);
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
 if(player&&state!=='gameover'){ drawShip(); drawBossOver(); }
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
// Each silhouette is its kit's draw() in its own boss block; this frame adds
// what every god shares: rank rings, enraged ticks and the red telegraphs.
function drawBossShape(e,enrage,flash){
 const kit=e.kit||BOSS_KITS[e.kind]||BOSS_KITS.overlord, def=kit.def, R=e.r, P=pigOf(e);
 const g={R,P,col:enrage?P.hi:P.c,body:flash?P.flash:P.body,dim:P.dim,lw:enrage?2:1.5,enrage,flash};
 if(kit.draw) kit.draw(e,g);
 else { ctx.fillStyle=g.body; ctx.strokeStyle=g.col; ctx.lineWidth=g.lw; poly(6,R-3,0); ctx.fill(); ctx.stroke(); }
 drawBossParts(e,g);
 // rank: concentric rings just outside the silhouette
 const tier=(def.tier||1);
 ctx.save(); ctx.globalAlpha=0.9; rankRings(0,0,R+10,tier,(e.summoned||e.echo)?P.dim:(enrage?P.hi:P.c),1);
 // enraged: the outer ring is cut with ticks, the way heavy is double-ruled
 if(enrage){ const ro=R+10+(tier-1)*3.5; ctx.strokeStyle=P.hi; ctx.lineWidth=1; ctx.beginPath(); for(let k=0;k<24;k++){ const a=k*0.2618+(REDUCED?0:e.t*0.4); ctx.moveTo(Math.cos(a)*(ro+2),Math.sin(a)*(ro+2)); ctx.lineTo(Math.cos(a)*(ro+(k%2?5:8)),Math.sin(a)*(ro+(k%2?5:8))); } ctx.stroke(); }
 ctx.restore();
 if(kit.drawTop) kit.drawTop(e,g);
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
  if(e.phased){ // translucent (a Ghost Form): the real shape, a whisper of itself, in a dashed rim
   ctx.globalAlpha=0.4; drawBossShape(e,enrage,flash); ctx.globalAlpha=1;
   ctx.strokeStyle=col; ctx.lineWidth=1.25; ctx.setLineDash([4,4]); ctx.beginPath(); ctx.arc(0,0,e.r+4,0,6.283); ctx.stroke(); ctx.setLineDash([]);
  } else {
   drawBossShape(e,enrage,flash);
  } }
 ctx.restore();
 // Labels sit outside the spawn pop, in screen space, measured from the same
 // radius as the HP bar: rings, then bar, then name, never overlapping.
 // Codex portraits skip the combat furniture — the shape is the subject.
 if(e.type==='boss'&&!codexPreview){ const enrage=e.hp<e.maxhp*0.3;
  ctx.textAlign='center';
  const tier=(e.def&&e.def.tier)||1, barY=e.y-e.r-10-tier*3.5-(enrage?8:0);
  inkText(e.bname||'BOSS',e.x,barY-10,K.text,fD(10));
  if(enrage) inkText('ENRAGED',e.x,barY-24,P.hi,fD(9));
  inkText(bossLabel(e),e.x,e.y+e.r+tier*3.5+26,enrage?P.hi:P.c,fM(11,600));
  if(e.rec&&e.healPool>0) inkText('MENDING',e.x,e.y+e.r+tier*3.5+42,P.hi,fM(11,600));
 }
 if(e.slowT>0){ ctx.strokeStyle=K.metal; ctx.lineWidth=1; ctx.setLineDash([2,3]); ctx.beginPath(); ctx.arc(e.x,e.y,e.r+4,0,6.283); ctx.stroke(); ctx.setLineDash([]); }
 if(!codexPreview&&(e.type==='brute'||e.type==='boss'||e.hp<e.maxhp)&&e.hp>0){
  const boss=e.type==='boss', w=boss?96:34, y=e.y-e.r-(boss?10+((e.def&&e.def.tier)||1)*3.5+(e.hp<e.maxhp*0.3?8:0):9), f=clamp(e.hp/e.maxhp,0,1);
  line(e.x-w/2,y,e.x+w/2,y,K.metalDim,1);
  // a phase beat is the god's one invulnerable window: the fill goes dashed
  if(boss&&e.mode==='beat') line(e.x-w/2,y,e.x-w/2+w*f,y,P.c,3,[4,3]); else line(e.x-w/2,y,e.x-w/2+w*f,y,P.c,boss?3:2);
  if(boss){ for(let k=1;k<4;k++) line(e.x-w/2+w*k/4,y-3,e.x-w/2+w*k/4,y+3,K.metalDim,1);
   // phase ticks: pending thresholds in bare metal, passed ones cut deeper in pigment
   if(e.phAt) e.phAt.forEach((a,i)=>{ const x=e.x-w/2+w*a, done=i<e.ph-1; line(x,y-(done?7:5),x,y+(done?7:5),done?P.c:K.metal,done?2:1); }); } }
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
  ctx.textAlign='center'; inkText((e.bname||'BOSS')+' '+Math.round(d)+'m',ax,ay+30,e.mode==='recover'?P.hi:P.c,fM(11,600));
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
 // hull: the number sits beside the groove, never on it.
 // The strip pins to both edges: the hull block stays left, the sector tally
 // stays right, and the middle systems yield first on narrow windows so no
 // two labels ever collide and 12px text never shrinks.
 const low=p.hp<=p.maxhp*0.3;
 const narrow = W < 860, phone = W < 620;
 const hullW = phone ? Math.max(70, Math.min(110, W * 0.22)) : narrow ? 110 : 150;
 heading('HULL',14,r1,9,K.textDim);
 groove(64,r1-4,hullW,p.hp/p.maxhp,low?K.red:K.gold,phone?0:10);
 mono(Math.ceil(p.hp)+'/'+p.maxhp,64+hullW+10,r1,13,low?K.red:K.text,'left',600);
 heading('LV',14,r2,9,K.textDim); mono(String(p.level),48,r2,12,K.gold,'left',600);
 groove(64,r2-4,hullW,p.xp/p.xpNeed,K.gold,0);
 if(replaySnap) mono('NO XP',64+hullW+10,r2,11,K.textDim,'left',600);
 else mono(Math.floor(p.xp)+'/'+p.xpNeed,64+hullW+10,r2,11,K.textDim);
 const leftEnd = 64 + hullW + 86;
 const rightReserve = phone ? 170 : narrow ? 210 : 250;
 const midX = leftEnd + 24;
 // dash and recall: the label sits in its own column so it never touches the
 // groove, the ticks or the value beside it.
 if(!phone && midX + 200 < W - rightReserve){
  heading('DASH',midX,r1,9,K.textDim);
  if(!p.dashUnlocked){ line(midX+62,r1-4,midX+128,r1-4,K.metalDim,1,[3,3]); mono('LOCKED',midX+136,r1,11,K.textDim); }
  else { const ready=p.dashCd<=0; groove(midX+62,r1-4,narrow?56:80,ready?1:1-(p.dashCd/p.dashCdMax),K.gold,4); mono(ready?'READY':p.dashCd.toFixed(1)+'s',midX+150,r1,11,ready?K.gold:K.textDim,'left',600); }
  heading('GATE',midX,r2,9,K.textDim);
  if(!p.recallUnlocked) mono('LOCKED',midX+62,r2,11,K.textDim);
  else { binTicks(midX+62,r2+1,p.charges,5,K.gold); mono(p.recall?(p.recallCd>0?Math.ceil(p.recallCd)+'s':'SET'):'—',midX+98,r2,11,p.recall&&p.recallCd<=0?K.gold:K.textDim,'left',600); }
 } else if(phone){
  // Phone: label and value are two inks with a gap, never one string.
  const ready=p.dashUnlocked&&p.dashCd<=0;
  heading('DASH',midX,r1,9,K.textDim); mono(!p.dashUnlocked?'—':(ready?'OK':p.dashCd.toFixed(0)+'s'),midX+52,r1,11,ready?K.gold:K.textDim,'left',600);
  heading('GATE',midX,r2,9,K.textDim); mono(!p.recallUnlocked?'—':(p.charges+'/5'),midX+52,r2,11,p.recallUnlocked?K.gold:K.textDim,'left',600);
 }
 // discharge charge and auto-fire
 if(!narrow){
  if(p.shockOn){ const f=clamp(p.shockKills/p.shockNeed,0,1);
   heading('CHARGE',528,r1,9,K.textDim); groove(598,r1-4,56,f,f>=1?K.goldHi:K.gold,0); mono(p.shockKills+'/'+p.shockNeed,662,r1,11,f>=1?K.gold:K.textDim); }
  heading('AUTO',528,r2,9,K.textDim); mono((p.autoFire?'ON':'OFF')+' [T]',586,r2,11,p.autoFire?K.gold:K.textDim,'left',600);
 } else if(!phone && p.shockOn && midX + 380 < W - rightReserve){
  const f=clamp(p.shockKills/p.shockNeed,0,1);
  heading('CHARGE',midX+200,r1,9,K.textDim); groove(midX+270,r1-4,48,f,f>=1?K.goldHi:K.gold,0); mono(p.shockKills+'/'+p.shockNeed,midX+326,r1,11,f>=1?K.gold:K.textDim);
 }
 // sector plate label and the tally
 const rp=replaySnap?'REPLAY · ':'';
 heading(rp+(phone?sectorName(arenaIdx):narrow?sectorName(arenaIdx):sectorName(arenaIdx)+' · '+(arena?arena.theme.name.toUpperCase():'')),W-14,r1,phone?12:11,K.gold,'right');
 let fieldXp=0; for(const g of gems) fieldXp+=g.v;
 const foes=hostiles();
 let x=W-14; ctx.textAlign='right';
 // Once the foes are gone, the tally becomes the XP still lying on the field:
 // it is lost on exit, so the HUD says how much is left to collect.
 // Phones keep the count short so the centred dash readout never collides.
 if(foes>0) mono('FOES '+foes,x,r2,12,K.red,'right',600);
 else if(gems.length) mono(phone?'XP '+Math.round(fieldXp*p.xpBonus):'XP ON FIELD '+Math.round(fieldXp*p.xpBonus),x,r2,12,K.hydro,'right',600);
  else mono(phone?'CLEAR':'FIELD CLEAR',x,r2,12,K.textDim,'right',600);
  // shields hang off the instrument's edge as engraved tags.
  // One source for the live shield names: the HUD and Help read these same
  // tags, so the book never disagrees with the instrument.
function hudShieldTags(p){
  const t=[];
  if(p.shieldReady) t.push('AEGIS PULSE');
  if(p.wardUp) t.push('WARDING PLATE');
  if(p.bulwark>0) t.push('BULWARK ×'+p.bulwark);
  if(p.mirrorUp) t.push('CRIT WARD');
  if(p.barrier>0) t.push('BARRIER '+Math.ceil(p.barrier));
  if(p.stasisN>0) t.push('STASIS ×'+p.stasisN);
  return t;
}
  const tags=hudShieldTags(p);
 if(tags.length&&state==='playing'){ ctx.font=fM(11,600); const t=tags.join('  ·  '); let tw=t.length*6.6; try{ tw=ctx.measureText(t).width; }catch(e){}
  ctx.fillStyle=K.ground; ctx.fillRect(10,HUD_H,tw+14,18); line(10,HUD_H+18,tw+24,HUD_H+18,K.goldDim,1); mono(t,16,HUD_H+13,11,K.gold,'left',600); }
 // what is being done to you, centred under the strip, in red
 let by=HUD_H+22;
 const stT=statusTags(p); // one tag per status being done to you
 if(state==='playing'&&stT.length){ heading(stT.join('  ·  '),W/2,by,12,K.red,'center'); by+=22; }
 if(portal&&state==='playing'){
  const armed=exitArmed();
  const atRisk=fieldXpAtRisk();
  let lines, ink, ul;
  if(!gems.length){ lines=['SECTOR CLEAR — ENTER THE EXIT [E]']; ink=K.gold; ul=K.goldDim; }
  else if(!armed){
   lines=(W<620?['SECTOR CLEAR — COLLECT YOUR XP',atRisk+' XP ON FIELD — LOST AT EXIT [E]']:['SECTOR CLEAR — COLLECT YOUR XP · '+atRisk+' XP LOST AT EXIT [E]']);
   ink=K.gold; ul=K.goldDim;
  } else {
   lines=(W<620?['LOSE '+atRisk+' XP? — [E] AGAIN TO EXIT','[E] AGAIN — '+atRisk+' XP IS LOST']:['LOSE '+atRisk+' XP? — [E] AGAIN · '+atRisk+' XP IS LOST']);
   ink=K.red; ul=K.red;
  }
  ctx.font=fM(12,600); let tw=lines.reduce((m,t)=>{ let w=t.length*7; try{ w=ctx.measureText(t).width; }catch(e){} return Math.max(m,w); },0);
  tw=Math.min(tw,W-32);
  ctx.fillStyle=K.ground; ctx.fillRect(W/2-tw/2-16,by-14,tw+32,20*lines.length-4);
  lines.forEach((t,i)=>mono(t,W/2,by+i*18,12,ink,'center',600));
  line(W/2-tw/2-16,by+(lines.length-1)*18+6,W/2+tw/2+16,by+(lines.length-1)*18+6,ul,1);
  if(armed) drainBar(W/2-tw/2-16,W/2+tw/2+16,by+(lines.length-1)*18+10,confirmFrac(exitArm));
 }
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
 // The disc bleeds off the right edge on desktop; on narrow/tall windows it
 // shrinks and tucks behind the text instead of swallowing it.
 const tR = Math.max(140, Math.min(300, Math.min(W * 0.42, H * 0.5)));
 const discX = W < 620 ? W - tR * 0.35 : W - 154 * (tR / 300);
 const tCy = Math.min(330, H * 0.52);
 drawRecord(discX, tCy, tR);
  const m = W < 600 ? 16 : 64;
  // Short windows keep the record cover's teaching prose: the intro stays
  // mounted and the tip line is the first thing cut (it never appears here).
   if(H < 560){
    const wH = W < 420 ? 30 : 40;
    drawWordmark(m, 30, wH);
    heading('ROGUELITE',m+2,30+wH+22,11,K.textDim);
    const saved=readRun();
    const tArmed=titleConfirm&&titleConfirmT>performance.now();
    if(saved){
     entry(BTN.titleContinue,'CONTINUE '+sectorName(saved.galaxySel|0),'[Enter]',titleSel===0);
     entry(BTN.titleStart,tArmed?'ABANDON SAVED RUN?':'NEW RUN',tArmed?'[N again]':'[N]',titleSel===1,tArmed?'danger':undefined);
     if(tArmed){ mono('[N] again to confirm — the saved run is lost.',m+2,BTN.titleStart.y+BTN.titleStart.h+16,11,K.red); drainBar(BTN.titleStart.x,BTN.titleStart.x+BTN.titleStart.w,BTN.titleStart.y+BTN.titleStart.h-5,confirmFrac(titleConfirmT)); }
    } else entry(BTN.titleContinue,'START','[Enter]',titleSel===0);
    if(!saved) mono('No saved run — START begins a fresh trail.',m+2,BTN.titleStart.y+22,11,K.textDim);
    entry(BTN.titleSet,'SETTINGS',null,saved?titleSel===2:titleSel===1);
    entry(BTN.titleCodex,'CODEX',null,saved?titleSel===3:titleSel===2);
    entry(BTN.titleHelp,'HELP',null,saved?titleSel===4:titleSel===3);
    const pr=codexProgress();
    const introWrapS=Math.max(24,Math.min(56,Math.floor((Math.min(W-32,470)-m)/6.6)));
    const introS=wrapLines('Fight down an endless galaxy trail — clear each sector, draft an upgrade, push on. Every 5th sector is a boss NEST. Boss kills bank +2% damage forever.',introWrapS);
    const introTopS=BTN.titleHelp.y+BTN.titleHelp.h+18;
    const introMaxS=Math.max(1,Math.floor((H-60-introTopS)/18));
    introS.slice(0,introMaxS).forEach((l,i)=>mono(l,m+2,introTopS+i*18,12,K.text));
    if(introS.length<=introMaxS&&introTopS+introS.length*18+8<=H-60)
     mono(W<480?'46 upgrades · 20 bosses':'46 stackable upgrades · 20 bosses in a chain of command',m+2,introTopS+introS.length*18+8,11,K.textDim);
    mono(W<480?'[↑↓←→] select · [C] codex '+pr.n+'/'+pr.tot:'[↑↓←→] select · [O] settings  ·  [C] codex '+pr.n+'/'+pr.tot+'  ·  [H] help',m+2,H-40,11,K.textDim);
   if(best>0||depth>0) mono('BEST '+best+'   ·   DEPTH S'+depth,m+2,H-20,12,K.gold,'left',600);
   else mono('No records yet — the Wake remembers.',m+2,H-20,12,K.textDim,'left');
   return;
  }
  const shift = Math.min(0, H - 640);
  const wordH = W < 420 ? 40 : 60;
  drawWordmark(m, 96 + Math.min(0, Math.max(-30, H - 640)), wordH);
 heading('ROGUELITE',m+2,190+shift,11,K.textDim);
 mono('Restored from backup. Mandate unchanged.',m+2,210+shift,12,K.textDim);
 line(m+2,228+shift,Math.min(m+406,W-(W<620?tR*0.5+16:64)),228+shift,K.metalDim,1);
 const wrapN = Math.max(24, Math.min(56, Math.floor((Math.min(W-(W<620?tR*0.7+32:64), 470)-m) / 6.6)));
 const intro=wrapLines('Fight down an endless galaxy trail — clear each sector, draft an upgrade, push on. Every 5th sector is a boss NEST. Boss kills bank +2% damage forever.',wrapN);
 intro.forEach((l,i)=>mono(l,m+2,250+i*18+shift,12,K.text));
 const pr=codexProgress();
 mono(W<480?'46 upgrades · 20 bosses':'46 stackable upgrades · 20 bosses in a chain of command',m+2,250+intro.length*18+8+shift,11,K.textDim);
  const saved=readRun();
  const tArmed=titleConfirm&&titleConfirmT>performance.now();
  if(saved){
   entry(BTN.titleContinue,'CONTINUE '+sectorName(saved.galaxySel|0),'[Enter]',titleSel===0);
   entry(BTN.titleStart,tArmed?'ABANDON SAVED RUN?':'NEW RUN',tArmed?'[N again]':'[N]',titleSel===1,tArmed?'danger':undefined);
   if(tArmed){ mono('[N] again to confirm — the saved run is lost.',BTN.titleStart.x+22,BTN.titleStart.y+BTN.titleStart.h+16,11,K.red); drainBar(BTN.titleStart.x,BTN.titleStart.x+BTN.titleStart.w,BTN.titleStart.y+BTN.titleStart.h-5,confirmFrac(titleConfirmT)); }
  } else entry(BTN.titleContinue,'START','[Enter]',titleSel===0);
  if(!saved) mono('No saved run — START begins a fresh trail.',m+2,BTN.titleStart.y+22,11,K.textDim);
  entry(BTN.titleSet,'SETTINGS',null,saved?titleSel===2:titleSel===1);
  entry(BTN.titleCodex,'CODEX',null,saved?titleSel===3:titleSel===2);
  entry(BTN.titleHelp,'HELP',null,saved?titleSel===4:titleSel===3);
  mono(W<480?'[↑↓←→] select · [C] codex '+pr.n+'/'+pr.tot:'[↑↓←→] select · [O] settings  ·  [C] codex '+pr.n+'/'+pr.tot+'  ·  [H] help',m+2,516+shift,11,K.textDim);
 // The tip yields first: it is drawn only when it clears the records line.
 const tipLines=wrapLines('Sniper lasers are telegraphed — break the line. Brute rings: stay out of the band.',Math.max(24,Math.min(58,Math.floor((W-m*2)/6.6))));
 const recY=592+shift;
 if(548+shift+tipLines.length*16+8<=recY) tipLines.forEach((l,i)=>mono(l,m+2,548+i*16+shift,11,K.textDim));
 const recTxt=(best>0||depth>0)?('BEST '+best+'   ·   DEPTH S'+depth):'No records yet — the Wake remembers.';
 mono(recTxt,m+2,592+shift,12,(best>0||depth>0)?K.gold:K.textDim,'left',600);
 // The sound hint is transient: once audio unlocks it goes away. Its slot is
 // measured off the records line, never a fixed x, so a large BEST cannot collide.
 if(!audioUnlocked()){
  const hint='click or press any key for sound';
  ctx.font=fM(12,600); let lw=recTxt.length*7; try{ lw=ctx.measureText(recTxt).width; }catch(e){}
  ctx.font=fM(11); let hw=hint.length*6; try{ hw=ctx.measureText(hint).width; }catch(e){}
  if(m+2+lw+16+hw<=W-64) mono(hint,W-64,592+shift,11,K.textDim,'right');
 }
 if(W>=480) mono('vanilla Canvas · WebAudio synth · BFS-validated maps · no deps',m+2,616+shift,10,K.textDim);
}
// ---------- galaxy hub: the pulsar map ----------
function drawGalaxy(){
 // the chart takes on the light of the sector it points at
 const s=galaxySel, th=sectorTheme(s);
 ctx.fillStyle=th.pal.ground; ctx.fillRect(0,0,W,H);
 drawFarStars(runSeed%512,0);
 heading('SECTOR '+String(s+1).padStart(2,'0')+' · '+th.name.toUpperCase(),W<600?16:64,86,W<420?13:(W<600?14:18),K.gold);
 line(W<600?16:64,104,Math.min(W<600?W-16:560,W-64),104,th.pal.dim,1);
 // The sub-line says what a replay is before you take one, and what it gave
 // back after: the restored hull, in numbers, for a few seconds.
 const note=hubNote&&performance.now()-hubNote.at<8000?hubNote:null;
 const subTxt=note?note.txt:(s<=clearedMax?'Replay: a drill. No XP, no drafts — the hull comes back exactly as it goes in.':'The pulsar map: every line runs home. Its ticks count the sector in binary.');
 wrapLines(subTxt,Math.max(30,Math.floor((W-(W<600?32:128))/6.6))).slice(0,2).forEach((l,k)=>mono(l,W<600?16:64,124+k*16,11,note?K.gold:K.textDim));
 const ns=galNodes(), HX=W<600?16:64, HY=H/2+40;
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
 const gm = W<600?16:64;
 line(gm,H-150,W-gm,H-150,K.metalDim,1);
 // the lore wraps to two lines on narrow glass instead of running off it
 const loreL=wrapLines(lore,Math.max(28,Math.floor((W-32)/7.2)));
 if(loreL.length>1) loreL.slice(0,2).forEach((l,k)=>mono(l,W/2,H-132+k*16,13,K.text,'center'));
 else mono(lore,W/2,H-124,13,K.text,'center');
 mono(W<620?'[tap] set course · [C] codex · [Esc] title':'[←→] select · [Enter / click] set course · [C] codex · [H] help · [O] settings · [Esc] title',W/2,H-98,11,K.textDim,'center');
 if(player&&Object.keys(upgradeCounts).length){ heading('BUILD',gm,H-44,9,K.textDim); drawBuild(gm+66,H-62,W-gm*2-66,1); drawBuildTip(); }
 const pr=codexProgress();
 entry(BTN.galCodex,'CODEX',pr.n+'/'+pr.tot+'  [C]',false);
}
// ---------- settings ----------
// One list of settings rows, drawn by the screen and read by the live region.
function settingsRows(armed,armLeft){
  return [['1','SCREEN SHAKE',settings.shake?'ON':'OFF',settings.shake],['2','PARTICLES',settings.particles?'FULL':'LOW',settings.particles],['3','MUSIC',settings.music?'ON':'OFF',settings.music],['4','AUTO-FIRE DEFAULT',settings.autofire?'ON':'OFF',settings.autofire],['5','SHOW SECTOR SEED',settings.showSeed?'ON':'OFF',settings.showSeed],['6',armed?'WIPE RECORDS?':'WIPE RECORDS',armed?('[6] AGAIN · '+armLeft+'S'):'BEST · DEPTH · BOSSES · CODEX',false,'danger'],['7','MUSIC VOLUME',Math.round(settings.musicVol*100)+'%',null],['8','SFX VOLUME',Math.round(settings.sfxVol*100)+'%',null],['9','DAMAGE NUMBERS',settings.dmgNums?'ON':'OFF',settings.dmgNums],['0','LARGE TEXT',settings.largeText?'ON':'OFF',settings.largeText]];
}
function drawSettings(){
 const short = H < 560;
 heading('SETTINGS',W/2,short?58:132,short?18:22,K.gold,'center');
 mono('[0–9 / ↑↓ + Enter / ←→ volume / click] change · [O / Esc] back',W/2,short?78:156,11,K.textDim,'center');
 const armed=wipeArmT>performance.now();
 const armLeft=armed?Math.max(1,Math.ceil((wipeArmT-performance.now())/1000)):0;
 const rows=settingsRows(armed,armLeft);
 const rr=rowRects();
 rows.forEach((r,i)=>{ const b=rr[i], cy=b.y+b.h/2+2, hot=hovered(b)||settingsSel===i, danger=r[4]==='danger';
  if(settingsSel===i){ ctx.save(); ctx.strokeStyle=danger?K.red:K.gold; ctx.lineWidth=3; ctx.strokeRect(b.x-4.5,b.y-4.5,b.w+9,b.h+9); ctx.restore(); }
  mono('['+r[0]+']',b.x,cy,11,K.textDim,'left');
  const label=r[1], value=r[2], labelX=b.x+42, rightEdge=b.x+b.w, gap=16;
  ctx.font=fD(11); track(Math.round(11*0.18)); let lw=label.length*9; try{ lw=ctx.measureText(label).width; }catch(e){} track(0);
  ctx.font=fM(12,600); let vw=value.length*7; try{ vw=ctx.measureText(value).width; }catch(e){}
  const labelCol=danger?K.red:(hot?K.gold:K.text);
  if(r[3]===null){ const v=i===6?settings.musicVol:settings.sfxVol;
   // The groove is measured into the space between label and value, never fixed over either.
   let gx=Math.max(b.x+b.w-190,labelX+lw+gap);
   let gw=rightEdge-vw-gap-gx;
   if(gw<40) gw=40;
   if(gx+gw+gap+vw>rightEdge) gx=Math.max(labelX+lw+gap,rightEdge-vw-gap-gw);
   heading(label,labelX,cy,11,labelCol);
   if(gx+gw+gap+vw<=rightEdge+1){ groove(gx,cy-4,gw,v,K.gold,10); mono(value,rightEdge,cy,12,K.gold,'right',600); }
   else mono(value,rightEdge,cy,12,K.gold,'right',600);
  }
  else if(labelX+lw+gap+vw>rightEdge&&danger&&armed){ heading(label,labelX,cy,11,labelCol); }
  else { heading(label,labelX,cy,11,labelCol); mono(value,rightEdge,cy,12,danger?K.red:(r[3]?K.gold:K.textDim),'right',600); }
  const col=danger?(armed?K.red:K.redDim):(r[3]?K.gold:K.goldDim);
  line(b.x,b.y+b.h-4,b.x+b.w,b.y+b.h-4,col,r[3]||armed?1.5:1,r[3]||armed?null:[4,4]);
  if(danger&&armed) drainBar(b.x,b.x+b.w,b.y+b.h-4,confirmFrac(wipeArmT));
 });
 if(armed) mono('[6] again to confirm — best, depth, bosses and codex are lost.',W/2,rr[5].y+rr[5].h+16,11,K.red,'center');
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
  // The body starts where the tabs start, so the text sits under the tab row.
  const hx = W<600?16:(rr.length?rr[0].x:80), hw = W-hx*2;
  const wrapN = Math.max(24, Math.floor(hw/6.6));
  let hy=196+Math.min(0,Math.max(-40,H-640));
  if(H < 560) hy = 170;
  // Flatten the tab to wrapped rows first so short viewports page the body
  // instead of silently dropping every line past the BACK button.
  const rows=[];
  L.forEach((l)=>{ const ws=wrapLines(l,wrapN); if(!ws.length) rows.push(null); else ws.forEach((w)=>rows.push(w)); });
  const textRows=rows.filter((r)=>r!==null);
  const bottom=BTN.back.y-14;
  const pagerH=20;
  let cap=Math.max(1,Math.floor((bottom-(textRows.length>0?0:0)-hy)/20));
  helpPagerRect=null;
  if(textRows.length<=cap){
   let y=hy;
   rows.forEach((r)=>{ if(r===null){ y+=3; return; } mono(r,hx,y,12,K.text); y+=20; });
  } else {
   // Reserve one row for the pager so the last body line never sits under it.
   cap=Math.max(1,Math.floor((bottom-hy-pagerH)/20));
   const total=Math.max(1,Math.ceil(textRows.length/cap));
   helpPage=Math.max(0,Math.min(helpPage,total-1));
   const slice=textRows.slice(helpPage*cap,(helpPage+1)*cap);
   let y=hy;
   slice.forEach((r)=>{ mono(r,hx,y,12,K.text); y+=20; });
   const py2=BTN.back.y-30;
   const up=helpPage>0?'▲ ':'';
   const label='▼ MORE '+(helpPage+1)+'/'+total+' [↓]';
   mono(up+label,W/2,py2,11,K.goldDim,'center');
   helpPagerRect={x:Math.round(W/2-hw/2),y:py2-16,w:hw,h:22};
  }
  entry(BTN.back,'BACK','[Esc]',false);
}
// ---------- codex ----------
function codexRects(){
 // Narrow windows keep the two-pane plate but squeeze both panes so the
 // detail keeps a readable 12px measure instead of bleeding off-screen.
 if(W < 720){
  const w = Math.max(130, Math.min(160, W - 200));
  const x = 16;
  const y0 = Math.max(150, 168 + Math.min(0, H - 640));
  return codexRows().map((r,k)=>({x,y:y0+k*19,w,h:17,row:r}));
 }
 return codexRows().map((r,k)=>({x:48,y:168+k*20,w:210,h:18,row:r}));
}
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
// "Answers to ARCHON · Calls ORACLE" — read from the ladder itself, so the
// codex can never disagree with who actually summons whom. Unmet gods stay ???.
function commandLine(kind){
 const nm=k=>codexSeen(k)?BOSSDEF[k].name:'???';
 const up=callersOf(kind), calls=summonsOf(kind), c={};
 for(const k of calls) c[k]=(c[k]||0)+1;
 const down=Object.keys(c).map(k=>nm(k)+(c[k]>1?' ×'+c[k]:''));
 return (up.length?'Answers to '+up.map(nm).join(', '):'Answers to no one')+'  ·  '+(down.length?'Calls '+down.join(', '):'Calls only chaff');
}
// Visible index rows on short viewports: the window follows the selection so
// arrow keys page the index instead of walking off-screen with no signal.
function codexIdxSpan(){
 try{
  const rects=codexRects();
  if(!rects.length) return 3;
  const bottom=BTN.back.y-14;
  const y0=rects[0].y;
  const pitch=rects.length>1?(rects[1].y-rects[0].y):20;
  return Math.max(1,Math.floor((bottom-y0-20)/Math.max(1,pitch)));
 }catch(e){ return 3; }
}
function codexIdxPage(dir){
 const order=codexRows().filter(r=>!r.hdr).map(r=>r.i);
 let k=order.indexOf(codexSel); if(k<0) k=0;
 const step=Math.max(1,codexIdxSpan());
 codexSel=order[Math.max(0,Math.min(order.length-1,k+dir*step))];
 codexPage=0;
}
// Paginate codex detail blocks (TELL / COUNTER / FIELD NOTE) into pages that
// fit the plate. Labels stick to their first line: a page never strands a
// label without text, and a block split across pages repeats its label.
function codexDetailPages(blocks,avail){
 const PAGER=18;
 const totalH=blocks.reduce((a,b)=>a+17+b.lines.length*15+11,0);
 if(totalH<=avail) return {pages:[blocks],paged:false};
 const budget=Math.max(32,avail-PAGER);
 const pages=[];
 let cur=[],used=0,bi=0,li=0,first=true;
 while(bi<blocks.length){
  const b=blocks[bi];
  const need=17+15+11;
  if(cur.length===0&&used===0&&budget<need){
   // Plate too short for even one full block: still show the label, one
   // line and the pager rather than an empty plate.
   pages.push([{label:b.label,col:b.col,italic:b.italic,lines:b.lines.slice(0,1),more:b.lines.length>1}]);
   if(b.lines.length>1) pages.push([{label:b.label,col:b.col,italic:b.italic,lines:b.lines.slice(1),more:false}]);
   bi++; continue;
  }
  if(li===0){
   if(used+17+15>budget&&cur.length){ pages.push(cur); cur=[]; used=0; first=true; continue; }
   used+=17;
  }
  const room=Math.max(1,Math.floor((budget-used-11)/15));
  const take=b.lines.slice(li,li+room);
  const done=li+take.length>=b.lines.length;
  cur.push({label:li===0?b.label:null,col:b.col,italic:b.italic,lines:take,more:!done,gap:done});
  used+=take.length*15+(done?11:0);
  if(done){ bi++; li=0; }
  else { li+=take.length; pages.push(cur); cur=[]; used=0; }
  first=false;
 }
 if(cur.length) pages.push(cur);
 if(!pages.length) pages.push(blocks.slice(0,1));
 return {pages,paged:true};
}
function drawCodexScreen(){
 const L=codexList();
 if(codexSel>=L.length) codexSel=0;
 const pr=codexProgress();
 heading('CODEX',W/2,62,22,K.gold,'center');
 mono('MET '+pr.m+' / '+pr.tot+'  ·  DEFEATED '+pr.n+' / '+pr.tot+'  ·  [1/2 ←→] tab  [↑↓] entry  [C / Esc] back',W/2,86,11,K.textDim,'center');
 mono('◆ defeated  ·  ◇ met, not yet defeated  ·  ? ? ? ? ? unmet',W/2,102,11,K.textDim,'center');
 const tr=codexTabRects();
 ['BESTIARY','BOSSES'].forEach((lab,i)=>{ const r=tr[i], on=codexTab===CODEX_TABS[i], hot=on||hovered(r);
  heading(lab,r.x+r.w/2,r.y+19,11,hot?K.gold:K.text,'center'); mono(String(i+1),r.x+4,r.y+19,10,K.textDim);
  rule(r.x,r.y+r.h,r.w,on?K.gold:K.goldDim,on); });
  // index column: rank headers + entries (bosses), or a flat list (bestiary).
  // Short viewports window the list around the selection with ▲▼ signals so
  // arrows page the index instead of walking entries off-screen unseen.
  codexIdxPagerRect=null;
  {
   const rects=codexRects();
   const idxBottom=BTN.back.y-14;
   const pitch=rects.length>1?(rects[1].y-rects[0].y):20;
   let cap=Math.max(1,Math.floor((idxBottom-(rects.length?rects[0].y:168))/Math.max(1,pitch)));
   let toDraw=rects, yOff=0, showUp=false, showDown=false;
   if(rects.length>cap){
    cap=Math.max(1,Math.floor((idxBottom-(rects.length?rects[0].y:168)-20)/Math.max(1,pitch)));
    cap=Math.max(1,cap);
    let selPos=rects.findIndex(r=>!r.hdr&&r.row.i===codexSel);
    if(selPos<0) selPos=0;
    let start=Math.max(0,Math.min(selPos-Math.floor(cap/2),rects.length-cap));
    const end=Math.min(rects.length,start+cap);
    showUp=start>0; showDown=end<rects.length;
    toDraw=rects.slice(start,end);
    yOff=rects[start].y-(rects.length?rects[0].y:168);
   }
   const y0=rects.length?rects[0].y:168;
   if(showUp) mono('▲',rects[0].x+8,y0-6,11,K.goldDim);
   toDraw.forEach((r)=>{
    const ry=r.y-yOff;
    if(r.row.hdr){ const n=TIER_NAMES.indexOf(r.row.hdr); binTicks(r.x+2,ry+14,n,5,K.metal); heading(r.row.hdr,r.x+36,ry+13,9,K.textDim); return; }
    const it=r.row.entry, on=r.row.i===codexSel, known=codexSeen(codexId(it)), killed=codexKnown(codexId(it));
    const nm=known?(it.name||BOSSDEF[it.id].name):'? ? ? ? ?';
    // filled pigment: defeated · hollow: met, not yet defeated
    if(on){ diamond(r.x+8,ry+9,3.5,K.gold); line(r.x+18,ry+r.h,r.x+r.w,ry+r.h,K.gold,1); }
    else if(known&&PIG[codexId(it)]) diamond(r.x+8,ry+9,2.5,PIG[codexId(it)].c,!killed);
    mono(nm,r.x+(codexTab==='bosses'?22:18),ry+13,12,on?K.gold:(known?K.text:K.textDim),'left',on?600:400);
    if(codexTab==='bosses') mono('S'+BOSSDEF[it.id].debut,r.x+r.w,ry+13,11,on?K.gold:K.textDim,'right');
   });
   if(showDown){
    const dy=y0+toDraw.length*pitch+4;
    mono('▼ MORE [↑↓]',rects[0].x+8,Math.min(dy,idxBottom),11,K.goldDim);
    codexIdxPagerRect={x:rects[0].x,y:Math.min(dy,idxBottom)-16,w:rects[0].w,h:22,dir:1};
   }
  }
 const entryE=L[codexSel];
 if(!entryE){ entry(BTN.back,'BACK','[Esc]',false); return; }
 const known=codexSeen(codexId(entryE)), killed=codexKnown(codexId(entryE)), boss=codexTab==='bosses';
 // detail: an engraved plate with corner ticks, the portrait at registered scale.
 // Wide windows keep the shipped side-by-side plate; narrow windows squeeze the
 // same plate so it stays centred with a readable 12px measure.
 const wide = W >= 800;
 const idxW = wide ? 210 : Math.max(130, Math.min(160, W - 200));
 const px = wide ? 286 : 16 + idxW + 12;
 const pw = wide ? W-px-46 : W-px-16;
 const py = wide ? 168 : Math.max(130, 168 + Math.min(0, H - 640));
 const ph = wide ? Math.min(378, Math.max(220, H - py - 90)) : Math.min(378, Math.max(80, H - py - 100));
 const portrait = wide ? 134 : 100;
 const tx = px + portrait + 30;
 plate(px,py,pw,ph,K.goldDim);
 plate(px+14,py+14,portrait,portrait,K.metalDim,false,true);
 drawCodexSprite(entryE,px+14+portrait/2,py+14+portrait/2,!known);
 const wrapRole = Math.max(20, Math.min(60, Math.floor((pw-portrait-48)/6)));
 const wrapBody = Math.max(20, Math.min(84, Math.floor((pw-36)/6)));
  if(!known){
   heading('? ? ? ? ?',tx,py+44,18,K.textDim);
   mono(boss?'Unidentified  ·  first met around S'+BOSSDEF[entryE.id].debut:'Unidentified hostile',tx,py+68,12,K.textDim);
   // The locked hint is two short lines; on a plate too short for both, the
   // second line becomes a pager signal instead of a silent drop.
   const hint2='Meet one to open its rank, tells and counters. Kill it to recover the field note.';
   const hintLines=wrapLines(hint2,wrapBody);
   mono('Not yet met.',px+18,py+178,13,K.text);
   const hintRoom=Math.max(0,Math.floor((py+ph-10-(py+178+17))/15));
   codexPagerRect=null;
   if(hintLines.length<=Math.max(1,hintRoom)){
    hintLines.forEach((l,i)=>mono(l,px+18,py+178+17+i*15,12,K.textDim));
   } else {
    hintLines.slice(0,Math.max(1,hintRoom)).forEach((l,i)=>mono(l,px+18,py+178+17+i*15,12,K.textDim));
    mono('▼ MORE [PgDn]',px+pw-14,py+ph-14,11,K.goldDim,'right');
    codexPagerRect={x:px,y:py+ph-32,w:pw,h:22};
    codexPage=0;
   }
   entry(BTN.back,'BACK','[Esc]',false);
   return;
  }
  const name=entryE.name||BOSSDEF[entryE.id].name, pg=PIG[codexId(entryE)];
  heading(name,tx,py+42,18,K.text);
  if(pg) line(tx,py+51,tx+56,py+51,pg.c,2); // its pigment, as seen in the field
  const rank=boss?TIER_NAMES[BOSSDEF[entryE.id].tier]+'  ·  ':'';
  wrapLines(rank+entryE.role+'  ·  '+entryE.threat+(boss?'  ·  first seen S'+BOSSDEF[entryE.id].debut:''),wrapRole).forEach((l,i)=>mono(l,tx,py+66+i*15,11,K.textDim));
  if(boss) wrapLines(commandLine(entryE.id),wrapRole).forEach((l,i)=>mono(l,tx,py+100+i*15,11,K.textDim));
  // Detail blocks page inside the plate: overflow shows ▼ MORE [PgDn] and
  // PgDn/Space advances, so TELL / COUNTER / FIELD NOTE are never cut muted.
  codexPagerRect=null;
  {
   const topY=(py+170>py+ph-58)?(py+ph-58):(py+170);
   const blocks=[
    {label:'TELL',col:K.red,italic:false,lines:wrapLines(entryE.tell,wrapBody)},
    {label:'COUNTER',col:K.gold,italic:false,lines:wrapLines(entryE.counter,wrapBody)},
    {label:'FIELD NOTE',col:K.metal,italic:true,lines:wrapLines(killed?entryE.lore:'Kill it to recover the field note.',wrapBody)},
   ];
   const avail=Math.max(40,(py+ph-8)-topY);
   const built=codexDetailPages(blocks,avail);
   const total=built.pages.length;
   codexPage=Math.max(0,Math.min(codexPage,total-1));
   const page=built.pages[codexPage];
   let y=topY;
   page.forEach((blk)=>{
    if(blk.label){ heading(blk.label,px+18,y,9,blk.col); y+=17; }
    blk.lines.forEach((l)=>{
     ctx.font=fM(12); ctx.fillStyle=blk.italic?K.textDim:K.text; ctx.textAlign='left'; ctx.fillText(l,px+18,y);
     y+=15;
    });
    if(blk.gap) y+=11;
   });
   if(built.paged){
    const up=codexPage>0?'▲ ':'';
    mono(up+'▼ MORE '+(codexPage+1)+'/'+total+' [PgDn]',px+pw-14,py+ph-14,11,K.goldDim,'right');
    codexPagerRect={x:px,y:py+ph-32,w:pw,h:22};
   }
  }
  entry(BTN.back,'BACK','[Esc]',false);
 }
// Arrow navigation walks entries in the order they are LISTED (rank order for
// bosses), skipping headers.
function codexStep(dir){
 const order=codexRows().filter(r=>!r.hdr).map(r=>r.i);
 let k=order.indexOf(codexSel); if(k<0) k=0;
 codexSel=order[(k+dir+order.length)%order.length];
 codexPage=0;
}
// ---------- refit icons ----------
// One engraving hand for all 46: monoline gold strokes on the dark ground,
// nest draft included.
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
// Row layout keeps one composition (cards, held slot, BUILD); narrow windows
// stack the cards vertically so they stay centred and tappable instead of
// bleeding off-screen.
function draftLayout(){
 const idx = levelChoices.map((u,i)=>i).filter(i=>levelChoices[i]!==levelBack);
 const backIdx = levelChoices.indexOf(levelBack);
 const n = idx.length || levelChoices.length;
 const gap = 20;
 // Prefer a centred row whenever the cards fit — shrinking the card width
 // first (down to 160) and the height on short windows, so landscape phones
 // keep the row instead of overflowing a stacked column.
 const fitW = Math.floor((W - 32 - (n - 1) * gap) / Math.max(1, n));
 const rects = {};
 if(fitW >= 160){
  const cardW = Math.min(220, fitW);
  const cardH = H < 500 ? 140 : 204;
  const totalW = n * cardW + (n - 1) * gap;
  const x0 = Math.round((W - totalW) / 2);
  // One composition, offered-again card or not: header, the cards, a slot
  // held open for the offered-again card, a clear gap, then the BUILD plate.
  // The slot sits empty on an ordinary draft, so nothing jumps when the
  // fourth card does appear — it simply fills its place.
  let y, buildY = null;
  if(H < 500) y = Math.max(56, Math.round(H / 2 - cardH / 2 - 30));
  else {
   const head = 56, slot = 22 + 62, plate = 60;
   const top = HUD_H + 24, bottom = H - 8, content = head + cardH + slot + plate;
   const gapB = clamp(bottom - top - content, 28, 76);
   const free = bottom - top - content - gapB;
   y = top + head + Math.max(-16, Math.round(free * OPTICAL));
   buildY = Math.min(y + cardH + slot + gapB, H - 66);
  }
  idx.forEach((li,k)=>{ rects[li] = {x:x0+k*(cardW+gap),y,w:cardW,h:cardH}; });
  if(backIdx >= 0){
   const bw = Math.min(460, W - 32);
   rects[backIdx] = {x:Math.round((W-bw)/2),y:y+cardH+22,w:bw,h:backIdx>=0&&H<500?56:62};
  }
  return {kind:'row', rects, headerY:Math.max(70, y-56), cardsY:y, buildY};
 }
 // Stacked: one centred column. Card height shrinks just enough to fit the
 // viewport, but width stays generous so 11-12px text never wraps to shards.
 const bw = Math.min(460, W - 32);
 const shortH = H < 500;
 const availH = Math.max(shortH?200:320, H - (shortH?150:200));
 const chLo = shortH?84:108, chHi = shortH?120:150;
 const ch = Math.max(chLo, Math.min(chHi, Math.floor((availH - (backIdx>=0?74:0) - (n-1)*12) / Math.max(1,n))));
 const totalH = n * ch + (n - 1) * 12 + (backIdx >= 0 ? 12 + 62 : 0);
 let y0 = Math.round(H / 2 - totalH / 2 + 16);
 y0 = Math.max(shortH?72:120, y0);
 // Clamp the column into the viewport so a short window with a back offer
 // still keeps every card tappable instead of bleeding past the edge.
 if(y0 + totalH > H - 8) y0 = Math.max(64, H - 8 - totalH);
 idx.forEach((li,k)=>{ rects[li] = {x:Math.round((W-bw)/2),y:y0+k*(ch+12),w:bw,h:ch}; });
 if(backIdx >= 0) rects[backIdx] = {x:Math.round((W-bw)/2),y:y0+n*ch+(n-1)*12+12,w:bw,h:62};
 // BUILD sits under the held-open slot, as in the row, pinned up from the
 // bottom edge when the column runs long.
 let buildY = y0 + n*ch + (n-1)*12 + 12 + 62 + 40;
 if(buildY + 58 > H - 8) buildY = H - 66;
 return {kind:'stack', rects, headerY:Math.max(84, y0-56), cardsY:y0, stackH:ch, buildY:shortH?null:buildY};
}
function draftRect(i){
 try{
  const L = draftLayout();
  if(L.rects[i]) return L.rects[i];
 }catch(e){}
 return levelChoices[i]===levelBack?{x:Math.round((W-460)/2),y:Math.round(H/2+126),w:460,h:62}:{x:130+i*240,y:220,w:220,h:204};
}
function drawBackOffer(u,i,ink){
 const r=draftRect(i), dn=(typeof u.dyn==='function')?u.dyn(player):null, sel=draftSel===i, hot=hovered(r)||sel;
 ctx.strokeStyle=ink.main; ctx.lineWidth=hot?1.5:1; if(!hot) ctx.setLineDash([5,4]); ctx.strokeRect(r.x+0.5,r.y+0.5,r.w,r.h); ctx.setLineDash([]);
 if(sel){ ctx.save(); ctx.strokeStyle=ink.main; ctx.lineWidth=3; ctx.strokeRect(r.x-4.5,r.y-4.5,r.w+9,r.h+9); ctx.restore(); }
 drawIcon(u.id,r.x+36,r.y+r.h/2,13);
 heading(((dn&&dn.name)||u.name).toUpperCase(),r.x+66,r.y+27,11,ink.text);
 mono((dn&&dn.desc)||u.desc,r.x+66,r.y+46,11,ink.dim);
 mono('['+(i+1)+']  offered again',r.x+r.w-12,r.y+27,11,ink.dim,'right');
}
function drawLevelUp(){
 const inv=nestDraftAt>0;
 // quieter nest peak: dark ground stays; a gold engraved disc rises behind
 // the cards. The fade is brightness, so it always runs — even under
 // reduced motion. Only the rise is movement, gated on REDUCED.
 let t=1, a=1;
 if(inv){ t=clamp((performance.now()-nestDraftAt)/350,0,1); a=1-Math.pow(1-t,4); }
 ctx.fillStyle=K.scrim; ctx.fillRect(0,0,W,H);
 if(inv){
  ctx.save(); ctx.globalAlpha=a;
  const R=Math.max(320,Math.min(460,W*0.45));
  const rise=REDUCED?0:(1-t)*60;
  const cx=W/2, cy=H+80+rise;
  ctx.fillStyle=K.goldFaint; ctx.beginPath(); ctx.arc(cx,cy,R,0,6.283); ctx.fill();
  ctx.strokeStyle=K.goldGroove; ctx.lineWidth=1;
  for(let r=40;r<R;r+=6){ ctx.beginPath(); ctx.arc(cx,cy,r,0,6.283); ctx.stroke(); }
  ctx.strokeStyle=K.goldDim; ctx.lineWidth=1.5;
  ctx.beginPath(); ctx.arc(cx,cy,R,0,6.283); ctx.stroke();
  ctx.restore();
 }
 const ink={main:K.gold,text:K.text,dim:K.textDim};
 iconInk(false);
  // phones get the short line and a smaller header, so neither runs off the glass
  const keysLine=W<600?('[1–'+levelChoices.length+'] pick · [←→] + [Enter] · [C] codex'):('['+levelChoices.map((_,i)=>i+1).join(' / ')+'] pick · [←→] select + [Enter] · click · [C] codex · [H] help');
  const hSz=W<600?16:20;
 const lead=inv&&nestTally.kinds.length?BOSSDEF[nestTally.kinds[0]]:null;
 let HY=164, SY=192, KY=192;
 try{ const L0=draftLayout(); HY=L0.headerY; SY=HY+26; KY=HY+(lead?44:28); }catch(e){}
 if(lead){ // the peak: which god fell, and what the fall is worth
  heading(nestTally.kinds.length>1?lead.name+"'S COURT FALLS":lead.name+' FALLS',W/2,HY,hSz,ink.main,'center');
  mono(TIER_NAMES[lead.tier]+(nestTally.banked?' · +'+nestTally.banked+'% DAMAGE BANKED FOR EVERY HULL':'')+(nestTally.firsts.length?' · FIELD NOTE RECOVERED [C]':''),W/2,SY,12,ink.main,'center',600);
  mono(keysLine,W/2,KY,11,ink.dim,'center');
  } else {
   heading('CHOOSE AN UPGRADE',W/2,HY,hSz,ink.main,'center');
   mono(keysLine,W/2,KY,W<600?11:12,ink.dim,'center'); }
  levelChoices.forEach((u,i)=>{
   if(u===levelBack){ drawBackOffer(u,i,ink); return; }
   const r=draftRect(i), sel=draftSel===i, hot=hovered(r)||sel, dn=(typeof u.dyn==='function')?u.dyn(player):null;
   // Every card gets a full frame — gold when hot/selected, dim otherwise —
   // so unpicked cards never read as broken corner ticks.
   plate(r.x,r.y,r.w,r.h,hot?ink.main:K.metalDim,true);
  if(sel){ ctx.save(); ctx.strokeStyle=ink.main; ctx.lineWidth=3; ctx.strokeRect(r.x-4.5,r.y-4.5,r.w+9,r.h+9); ctx.restore(); }
  // rarity as rim ticks: one, two or three cuts along the top edge
  const n=u.r===2?3:(u.r===1?2:1); for(let k=0;k<n;k++){ const tx=r.x+r.w/2+(k-(n-1)/2)*8; line(tx,r.y-4,tx,r.y+4,ink.main,1.5); }
  if(r.h < 170){
   // Stacked phone card: icon left, text right, so a short centred card
   // still reads at 11-12px instead of clipping.
   drawIcon(u.id,r.x+34,r.y+r.h/2,13);
   mono('['+(i+1)+']',r.x+58,r.y+24,11,ink.dim);
   if(u.r===2) heading('RARE',r.x+r.w-12,r.y+24,9,ink.main,'right');
   const nm=((dn&&dn.name)||u.name).toUpperCase();
   heading(nm,r.x+58,r.y+44,11,ink.text);
   const wrapN=Math.max(20,Math.floor((r.w-76)/6.6));
   const dl=wrapLines((dn&&dn.desc)||u.desc,Math.min(48,wrapN)); dl.slice(0,2).forEach((l,k)=>mono(l,r.x+58,r.y+62+k*15,11,ink.dim));
   const df=draftDiffs()[i]||[];
   if(df.length&&r.h>=128) mono(df[0],r.x+58,r.y+r.h-12,11,ink.main,'left',600);
   return;
  }
  mono('['+(i+1)+']',r.x+12,r.y+22,11,ink.dim);
  if(u.r===2) heading('RARE',r.x+r.w-12,r.y+22,9,ink.main,'right');
  drawIcon(u.id,r.x+r.w/2,r.y+66,19);
  const nm=((dn&&dn.name)||u.name).toUpperCase();
  const nl=wrapLines(nm,18); ctx.font=fD(11); nl.forEach((l,k)=>heading(l,r.x+r.w/2,r.y+118+k*17,11,ink.text,'center'));
   const dl=wrapLines((dn&&dn.desc)||u.desc,28); dl.forEach((l,k)=>mono(l,r.x+r.w/2,r.y+124+nl.length*17+10+k*16,11,ink.dim,'center'));
   // what it does to this hull: one true change line, never a bare count.
   // The BUILD plate below already carries every stack count.
   const df=draftDiffs()[i]||[], dy0=r.y+124+nl.length*17+10+dl.length*16+6;
   df.slice(0,2).forEach((l,k)=>{ const yy=dy0+k*15; if(yy<r.y+r.h-6) mono(l,r.x+r.w/2,yy,11,ink.main,'center',600); });
  });
  // the hull so far: one row in the empty lower third, level draft and nest
  // draft alike. Hover names the refit and its true count.
  let headY=null; try{ headY=draftLayout().buildY; }catch(e){}
  if(H>=500&&headY!=null){
   const bx=W<600?16:64, bw=W-bx*2;
   heading('BUILD',bx,headY,9,ink.dim); line(bx,headY+8,bx+bw,headY+8,K.metalFaint,1);
   drawBuild(bx,headY+10,bw,1,ink);
   drawBuildTip();
  }
  iconInk(false);
}
function wrapText(t,x,y,mw){ wrapLines(t,20).forEach((l,i)=>{ ctx.textAlign='center'; ctx.fillText(l,x,y+i*20); }); }
// ---------- pause ----------
function drawPaused(){
 try{ layoutPause(); }catch(e){}
 ctx.fillStyle=K.scrim; ctx.fillRect(0,0,W,H);
 const short = H < 560;
 const ty = short ? Math.max(34, BTN.pauseResume.y - 64) : BTN.pauseResume.y - 78;
 heading(autoPaused?'AUTO-PAUSED':'PAUSED',W/2,ty,short?20:26,K.gold,'center');
 if(short) mono('ESC resume · ↑↓ select · H help · C codex',W/2,ty+26,12,K.text,'center');
 else {
  mono(W<620?'ESC resume · ↑↓ select · H help · C codex':autoPaused?'tab hidden — ESC / click resume':'ESC resume · ↑↓ select · H help · C codex · O settings · R abandon · Q title',W/2,ty+32,12,K.text,'center');
  mono(replaySnap?'Replay: nothing here carries over. Leaving restores the hull as it went in.':'The run is saved. Returning replays this sector from its start.',W/2,ty+54,11,K.textDim,'center');
 }
 entry(BTN.pauseResume,'RESUME','[Esc]',pauseSel===0);
 entry(BTN.pauseSet,'SETTINGS','[O]',pauseSel===1);
 entry(BTN.pauseHelp,'HELP','[H]',pauseSel===2);
 entry(BTN.pauseCodex,'CODEX','[C]',pauseSel===3);
 const armed=restartArm>performance.now();
 entry(BTN.pauseRestart,armed?'ABANDON RUN?':'ABANDON RUN',armed?'[R again]':'[R]',pauseSel===4,'danger');
 if(armed){ mono('[R] again to confirm — the saved run is lost.',W/2,BTN.pauseRestart.y+BTN.pauseRestart.h+14,11,K.red,'center'); drainBar(BTN.pauseRestart.x,BTN.pauseRestart.x+BTN.pauseRestart.w,BTN.pauseRestart.y+BTN.pauseRestart.h-5,confirmFrac(restartArm)); }
 entry(BTN.pauseQuit,'RETURN TO TITLE','[Q]',pauseSel===5);
 // the hull as it stands: its refits on the left, its systems on the right.
 // Narrow windows stack the two columns so neither squeezes to a sliver.
 if(player){ const p=player;
  const byY = BTN.pauseQuit.y + BTN.pauseQuit.h + 24;
  // Short landscape windows have no room for the hull record: the six
  // entries already fill the viewport, so the record yields.
  if(H < 560){
   let s='KILLS '+kills+'   SCORE '+scoreCalc()+'   BEST '+best;
   if(settings.showSeed&&arena) s+='   SEED '+arena.seed;
   mono(s,W/2,H-14,11,K.textDim,'center');
   return;
  }
   // layoutPause chose the record's shape: side columns only when they clear
   // the centred entries, else stacked beneath with what fits.
   const lx=48, lw=240, sx=W-48-240, sw=240;
   if(pauseRecord==='side'){
    // both columns hang from RESUME's line, so the three read as one band
    const cy0=BTN.pauseResume.y+10;
    heading('BUILD',lx,cy0,9,K.textDim); line(lx,cy0+8,lx+lw,cy0+8,K.metalFaint,1); drawBuild(lx,cy0+18,lw,6);
    heading('SYSTEMS',sx,cy0,9,K.textDim); line(sx,cy0+8,sx+sw,cy0+8,K.metalFaint,1);
    const sys=[['HULL',Math.ceil(p.hp)+'/'+p.maxhp],['DMG','×'+p.dmgMult.toFixed(2)],['RATE',p.fireRate.toFixed(1)+'/s'],['SHOTS',p.shots],['CRIT',Math.round(p.critCh*100)+'%'],['SPEED',Math.round(p.speed)],['MAGNET',Math.round(p.magnet)]];
    if(p.pierce) sys.push(['PIERCE',p.pierce]); if(p.bounce) sys.push(['RICOCHET',p.bounce]); if(p.homing) sys.push(['SEEK',p.homing]);
    sys.push(['BOSS BONUS','+'+Math.round(bosses*2)+'%']);
    sys.forEach(([k,v],i)=>{ const yy=cy0+30+i*20; mono(k,sx,yy,11,K.textDim); mono(String(v),sx+sw,yy,11,K.text,'right',600); });
   } else if(pauseRecord!=='none'){
   const bw = Math.min(420, W - 32), bx = Math.round((W - bw) / 2);
   heading('BUILD',bx,byY,9,K.textDim); line(bx,byY+8,bx+bw,byY+8,K.metalFaint,1);
   const bh = drawBuild(bx,byY+18,bw,2);
   const sy = byY + 18 + bh + 12;
   if(pauseRecord==='stack'){
   heading('SYSTEMS',bx,sy,9,K.textDim); line(bx,sy+8,bx+bw,sy+8,K.metalFaint,1);
   const sys=[['HULL',Math.ceil(p.hp)+'/'+p.maxhp],['DMG','×'+p.dmgMult.toFixed(2)],['RATE',p.fireRate.toFixed(1)+'/s'],['SHOTS',p.shots],['CRIT',Math.round(p.critCh*100)+'%'],['SPEED',Math.round(p.speed)],['MAGNET',Math.round(p.magnet)]];
   if(p.pierce) sys.push(['PIERCE',p.pierce]); if(p.bounce) sys.push(['RICOCHET',p.bounce]); if(p.homing) sys.push(['SEEK',p.homing]);
   sys.push(['BOSS BONUS','+'+Math.round(bosses*2)+'%']);
   const per = 2, rows = Math.ceil(sys.length / per);
   sys.forEach(([k,v],i)=>{ const c=i%per, r=Math.floor(i/per), cx=bx+c*(bw/per), yy=sy+20+r*18;
    if(yy>H-50) return;
    mono(k,cx,yy,11,K.textDim); mono(String(v),cx+bw/per-4,yy,11,K.text,'right',600); });
   }
   }
   drawBuildTip();
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
 // Unlocks change what the keys do, not a number: name the change itself.
 if(u.id==='spd'&&!player.dashUnlocked) return ['DASH LOCKED → SPACE'];
 if(u.id==='pcell'&&!player.recallUnlocked) return ['RECALL LOCKED → E'];
 let q=null; previewing=true; try{ q=JSON.parse(JSON.stringify(player)); u.apply(q); }catch(e){ return []; } finally{ previewing=false; }
 const out=[]; for(const [k,label,f] of STAT_VIEW){ const a=player[k], b=q[k]; if(typeof a==='number'&&typeof b==='number'&&Math.abs(a-b)>1e-9) out.push(label+' '+fmtStat(f,a)+' → '+fmtStat(f,b)); }
 return out;
}
let diffCache={of:null,d:[]};
function draftDiffs(){ if(diffCache.of!==levelChoices){ diffCache={of:levelChoices,d:levelChoices.map(statDiff)}; } return diffCache.d; }
// ---------- the build plate ----------
// Everything KRIEFNE has bolted on this hull, in the order it was drafted:
// the refit's engraving, and a count under it once it stacks (MAX at cap).
// Shared by the draft, the end screen, pause and the hub. Returns the height
// it used. Every icon registers a 40x44 hit rect in buildRects so the plate
// can name the refit and its true count on hover (mouse and touch share it).
let buildRects=[];
function buildTipFor(id){
 const n=upgradeCounts[id]||0, u=UPGRADES.find(q=>q.id===id);
 if(!u) return {name:id,sub:'×'+n};
 let nm=u.name; try{ const dn=(player&&typeof u.dyn==='function')?u.dyn(player):null; if(dn&&dn.name) nm=dn.name; }catch(e){}
 const sub=(u.max&&n>=u.max)?('MAX '+n+'/'+u.max):('×'+n);
 return {name:nm,sub};
}
function drawBuild(x,y,w,rows,ink){
 buildRects=[];
 const ids=Object.keys(upgradeCounts).filter(id=>upgradeCounts[id]>0), cell=40, per=Math.max(1,Math.floor(w/cell)), cap=per*(rows||2);
 if(!ids.length){ mono('No refits drafted on this hull.',x,y+18,11,(ink&&ink.dim)||K.textDim); return 26; }
 ids.slice(0,ids.length>cap?cap-1:cap).forEach((id,i)=>{ const cx=x+cell/2+(i%per)*cell, cy=y+16+Math.floor(i/per)*46;
  buildRects.push({id,x:cx-20,y:cy-16,w:40,h:44,cx,cy});
  drawIcon(id,cx,cy,9); const n=upgradeCounts[id], u=UPGRADES.find(q=>q.id===id);
  if(u&&u.max&&n>=u.max) mono('MAX',cx,cy+28,10,K.gold,'center',600); else if(n>1) mono('×'+n,cx,cy+28,10,(ink&&ink.text)||K.text,'center',600); });
 if(ids.length>cap){ const i=cap-1, cx=x+cell/2+(i%per)*cell, cy=y+16+Math.floor(i/per)*46; mono('+'+(ids.length-cap+1),cx,cy+4,11,K.textDim,'center',600); }
 return Math.ceil(Math.min(ids.length,cap)/per)*46;
}
function drawBuildTip(){
 for(const b of buildRects){ if(!hovered(b)) continue;
  const t=buildTipFor(b.id), label=t.name.toUpperCase()+'  '+t.sub;
  ctx.font=fM(11,600); let tw=label.length*7; try{ tw=ctx.measureText(label).width; }catch(e){}
  const pw=tw+20, px=clamp(b.cx-pw/2,8,W-pw-8);
  let py=b.cy-52; if(py<8) py=b.cy+36;
  ctx.fillStyle=K.ground; ctx.fillRect(px,py,pw,26);
  plate(px,py,pw,26,K.gold,true);
  mono(label,px+pw/2,py+17,11,K.gold,'center',600);
  return;
 }
}
// ---------- game over ----------
// The end screen is a record of the hull: what brought it down and how to
// read that blow next time, what it carried, and where the trail goes next.
function nextGodLine(){
 const order=BOSS_KINDS.slice().sort((a,b)=>BOSSDEF[a].debut-BOSSDEF[b].debut);
 const k=order.find(q=>!codexKnown(q));
 if(!k) return 'Every god has fallen once. Past S110 the trail is a wall.';
  const d=BOSSDEF[k], rank=TIER_NAMES[d.tier];
  const art=/^[AEIOU]/.test(rank)?'An ':'A ';
  return codexSeen(k)?'Unfinished: '+d.name+', '+rank+', first met at S'+d.debut+'.':art+rank+' holds S'+d.debut+'.';
}
function drawEnd(){
 ctx.fillStyle=K.scrim; ctx.fillRect(0,0,W,H);
 const src=endInfo.src, narrow = W < 700;
 const L=narrow?16:150, T=narrow?118:252;
 const wrapN = Math.max(24, Math.floor((W-T-16)/6.6));
 const ent=src&&(CODEX_FOES.find(f=>f.type===src.id)||CODEX_BOSSES.find(b=>b.id===src.id));
 const tl=ent?wrapLines(ent.tell,wrapN).slice(0,2):[], cl=ent?wrapLines(ent.counter,wrapN).slice(0,2):[];
 const nIds=Object.keys(upgradeCounts).filter(id=>upgradeCounts[id]>0).length, per=Math.max(1,Math.floor((W-L-T)/40));
 const buildH=nIds?Math.min(2,Math.ceil(nIds/per))*46:26;
 // measure first, then centre the record in the space above RETRY
 const causeH=src?26+28+(ent?tl.length*15+8+cl.length*15:0):30;
 const blockH=34+30+causeH+22+26+buildH+10+44;
 let y=Math.max(80,Math.round((BTN.endRestart.y-24-blockH)/2)+34);
 heading('HULL LOST',W/2,y,narrow?26:34,K.red,'center'); line(W/2-Math.min(220,W/2-16),y+18,W/2+Math.min(220,W/2-16),y+18,K.redDim,1); y+=52;
 if(src){
   const pg=PIG[src.id], nm=src.name+(src.lt?' (SUMMONED)':''), what=' · '+src.what;
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
 if(narrow){
  mono('Score '+scoreCalc()+'   Best '+best+'   Kills '+kills,T,y+4,12,K.text); y+=18;
  mono('Level '+player.level+'   Time '+Math.floor(timeSec)+'s   Reached '+sectorName(arenaIdx),T,y+4,12,K.text); y+=26;
 } else {
  mono('Score '+scoreCalc()+'   Best '+best+'   Kills '+kills+'   Level '+player.level+'   Time '+Math.floor(timeSec)+'s   Reached '+sectorName(arenaIdx),T,y+4,12,K.text); y+=26;
 }
 heading('BUILD',L,y+20,9,K.textDim); y+=drawBuild(T,y,W-L-T,2)+14;
 mono('Restored at the Wake. Boss kills stay banked: +2% damage each.',W/2,y+8,12,K.gold,'center');
  mono(nextGodLine(),W/2,y+26,11,K.textDim,'center');
  entry(BTN.endRestart,'RETRY','[R]',endSel===0&&endReady());
  entry(BTN.endTitle,'TITLE','[Esc]',endSel===1);
  mono('[↑↓] select · [Enter] confirm',W/2,BTN.endTitle.y+BTN.endTitle.h+16,11,K.textDim,'center');
 drawBuildTip();
}

// ---------- screen reader ----------
// A screen reader cannot see the canvas. A polite live region in the page
// reads out what each screen is and what it offers, when that changes: the
// same words the canvas draws, never a second script to keep in sync.
// The draft is additionally mirrored as offscreen DOM buttons so a screen
// reader can choose a card directly; the canvas and the live narration stay.
let srEl=null, srLast='', srT=0, draftSrEl=null, draftSrSig='';
// the canvas is described by whichever hint line is actually showing
try{ if(window.matchMedia&&window.matchMedia('(pointer:coarse)').matches&&canvas.setAttribute) canvas.setAttribute('aria-describedby','hint-touch'); }catch(e){}
try{ srEl=document.getElementById?document.getElementById('sr'):null; }catch(e){}
try{ draftSrEl=document.getElementById?document.getElementById('draft-sr'):null; }catch(e){ draftSrEl=null; }
function draftCardText(u,i){
 try{
  const dn=(typeof u.dyn==='function')?u.dyn(player):null;
  let s=((dn&&dn.name)||u.name)+'. '+((dn&&dn.desc)||u.desc);
  try{ const df=statDiff(u); if(df&&df.length) s+=' Changes: '+df.join('; ')+'.'; }catch(e){}
  if(u===levelBack) s+=', offered again';
  return (i+1)+': '+s;
 }catch(e){ try{ return (i+1)+': '+((u&&(u.name||u.id))||'upgrade'); }catch(_){ return (i+1)+': upgrade'; } }
}
function syncDraftSr(){
 try{
  if(!draftSrEl||!draftSrEl.appendChild) return;
  if(state!=='levelup'||!levelChoices||!levelChoices.length){
   if(draftSrSig!==''){ draftSrSig=''; try{ while(draftSrEl.firstChild) draftSrEl.removeChild(draftSrEl.firstChild); }catch(e){ try{ draftSrEl.innerHTML=''; }catch(_){} } }
   return;
  }
  const sig=levelChoices.map((u,i)=>draftCardText(u,i)).join('|');
  if(sig!==draftSrSig){
   draftSrSig=sig;
   try{ while(draftSrEl.firstChild) draftSrEl.removeChild(draftSrEl.firstChild); }catch(e){ try{ draftSrEl.innerHTML=''; }catch(_){} }
   levelChoices.forEach((u,i)=>{
    let b=null;
    try{ b=document.createElement('button'); }catch(e){ return; }
    if(!b) return;
    try{
     b.type='button';
     b.textContent='Pick '+draftCardText(u,i);
     try{ b.setAttribute('data-draft',String(i)); }catch(e){}
     try{ if(u&&u.id) b.setAttribute('data-card',String(u.id)); }catch(e){}
     b.addEventListener('click',()=>{ try{ draftSel=i; pickUpgrade(levelChoices[i]); }catch(e){} });
     b.addEventListener('focus',()=>{ try{ if(draftSel!==i){ draftSel=i; if(SFX&&SFX.click) SFX.click(); } }catch(e){} });
     draftSrEl.appendChild(b);
    }catch(e){}
   });
  }
  try{
   const kids=draftSrEl.children||[];
   for(let k=0;k<kids.length;k++){ try{ if(k===draftSel) kids[k].setAttribute('aria-current','true'); else kids[k].removeAttribute('aria-current'); }catch(e){} }
  }catch(e){}
 }catch(e){}
}
function srSummary(){
 const keys=' Settings O, codex C, help H.';
  if(state==='title'){ const sv=readRun();
   if(titleConfirm&&titleConfirmT>performance.now()) return 'Abandon the saved run? Press N again to confirm — the saved run is lost. Or Enter continues it.';
  return 'KRIEFNE, roguelite. '+(sv?'Enter continues at '+sectorName(sv.galaxySel|0)+'. N starts a new run.':'Enter starts a run.')+keys; }
 if(state==='galaxy'){ const th=sectorTheme(galaxySel);
  const note=hubNote&&performance.now()-hubNote.at<8000?hubNote.txt+' ':'';
  return note+'Galaxy chart. Sector '+(galaxySel+1)+', '+th.name+(isBossSector(galaxySel)?', boss nest':'')+'. '+galaxyLore(galaxySel,th.name)+(galaxySel<=clearedMax?' Cleared: a replay banks no XP and restores the hull after.':'')+' Arrows select, Enter sets course, Escape returns to title.'; }
 if(state==='playing'){ if(!player) return '';
  let coach=''; try{ const cs=coachStep(); if(cs) coach=' Coach: '+coachLines(cs).join(' ')+' Enter dismisses.'; }catch(e){}
  const where=(replaySnap?'Replay, no XP. ':'')+'Sector '+(arenaIdx+1)+', '+(arena&&arena.theme?arena.theme.name:'')+'.';
  if(portal){ if(!gems.length) return where+' Sector clear. Exit with E.'+coach;
   const atRisk=fieldXpAtRisk();
   if(exitArmed()) return where+' Sector clear. Lose '+atRisk+' XP? Press E again to confirm — '+atRisk+' XP is lost.'+coach;
   return where+' Sector clear. '+atRisk+' XP on the field is lost at the exit. Exit with E.'+coach; }
  const low=player.hp<=player.maxhp*0.3?' Hull critical.':'';
  const nestNames=()=>{ const c=nestSummons(arenaIdx); return BOSSDEF[leadFor(arenaIdx+1)].name+(c.length?', who calls '+callNames(c):''); };
  return where+(isBossSector(arenaIdx)?' Boss nest: '+nestNames()+'.':' Hostiles inbound.')+low+coach; }
 if(state==='levelup'){
  const head=(nestDraftAt>0&&nestTally.kinds.length?BOSSDEF[nestTally.kinds[0]].name+(nestTally.kinds.length>1?"'s court falls.":' falls.')+(nestTally.banked?' +'+nestTally.banked+'% damage banked.':''):(nestDraftAt>0?'Nest cleared.':'Level '+(player?player.level:'')+'.'))+' Choose an upgrade; C opens the codex, H help. ';
  const cards=levelChoices.map((u,i)=>{ const dn=(typeof u.dyn==='function')?u.dyn(player):null; let s=(i+1)+': '+((dn&&dn.name)||u.name)+', '+((dn&&dn.desc)||u.desc); try{ const df=statDiff(u); if(df&&df.length) s+=' Changes: '+df.join('; ')+'.'; }catch(e){} if(u===levelBack) s+=', offered again'; return s+'.'; }).join(' ');
  let build='';
  try{ const ids=Object.keys(upgradeCounts).filter(id=>upgradeCounts[id]>0); if(ids.length) build=' Build: '+ids.map(id=>{ try{ return buildTipFor(id).name+' '+buildTipFor(id).sub; }catch(e){ const u=UPGRADES.find(q=>q.id===id); return (u?u.name:id)+' ×'+upgradeCounts[id]; } }).join(', ')+'.'; }catch(e){}
  return head+cards+build;
 }
  if(state==='paused') return restartArm>performance.now()?'Abandon this run? Press R again to confirm; the saved run is lost.':'Paused. Escape resumes. Arrows select, Enter confirms. O settings, H help, C codex, R abandons the run, Q returns to title.';
 if(state==='settings'){ const armed=wipeArmT>performance.now(), left=armed?Math.max(1,Math.ceil((wipeArmT-performance.now())/1000)):0;
  return 'Settings. '+settingsRows(armed,left).map(r=>r[0]+', '+r[1]+(r[1].indexOf('PRESS')===0?'':': '+r[2])).join('. ')+'. Escape goes back.'; }
 if(state==='help') return 'Help, '+helpTab+'. '+(HELP_TXT[helpTab]||[]).join(' ')+' Keys 1 to 4 switch tab; Escape goes back.';
 if(state==='codex'){ const L=codexList(), en=L[codexSel]; if(!en) return 'Codex.';
  const id=codexId(en), nm=en.name||(BOSSDEF[en.id]&&BOSSDEF[en.id].name)||'';
  if(!codexSeen(id)) return 'Codex, '+codexTab+'. Not yet met. Up and down change entry.';
  const b=BOSSDEF[en.id], rank=b?TIER_NAMES[b.tier]+', ':'';
   return 'Codex, '+codexTab+'. '+nm+'. '+rank+en.role+', '+en.threat+'.'+(b?' '+commandLine(en.id)+'.':'')+' Tell: '+en.tell+' Counter: '+en.counter+' '+(codexKnown(id)?'Field note: '+en.lore:'Kill it to recover the field note.')+' Up and down change entry.'; }
 if(state==='gameover'){ const sr=endInfo.src, ent=sr&&(CODEX_FOES.find(f=>f.type===sr.id)||CODEX_BOSSES.find(b=>b.id===sr.id));
  return 'Hull lost.'+(sr?' Brought down by '+sr.name+', '+sr.what+'.'+(ent?' Tell: '+ent.tell+' Counter: '+ent.counter:''):'')+(endInfo.newBest?' New best.':'')+' Score '+scoreCalc()+'. Reached sector '+(arenaIdx+1)+'. '+nextGodLine()+' R retries, Escape returns to title.'; }
 return '';
}
function srTick(now){ try{ syncDraftSr(); }catch(e){} if(!srEl||now-srT<250) return; srT=now; let t=''; try{ t=srSummary(); }catch(e){} if(t&&t!==srLast){ srLast=t; srEl.textContent=t; } }

// ---------- main loop ----------
let last=performance.now(), acc=0; const STEP=1000/60;
function frame(now){ requestAnimationFrame(frame); let dt=now-last; last=now; if(dt>250) dt=250; acc+=dt*(__dev?__dev.ts:1); let n=0; while(acc>=STEP&&n<5){ update(STEP/1000); acc-=STEP; n++; } if(n===5) acc=0; render(); srTick(now); }
arena={seed:1337, obs:[], theme:THEMES[0], spawns:[], port:{x:800,y:500}, validated:true, ratio:1};
  try{ window.__kriefne={ startRun, continueRun, saveRun, readRun, loadArena, loadSector, killEnemy, nextArena, gainXp, pickUpgrade, hurtPlayer, doPortalKey, tryExitPortal, cancelBlink, fieldXpAtRisk, exitArmed, tryDash, update, render, focusWatch, xpNeedFor, openHelp, handleKeyPress, handleClick,
   spawnEnemy, steer, hostiles, collectGems, isBossSector, bossKindsFor, compFor, sectorName, sectorWorld, galNodes, reflectBullet, bulletBlocked,
   forceState(s){ state=s; }, get upgrades(){ return UPGRADES; }, get helpTab(){ return helpTab; },
   get bossdefs(){ return BOSSDEF; }, get hazards(){ return hazards; },
   get tierNames(){ return TIER_NAMES; }, get bossesByTier(){ return BOSSES_BY_TIER; }, get nestSummonLeft(){ return nestSummonLeft; },
   nestLore, get debutLore(){ return DEBUT_LORE; },
   // boss engine: the ladder, the chain and the registry
   get ladder(){ return LADDER; }, get bossKits(){ return BOSS_KITS; }, get teleportOk(){ return TELEPORT_OK; }, get caps(){ return CAP; },
   leadFor, ladderLevel, summonsOf, callersOf, nestSummons, summonAt, chainExtra, maxChainDepth, summonBudgetFor, phaseAt,
   mkBoss, mkSummoned, bossMaxSpeed, bossBlink, bossLabel, liveSummoned,
   // boss primitives, status, recovery and phases (the prims / fuzz suites drive these)
   bossBeam, bossMarks, markEscapeGap, dropDisc, shockwave, eshotB, bossDeflect, addPart, hitBossPart, breakPart, placeTempObs, bossGrasp,
   eraseZone, bulletErased, addCurrent, bulletField, applyStatus, statusTags, rayObs, clearBossState, relentlessFor, nestHead,
   get bossBeams(){ return bossBeams; }, get marks(){ return marks; }, get discs(){ return discs; }, get bossZones(){ return bossZones; },
   get bossCurrents(){ return bossCurrents; }, get bossGrasps(){ return bossGrasps; }, get rings(){ return rings; }, get nestChaffT(){ return nestChaffT; },
   get phaseBeat(){ return PHASE_BEAT; }, get recovOpen(){ return RECOV_OPEN; }, get freezeImmune(){ return FREEZE_IMMUNE; }, get summonHp(){ return SUMMON_HP; }, get summonLiveCap(){ return SUMMON_LIVE_CAP; },
   drawIcon, get ctx(){ return ctx; },
   get pigments(){ return PIGMENT_DEF; }, get pig(){ return PIG; }, get tokens(){ return K; }, get bossDefs(){ return BOSSDEF; }, get themes(){ return THEMES; },
   srSummary,
   syncDraftSr, draftCardText,
   get helpTabs(){ return HELP_TABS; }, get codexFoes(){ return CODEX_FOES; }, get codexBosses(){ return CODEX_BOSSES; },
    setHelpTab(t){ helpTab=t; helpPage=0; helpPagerRect=null; },
    openCodex, closeCodex, codexKnown, codexSeen, handleRelease, statDiff, get endInfo(){ return endInfo; }, get restartArm(){ return restartArm; }, get exitArm(){ return exitArm; }, codexProgress, commandLine,
    get codexTab(){ return codexTab; }, setCodexTab(t){ codexTab=t; codexSel=0; codexPage=0; codexPagerRect=null; }, get codexSel(){ return codexSel; },
    get helpPage(){ return helpPage; }, get codexPage(){ return codexPage; },
    get helpPager(){ return helpPagerRect; }, get codexPager(){ return codexPagerRect; }, get codexIdxPager(){ return codexIdxPagerRect; },
    codexStep, codexIdxPage, codexIdxSpan, codexDetailPages,
    setViewport(w,h){ W=Math.max(280,Math.round(w)); H=Math.max(200,Math.round(h)); helpPage=0; helpPagerRect=null; codexPage=0; codexPagerRect=null; codexIdxPagerRect=null; try{ layoutButtons(); }catch(e){} },
  pool(){ return UPGRADES.filter(u=>(!u.req||u.req(player))&&(!u.max||(upgradeCounts[u.id]||0)<u.max)).map(u=>u.id); },
  get autoPaused(){ return autoPaused; }, get queue(){ return spawnQueue; }, get cam(){ return cam; },
  get pendingLevels(){ return pendingLevels; }, get pendingNest(){ return pendingNest; }, get pity(){ return pity; }, get runSeed(){ return runSeed; }, get upgradeCounts(){ return upgradeCounts; },
  get titleConfirm(){ return titleConfirm; }, get levelBack(){ return levelBack; },
  get depth(){ return depth; }, get bosses(){ return bosses; }, get best(){ return best; },
  get cleared(){ return clearedMax; }, get replay(){ return !!replaySnap; }, get kills(){ return kills; }, get titleSel(){ return titleSel; }, get hubNote(){ return hubNote; }, get galaxySel(){ return galaxySel; }, get time(){ return timeSec; },
   get ebullets(){ return ebullets; }, get hostileRings(){ return rings.filter(g=>g.dmg>0&&!g.own); }, get hazardList(){ return hazards; },
   get state(){return state;}, get player(){return player;}, get enemies(){return enemies;}, get gems(){return gems;}, get settings(){return settings;}, get arena(){return arena;}, get portal(){return portal;}, get choices(){return levelChoices;}, keys, mouse, touch, fitCanvas,
   get viewScale(){ return viewScale; }, get devicePx(){ return devicePx; },
    get vw(){ return W; }, get vh(){ return H; }, get btn(){ return BTN; }, draftLayout, draftRect, rowRects, helpTabRects, codexTabRects, codexRects, layoutButtons,
    coachStep, coachLines, dismissCoach, coachSeen, markCoach, drawCoach, updateCoach }; }catch(e){}
// bullet hooks. defineProperties, not Object.assign: assign would read the
// getter once and pin a stale array (bullets is reassigned on every sector load).
try{ Object.defineProperties(window.__kriefne,Object.getOwnPropertyDescriptors({ get bullets(){ return bullets; }, enemyHitT, get hitWhat(){ return HIT; }, SEG_PASS })); }catch(e){}
// map hooks: generate a sector's map without loading it (the field bounds are
// set for that sector, then put back), and the pieces the maps suite audits
try{ Object.assign(window.__kriefne,{
 sectorTheme, mkSectorPal, nearRed, pointBlocked, polyDist, groupEdges, obsClash, place, worldLayer, get layouts(){ return LAYOUTS; },
 pushOut(obs,e){ const keep=arena.obs; arena.obs=obs; try{ resolveObstacles(e); } finally{ arena.obs=keep; } },
 mapProbe(seed,idx,types){
  const keep=[WW,HH,PX0,PY0,PX1,PY1], wz=sectorWorld(idx);
  WW=wz.w; HH=wz.h; PX0=WALL; PY0=HUD_H+WALL; PX1=WW-WALL; PY1=HH-WALL;
  try{ const g=genArenaValidated(seed>>>0,idx,types||[]);
   return { map:g, bounds:{x0:PX0,y0:PY0,x1:PX1,y1:PY1}, drop:{x:(PX0+PX1)/2,y:(PY0+PY1)/2} }; }
  finally{ [WW,HH,PX0,PY0,PX1,PY1]=keep; } }
}); }catch(e){}
// ---------- DevX lab hooks ----------
// Inert unless window.__KRIEFNE_DEV===true is set before this file loads (only
// DevX/lab.html does). `__dev` is read by five one-line guarded touch-points:
// hurtPlayer (god / damage log), the enemy loop (AI freeze), the wave director
// (spawns off), render (overlay) and frame (time scale). Production never
// assigns it, so each touch-point costs one null check.
var __dev=null;
try{ if(window.__KRIEFNE_DEV===true&&window.__kriefne){
 const D={ ts:1, frz:false, spawnsOff:false, god:false, logOnly:false, infDash:false, hit:false, nums:false, meter:true, target:0, lastTtk:null };
 // Mid-run reference builds (~S20-25 worth of picks). The fight simulator owns
 // the drafted versions; these are fixed stacks so a lab fight is repeatable.
 const PRESETS={
  balanced:{dmg:4,hp:3,rate:3,ward:1,array:2,vamp:2,crit:2,aegis:1,spd:2,shock:1,bulwark:1,seek:1,repair:1,pcell:1},
  greedy:{dmg:6,rate:5,array:3,crit:3,slug:2,overcharge:2,flak:2,minigun:1,split:1,spd:1},
  hose:{array:3,seek:2,dmg:4,rate:3},
  empty:{}
 };
 const HC={ body:'#39d0ff', part:'#ffd23c', seg:'#c38bff', haz:'#ff9a3c', mark:'#ff5ad1', beam:'#ff5ad1', ring:'#ff6b6b', player:'#7dff7a', pb:'#bfe8f3', eb:'#ff6b6b' };
 const hpSeen=new Map(), removed=new Set(), fights=[];
 let lastArena=null, lastHp=null, fight=null, fightN=0, dpsWin=[];
 const r1=v=>Math.round(v*10)/10;
  function liveBoss(uid){ return enemies.find(e=>e.type==='boss'&&!e.dead&&(!uid||e.uid===uid))||null; }
 function targetBoss(uid){ return (uid&&liveBoss(uid))||(D.target&&liveBoss(D.target))||liveBoss(); }
 function roleOf(e){ return e.labRole||(e.thrall?'thrall':((e.lieutenant||e.summoned)?'summoned':'lead')); }
 function kitOf(kind){ try{ return (typeof BOSS_KITS!=='undefined'&&BOSS_KITS&&BOSS_KITS[kind])||null; }catch(_){ return null; } }
 function attacksFor(kind){
  const k=kitOf(kind);
  if(k&&k.attacks){ const a=k.attacks; return Array.isArray(a)?a.map(x=>typeof x==='string'?x:(x&&(x.id||x.name))).filter(Boolean):Object.keys(a); }
  const d=BOSSDEF[kind]; return d&&d.phases?Array.from(new Set(d.phases)):[];
 }
 function phasesFor(kind){
  const k=kitOf(kind);
  if(k&&k.phases!=null){ const n=Array.isArray(k.phases)?k.phases.length:(+k.phases||0); if(n>0) return n; }
  const s=BOSSDEF[kind]?BOSSDEF[kind].debut:5; return s>=100?2:(s>=50?3:(s>=25?2:1)); // SPEC §3.7 bands
 }
 // ----- fight record -----
 function newFight(reason){
  if(fight&&fight.dealt===0&&fight.hits===0&&timeSec-fight.startT<0.5) fight=null; // an empty fight is noise, not history
  endFight('replaced'); fightN++; dpsWin=[];
  fight={ id:fightN, reason:reason||'manual', sector:arenaIdx+1, startT:timeSec, endT:null, ended:null,
   level:player?player.level:0, build:Object.assign({},upgradeCounts),
   flags:{god:false,logOnly:false,frozen:false,spawnsOff:false,infDash:false,ts:[]}, // anything on at any point in the fight
   dealt:0, dealtBoss:0, dealtChaff:0, kills:0, taken:0, hits:0, blocked:0, hull:0, lethal:0, bySrc:{}, bosses:[] };
  return fight;
 }
 function endFight(why){ if(!fight) return; fight.endT=timeSec; fight.ended=why||'manual'; fights.push(fight); if(fights.length>30) fights.shift(); fight=null; }
 function fightJSON(f){
  if(!f) return null;
  const dur=Math.max(0,(f.endT==null?timeSec:f.endT)-f.startT);
  const src=Object.keys(f.bySrc).map(k=>({source:k,dmg:Math.round(f.bySrc[k].dmg),hits:f.bySrc[k].hits,blocked:f.bySrc[k].blocked,heavy:f.bySrc[k].heavy})).sort((a,b)=>b.dmg-a.dmg);
  return { id:f.id, sector:'S'+String(f.sector).padStart(2,'0'), started:f.reason, ended:f.ended||'live', duration:r1(dur), level:f.level, build:f.build, flags:f.flags,
   dealt:{ total:Math.round(f.dealt), boss:Math.round(f.dealtBoss), chaff:Math.round(f.dealtChaff), dps:dur>0?Math.round(f.dealt/dur):0, kills:f.kills },
   taken:{ incoming:Math.round(f.taken), hits:f.hits, blocked:f.blocked, hull:Math.round(f.hull), lethal:f.lethal, bySource:src },
   bosses:f.bosses.map(b=>({ name:b.name, kind:b.kind, role:b.role, maxhp:Math.round(b.maxhp), spawnAt:r1(b.spawnAt-f.startT), ttk:b.ttk==null?null:r1(b.ttk), hpLeftPct:b.ttk==null?b.hpPct:0, removed:!!b.removed })) };
 }
 function dps(){ if(!fight) return 0; let s=0; for(const w of dpsWin) s+=w[1]; return s/Math.min(3,Math.max(0.5,timeSec-fight.startT)); }
 function credit(d,isBoss){ if(!fight) return; fight.dealt+=d; if(isBoss) fight.dealtBoss+=d; else fight.dealtChaff+=d; dpsWin.push([timeSec,d]); }
 function trackBoss(e){ if(!fight) newFight('boss'); fight.bosses.push({uid:e.uid,kind:e.kind,name:e.bname||(e.def&&e.def.name)||e.kind,role:roleOf(e),maxhp:e.maxhp,spawnAt:timeSec,ttk:null,hpPct:100}); }
 // Forced attacks are honoured by the boss engine once BOSS_KITS exists. Until
 // then the lab loops a forced attack by holding the phase clock inside that
 // attack's slot of the BOSSDEF cycle (lab-side state only, no AI change).
 function pinAttack(e){
  if(e.type!=='boss'||!e.forcedAttack||!e.def||!Array.isArray(e.def.phases)) return;
  const i=e.def.phases.indexOf(e.forcedAttack); if(i<0) return;
  const pt=e.def.pt||3, prog=e.phaseT-i*pt; if(prog>=0&&prog<pt-0.15) return;
  e.phaseT=i*pt+0.01; e.phase=i; e.chargeOn=false; e.ramLx=undefined; e.burstT=0;
 }
 // Runs once per rendered frame: HP deltas give damage dealt from every source
 // (rounds, burns, splash, abilities) without touching the combat code.
 function sample(){
  if(!player) return;
  if(arena!==lastArena){ lastArena=arena; hpSeen.clear(); removed.clear(); lastHp=null; newFight('sector'); }
  const p=player;
  if(D.infDash&&p.dashCd>0) p.dashCd=0;
  if(typeof BOSS_KITS==='undefined') for(const e of enemies) pinAttack(e);
  const cur=new Set();
  for(const e of enemies){ cur.add(e.uid); const s=hpSeen.get(e.uid);
   if(!s){ const b=e.type==='boss'; hpSeen.set(e.uid,{hp:e.hp,boss:b}); if(b) trackBoss(e); continue; }
   const d=s.hp-e.hp; if(d>0) credit(d,s.boss); s.hp=e.hp;
   if(s.boss&&fight){ const bt=fight.bosses.find(x=>x.uid===e.uid); if(bt) bt.hpPct=Math.round(100*Math.max(0,e.hp)/e.maxhp); } }
  for(const [uid,s] of hpSeen){ if(cur.has(uid)) continue; hpSeen.delete(uid);
   const gone=removed.has(uid); removed.delete(uid);
   if(!gone){ if(s.hp>0) credit(s.hp,s.boss); if(fight) fight.kills++; }
   if(s.boss&&fight){ const bt=fight.bosses.find(x=>x.uid===uid);
    if(bt&&bt.ttk==null&&!bt.removed){ if(gone) bt.removed=true; else { bt.ttk=timeSec-bt.spawnAt; D.lastTtk={name:bt.name,ttk:r1(bt.ttk)}; } } } }
  if(lastHp!=null&&p.hp<lastHp&&fight) fight.hull+=lastHp-p.hp; lastHp=p.hp;
  if(fight){ const g=fight.flags; g.god=g.god||D.god; g.logOnly=g.logOnly||D.logOnly; g.frozen=g.frozen||D.frz; g.spawnsOff=g.spawnsOff||D.spawnsOff; g.infDash=g.infDash||D.infDash; if(g.ts.indexOf(D.ts)<0) g.ts.push(D.ts); }
  if(fight){ const bs=fight.bosses;
   if(bs.length&&bs.every(b=>b.ttk!=null||b.removed)) endFight('boss down');
   else if(!bs.length&&hostiles()===0&&timeSec>fight.startT) endFight('cleared'); }
  while(dpsWin.length&&dpsWin[0][0]<timeSec-3) dpsWin.shift();
 }
 // ----- overlay -----
 function circ(x,y,r,col,w,dash){ if(!(r>0)||!isFinite(x)||!isFinite(y)) return; ctx.setLineDash(dash||[]); ctx.strokeStyle=col; ctx.lineWidth=w||1; ctx.beginPath(); ctx.arc(x,y,r,0,6.283); ctx.stroke(); }
 // Same shapes enemyHitT tests (all world-space): body at the drawn scale,
 // hitParts, live parts, segments.
 function partPos(e,q){ return {x:q.x,y:q.y}; }
 function paintBeam(b){
  if(!b) return; ctx.setLineDash(b.live===false||b.warn>0?[6,4]:[]); ctx.strokeStyle=HC.beam; ctx.lineWidth=1;
  let x1,y1,x2,y2; if(b.x1!=null){ x1=b.x1; y1=b.y1; x2=b.x2; y2=b.y2; } else if(b.a!=null){ x1=b.x; y1=b.y; const L=b.len||b.reach||600; x2=x1+Math.cos(b.a)*L; y2=y1+Math.sin(b.a)*L; } else return;
  const w=(b.w||b.width||4)/2, nx=-(y2-y1), ny=x2-x1, nl=Math.hypot(nx,ny)||1;
  ctx.beginPath(); ctx.moveTo(x1+nx/nl*w,y1+ny/nl*w); ctx.lineTo(x2+nx/nl*w,y2+ny/nl*w); ctx.lineTo(x2-nx/nl*w,y2-ny/nl*w); ctx.lineTo(x1-nx/nl*w,y1-ny/nl*w); ctx.closePath(); ctx.stroke();
 }
 function arrOpt(v){ return Array.isArray(v)?v:null; }
 function paintHit(){
  for(const h of hazards) circ(h.x,h.y,h.r,HC.haz,1,h.t<(h.warn||0)?[4,4]:null);
  const extra=[]; // boss-engine pools, drawn if this build has them
  try{ if(typeof marks!=='undefined') extra.push(['mark',arrOpt(marks)]); }catch(_){}
  try{ if(typeof discs!=='undefined') extra.push(['haz',arrOpt(discs)]); }catch(_){}
  for(const [k,a] of extra) if(a) for(const m of a) circ(m.x,m.y,m.r,HC[k],1.5,(m.t!=null&&m.warn!=null&&m.t<m.warn)?[6,3]:null);
  const bl=[beams]; try{ if(typeof bossBeams!=='undefined') bl.push(arrOpt(bossBeams)); }catch(_){} try{ if(typeof eBeams!=='undefined') bl.push(arrOpt(eBeams)); }catch(_){}
  for(const a of bl) if(a) for(const b of a) paintBeam(b);
  for(const g of rings) if(g.dmg>0&&!g.own) circ(g.x,g.y,g.r,HC.ring,1,[3,5]);
  for(const e of enemies){
   circ(e.x,e.y,e.r*(e.vscale||1),HC.body,e.type==='boss'?1.5:1);
   if(Array.isArray(e.hitParts)) for(const q of e.hitParts) circ(q.x,q.y,q.r,HC.body,1,[4,2]);
   if(Array.isArray(e.parts)) for(const q of e.parts){ if(q.dead||q.hp<=0) continue; const c=partPos(e,q); circ(c.x,c.y,q.r,HC.part,1.5,[5,2]); }
   if(Array.isArray(e.segs)) for(const q of e.segs) circ(q.x,q.y,q.r,HC.seg,1);
  }
  ctx.setLineDash([]);
  for(const b of ebullets) circ(b.x,b.y,b.r,HC.eb,1);
  ctx.strokeStyle=HC.pb; ctx.lineWidth=1;
  for(const b of bullets){ circ(b.x,b.y,b.r,HC.pb,1); if(b.px!=null){ ctx.beginPath(); ctx.moveTo(b.px,b.py); ctx.lineTo(b.x,b.y); ctx.stroke(); } }
  if(player) circ(player.x,player.y,player.r,HC.player,1.5);
  ctx.setLineDash([]);
 }
 function paintNums(){
  ctx.textAlign='center'; ctx.font=fM(10,600);
  for(const e of enemies){
   const R=e.r*(e.vscale||1), t=e.type==='boss'?Math.ceil(e.hp)+'/'+Math.ceil(e.maxhp)+' · '+Math.round(100*e.hp/e.maxhp)+'%':String(Math.ceil(e.hp));
   ctx.fillStyle=K.deep; ctx.fillText(t,e.x+1,e.y-R-7); ctx.fillStyle=e.type==='boss'?K.goldHi:K.text; ctx.fillText(t,e.x,e.y-R-8);
   if(Array.isArray(e.parts)) for(const q of e.parts){ if(q.dead||!(q.hp>0)) continue; const c=partPos(e,q); ctx.fillStyle=HC.part; ctx.fillText(String(Math.ceil(q.hp)),c.x,c.y-(q.r||8)-4); }
  }
 }
 function paintMeter(){
  const f=fight, lines=[];
  lines.push('LAB  T '+(f?(timeSec-f.startT).toFixed(1):'-.-')+'s   DPS '+Math.round(dps())+'   TTK '+(D.lastTtk?D.lastTtk.ttk.toFixed(1)+'s '+D.lastTtk.name:'--'));
  const b=targetBoss();
  if(b) lines.push((b.bname||b.kind)+'  '+Math.round(100*b.hp/b.maxhp)+'%  '+(typeof bossLabel==='function'?bossLabel(b):'')+(b.forcedAttack?'  [FORCED '+String(b.forcedAttack).toUpperCase()+']':'')+(b.forcedPhase?'  [PHASE '+b.forcedPhase+']':''));
  const fl=[]; if(D.god) fl.push('GOD'); if(D.logOnly) fl.push('NO-DIE'); if(D.infDash) fl.push('INF DASH'); if(D.frz) fl.push('AI FROZEN'); if(D.spawnsOff) fl.push('SPAWNS OFF'); if(D.ts!==1) fl.push(D.ts+'x');
  lines.push('TAKEN '+(f?Math.round(f.taken):0)+'  DEALT '+(f?Math.round(f.dealt):0)+(fl.length?'   '+fl.join(' · '):''));
  ctx.font=fM(11,500); let w=0; for(const l of lines){ let lw=l.length*7; try{ lw=ctx.measureText(l).width; }catch(_){} w=Math.max(w,lw); }
  const x=14, y=H-14-(lines.length-1)*15;
  ctx.globalAlpha=0.85; ctx.fillStyle=K.deep; ctx.fillRect(x-7,y-14,w+14,lines.length*15+8); ctx.globalAlpha=1;
  lines.forEach((l,i)=>mono(l,x,y+i*15,11,i===0?K.gold:K.text,'left',500));
 }
 D.draw=function(){
  try{ sample(); }catch(e){}
  if(!player) return;
  try{
   ctx.save();
   // world overlays only in live play, never over a menu or a draft
   if((D.hit||D.nums)&&state==='playing'){ ctx.save(); ctx.beginPath(); ctx.rect(0,HUD_H,W,H-HUD_H); ctx.clip(); ctx.translate(-cam.x,-cam.y);
    if(D.hit) paintHit(); if(D.nums) paintNums(); ctx.restore(); }
   if(D.meter) paintMeter();
   ctx.restore();
  }catch(e){ try{ ctx.restore(); }catch(_){} }
 };
 D.hurt=function(dmg,heavy,src){
  const p=player; if(!fight) newFight('hit');
  const key=src?((src.name||src.id||'?')+(src.lt?' LT':'')+' · '+(src.what||'?')):'UNKNOWN';
  const b=fight.bySrc[key]||(fight.bySrc[key]={dmg:0,hits:0,blocked:0,heavy:0});
  b.hits++; fight.hits++; if(heavy) b.heavy++;
  if(D.god){ b.dmg+=dmg; fight.taken+=dmg; p.invuln=Math.max(p.invuln,0.35); p.flash=0.15; if(src) p.lastSrc=src; addFloater(p.x+24,p.y-20,'('+Math.round(dmg)+')',K.textDim); return true; }
  // the same order hurtPlayer resolves shields in: a blocked hit costs no hull
  if((heavy&&p.mirrorUp)||p.wardUp||p.bulwark>0||p.barrier>=dmg||p.shieldReady){ b.blocked++; fight.blocked++; return false; }
  b.dmg+=dmg; fight.taken+=dmg;
  if(D.logOnly){ const rem=Math.max(0,dmg-(p.barrier||0));
   if(rem>=p.hp&&!(p.stasisN>0)&&!p.secondWind){ fight.lethal++; p.hp=rem+1; addFloater(p.x,p.y-44,'LETHAL · LOGGED',K.red); } }
  return false;
 };
 // ----- actions -----
 function setLevel(L){ if(!player) return 0; L=Math.max(1,Math.min(300,L|0)); const d=L-player.level; player.level=L; player.xp=0; player.xpNeed=xpNeedFor(L); player.maxhp=Math.max(1,player.maxhp+3*d); player.hp=player.maxhp; return L; }
 function setHp(v){ if(!player) return 0; v=Math.max(1,Math.round(+v)||1); if(v>player.maxhp) player.maxhp=v; player.hp=v; lastHp=v; return v; }
 function jump(n,opts){
  opts=opts||{}; n=Math.max(1,Math.min(150,Math.round(+n)||1)); const i=n-1;
  if(!player||state==='title'||state==='gameover'||!(player.hp>0)) startRun();
  clearedMax=i-1; // the frontier, never a replay: replays bank nothing
  loadSector(i);
  if(opts.level) setLevel(opts.level);
  if(opts.hp) setHp(opts.hp);
  lastArena=arena; hpSeen.clear(); removed.clear(); lastHp=null; D.lastTtk=null; newFight('goto S'+n);
  return { ok:true, sector:n, nest:isBossSector(i), kinds:isBossSector(i)?bossKindsFor(i):[], state };
 }
 function setCards(map){
  if(!player) return {ok:false,msg:'no run'};
  map=map||{};
  const keep={x:player.x,y:player.y,level:player.level,xp:player.xp,aim:player.aim,face:player.face,invuln:player.invuln,lastSrc:player.lastSrc,lastHurt:player.lastHurt};
  const np=Object.assign(newPlayer(1+0.02*bosses),keep); np.xpNeed=xpNeedFor(np.level); np.maxhp+=3*(np.level-1); np.hp=np.maxhp;
  player=np; upgradeCounts={};
  const want={};
  for(const id in map){ const u=UPGRADES.find(x=>x.id===id), n=Math.max(0,map[id]|0); if(u&&n) want[id]=u.max?Math.min(n,u.max):n; }
  const st=state, pl=pendingLevels, pn=pendingNest, mu=muted, gs=gems; pendingLevels=0; pendingNest=0; muted=true; gems=[];
  try{ // passes, so req-gated cards (slip, gatecd, shock*) land after their unlock
   for(let pass=0,progress=true;progress&&pass<40;pass++){ progress=false;
    for(const u of UPGRADES){ const c=upgradeCounts[u.id]||0;
     if(!want[u.id]||c>=want[u.id]||(u.max&&c>=u.max)||(u.req&&!u.req(player))) continue;
     pickUpgrade(u); progress=true; } }
  } finally { muted=mu; pendingLevels=pl; pendingNest=pn; gems=gs; state=st; }
  const skipped={}; for(const id in want){ const got=upgradeCounts[id]||0; if(got<want[id]) skipped[id]=want[id]-got; }
  player.hp=player.maxhp; lastHp=player.hp; floaters=[];
  addFloater(player.x,player.y-30,'LAB BUILD · '+Object.values(upgradeCounts).reduce((a,b)=>a+b,0)+' CARDS',K.gold);
  return { ok:true, counts:Object.assign({},upgradeCounts), skipped };
 }
 function clearField(pred){
  pred=pred||(()=>true); const keep=[]; let n=0;
  for(const e of enemies){ if(pred(e)){ removed.add(e.uid); e.dead=true; n++; } else keep.push(e); }
  enemies=keep; return n;
 }
 function spawnBoss(kind,role,opts){
  opts=opts||{}; role=role||'lead';
  if(!player||!arena||state==='title'||state==='galaxy') return {ok:false,msg:'not in a sector: load one first'};
  if(!BOSSDEF[kind]) return {ok:false,msg:'unknown kind '+kind};
  const s=arenaIdx; let mk=null, via=role;
  if(role==='lead') mk=(x,y)=>mkBoss(kind,x,y,s);
  else if(role==='summoned'){
   if(typeof mkSummoned==='function'){ via='mkSummoned'; mk=(x,y)=>mkSummoned(kind,x,y,s,1); }
   else { via='mkLieutenant'; mk=(x,y)=>mkLieutenant(kind,x,y,s,1,0); }
  } else if(role==='thrall'){
   if(typeof mkThrall!=='function') return {ok:false,msg:'thrall: not available in this build (no mkThrall)'};
   via='mkThrall'; mk=(x,y)=>mkThrall(kind,x,y,s);
  } else return {ok:false,msg:'unknown role '+role};
  if(opts.replace) clearField(o=>o.type==='boss');
  const q=nearSpot(player.x,player.y,300,420,(BOSSDEF[kind].r||30)+10);
  let e=null; try{ e=mk(q.x,q.y); }catch(err){ return {ok:false,msg:via+' threw: '+(err&&err.message)}; }
  if(!e||typeof e!=='object') return {ok:false,msg:via+' returned nothing'};
  e.labRole=role; e.spawnT=0.9; enemies.push(e);
  rings.push({x:q.x,y:q.y,r:10,maxR:120,spd:300,dmg:0,hit:true});
  if(role==='lead'){ newFight('spawn '+kind); D.lastTtk=null; bossWarnT=2.4; bossWarnTxt=e.bname||BOSSDEF[kind].name; bossWarnSub=['LAB · '+role.toUpperCase()];
   if(opts.replace){ try{ nestTally.kinds=[kind]; }catch(_){} } }
  trackBoss(e); hpSeen.set(e.uid,{hp:e.hp,boss:true});
  D.target=e.uid;
  return { ok:true, uid:e.uid, name:e.bname||kind, role, via };
 }
 function forceAttack(name,uid){ const e=targetBoss(uid); if(!e) return {ok:false,msg:'no boss alive'};
  e.forcedAttack=name||null; if(name) pinAttack(e);
  return { ok:true, uid:e.uid, name:e.bname, attack:e.forcedAttack, engine:!!kitOf(e.kind) }; }
 function stepAttack(uid){ const e=targetBoss(uid); if(!e) return {ok:false,msg:'no boss alive'};
  const list=attacksFor(e.kind); if(!list.length) return {ok:false,msg:'no attack list'};
  return forceAttack(list[(list.indexOf(e.forcedAttack)+1)%list.length],e.uid); }
 function forcePhase(n,uid){ const e=targetBoss(uid); if(!e) return {ok:false,msg:'no boss alive'};
  e.forcedPhase=(n==null||n===''||!(+n))?null:(+n|0); return { ok:true, uid:e.uid, name:e.bname, phase:e.forcedPhase }; }
 function setBossHp(frac,uid){ const e=targetBoss(uid); if(!e) return {ok:false,msg:'no boss alive'};
  e.hp=e.maxhp*Math.max(0.001,Math.min(1,+frac||0)); const s=hpSeen.get(e.uid); if(s) s.hp=e.hp; return {ok:true,uid:e.uid,hp:Math.ceil(e.hp)}; }
 function aiFreeze(on){ D.frz=!!on; window.devAiFreeze=D.frz; try{ devAiFreeze=D.frz; }catch(_){} return D.frz; }
 function killAll(){
  if(!player) return 0; spawnQueue.length=0; let n=0;
  for(let pass=0;pass<4&&enemies.length;pass++){ const snap=enemies.slice();
   for(let j=snap.length-1;j>=0;j--){ const e=snap[j]; if(e.dead) continue; const ix=enemies.indexOf(e); if(ix<0) continue; removed.add(e.uid); e.hp=0; killEnemy(ix); n++; } } // lab kills stay out of the dealt/TTK record
  return n;
 }
 function bossList(){ const t=targetBoss();
  return enemies.filter(e=>e.type==='boss'&&!e.dead).map(e=>({ uid:e.uid, kind:e.kind, name:e.bname||e.kind, role:roleOf(e), hp:Math.ceil(e.hp), maxhp:Math.ceil(e.maxhp), pct:Math.round(100*e.hp/e.maxhp),
   attack:typeof bossLabel==='function'?bossLabel(e):'', forcedAttack:e.forcedAttack||null, forcedPhase:e.forcedPhase||null, target:!!t&&t.uid===e.uid })); }
 function labStatus(){ const f=fight, p=player;
  return { state, sector:arenaIdx+1, level:p?p.level:0, hp:p?Math.ceil(p.hp):0, maxhp:p?Math.ceil(p.maxhp):0,
   flags:{god:D.god,logOnly:D.logOnly,infDash:D.infDash,frz:D.frz,spawnsOff:D.spawnsOff,ts:D.ts,hit:D.hit,nums:D.nums,meter:D.meter},
   fightT:f?r1(timeSec-f.startT):null, dps:Math.round(dps()), lastTtk:D.lastTtk, dealt:f?Math.round(f.dealt):0, taken:f?Math.round(f.taken):0,
   hostiles:hostiles(), queue:spawnQueue.length, engineKits:typeof BOSS_KITS!=='undefined', counts:Object.assign({},upgradeCounts) }; }
 window.devAiFreeze=false;
 __dev=D;
 Object.assign(window.__kriefne,{
  dev:true, jump, setLevel, setHp, setCards, preset(name){ return setCards(PRESETS[name]||{}); },
  spawnBoss, bossList, target(uid){ D.target=uid|0; return D.target; }, attacksFor, phasesFor,
  forceAttack, stepAttack, forcePhase, setBossHp, aiFreeze,
  setGod(on){ D.god=!!on; return D.god; }, setLogOnly(on){ D.logOnly=!!on; return D.logOnly; },
  infiniteDash(on){ D.infDash=!!on; if(D.infDash&&player) player.dashUnlocked=true; return D.infDash; },
  timeScale(x){ if(x!==undefined) D.ts=Math.max(0.05,Math.min(4,+x||1)); return D.ts; },
  showHitboxes(on){ D.hit=!!on; return D.hit; }, showHpNumbers(on){ D.nums=!!on; return D.nums; }, showMeter(on){ D.meter=!!on; return D.meter; },
  killAll, clearField(){ spawnQueue.length=0; return clearField(); }, heal(){ if(!player) return 0; player.hp=player.maxhp; lastHp=player.hp; return player.hp; },
  setSpawns(on){ D.spawnsOff=!on; return !D.spawnsOff; },
  newFight(){ newFight('manual'); return fight.id; }, endFight(){ endFight('manual'); }, clearLog(){ fights.length=0; },
  labStatus
 });
 // getters go through defineProperties: Object.assign would copy their value once
 Object.defineProperties(window.__kriefne,{
  presets:{ get(){ return PRESETS; }, configurable:true, enumerable:true },
  bossKits:{ get(){ return typeof BOSS_KITS!=='undefined'?BOSS_KITS:null; }, configurable:true, enumerable:true },
  fightLog:{ get(){ return { current:fightJSON(fight), history:fights.map(fightJSON) }; }, configurable:true, enumerable:true }
 });
}}catch(e){ try{ console.warn('DevX hooks failed', e); }catch(_){} }
// fight-simulator hooks (test.js --only fightsim): pacing internals, readable
// and, for fitting only, tunable without editing the file.
try{ Object.assign(window.__kriefne,{ compTotal, compXpScale, wavePlan, eHpScale, eHpScaleFoe, get foeHp(){ return FOE_HP; }, get waveWin(){ return WAVE_WIN; },
 retuneWaves(){ for(const k in _wavePlans) delete _wavePlans[k]; } }); }catch(e){}
fitCanvas();
requestAnimationFrame(frame);
})();
