/* KRIEFNE v2 — Neon Roguelite. Vanilla Canvas, zero deps.
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
const ctx = canvas.getContext('2d');
ctx.imageSmoothingEnabled = false;

// ---------- utils ----------
function clamp(v,a,b){ return v<a?a:(v>b?b:v); }
function dist2(ax,ay,bx,by){ const dx=ax-bx, dy=ay-by; return dx*dx+dy*dy; }
function len(x,y){ return Math.sqrt(x*x+y*y) || 0.0001; }
function mulberry32(a){ return function(){ a|=0; a=a+0x6D2B79F5|0; let t=Math.imul(a^a>>>15,1|a); t=t+Math.imul(t^t>>>7,61|t)^t; return ((t^t>>>14)>>>0)/4294967296; }; }
function circleHit(a,b){ const dx=a.x-b.x, dy=a.y-b.y, r=a.r+b.r; return dx*dx+dy*dy < r*r; }
function circleRect(cx,cy,cr,r){ const nx=clamp(cx,r.x,r.x+r.w), ny=clamp(cy,r.y,r.y+r.h); const dx=cx-nx, dy=cy-ny; return dx*dx+dy*dy < cr*cr; }
function resolveCircleRect(e,r){ const nx=clamp(e.x,r.x,r.x+r.w), ny=clamp(e.y,r.y,r.y+r.h); let dx=e.x-nx, dy=e.y-ny; let d=Math.sqrt(dx*dx+dy*dy); if(d < e.r){ if(d<0.001){ e.x=r.x-e.r-0.5; return; } const push=(e.r-d); e.x+=dx/d*push; e.y+=dy/d*push; } }
// ---------- convex polygon obstacles ----------
// A third obstacle kind beside rect and circle, so districts can be built from
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
let settings = { shake:true, particles:true, music:true, autofire:true, showSeed:true, musicVol:0.8, sfxVol:0.6 };
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
window.addEventListener('mouseup',()=>{ mouse.down=false; });
canvas.addEventListener('contextmenu',e=>e.preventDefault());
// auto-pause when the tab loses focus / window blurs / page occluded (alt-tab safe).
// Why a belt-and-braces approach: on alt-tab the browser often stalls rAF for the
// covered page WITHOUT firing visibilitychange, so the game freezes on its last frame
// and the pause overlay never paints. We therefore (a) pause on blur too, (b) run a
// 250ms watchdog on document.hasFocus(), and (c) paint one frame synchronously.
function clearInputs(){ try{ for(const k in keys) keys[k]=false; mouse.down=false; }catch(e){} }
function toPaused(auto){ clearInputs(); state='paused'; autoPaused=!!auto; setMusicCfg(PAUSE_MUS); try{ render(); }catch(e){} }
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

// ---------- data ----------
const THEMES=[
 {name:'Neon Alley', bg:'#0a0e1a', grid:'rgba(0,255,255,0.13)', wall:'#f0f', obs:'#101426', obsEdge:'#0ff', bass:[55,0,55,65.41,0,55,49,58.27], tempo:190, lwave:'square', lead:[440,0,523.25,0,587.33,0,523.25,392,440,0,523.25,659.25,0,587.33,523.25,0]},
 {name:'Data Market', bg:'#0c0a1c', grid:'rgba(255,0,255,0.13)', wall:'#0ff', obs:'#141026', obsEdge:'#f0f', bass:[49,0,49,58.27,0,49,43.65,51.91], tempo:180, lwave:'square', lead:[392,0,440,0,493.88,587.33,0,493.88,440,0,392,0,329.63,0,392,0]},
 {name:'Overpass', bg:'#081411', grid:'rgba(0,255,150,0.12)', wall:'#ff0', obs:'#0e1a14', obsEdge:'#0f6', bass:[65.41,0,65.41,73.42,0,65.41,55,62.23], tempo:200, lwave:'sawtooth', lead:[523.25,659.25,0,783.99,0,659.25,523.25,0,440,523.25,0,659.25,783.99,0,659.25,0]},
 {name:'Server Pit', bg:'#120812', grid:'rgba(255,150,0,0.12)', wall:'#0f6', obs:'#1c1018', obsEdge:'#fa0', bass:[43.65,0,43.65,49,0,55,43.65,41.2], tempo:175, lwave:'square', lead:[349.23,0,349.23,415.3,0,349.23,311.13,293.66,349.23,0,415.3,0,466.16,415.3,349.23,0]},
 {name:'Black Plaza', bg:'#05050f', grid:'rgba(150,150,255,0.14)', wall:'#f44', obs:'#0c0c1c', obsEdge:'#88f', bass:[36.71,0,36.71,43.65,0,36.71,34.65,38.89], tempo:205, lwave:'sawtooth', lead:[369.99,0,440,0,554.37,0,493.88,440,369.99,0,415.3,440,0,493.88,440,0]},
 {name:'Rooftop', bg:'#0a0616', grid:'rgba(255,0,150,0.16)', wall:'#ff2fb3', obs:'#160a20', obsEdge:'#f0f', bass:[55,55,0,65.41,55,0,49,58.27], tempo:185, lwave:'square', lead:[440,440,0,523.25,0,587.33,0,659.25,587.33,0,523.25,440,392,440,0,0]}
];
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
 overlord:'AN ENFORCER GUARDS THE GATE — OVERLORD has never once withdrawn. End the legend.',
 warden:'A CAPTAIN HOLDS THE LINE — WARDEN outlived the wall it guarded. It still guards the gap.',
 phantom:'A CAPTAIN WITHOUT A POST — PHANTOM runs dispatches for commanders you have not met.',
 leviathan:'A LORD OF THE DEEP LANE — LEVIATHAN answers to Sovereigns. Past here, nests call for help.',
 oracle:'A LORD WHO KEEPS THE BOOKS — ORACLE has already calculated this fight. Break its wards.',
 archon:'THE FIRST SOVEREIGN — ARCHON never fires first in a battle it wins. Its Lords fire for it.',
 basilisk:'A LORD OF QUARANTINE — do not meet BASILISK\'s eye. The survey team is still standing there.',
 harbinger:'A LORD WHO ANNOUNCES — HARBINGER wants you to see it coming. Read the walls; find the gap.',
 juggernaut:'A SOVEREIGN THAT CANNOT STEER — JUGGERNAUT commands by momentum alone. Get behind it.',
 nullifier:'A SOVEREIGN OF SILENCE — NULLIFIER needs you ordinary for four seconds. Keep moving.',
 chorus:'A SOVEREIGN IN THREE VOICES — CHORUS argues with itself, and every echo tells the truth.',
 singularity:'THE APEX — every rank you have fought answers to SINGULARITY. It answers to no one.'
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
 if(s<=clearedMax) return 'Sector pacified. Salvage crews thank you — replay to farm, or push deeper.';
 const pools=[
  'Static on the fringe channels. Something out there is counting your kills.',
  'The trail bends through '+thName+'. The locals stopped transmitting.',
  'Drift and static. The gate ahead has swallowed better pilots than you.',
  'Old maps call this stretch the Throat. It swallowed the cartographers too.',
  'Your hull still pings with the last fight. The next one is already listening.',
  'Neon ahead, silence behind. That is the whole job description.'];
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
// r: rarity 0 common (w10) / 1 uncommon (w5) / 2 rare (w2, ★ tag + jingle)
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
 {id:'pcell', name:'Portal Cell', desc:'ITEM: +2 recall charges (max 5)', req(p){ return p.charges<5; }, apply(p){ p.recallUnlocked=true; p.charges=Math.min(5,p.charges+2); }},
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
let hazards=[]; // lingering ground effects: mines, zones, spike fields, jammers
let strikes=[], beams=[]; // orbital cannon impacts, prism lance traces
let spawnQueue=[], spawnT=0; // wave director: queued reinforcements stream in off-screen
let bossWarnT=0, bossWarnTxt='';
let galaxySel=0, clearedMax=-1; // level selector: highest cleared sector idx, next unlocks
let shake=0, levelChoices=[], upgradeCounts={}, starterOffered=false;
let sectorCleared=false; // clear bonus fires once per sector, not per empty field
let pendingLevels=0;     // level-ups earned but not yet drafted (see gainXp)
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
// Layouts are structured districts (jittered city-grid blocks + a pylon landmark),
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
// Six recognisable district types instead of one grid and one scatter, so two
// sectors at the same depth no longer look like the same map with the blocks
// shuffled. Every one is still BFS-validated downstream.
const LAYOUTS=['districts','arena','corridors','plaza','spokes','scatter'];
function layoutDistricts(R,obs,C,idx){
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
function layoutPlaza(R,obs,C,idx){
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
 else if(kind==='plaza') layoutPlaza(R,obs,C,idx);
 else if(kind==='spokes') layoutSpokes(R,obs,C,idx);
 else if(kind==='scatter') layoutScatter(R,obs,C,idx);
 else layoutDistricts(R,obs,C,idx);
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
 // fallback: open plaza (always playable)
 return {seed:baseSeed>>>0, obs:[], theme, layout:'plaza-fallback', spawns:spawnTypes.map((_,i)=>({x:PX0+80+(i%4)*((PX1-PX0-160)/3),y:PY0+70})), port:{x:PX1-90,y:PY1-90}, validated:true, ratio:1, openFrac:1};
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
 overlord:{name:'OVERLORD',tier:1,debut:5,hp:985,r:30,spd:1.00,shape:'octa',col:'#f0f',pt:3.0,
  phases:['burst','summon','charge','sweep'],sig:null,recov:null,chaff:['drone','stalker']},
 warden:{name:'WARDEN',tier:2,debut:10,hp:1250,r:34,spd:0.80,shape:'hex',col:'#fc0',pt:3.5,
  phases:['spiral','summon','slam','twinwave'],sig:null,recov:'retreat',chaff:['drone','stalker']},
 phantom:{name:'PHANTOM',tier:2,debut:15,hp:760,r:26,spd:1.35,shape:'diamond',col:'#f0f',pt:9,
  phases:['skirmish'],sig:'laser',recov:'phase',chaff:['drone','mite']},
 leviathan:{name:'LEVIATHAN',tier:3,debut:30,hp:1700,r:36,spd:0.85,shape:'serpent',col:'#0f8',pt:4.0,
  phases:['tailsweep','mines','burrow','spiral'],sig:'segments',recov:'retreat',chaff:['mite','drone']},
 oracle:{name:'ORACLE',tier:3,debut:40,hp:1150,r:30,spd:0.90,shape:'eye',col:'#8cf',pt:3.6,
  phases:['clockbeam','zone','summon','burst'],sig:'wards',recov:'phase',chaff:['tempest','drone']},
 archon:{name:'ARCHON',tier:4,debut:50,hp:1800,r:34,spd:0.90,shape:'crown',col:'#ffd',pt:3.8,
  phases:['crossbeam','lieutenant','burst','slam'],sig:'command',recov:'retreat',chaff:['stalker','sniper'],commander:true},
 basilisk:{name:'BASILISK',tier:3,debut:60,hp:1350,r:31,spd:1.10,shape:'coil',col:'#9f4',pt:3.4,
  phases:['gaze','linecharge','spikes','fan'],sig:'petrify',recov:null,chaff:['stalker','mite']},
 harbinger:{name:'HARBINGER',tier:3,debut:70,hp:1100,r:29,spd:1.00,shape:'star',col:'#fa0',pt:3.2,
  phases:['spiralwall','meteor','fan','spiral'],sig:null,recov:null,chaff:['tempest','mite']},
 juggernaut:{name:'JUGGERNAUT',tier:4,debut:80,hp:1700,r:38,spd:0.95,shape:'ram',col:'#f62',pt:3.0,
  phases:['ram','slam','debris','ram'],sig:'vent',recov:null,chaff:['brute','drone']},
 nullifier:{name:'NULLIFIER',tier:4,debut:90,hp:1250,r:30,spd:1.00,shape:'prism',col:'#c8f',pt:3.4,
  phases:['disrupt','fan','summon','burst'],sig:'jam',recov:'phase',chaff:['sniper','stalker']},
 chorus:{name:'CHORUS',tier:4,debut:95,hp:1400,r:28,spd:1.05,shape:'triad',col:'#4df',pt:3.0,
  phases:['fan','spiral','summon','burst'],sig:'split',recov:null,chaff:['mite','drone']},
 singularity:{name:'SINGULARITY',tier:5,debut:100,hp:1950,r:40,spd:0.85,shape:'well',col:'#b6f',pt:4.0,
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
 starterOffered=false; pendingLevels=0;
 loadArena(0); // live world behind the hub; entering S1 reloads it fresh
 galaxySel=0; clearedMax=-1;
 setMusicCfg(TITLE_MUS);
 state='galaxy'; autoPaused=false;
}
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
 if(boss){ bossWarnT=2.5; bossWarnTxt='!! '+bossKindsFor(s).join(' + ').toUpperCase()+' !!'; SFX.alarm(); }
  setMusicCfg(g.theme);
  addFloater(player.x,player.y-30,sectorName(s)+' · '+g.theme.name+' · seed '+g.seed,'#8affff');
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
 for(let i=0;i<n;i++){ const a=Math.random()*6.283; const s=(0.4+Math.random()*0.6)*spd; parts.push({x,y,vx:Math.cos(a)*s,vy:Math.sin(a)*s,life:life*(0.6+Math.random()*0.6),maxlife:life,col,r:size*(0.6+Math.random()*0.8)}); }
}
function zapFx(x1,y1,x2,y2){ for(let i=0;i<=8;i++){ const t=i/8; parts.push({x:x1+(x2-x1)*t+(Math.random()-0.5)*10,y:y1+(y2-y1)*t+(Math.random()-0.5)*10,vx:0,vy:0,life:0.15,maxlife:0.15,col:'#8ff',r:3}); } }
function addFloater(x,y,txt,col){ floaters.push({x,y,txt,col:col||'#fff',life:0.9}); }
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
// Sector-clear / Magnet Core vacuum: bank every gem on the field at once.
// The credit is instantaneous and conservation is covered by tests, but it used
// to be completely SILENT — the field just emptied, and if the lump crossed a
// level the XP bar reset to a small remainder. That reads as "my XP vanished",
// which is exactly what was reported. So show the collection: a streak from each
// gem toward the ship, and a running total.
function collectGems(){
 let t=0;
 for(const g of gems){
  t+=g.v;
  for(let k=1;k<=3;k++){ const f=k/4;
   parts.push({x:g.x+(player.x-g.x)*f, y:g.y+(player.y-g.y)*f, vx:0, vy:0,
    life:0.30+f*0.20, maxlife:0.5, col:'#3ff', r:3.2});
  }
 }
 gems.length=0;
 if(t>0){
  const shown=Math.round(t*player.xpBonus);
  addFloater(player.x,player.y-40,'+'+shown+' XP','#3ff');
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
  openDraft(picks);
}
// Single exit for every draft, starter included. Endless runs eventually exhaust
// a capped pool; without a repeatable filler the draft opens with zero cards and
// the 1/2/3 handler throws on undefined — a hard softlock at the exact moment a
// run is going well.
function openDraft(picks){
 if(!picks.length) picks=[REFIT];
 levelChoices=picks; state='levelup'; SFX.levelup();
}
function pickUpgrade(u){
 if(!u) return;
 upgradeCounts[u.id]=(upgradeCounts[u.id]||0)+1; u.apply(player);
 addFloater(player.x,player.y-24,u.name,'#0ff');
 if(u.r===2) SFX.rare(); else SFX.upgrade();
 state='playing';
 if(pendingLevels>0){ pendingLevels--; openLevelUp(); } // drain queued level-ups
}
function scoreCalc(){ return kills*50+arenasCleared*250+player.level*100+Math.max(0,1800-Math.floor(timeSec)*5); }
function die(){ state='gameover'; const s=scoreCalc(); if(s>best) best=s; depth=Math.max(depth,arenaIdx+1); saveMeta(); SFX.lose(); stopMusic(); spawnBurst(player.x,player.y,40,'#f0f',260,0.8,4); }

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
 addFloater(e.x,e.y-44,e.bname+' RETREATS — chase it down!','#fc0'); SFX.portal();
}
// PHANTOM phase: go translucent on the spot — kill every minion to break it out.
// It absorbs rounds at 30% damage while phased; it is never bullet-transparent.
function bossPhase(e){
 e.mode='phase'; e.modeT=4.5; e.phased=true; e.charging=false; e.laser=null; e.beamT=0;
 e.healPool=e.maxhp*RECOV_HEAL; e.spawned=[];
 const nm=2+(arenaIdx>=15?1:0);
 for(let k=0;k<nm&&enemies.length<16;k++){ const s2=nearSpot(player.x,player.y,200,330,26); const m=mkEnemy(k?'mite':'drone',s2.x,s2.y,arenaIdx); m.spawnT=0.9; enemies.push(m); e.spawned.push(m.uid); }
 rings.push({x:e.x,y:e.y,r:10,maxR:120,spd:320,dmg:0,hit:true});
 addFloater(e.x,e.y-44,e.bname+' PHASES — kill minions!','#c8f'); SFX.portal();
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
 addFloater(e.x,e.y-46,(e.bname||'BOSS')+' REPOSITIONS','#fc0'); SFX.portal();
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
 if(made) addFloater(e.x,e.y-44,'SUMMON','#f0f');
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
 addFloater(e.x,e.y-46,e.bname+' CALLS '+TIER_NAMES[lt.def.tier]+' '+lt.def.name,'#ffd'); SFX.alarm();
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
   if(!e.chargeOn){ e.chargeOn=true; e.chargeDx=nx; e.chargeDy=ny; addFloater(e.x,e.y-44,'CHARGE!','#ff0'); }
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
    SFX.ring(); if(settings.shake) shake=Math.min(10,shake+4); spawnBurst(e.x,e.y,14,'#fc0',220,0.5,3); }
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
    hazards.push({x:e.x+(Math.random()-0.5)*90,y:e.y+(Math.random()-0.5)*90,r:52,t:0,life:6,dmg:Math.round(e.dmg*0.5),tick:0,col:'#0f8'});
    SFX.click(); }
   break;
  case 'burrow': // submerge and resurface under the player, telegraphed
   if(!e.burrowT){ e.burrowT=1.2; e.burrowX=p.x; e.burrowY=p.y; addFloater(e.x,e.y-44,'BURROWS','#0f8'); SFX.portal(); }
   e.burrowT-=dt;
   if(e.burrowT<=0){ e.burrowT=0;
    e.x=clamp(e.burrowX,PX0+e.r,PX1-e.r); e.y=clamp(e.burrowY,PY0+e.r,PY1-e.r); resolveObstacles(e);
    rings.push({x:e.x,y:e.y,r:14,maxR:150,spd:320,dmg:e.dmg,hit:false,heavy:true});
    spawnBurst(e.x,e.y,20,'#0f8',240,0.6,3); SFX.ring(); }
   break;
  case 'clockbeam': // ORACLE: a slow rotating hand — walk with it, not into it
   mv(0.25); e.spirT-=dt;
   if(e.spirT<=0){ e.spirT=0.10; const a=e.phaseT*1.5;
    eshot(e,a,240,5,0.7,2.6); eshot(e,a+3.1416,240,5,0.7,2.6); }
   break;
  case 'zone': // a damaging field parked on you — move house
   mv(0.35); e.zoneT-=dt;
   if(e.zoneT<=0){ e.zoneT=2.6;
    hazards.push({x:p.x,y:p.y,r:78,t:0,life:4.5,dmg:Math.round(e.dmg*0.45),tick:0,col:'#8cf',warn:0.7});
    SFX.click(); }
   break;
  case 'gaze': // BASILISK: telegraphed cone that roots you where you stand
   mv(0.4); e.gazeT-=dt;
   if(e.gaze){ e.gaze.t-=dt;
    if(e.gaze.t<=0){ const a=e.gaze.ang;
     let da=Math.abs(((aim-a+Math.PI)%6.283)-Math.PI);
     if(da<0.45&&d<430){ p.rootT=Math.max(p.rootT||0,1.0); hurtPlayer(Math.round(e.dmg*0.8),true); addFloater(p.x,p.y-30,'PETRIFIED','#9f4'); }
     for(let k=0;k<9;k++) parts.push({x:e.x+Math.cos(a)*k*46,y:e.y+Math.sin(a)*k*46,vx:0,vy:0,life:0.3,maxlife:0.3,col:'#9f4',r:5});
     e.gaze=null; e.gazeT=enrage?2.6:4; SFX.eshoot(); } }
   else if(e.gazeT<=0){ e.gaze={t:0.75,ang:aim}; SFX.click(); }
   break;
  case 'linecharge': // commits along a straight line, leaving spikes behind
   if(!e.chargeOn){ e.chargeOn=true; e.chargeDx=nx; e.chargeDy=ny; addFloater(e.x,e.y-44,'LUNGE!','#9f4'); }
   e.charging=true;
   e.x+=e.chargeDx*320*dt; e.y+=e.chargeDy*320*dt;
   e.burstT-=dt;
   if(e.burstT<=0){ e.burstT=0.22; hazards.push({x:e.x,y:e.y,r:30,t:0,life:4,dmg:Math.round(e.dmg*0.35),tick:0,col:'#9f4'}); }
   break;
  case 'spikes':
   mv(0.5); e.burstT-=dt;
   if(e.burstT<=0){ e.burstT=1.0;
    for(let k=0;k<3;k++){ const a=aim+(k-1)*0.7, rr=140+Math.random()*130;
     hazards.push({x:e.x+Math.cos(a)*rr,y:e.y+Math.sin(a)*rr,r:36,t:0,life:4.5,dmg:Math.round(e.dmg*0.4),tick:0,col:'#9f4',warn:0.5}); } }
   break;
  case 'ram': // JUGGERNAUT: repeated commits, shockwave on wall impact
   e.ramT-=dt;
   if(!e.chargeOn&&e.ramT<=0){ e.chargeOn=true; e.chargeDx=nx; e.chargeDy=ny; e.facing=Math.atan2(ny,nx); addFloater(e.x,e.y-46,'RAM!','#f62'); SFX.alarm(); }
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
     if(settings.shake) shake=Math.min(12,shake+6); spawnBurst(e.x,e.y,22,'#f62',260,0.6,4); SFX.ring(); }
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
    hazards.push({x:p.x,y:p.y,r:96,t:0,life:4,dmg:0,tick:0,col:'#c8f',warn:0.6,jam:true});
    addFloater(e.x,e.y-46,'DISRUPTOR FIELD','#c8f'); SFX.alarm(); }
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
     for(let k=0;k<=10;k++) parts.push({x:e.x+dx2*k*70,y:e.y+dy2*k*70,vx:0,vy:0,life:0.25,maxlife:0.25,col:'#0ff',r:5});
     SFX.eshoot();
     if(Math.hypot(p.x-cx,p.y-cy)<16) hurtPlayer(e.dmg+8,true); } }
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
     e.contactCd=0.7; hurtPlayer(Math.round(e.dmg*0.6),true); }
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
    addFloater(e.x,e.y-48,'CHORUS FRACTURES','#4df'); SFX.brk();
   }
   break; }
  case 'wellpull': break; // handled by the gravity phase
 }
}
function bossLabel(e){
 if(e.mode==='phase') return 'PHASED';
 if(e.mode==='retreat') return 'RETREAT';
 if(e.mode!=='hunt') return '!';
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
 parts.push({x:p.x+Math.cos(base)*15,y:p.y+Math.sin(base)*15,vx:0,vy:0,life:0.06,maxlife:0.06,col:'#ff0',r:4});
}
function shieldBlock(msg,col){ const p=player; p.invuln=Math.max(p.invuln,0.4); addFloater(p.x,p.y-20,msg,col); SFX.block(); spawnBurst(p.x,p.y,10,col,180,0.4,3); }
// heavy=true: sniper/tempest bolts, brute rings, boss contact+bursts (blocked by Crit Ward)
function hurtPlayer(dmg,heavy){
 const p=player; if(p.invuln>0||p.dashT>0||state!=='playing') return;
 if(heavy&&p.mirrorUp){ p.mirrorUp=false; shieldBlock('CRIT BLOCKED','#c8f'); return; }
 if(p.wardUp){ p.wardUp=false; shieldBlock('WARDED','#fff'); return; }
 if(p.bulwark>0){ p.bulwark--; if(p.bulwark<=0){ addFloater(p.x,p.y-20,'BULWARK DOWN','#fa0'); SFX.brk(); } else shieldBlock('BLOCKED ('+p.bulwark+' left)','#fc0'); p.invuln=Math.max(p.invuln,0.4); return; }
 if(p.barrier>0){ const take=Math.min(p.barrier,dmg); p.barrier-=take; dmg-=take; spawnBurst(p.x,p.y,8,'#0fc',170,0.4,3);
  if(p.barrier<=0){ addFloater(p.x,p.y-20,'BARRIER DOWN','#0fc'); SFX.brk(); } else addFloater(p.x,p.y-20,'ABSORBED ('+Math.ceil(p.barrier)+' left)','#0fc');
  p.invuln=Math.max(p.invuln,0.4); SFX.block(); if(dmg<=0) return; }
 if(p.shieldReady){ p.shieldReady=false; p.shieldT=p.shieldCdMax; shieldBlock('BLOCKED','#0ff'); return; }
 p.hp-=dmg; p.flash=0.15; p.invuln=0.35; p.lastHurt=timeSec;
 if(settings.shake) shake=Math.min(10,shake+4);
 addFloater(p.x,p.y-18,'-'+Math.round(dmg),'#f55'); SFX.hurt();
 spawnBurst(p.x,p.y,8,'#f00',200,0.5,3);
 if(p.hp<=0){ if(p.stasisN>0){ p.stasisN--; p.hp=p.stasisTier>=3?p.maxhp:(p.stasisTier===2?Math.ceil(p.maxhp*0.25):1); p.invuln=2.5; rings.push({x:p.x,y:p.y,r:20,maxR:260,spd:420,dmg:0,hit:true}); spawnBurst(p.x,p.y,40,'#c8f',300,0.9,4); addFloater(p.x,p.y-28,'STASIS! ('+p.stasisN+' left)','#c8f'); SFX.stasis(); return; } if(p.secondWind){ p.secondWind=false; p.hp=Math.ceil(p.maxhp*0.5); p.invuln=2; rings.push({x:p.x,y:p.y,r:20,maxR:200,spd:380,dmg:0,hit:true}); spawnBurst(p.x,p.y,30,'#0f6',260,0.8,4); addFloater(p.x,p.y-28,'SECOND WIND!','#0f6'); SFX.levelup(); return; } p.hp=0; die(); }
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
  codexKills[cid]=true; saveCodex();
  const nm=e.type==='boss'?(BOSSDEF[cid]?BOSSDEF[cid].name:cid):cid.toUpperCase();
  addFloater(e.x,e.y-58,'CODEX UNLOCKED · '+nm+' [C]','#8cf');
 }
 if(e.type==='mite'&&enemies.length<20){ for(let k=0;k<2;k++){ const m=mkEnemy('drone',e.x+(Math.random()-0.5)*30,e.y+(Math.random()-0.5)*30,arenaIdx); enemies.push(m); } addFloater(e.x,e.y-16,'SPLIT!','#f0f'); }
 spawnBurst(e.x,e.y,e.type==='boss'?50:(e.type==='brute'?22:12),e.type==='boss'?'#f0f':'#0ff',240,0.6,3);
 SFX.die();
  const n=e.type==='brute'?3:(e.type==='boss'?8:1);
  const gemV=Math.max(1,Math.round(e.xp/n*(1+0.12*arenaIdx))); // later arenas pay more: pacing stays smooth
  for(let k=0;k<n;k++) gems.push({x:e.x+(Math.random()-0.5)*24,y:e.y+(Math.random()-0.5)*24,v:gemV,t:0});
 if(player.vamp>0&&!over){ player.hp=Math.min(player.maxhp,player.hp+player.vamp); addFloater(player.x,player.y-26,'+'+player.vamp,'#0f0'); }
 if(player.surgeLvl>0){ player.surgeT=Math.min(5,player.surgeT+2.5); }
 // SHRAPNEL CORE: the corpse is the weapon
 if(player.shrap>0) splashDamage(e.x,e.y,62+16*player.shrap,10*player.dmgMult*player.shrap,'#fc6',e.uid);
 // KINETIC DISCHARGE: charges on kills, releases a shockwave at the threshold
 if(player.shockOn){
  player.shockKills++;
  if(player.shockKills>=player.shockNeed){
   player.shockKills=0;
   const R=player.shockR, dmg=player.shockDmg*player.dmgMult;
   rings.push({x:player.x,y:player.y,r:18,maxR:R,spd:520,dmg:0,hit:true});
   const snap=enemies.slice();
   for(let j=snap.length-1;j>=0;j--){ const o=snap[j]; if(o.dead) continue;
    if(dist2(player.x,player.y,o.x,o.y)>R*R) continue;
    if(player.shockChill>0) o.slowT=Math.max(o.slowT,1.2+0.5*player.shockChill);
    damageEnemy(o,dmg,'#0ff',o.x,o.y);
    if(o.hp<=0){ const ix=enemies.indexOf(o); if(ix>=0) killEnemy(ix); } }
   spawnBurst(player.x,player.y,26,'#0ff',300,0.7,4);
   addFloater(player.x,player.y-32,'DISCHARGE!','#0ff');
   if(settings.shake) shake=Math.min(10,shake+4);
   tone('sine',200,900,0.32,0.18);
  }
 }
 if(e.type==='boss'){
  // Lieutenants are somebody else's minions: they do not bank the permanent
  // +2% damage, or an ARCHON nest would be a damage-meta farm.
  if(!e.lieutenant){ bosses++; saveMeta(); }
  if(over) return;
  player.hp=Math.min(player.maxhp,player.hp+(e.lieutenant?10:30));
  const left=enemies.filter(o=>o.type==='boss').length;
  if(left>0){ addFloater(player.x,player.y-34,'BOSS DOWN — '+left+' LEFT','#ff0'); SFX.win(); }
  else { addFloater(player.x,player.y-34,'NEST CLEARED! bonus draft','#ff0'); SFX.win(); openLevelUp(); }
  return; }
 // Sector-clear bonus, ONCE per sector. The field empties repeatedly between
 // reinforcement batches, so the old unguarded `enemies.length===0` test paid
 // +10 HP and +250 score every single time the last drone on screen died —
 // free sustain all round long and badly inflated scores.
 if(enemies.length===0&&spawnQueue.length===0&&!sectorCleared&&!over){
  sectorCleared=true; player.hp=Math.min(player.maxhp,player.hp+10);
  addFloater(player.x,player.y-30,'SECTOR CLEAR +10 HP','#0f0');
 }
}
// clearing a sector returns to the galaxy hub with the next sector unlocked
function nextArena(){ if(state!=='playing') return; SFX.portal(); arenasCleared=Math.max(arenasCleared,arenaIdx+1); clearedMax=Math.max(clearedMax,arenaIdx); galaxySel=arenaIdx+1; setMusicCfg(TITLE_MUS); state='galaxy'; }
function loadSector(i){ loadArena(i); galaxySel=i; state='playing'; autoPaused=false; }
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
 if(!p.recallUnlocked){ if(p.lockMsgCd<=0){ p.lockMsgCd=1; addFloater(p.x,p.y-24,'RECALL LOCKED: Portal Cell','#888'); } return; }
 if(p.jamT>0){ if(p.lockMsgCd<=0){ p.lockMsgCd=1; addFloater(p.x,p.y-24,'SYSTEMS JAMMED','#c8f'); } return; }
 if(p.channel){ p.channel=null; addFloater(p.x,p.y-24,'BLINK OFF','#888'); SFX.click(); return; }
 if(!p.recall){
  if(p.charges>0){ p.charges--; p.recall={x:p.x,y:p.y}; addFloater(p.x,p.y-24,'GATE SET ('+p.charges+' left)','#ff0'); SFX.upgrade(); spawnBurst(p.x,p.y,8,'#ff0',140,0.4,2.5); }
  else if(p.lockMsgCd<=0){ p.lockMsgCd=1; addFloater(p.x,p.y-24,'NO CHARGES: Portal Cell','#888'); }
  return;
 }
 const d=Math.hypot(p.x-p.recall.x,p.y-p.recall.y);
 if(d<44){ p.recall.x=p.x; p.recall.y=p.y; addFloater(p.x,p.y-24,'GATE MOVED','#ff0'); SFX.click(); return; }
 if(d>p.gateRange){ if(p.lockMsgCd<=0){ p.lockMsgCd=1; addFloater(p.x,p.y-24,'GATE OUT OF RANGE','#888'); } return; }
 if(p.recallCd>0){ if(p.lockMsgCd<=0){ p.lockMsgCd=1; addFloater(p.x,p.y-24,'GATE '+p.recallCd.toFixed(1)+'s','#888'); } return; }
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
 addFloater(hx===undefined?e.x:hx,(hy===undefined?e.y:hy)-14,Math.round(dmg),col||'#fff');
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
 rings.push({x,y,r:4,maxR:r,spd:r*4,dmg:0,hit:true});
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
  spawnBurst(hx,hy,3,'#8cf',150,0.25,2);
  if(w.hp<=0){ e.wards.shift(); spawnBurst(e.x,e.y,12,'#8cf',220,0.5,3); SFX.brk();
   if(!e.wards.length){ e.wardsBroken=true; e.shielded=false; addFloater(e.x,e.y-50,'WARDS DOWN — EXPOSED','#ff0'); }
   else addFloater(e.x,e.y-50,'WARD BROKEN ('+e.wards.length+' left)','#8cf'); }
 }
 // JUGGERNAUT: armoured prow, exposed rear vent. It locks its facing while
 // ramming, so flanking a charge is the whole fight.
 if(e.def&&e.def.sig==='vent'){
  // Narrow arcs on purpose: an 80-degree prow and a 95-degree vent, with the
  // whole flank neutral. A wide frontal shield on a boss that always faces you
  // is not a positioning puzzle, it is just a damage tax.
  const a=Math.atan2(hy-e.y,hx-e.x);
  const da=Math.abs(((a-(e.facing||0)+Math.PI)%6.283)-Math.PI);
  if(da<0.7){ dmg*=0.6; spawnBurst(hx,hy,3,'#999',150,0.25,2); }
  else if(da>2.3){ dmg*=1.9; addFloater(hx,hy-20,'VENT!','#ff0'); }
 }
 e.hp-=dmg; e.lastHit=timeSec; e.flash=Math.max(e.flash,0.08);
 if(!phased){ if(b.burn>0){ e.burnT=2; e.burnDps=b.burn; } if(b.chill>0) e.slowT=Math.max(e.slowT,b.chill); }
 addFloater(hx,hy-14,Math.round(dmg)+(b.crit?'!':''),phased?'#c8f':(b.crit?'#ff0':'#fff'));
 spawnBurst(hx,hy,b.crit?8:4,phased?'#c8f':'#ff9',180,0.35,2.5);
 if(e.type==='boss') spawnBurst(hx,hy,3,'#fff',130,0.22,2);
 SFX.hit();
 // FLAK: detonate on contact. Splash is deliberately weaker than the round that
 // caused it, so it thickens crowd clear without doubling single-target damage.
 if(b.flak>0){ const r=54+18*b.flak;
  spawnBurst(hx,hy,10,'#fa0',220,0.4,3);
  splashDamage(hx,hy,r,b.dmg*0.38*b.flak,'#fa0',e.uid); }
 // CHAIN SHOT: one short arc to a different nearby foe
 if(b.chain>0){ let bd=210*210, be=null;
  for(const o of enemies){ if(o===e||o.phased) continue; const dd=dist2(hx,hy,o.x,o.y); if(dd<bd){ bd=dd; be=o; } }
  if(be){ zapFx(hx,hy,be.x,be.y); damageEnemy(be,b.dmg*0.45*b.chain,'#8ff',be.x,be.y);
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
  if(p.aegisLvl>0&&!p.shieldReady){ p.shieldT-=dt; if(p.shieldT<=0){ p.shieldReady=true; addFloater(p.x,p.y-24,'AEGIS UP','#0ff'); SFX.upgrade(); } }
  // ability systems: frost nova / tesla arc / guardian orbit
  if(p.novaLvl>0){ p.novaT-=dt; if(p.novaT<=0){ p.novaT=6-1.5*(p.novaLvl-1); const R=200+50*p.novaLvl; rings.push({x:p.x,y:p.y,r:20,maxR:R,spd:420,dmg:0,hit:true}); for(const e of enemies){ if(dist2(p.x,p.y,e.x,e.y)<R*R){ e.slowT=2; e.flash=Math.max(e.flash,0.1); } } spawnBurst(p.x,p.y,10,'#8ff',180,0.5,3); tone('sine',900,200,0.3,0.12); } }
  if(p.teslaLvl>0){ p.teslaT-=dt; if(p.teslaT<=0){ p.teslaT=3; let from={x:p.x,y:p.y}; const hit=[]; for(let c=0;c<=p.teslaLvl;c++){ let bd=(c===0?320:220); bd*=bd; let be=null; for(const e of enemies){ if(e.phased||hit.indexOf(e.uid)>=0) continue; const d=dist2(from.x,from.y,e.x,e.y); if(d<bd){ bd=d; be=e; } } if(!be) break; const dmg=22*p.dmgMult; be.hp-=dmg; be.lastHit=timeSec; be.flash=0.1; addFloater(be.x,be.y-14,Math.round(dmg),'#8ff'); zapFx(from.x,from.y,be.x,be.y); SFX.hit(); hit.push(be.uid); from=be; if(be.hp<=0){ const ix=enemies.indexOf(be); if(ix>=0) killEnemy(ix); } } } }
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
     damageEnemy(e,dmg,'#8ff',e.x,e.y);
     if(e.hp<=0){ const ix=enemies.indexOf(e); if(ix>=0) killEnemy(ix); } }
    beams.push({x:p.x,y:p.y,a,len:reach,w,t:0,life:0.28});
    tone('sawtooth',1400,300,0.22,0.13);
   }
  }
  if(p.orbs>0){ p.orbAng+=dt*2.6; const odmg=15*p.dmgMult; for(let k=0;k<p.orbs;k++){ const a=p.orbAng+k*6.283/p.orbs; const ox=p.x+Math.cos(a)*34, oy=p.y+Math.sin(a)*34; const snap=enemies.slice(); for(let j=snap.length-1;j>=0;j--){ const e=snap[j]; if(e.dead||e.phased) continue; const dx=e.x-ox, dy=e.y-oy; if(dx*dx+dy*dy<(e.r+8)*(e.r+8)&&e.orbCd<=0){ e.orbCd=0.45; e.hp-=odmg; e.lastHit=timeSec; e.flash=0.1; addFloater(e.x,e.y-12,Math.round(odmg),'#fc0'); spawnBurst(ox,oy,4,'#fc0',160,0.3,2.5); SFX.hit(); if(e.hp<=0) killEnemy(enemies.indexOf(e)); } } } }
 if(p.channel){ p.channel.t-=dt; parts.push({x:p.x+(Math.random()-0.5)*20,y:p.y+(Math.random()-0.5)*20,vx:0,vy:0,life:0.2,maxlife:0.2,col:'#ff0',r:2.5});
  if(p.channel.t<=0){ const c=p.channel; p.channel=null; spawnBurst(p.x,p.y,12,'#ff0',200,0.5,3);
   p.x=clamp(c.tx,PX0+p.r,PX1-p.r); p.y=clamp(c.ty,PY0+p.r,PY1-p.r); resolveObstacles(p);
   p.invuln=Math.max(p.invuln,0.5); p.recallCd=p.recallCdMax;
   spawnBurst(p.x,p.y,14,'#ff0',220,0.5,3); addFloater(p.x,p.y-24,'RECALL!','#ff0'); SFX.portal(); } }
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
  if(p.dashT>0){ p.x+=p.dashDx*1050*dt; p.y+=p.dashDy*1050*dt; parts.push({x:p.x,y:p.y,vx:0,vy:0,life:0.3,maxlife:0.3,col:'#0ff',r:5}); }
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
    if(b.bounce>0){ b.bounce--; if(reflectBullet(b,dt)){ spawnBurst(b.x,b.y,3,'#fa0',120,0.3,2); SFX.click(); b.px=b.x; b.py=b.y; } else dead=true; }
    else { spawnBurst(b.x,b.y,3,'#0ff',120,0.3,2); dead=true; }
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
   if(!dead&&segCircleT(b.px,b.py,b.x,b.y,p.x,p.y,p.r+b.r)>=0){ hurtPlayer(b.dmg,b.heavy); dead=true; }
   if(dead) ebullets.splice(i,1);
  }
  // Orbital strikes: land after their telegraph, then damage everything inside.
  // Targeted where the enemy WAS, so a moving target can still slip the circle.
  for(let i=strikes.length-1;i>=0;i--){ const s=strikes[i]; s.t+=dt;
   if(s.t>=s.warn){
    splashDamage(s.x,s.y,s.r,s.dmg,'#ff0');
    spawnBurst(s.x,s.y,22,'#ff0',300,0.6,4);
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
    if(h.jam){ p.jamT=Math.max(p.jamT,0.6); if(p.channel){ p.channel=null; addFloater(p.x,p.y-24,'BLINK JAMMED','#c8f'); } }
    if(h.dmg>0){ h.tick-=dt; if(h.tick<=0){ h.tick=0.6; hurtPlayer(h.dmg,false); } }
   }
   if(h.t>=h.life) hazards.splice(i,1);
  }
  // shock rings (brute)
   for(let i=rings.length-1;i>=0;i--){ const g=rings[i]; g.r+=g.spd*dt;
    if(g.dmg>0&&!g.hit){ const d=Math.hypot(p.x-g.x,p.y-g.y); if(Math.abs(d-g.r)<14){ g.hit=true; hurtPlayer(g.dmg,g.heavy); } }
   if(g.r>=g.maxR) rings.splice(i,1);
  }
  // enemies
  const esnap=enemies.slice();
  for(let j=esnap.length-1;j>=0;j--){ const e=esnap[j]; if(e.dead) continue; e.t+=dt; e.flash-=dt; e.contactCd-=dt; if(e.orbCd>0)e.orbCd-=dt; if(e.spawnT>0)e.spawnT-=dt;
   if(e.burnT>0){ e.burnT-=dt; if(!e.phased){ e.hp-=e.burnDps*dt; e.lastHit=timeSec; e.flash=Math.max(e.flash,0.05); if(Math.random()<dt*10) parts.push({x:e.x+(Math.random()-0.5)*10,y:e.y+(Math.random()-0.5)*10,vx:0,vy:-40,life:0.3,maxlife:0.3,col:'#fa0',r:3}); if(e.hp<=0){ killEnemy(enemies.indexOf(e)); continue; } } }
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
     if(e.windup>0){ e.windup-=dt; if(e.windup<=0){ rings.push({x:e.x,y:e.y,r:20,maxR:110+Math.min(60,arenaIdx*6),spd:260,dmg:e.dmg,hit:false,heavy:true}); SFX.ring(); if(settings.shake) shake=Math.min(10,shake+3); spawnBurst(e.x,e.y,12,'#f80',200,0.5,3); } }
     else { const sv=steer(e,nx,ny); e.x+=sv[0]*e.sp*sF*dt; e.y+=sv[1]*e.sp*sF*dt; e.slamCd-=dt; if(d<95&&e.slamCd<=0){ e.windup=0.6; e.slamCd=Math.max(1.6,2.6-arenaIdx*0.12); } }
    }
   else if(e.type==='boss'){
    const enrage=e.hp<e.maxhp*0.3||e.hardEnrage;
    if(e.beamT>0) e.beamT-=dt;
    e.fightT+=dt; if(e.recovCd>0) e.recovCd-=dt;
    // safety valve: a fight that has run three minutes stops offering outs
    if(!e.hardEnrage&&e.fightT>BOSS_HARD_ENRAGE){ e.hardEnrage=true; e.recovLeft=0; e.healPool=0;
     if(e.mode==='phase'||e.mode==='retreat'){ e.phased=false; e.mode='hunt'; e.modeT=8; }
     addFloater(e.x,e.y-52,(e.bname||'BOSS')+' RELENTLESS','#f00'); SFX.alarm(); }
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
     addFloater(e.x,e.y-44,(e.bname||'BOSS')+' DESPERATE!','#f00'); SFX.alarm();
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
   if(!e.phased&&circleHit(e,p)&&e.contactCd<=0){ e.contactCd=0.6; if(e.type!=='brute'||e.windup<=0) hurtPlayer(e.type==='boss'?e.dmg:e.dmg,(e.type==='boss'||e.type==='brute')); }
  }
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
   // on top of them; leftover gems vacuum in — nothing sits out of magnet range.
   // The pre-validated arena.port is the fallback if no near spot is free.
   let q=null;
   for(let t=0;t<40&&!q;t++){ const a=Math.random()*6.283, d=250+Math.random()*300;
    const x=clamp(p.x+Math.cos(a)*d,PX0+30,PX1-30), y=clamp(p.y+Math.sin(a)*d,PY0+30,PY1-30);
    if(Math.hypot(x-p.x,y-p.y)<230) continue;
    if(pointBlocked(x,y,26,arena.obs)) continue;
    q={x,y}; }
   portal={x:(q||arena.port).x,y:(q||arena.port).y,r:20,t:0}; SFX.portal(); collectGems();
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
 for(let i=floaters.length-1;i>=0;i--){ const f=floaters[i]; f.y-=34*dt; f.life-=dt; if(f.life<=0) floaters.splice(i,1); }
}

// ---------- input actions ----------
function handleKeyPress(code){
 ac();
 if(code==='KeyM'){ muted=!muted; applyVol(); return; }
  if(state==='title'){
   ensureTitleMusic();
   if(code==='Enter'||code==='Space'){ SFX.click(); startRun(); }
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
  if(state==='gameover'){ if(code==='KeyR'||code==='Enter'||code==='Space'){ SFX.click(); startRun(); } if(code==='Escape'){ state='title'; ensureTitleMusic(); } return; }
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
  if(state==='levelup'){ if(code==='Digit1'&&levelChoices[0]) pickUpgrade(levelChoices[0]); if(code==='Digit2'&&levelChoices[1]) pickUpgrade(levelChoices[1]); if(code==='Digit3'&&levelChoices[2]) pickUpgrade(levelChoices[2]); return; }
  if(state==='galaxy'){
   if(code==='Enter'||code==='Space'){ galaxyConfirm(); return; }
   if(code==='ArrowRight'||code==='ArrowLeft'){ const ns=clamp(galaxySel+(code==='ArrowRight'?1:-1),0,clearedMax+1); if(ns!==galaxySel){ galaxySel=ns; SFX.click(); } else SFX.brk(); return; }
   if(code==='Escape'){ state='title'; ensureTitleMusic(); SFX.click(); return; }
   if(code==='KeyO'){ openSettings('galaxy'); return; }
   if(code==='KeyH'||code==='F1'){ openHelp('galaxy'); return; }
   if(code==='KeyC'){ openCodex('galaxy'); return; }
   return; }
  if(state==='playing'){
   if(code==='Escape'||code==='KeyP'){ toPaused(false); SFX.click(); return; }
  if(code==='KeyT'){ player.autoFire=!player.autoFire; addFloater(player.x,player.y-24,player.autoFire?'AUTO ON':'AUTO OFF','#ff0'); return; }
  if(code==='KeyH'||code==='F1'){ openHelp('paused'); state='help'; helpFrom='playing-paused'; return; }
  if(code==='KeyC'){ openCodex('playing-paused'); return; } // look up what just hit you
  if(code==='KeyO'){ openSettings('paused'); settingsFrom='playing-paused'; return; }
  if(code==='Space'||code==='ShiftLeft'||code==='ShiftRight'){ tryDash(); return; }
  if(code==='KeyE'){ doPortalKey(); return; }
  return;
 }
 if(state==='paused'){ if(code==='Escape'||code==='KeyP'){ toPlaying(); SFX.click(); } if(code==='KeyR'){ startRun(); } if(code==='KeyO') openSettings('paused'); if(code==='KeyH') openHelp('paused'); if(code==='KeyC') openCodex('paused'); return; }
}
function tryDash(){
 const p=player; if(!p||state!=='playing') return;
 if(!p.dashUnlocked){ if(p.lockMsgCd<=0){ p.lockMsgCd=1; addFloater(p.x,p.y-24,'DASH LOCKED: Ion Thrusters','#888'); } return; }
 if(p.jamT>0){ if(p.lockMsgCd<=0){ p.lockMsgCd=1; addFloater(p.x,p.y-24,'SYSTEMS JAMMED','#c8f'); } return; }
 if(p.rootT>0){ if(p.lockMsgCd<=0){ p.lockMsgCd=1; addFloater(p.x,p.y-24,'PETRIFIED','#9f4'); } return; }
 if(p.dashCd>0||p.dashT>0) return;
 let ax=((keys.KeyD||keys.ArrowRight)?1:0)-((keys.KeyA||keys.ArrowLeft)?1:0);
 let ay=((keys.KeyS||keys.ArrowDown)?1:0)-((keys.KeyW||keys.ArrowUp)?1:0);
 if(ax===0&&ay===0){ ax=Math.cos(p.aim); ay=Math.sin(p.aim); }
 const l=len(ax,ay); p.dashDx=ax/l; p.dashDy=ay/l;
 p.dashT=0.16; p.dashCd=p.dashCdMax; p.invuln=Math.max(p.invuln,0.25);
 SFX.dash(); spawnBurst(p.x,p.y,7,'#0ff',160,0.4,2.5);
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
  if(code==='Digit6'){ best=0; depth=0; bosses=0; saveMeta(); codexKills={}; saveCodex(); }
 if(code==='Digit7'){ settings.musicVol=settings.musicVol>=1?0:Math.round((settings.musicVol+0.1)*10)/10; saveCfg(); applyVol(); }
 if(code==='Digit8'){ settings.sfxVol=settings.sfxVol>=1?0:Math.round((settings.sfxVol+0.1)*10)/10; saveCfg(); applyVol(); }
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
function closeCodex(){ SFX.click(); if(codexFrom==='paused'||codexFrom==='playing-paused') toPaused(autoPaused); else if(codexFrom==='galaxy') state='galaxy'; else state='title'; }
function codexTabRects(){ const w=200, g=12, x0=(W-(w*2+g))/2; return [0,1].map(i=>({x:x0+i*(w+g),y:120,w,h:30})); }
// ---------- codex ----------
// One entry per thing that can kill you. TELL is what you see before it hurts,
// COUNTER is what you do about it — the two lines that actually change play.
// Lore builds the setting instead of restating the mechanic above it.
const CODEX_FOES=[
 {id:'drone', type:'drone', name:'DRONE', role:'Chaser', threat:'Low',
  tell:'Weaves as it closes, then accelerates inside 160px.',
  counter:'Strafe and let it commit. Never let three stack on one line.',
  lore:'Municipal sweeper frames with the compliance governor cut out. They still run the old civic pathing, which is why they wobble — half the routine is avoiding pedestrians who left this district years ago.'},
 {id:'mite', type:'mite', name:'MITE', role:'Splitter', threat:'Low',
  tell:'Fastest thing on the field. Comes in straight and reckless.',
  counter:'Kill it at range — death spawns two drones on the spot.',
  lore:'Not a machine so much as a budget. Someone worked out that two cheap chassis delivered later beat one good chassis delivered now, and shipped the maths as a weapon.'},
 {id:'stalker', type:'stalker', name:'STALKER', role:'Duellist', threat:'Medium',
  tell:'Orbits at range, then FLASHES WHITE and holds still for half a second.',
  counter:'The flash is the commitment. Move perpendicular — it cannot correct mid-dash.',
  lore:'Salvaged duelling stock. The flash is not a targeting laser, it is a courtesy: the frames were built for arena bouts where striking an unready opponent voided the purse.'},
 {id:'sniper', type:'sniper', name:'SNIPER', role:'Artillery', threat:'Medium',
  tell:'A RED LINE from it to you, half a second before a HEAVY bolt.',
  counter:'Break the line — put a pylon between you, or dash through it.',
  lore:'It relocates after every shot because the doctrine says so, and the doctrine was written for a war against people who shot back with artillery. Against one pilot it is simply a nervous habit.'},
 {id:'tempest', type:'tempest', name:'TEMPEST', role:'Suppression', threat:'Medium',
  tell:'Rotor blades glow ORANGE, then a spread of HEAVY bolts.',
  counter:'Close or leave — the spread is widest at range. Five bolts past S7.',
  lore:'Crowd-control stock from the market riots. The spread pattern is still calibrated for a street forty metres wide, which is why so much of it goes nowhere.'},
 {id:'brute', type:'brute', name:'BRUTE', role:'Zone control', threat:'High',
  tell:'A red ring previews the blast radius while it winds up.',
  counter:'The wave is DODGEABLE — it is a ring, not a sphere. Step over the band or dash it.',
  lore:'Demolition plant. It has no opinion about you at all; you are simply standing inside a volume scheduled for clearance, and the schedule does not have a field for that.'}
];
const CODEX_BOSSES=[
 {id:'overlord',
  role:'Brawler', threat:'Never recovers',
  tell:'Cycles BURST / SUMMON / CHARGE / SWEEP on a three-second clock.',
  counter:'Pure aggression with no escape. Learn the cycle and out-damage it.',
  lore:'The first thing down the trail that was built to win rather than to hold. It has never withdrawn from an engagement, which its handlers call discipline and its victims called a design flaw they did not live to file.'},
 {id:'warden',
  role:'Siege fortress', threat:'Retreats once or twice',
  tell:'Slow. Spirals, guards, seismic slams, twin staggered waves.',
  counter:'Stay off the rings. When it RETREATS, chase — damage stops its healing.',
  lore:'Gate authority. It was never meant to advance, only to make advancing expensive, and it has kept that contract long after the gate it guarded stopped existing.'},
 {id:'phantom',
  role:'Skirmisher', threat:'Phases, briefly',
  tell:'A locked RED LINE that holds still — the beam comes down exactly there.',
  counter:'Step off the line. When it PHASES it still takes 30% damage — kill the minions to end it early.',
  lore:'A courier that learned its cargo was itself. The blink hardware was for outrunning interdiction; the beam was improvised later, from the part that did the outrunning.'},
 {id:'leviathan',
  role:'Serpent', threat:'Body damages on contact',
  tell:'BURROWS with a telegraph, resurfaces underneath you with a shockwave.',
  counter:'Watch the ground, not the head. Segments hurt — never stand in the trail.',
  lore:'Deep-lane infrastructure that kept growing after the contract lapsed. The segments are not armour, they are the original tunnelling string, still following the head out of habit.'},
 {id:'oracle',
  role:'Zone controller', threat:'Warded until broken',
  tell:'Three shards orbit it. Rotating twin beams; damaging fields parked on you.',
  counter:'Break all three WARDS first — until then it soaks 75% of every round.',
  lore:'It computes where you will be, which is a harder problem than it sounds and a cheaper one than aiming. The wards are not protection; they are the working memory it cannot afford to lose mid-calculation.'},
 {id:'harbinger',
  role:'Bullet-hell caster', threat:'Never recovers',
  tell:'Dense rotating walls with ONE gap, plus targeted meteors.',
  counter:'Find the gap and travel with it. Do not try to out-run the wall.',
  lore:'An announcement, not a soldier. Everything it does is legible from a distance, because the point was always that you would see it coming and understand what it meant.'},
 {id:'basilisk',
  role:'Controller', threat:'Roots you in place',
  tell:'A green CONE opens before the gaze fires. Lunges leave spikes behind.',
  counter:'Leave the cone — being PETRIFIED next to a lunge is how this fight ends.',
  lore:'Quarantine enforcement. It does not kill so much as file you in place pending review, and the review queue has not moved in a very long time.'},
 {id:'juggernaut',
  role:'Ram', threat:'Armoured prow',
  tell:'RAM! then a straight commit, shockwave on impact. Facing LOCKS while charging.',
  counter:'The prow takes 40%, the REAR VENT takes 190%. Flank every charge.',
  lore:'Built around a single engine too large to be steered and too valuable to be wasted, so they put armour on the front and filed the exhaust problem as acceptable.'},
 {id:'nullifier',
  role:'Disruptor', threat:'Jams your abilities',
  tell:'A violet DISRUPTOR FIELD drops on your position.',
  counter:'Walk out. It locks dash and recall — never your guns. Sniper escorts punish standing still.',
  lore:'Counter-insurgency hardware from a campaign against pilots who relied on their gear. It cannot shoot especially well. It does not need to; it only needs you to be ordinary for four seconds.'},
 {id:'chorus',
  role:'Splitter', threat:'Fractures twice',
  tell:'At 66% and 33% it FRACTURES into smaller synced echoes.',
  counter:'Burst through the thresholds fast, or fight three at once. Echoes are fragile.',
  lore:'One intelligence that decided redundancy was cheaper than survival. Each echo believes it is the original and is, in every sense that has ever been tested, correct.'},
 {id:'archon',
  role:'Commander', threat:'Calls LORDS twice as often',
  tell:'Rotating cross-beams, and "ARCHON CALLS LORD …" — a weakened Lord arrives beside it.',
  counter:'Deep down the trail, its Lords call Captains of their own. Kill the ARCHON to stop the calls.',
  lore:'Rank, rendered as a machine. It has never fired the first shot in any engagement it has won, and regards this as the entire point of the office.'},
 {id:'singularity',
  role:'Apex', threat:'Commands three links deep',
  tell:'GRAVITY drags you inward while debris arcs outward, and SOVEREIGNS answer its call.',
  counter:'Thrust against the pull. Its Sovereigns call Lords, and those Lords call Captains — kill fast or drown in rank.',
  lore:'The end of the trail, and the reason there is a trail. Everything you have fought since the first sector was, in some documented sense, subcontracted from here.'}
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
 let n=0, tot=0;
 for(const f of CODEX_FOES){ tot++; if(codexKnown(f.type)) n++; }
 for(const b of CODEX_BOSSES){ tot++; if(codexKnown(b.id)) n++; }
 return {n,tot};
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
'Crit Ward ★: blocks 1 HEAVY hit per round. Refreshes per arena.',
'Aegis Pulse: a shield that recharges mid-fight and blocks hits.',
'Ablative Barrier ★: ONE-TIME pool absorbs 50 damage — never comes back.',
'Stasis Protocol ★: cheat death up to 3 times — revival grows 1 HP → 25% → FULL.',
'Second Wind ★: one revive at 50% HP.',
'Block order: Crit Ward (heavy only) → Warding → Bulwark → Barrier → Aegis.',
'Live shields glow on your HUD: [WARD] [BULx2] [MIR] [BAR50] [STASIS].',
'Repair Drone mends you only after 4s UNDAMAGED — sustain between fights.',
'Adrenal Core pays more the lower your HP. Salvage mends on every gem.'],
arsenal:[
'BARRELS: Gun Array +1 shot, no cost. Split Chamber ★ +1 shot, -15% dmg.',
'  Minigun Amps +1 barrel, wider spread, per-bullet damage rebalanced.',
'AMMO: Incendiary burns · Cryo chills · Slug hits harder and slower.',
'  Flak detonates on impact · Corrosive shreds armour (5 stacks, +8% each).',
'  Chain Shot arcs to a second foe · Overcharge makes every 5th volley heavy.',
'  Seeker homes · Ricochet bounces · Lance Rounds pierce.',
'ABILITIES: Kinetic Discharge charges on KILLS then blasts — Capacitor Tuning',
'  lowers the kill cost, Amplifier raises damage, Resonance widens and chills.',
'  Orbital Cannon calls telegraphed strikes. Prism Lance fires a piercing beam.',
'  Guardian Orbit, Frost Nova, Tesla Arc ★, Kill Surge, Shrapnel Core.',
'MAPS: every arena is validated — all spawns and the EXIT are always reachable,',
'  and at least 45% of the floor is open. Six district types, six themes.'],
lore:[
'You are flying a salvaged interceptor down a trail nobody finished mapping.',
'Each sector was something once — a market, an overpass, a server pit — and each',
'has been repurposed by whatever moved in after the people left.',
'',
'Every fifth sector is a NEST, and the things in them keep a chain of command:',
'  APEX  >  SOVEREIGN  >  LORD  >  CAPTAIN  >  ENFORCER  >  chaff.',
'Each boss is met alone the first time. After that it returns as a commander',
'holding court, or as an escort serving someone who outranks it.',
'',
'Past S30 a boss can CALL one rank below it — a weakened lieutenant. Past S60 a',
'lieutenant can call one of its own. The Apex at S100 commands three links deep.',
'Kill the one giving orders and the calls stop.',
'',
'Beyond S100 the trail repeats, and every court runs deeper than the last.',
'Every boss killed banks +2% damage permanently. The CODEX [C] fills as you kill.']
};
function openHelp(from){ helpFrom=from; helpTab='controls'; state='help'; if(from==='paused'||from==='playing-paused') setMusicCfg(PAUSE_MUS); SFX.click(); }
function closeHelp(){ SFX.click(); if(helpFrom==='paused'){ toPaused(autoPaused); } else if(helpFrom==='playing-paused'){ toPaused(autoPaused); } else if(helpFrom==='galaxy'){ state='galaxy'; } else { state='title'; } }
function inBtn(x,y,b){ return x>b.x&&x<b.x+b.w&&y>b.y&&y<b.y+b.h; }
const BTN={ titleStart:{x:330,y:400,w:300,h:52}, titleSet:{x:330,y:460,w:96,h:42}, titleCodex:{x:432,y:460,w:96,h:42}, titleHelp:{x:534,y:460,w:96,h:42},
 pauseResume:{x:330,y:296,w:300,h:46}, pauseSet:{x:330,y:350,w:300,h:46}, pauseHelp:{x:330,y:404,w:300,h:46}, pauseCodex:{x:330,y:458,w:300,h:46}, pauseRestart:{x:330,y:512,w:300,h:46},
 galCodex:{x:W-156,y:20,w:136,h:34},
 endRestart:{x:330,y:440,w:300,h:52}, endTitle:{x:330,y:500,w:300,h:40},
 back:{x:330,y:560,w:300,h:44} };
function handleClick(x,y){
 if(state==='title'){
  ensureTitleMusic();
  if(inBtn(x,y,BTN.titleStart)){ SFX.click(); startRun(); }
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
   if(inBtn(x,y,BTN.endRestart)){ SFX.click(); startRun(); }
   else if(inBtn(x,y,BTN.endTitle)){ state='title'; ensureTitleMusic(); }
   return;
  }
  if(state==='levelup'){
   for(let i=0;i<levelChoices.length;i++){ const bx=130+i*240, by=220, bw=220, bh=200; if(x>bx&&x<bx+bw&&y>by&&y<by+bh) pickUpgrade(levelChoices[i]); }
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
  else if(inBtn(x,y,BTN.pauseRestart)){ SFX.click(); startRun(); }
  return;
 }
  if(state==='playing'){
   const wx=x+cam.x, wy=y+cam.y; // clicks arrive in screen space; the world is camera-offset
   if(portal&&dist2(wx,wy,portal.x,portal.y)<50*50){ nextArena(); return; }
   const rc=player.recall;
   if(rc&&dist2(wx,wy,rc.x,rc.y)<40*40){ doPortalKey(); }
  }
}
function rowRects(){ const a=[]; for(let i=0;i<8;i++) a.push({x:230,y:186+i*46,w:500,h:40}); return a; }

// ---------- render ----------
function render(){
 ctx.save();
 if(shake>0&&settings.shake) ctx.translate((Math.random()-0.5)*shake,(Math.random()-0.5)*shake);
  const th=arena?arena.theme:THEMES[0];
  ctx.fillStyle=th.bg; ctx.fillRect(-20,-20,W+40,H+40);
  if(state==='title'){ ctx.restore(); drawTitle(); drawFx(); return; }
  if(state==='galaxy'){ ctx.restore(); drawGalaxy(); return; }
  if(state==='settings'){ ctx.restore(); drawWorldMini(th); drawSettings(); drawFx(); return; }
  if(state==='help'){ ctx.restore(); drawWorldMini(th); drawHelp(); drawFx(); return; }
  if(state==='codex'){ ctx.restore(); drawWorldMini(th); drawCodexScreen(); return; }
  // world layer: grid clipped to the visible playfield, everything in world coords
  ctx.save(); ctx.beginPath();
  const cx0=Math.max(0,PX0-cam.x), cy0=Math.max(HUD_H,PY0-cam.y);
  const cx1=Math.min(W,PX1-cam.x), cy1=Math.min(H,PY1-cam.y);
  ctx.rect(cx0,cy0,Math.max(0,cx1-cx0),Math.max(0,cy1-cy0)); ctx.clip();
  ctx.translate(-cam.x,-cam.y);
  ctx.strokeStyle=th.grid; ctx.lineWidth=1;
  const gx0=Math.max(PX0,Math.floor(cam.x/40)*40), gx1=Math.min(PX1,cam.x+W+40);
  const gy0=Math.max(PY0,Math.floor(cam.y/40)*40), gy1=Math.min(PY1,cam.y+H+40);
  for(let x=gx0;x<=gx1;x+=40){ ctx.beginPath(); ctx.moveTo(x,gy0); ctx.lineTo(x,gy1); ctx.stroke(); }
  for(let y=gy0;y<=gy1;y+=40){ ctx.beginPath(); ctx.moveTo(gx0,y); ctx.lineTo(gx1,y); ctx.stroke(); }
  ctx.strokeStyle=th.wall; ctx.lineWidth=3; ctx.strokeRect(PX0,PY0,PX1-PX0,PY1-PY0);
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
  if(bossWarnT>0&&state==='playing'){ ctx.fillStyle='#f00'; ctx.font='bold 42px monospace'; ctx.textAlign='center'; ctx.fillText(bossWarnTxt||'!! BOSS !!',W/2,PY0+70); }
}
function drawWorldMini(th){ // dim backdrop behind panels
 ctx.save(); ctx.translate(-cam.x,-cam.y);
 ctx.globalAlpha=0.35; drawWorld(th); ctx.globalAlpha=1; ctx.restore();
 ctx.fillStyle='rgba(0,0,8,0.55)'; ctx.fillRect(0,0,W,H);
}
function drawWorld(th){
 if(arena){ for(const o of arena.obs){
  if(o.kind==='rect'){ ctx.fillStyle=th.obs; ctx.fillRect(o.x,o.y,o.w,o.h); ctx.strokeStyle=th.obsEdge; ctx.lineWidth=2; ctx.strokeRect(o.x,o.y,o.w,o.h);
   // hazard hatching on the long edge reads as plating rather than a flat box
   if(o.w>70&&o.h>16){ ctx.strokeStyle=th.grid; ctx.lineWidth=1; for(let hx=o.x+8;hx<o.x+o.w-4;hx+=14){ ctx.beginPath(); ctx.moveTo(hx,o.y+3); ctx.lineTo(hx+7,o.y+Math.min(11,o.h-3)); ctx.stroke(); } } }
  else if(o.kind==='poly'){ const pts=o.pts;
   ctx.fillStyle=th.obs; ctx.beginPath();
   for(let i=0;i<pts.length;i++){ const x=o.x+pts[i][0], y=o.y+pts[i][1]; if(i) ctx.lineTo(x,y); else ctx.moveTo(x,y); }
   ctx.closePath(); ctx.fill(); ctx.strokeStyle=th.obsEdge; ctx.lineWidth=2; ctx.stroke();
   // inner facet line so faceted structures read as volume, not a flat plate
   ctx.strokeStyle=th.grid; ctx.lineWidth=1; ctx.beginPath();
   for(let i=0;i<pts.length;i++){ const x=o.x+pts[i][0]*0.55, y=o.y+pts[i][1]*0.55; if(i) ctx.lineTo(x,y); else ctx.moveTo(x,y); }
   ctx.closePath(); ctx.stroke(); }
  else { ctx.fillStyle=th.obs; ctx.beginPath(); ctx.arc(o.x,o.y,o.r,0,6.283); ctx.fill(); ctx.strokeStyle=th.obsEdge; ctx.lineWidth=2; ctx.stroke(); ctx.fillStyle=th.grid; ctx.font='11px monospace'; ctx.textAlign='center'; ctx.fillText('///',o.x,o.y+4); }
 } }
   if(portal){ // beacon column so the gate reads from far away: a tapered beam that
   // fades with height, a bright core, a ground glow and rising motes. Height is
   // deliberately modest (280px) so it never streaks across the sector or clips
   // oddly at the viewport edge like a full-height line would.
   const bh=280, bw=30, by=portal.y-portal.r;
   const shimmer=0.75+0.25*Math.sin(portal.t*5);
   let g=ctx.createLinearGradient(0,by,0,by-bh);
   g.addColorStop(0,'rgba(0,255,255,'+(0.30*shimmer).toFixed(3)+')');
   g.addColorStop(1,'rgba(0,255,255,0)');
   ctx.fillStyle=g; ctx.beginPath();
   ctx.moveTo(portal.x-bw/2,by); ctx.lineTo(portal.x+bw/2,by);
   ctx.lineTo(portal.x+5,by-bh); ctx.lineTo(portal.x-5,by-bh); ctx.closePath(); ctx.fill();
   const cg=ctx.createLinearGradient(0,by,0,by-bh);
   cg.addColorStop(0,'rgba(200,255,255,'+(0.55*shimmer).toFixed(3)+')');
   cg.addColorStop(1,'rgba(200,255,255,0)');
   ctx.fillStyle=cg; ctx.beginPath();
   ctx.moveTo(portal.x-3,by); ctx.lineTo(portal.x+3,by);
   ctx.lineTo(portal.x+1,by-bh); ctx.lineTo(portal.x-1,by-bh); ctx.closePath(); ctx.fill();
   ctx.fillStyle='rgba(0,255,255,'+(0.10*shimmer).toFixed(3)+')';
   ctx.beginPath(); ctx.ellipse(portal.x,portal.y,portal.r+16,10,0,0,6.283); ctx.fill();
   for(let m=0;m<4;m++){ const f=((portal.t*0.35+m/4)%1);
    const my=by-f*bh, mx=portal.x+Math.sin(portal.t*3+m*1.7)*8*(1-f*0.6);
    ctx.fillStyle='rgba(180,255,255,'+(0.7*(1-f)).toFixed(3)+')';
    ctx.beginPath(); ctx.arc(mx,my,2.5,0,6.283); ctx.fill(); }
   const pr=portal.r+10+6*Math.sin(portal.t*4); // proximity pulse: the gate "breathes"
   ctx.strokeStyle='rgba(0,255,255,0.35)'; ctx.lineWidth=2;
   ctx.beginPath(); ctx.arc(portal.x,portal.y,pr,0,6.283); ctx.stroke();
   const pl=1+Math.sin(portal.t*6)*0.12; ctx.save(); ctx.translate(portal.x,portal.y); ctx.scale(pl,pl); ctx.strokeStyle='#0ff'; ctx.lineWidth=3; ctx.beginPath(); ctx.arc(0,0,portal.r,0,6.283); ctx.stroke(); ctx.strokeStyle=arena.theme.wall; ctx.beginPath(); ctx.arc(0,0,portal.r-8,portal.t*2,portal.t*2+5); ctx.stroke(); ctx.fillStyle='#0ff'; ctx.font='12px monospace'; ctx.textAlign='center'; ctx.fillText('EXIT [E]',0,34); ctx.restore(); }
 const rc=player&&player.recall;
 if(rc&&state!=='gameover'){
  const inR=Math.hypot(player.x-rc.x,player.y-rc.y)<=player.gateRange;
  ctx.save(); ctx.strokeStyle=inR?'rgba(255,255,0,0.45)':'rgba(255,80,80,0.4)'; ctx.lineWidth=1.5; ctx.setLineDash([6,6]);
  ctx.beginPath(); ctx.moveTo(player.x,player.y); ctx.lineTo(rc.x,rc.y); ctx.stroke(); ctx.setLineDash([]); ctx.restore();
  const pu=1+Math.sin(performance.now()/300)*0.1; ctx.save(); ctx.translate(rc.x,rc.y); ctx.scale(pu,pu); ctx.rotate(Math.PI/4);
  ctx.strokeStyle=player.recallCd>0?'#665f00':'#ff0'; ctx.lineWidth=2.5; ctx.strokeRect(-10,-10,20,20);
  ctx.fillStyle='rgba(255,255,0,0.15)'; ctx.fillRect(-10,-10,20,20); ctx.restore();
  ctx.fillStyle=player.recallCd>0?'#888':'#ff0'; ctx.font='11px monospace'; ctx.textAlign='center';
  ctx.fillText(player.recallCd>0?('RECALL '+player.recallCd.toFixed(0)+'s'):'RECALL [E]',rc.x,rc.y-20); }
 if(player&&player.channel&&state==='playing'){ const f=clamp(player.channel.t/player.channelMax,0,1);
  ctx.strokeStyle='#ff0'; ctx.lineWidth=3; ctx.beginPath(); ctx.arc(player.x,player.y,12+30*f,0,6.283); ctx.stroke();
  ctx.fillStyle='#ff0'; ctx.font='bold 11px monospace'; ctx.textAlign='center'; ctx.fillText('BLINK',player.x,player.y-24); }
 for(const g of gems){ const bob=Math.sin(g.t*5)*2; ctx.fillStyle='#3ff'; ctx.save(); ctx.translate(g.x,g.y+bob); ctx.rotate(Math.PI/4); ctx.fillRect(-4,-4,8,8); ctx.restore(); }
 for(const gr of rings){ ctx.strokeStyle='rgba(255,120,0,'+clamp(1.4-gr.r/gr.maxR,0,1)+')'; ctx.lineWidth=5; ctx.beginPath(); ctx.arc(gr.x,gr.y,gr.r,0,6.283); ctx.stroke(); }
 // orbital strike telegraph: a closing reticle, so the circle reads as a timer
 for(const s of strikes){ const f=clamp(s.t/s.warn,0,1);
  ctx.save();
  ctx.strokeStyle='rgba(255,220,0,0.85)'; ctx.lineWidth=2;
  ctx.beginPath(); ctx.arc(s.x,s.y,s.r,0,6.283); ctx.stroke();
  ctx.fillStyle='rgba(255,220,0,'+(0.10+0.14*f).toFixed(3)+')';
  ctx.beginPath(); ctx.arc(s.x,s.y,s.r,0,6.283); ctx.fill();
  ctx.strokeStyle='#ff0'; ctx.lineWidth=3;
  ctx.beginPath(); ctx.arc(s.x,s.y,s.r*(1-f)+6,0,6.283); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(s.x-s.r,s.y); ctx.lineTo(s.x+s.r,s.y);
  ctx.moveTo(s.x,s.y-s.r); ctx.lineTo(s.x,s.y+s.r); ctx.lineWidth=1; ctx.stroke();
  ctx.restore(); }
 // prism lance trace
 for(const b2 of beams){ const f=clamp(1-b2.t/b2.life,0,1);
  ctx.save(); ctx.translate(b2.x,b2.y); ctx.rotate(b2.a);
  ctx.globalAlpha=f;
  const g2=ctx.createLinearGradient(0,0,b2.len,0);
  g2.addColorStop(0,'rgba(200,255,255,0.95)'); g2.addColorStop(1,'rgba(140,255,255,0)');
  ctx.fillStyle=g2; ctx.fillRect(0,-b2.w*f,b2.len,b2.w*2*f);
  ctx.fillStyle='rgba(255,255,255,'+(0.8*f).toFixed(3)+')'; ctx.fillRect(0,-2*f,b2.len,4*f);
  ctx.restore(); ctx.globalAlpha=1; }
 // ground hazards: dashed while arming, solid once live, fading as they expire
 for(const h of hazards){
  const arming=h.t<(h.warn||0), fade=clamp(1-(h.t/h.life),0,1);
  const c=h.col||'#fa0';
  ctx.save();
  ctx.globalAlpha=(arming?0.30+0.25*Math.sin(h.t*18):0.20*fade);
  ctx.fillStyle=c; ctx.beginPath(); ctx.arc(h.x,h.y,h.r,0,6.283); ctx.fill();
  ctx.globalAlpha=arming?0.9:(0.55*fade+0.2);
  ctx.strokeStyle=c; ctx.lineWidth=2; if(arming) ctx.setLineDash([7,6]);
  ctx.beginPath(); ctx.arc(h.x,h.y,h.r,0,6.283); ctx.stroke(); ctx.setLineDash([]);
  if(h.jam){ ctx.globalAlpha=0.8; ctx.fillStyle=c; ctx.font='bold 11px monospace'; ctx.textAlign='center'; ctx.fillText('JAM',h.x,h.y+4); }
  ctx.restore();
 }
 // LEVIATHAN body: drawn before the heads so segments read as trailing behind
 for(const e of enemies){
  if(e.type!=='boss'||!e.segs||!e.segs.length) continue;
  ctx.save(); ctx.globalAlpha=e.phased?0.3:1;
  for(let k=e.segs.length-1;k>=0;k--){ const g=e.segs[k];
   ctx.fillStyle='#04321f'; ctx.strokeStyle=e.hp<e.maxhp*0.3?'#ff0':'#0f8'; ctx.lineWidth=2.5;
   ctx.beginPath(); ctx.arc(g.x,g.y,g.r,0,6.283); ctx.fill(); ctx.stroke();
   ctx.fillStyle='rgba(0,255,136,0.5)'; ctx.beginPath(); ctx.arc(g.x,g.y,g.r*0.38,0,6.283); ctx.fill(); }
  ctx.restore();
 }
 for(const b of ebullets){ ctx.fillStyle='#f44'; ctx.beginPath(); ctx.arc(b.x,b.y,b.r,0,6.283); ctx.fill(); ctx.fillStyle='#fff'; ctx.beginPath(); ctx.arc(b.x,b.y,2,0,6.283); ctx.fill(); }
 // sniper + tempest telegraphs
 for(const e of enemies){ if((e.type==='sniper'||e.type==='tempest')&&e.aimT>0&&player){ ctx.strokeStyle=e.type==='tempest'?'rgba(255,150,0,0.55)':'rgba(255,0,0,0.55)'; ctx.lineWidth=1.5; ctx.beginPath(); ctx.moveTo(e.x,e.y); ctx.lineTo(player.x,player.y); ctx.stroke(); } }
 for(const e of enemies) drawEnemy(e);
  // rounds draw as a tracer (last step's travel) plus a head, so fast bullets
  // read as a moving object instead of a dot teleporting across the screen
  for(const b of bullets){ const col=b.crit?'#ff0':(b.burn?'#fa0':(b.chill?'#8ff':'#ffe'));
   if(b.px!==undefined){ ctx.strokeStyle=col; ctx.globalAlpha=0.45; ctx.lineWidth=Math.max(1,b.r*0.9); ctx.lineCap='round';
    ctx.beginPath(); ctx.moveTo(b.px,b.py); ctx.lineTo(b.x,b.y); ctx.stroke(); ctx.globalAlpha=1; }
   ctx.fillStyle=col; ctx.beginPath(); ctx.arc(b.x,b.y,b.r,0,6.283); ctx.fill();
   if(b.burn||b.chill){ ctx.fillStyle=b.burn?'#f60':'#cff'; ctx.beginPath(); ctx.arc(b.x,b.y,Math.max(1.4,b.r-1.6),0,6.283); ctx.fill(); }
   ctx.strokeStyle=b.bounce>0?'#fa0':'#0ff'; ctx.lineWidth=1; ctx.stroke(); }
  if(player&&state!=='gameover') drawShip();
  if(player&&player.orbs>0&&state!=='gameover'){ for(let k=0;k<player.orbs;k++){ const a=player.orbAng+k*6.283/player.orbs; const ox=player.x+Math.cos(a)*34, oy=player.y+Math.sin(a)*34;
   ctx.save(); ctx.translate(ox,oy); ctx.rotate(a*3+k*2.1);
   ctx.fillStyle='#cfd8dc'; ctx.strokeStyle='#fff'; ctx.lineWidth=1;
   ctx.beginPath(); ctx.moveTo(7,0); ctx.lineTo(2,-2); ctx.lineTo(-6,-1.5); ctx.lineTo(-6,1.5); ctx.lineTo(2,2); ctx.closePath(); ctx.fill(); ctx.stroke();
   ctx.strokeStyle='#78909c'; ctx.beginPath(); ctx.moveTo(-5,0); ctx.lineTo(6,0); ctx.stroke();
   ctx.fillStyle='#fc0'; ctx.beginPath(); ctx.arc(-6,0,1.3,0,6.283); ctx.fill();
   ctx.restore(); } }
}
function drawShip(){
 const p=player;
 const blink=p.invuln>0&&Math.floor(performance.now()/80)%2===0;
 ctx.save(); ctx.translate(p.x,p.y);
 if(p.dashT>0){ ctx.strokeStyle='rgba(0,255,255,0.6)'; ctx.lineWidth=2; ctx.beginPath(); ctx.arc(0,0,p.r+6,0,6.283); ctx.stroke(); }
 // shield layers, outermost first
 if(p.barrier>0){ ctx.fillStyle='rgba(0,255,200,0.10)'; ctx.beginPath(); ctx.arc(0,0,p.r+9,0,6.283); ctx.fill(); ctx.strokeStyle='rgba(0,255,200,0.7)'; ctx.lineWidth=1.5; ctx.stroke(); }
 if(p.bulwark>0){ ctx.strokeStyle='rgba(255,200,0,0.85)'; ctx.lineWidth=2; ctx.setLineDash([5,4]); ctx.beginPath(); ctx.arc(0,0,p.r+7,0,6.283); ctx.stroke(); ctx.setLineDash([]); }
 if(p.mirrorUp){ ctx.strokeStyle='rgba(200,120,255,0.9)'; ctx.lineWidth=1.5; ctx.beginPath(); ctx.arc(0,0,p.r+5.5+Math.sin(performance.now()/240)*1,0,6.283); ctx.stroke(); }
 if(p.wardUp){ ctx.strokeStyle='rgba(255,255,255,0.85)'; ctx.lineWidth=1.5; ctx.beginPath(); ctx.arc(0,0,p.r+4,0,6.283); ctx.stroke(); }
 if(p.shieldReady){ ctx.strokeStyle='rgba(0,255,255,0.8)'; ctx.lineWidth=2; ctx.beginPath(); ctx.arc(0,0,p.r+5+Math.sin(performance.now()/200)*1.5,0,6.283); ctx.stroke(); }
  ctx.rotate(p.face);
 // twin engine flames
 const f1=5+Math.random()*5, f2=5+Math.random()*5;
 ctx.fillStyle='rgba(255,120,0,0.9)';
 ctx.beginPath(); ctx.moveTo(-9,-4.5); ctx.lineTo(-9-f1,-6.5); ctx.lineTo(-9-f1,-2.5); ctx.closePath(); ctx.fill();
 ctx.beginPath(); ctx.moveTo(-9,4.5); ctx.lineTo(-9-f2,2.5); ctx.lineTo(-9-f2,6.5); ctx.closePath(); ctx.fill();
 ctx.fillStyle='#ffe'; ctx.fillRect(-10,-5,2,2); ctx.fillRect(-10,3,2,2);
 // swept-wing spaceframe hull
 ctx.fillStyle=blink?'rgba(0,255,150,0.45)':'#074'; ctx.strokeStyle='#0ff'; ctx.lineWidth=1.6;
 ctx.beginPath(); ctx.moveTo(16,0); ctx.lineTo(2,-4); ctx.lineTo(-11,-11); ctx.lineTo(-8,-3); ctx.lineTo(-8,3); ctx.lineTo(-11,11); ctx.lineTo(2,4); ctx.closePath(); ctx.fill(); ctx.stroke();
 // tail fins
 ctx.fillStyle=blink?'rgba(0,255,150,0.45)':'#095'; ctx.fillRect(-11,-3,3,6);
 // canopy
 ctx.fillStyle='#aff'; ctx.beginPath(); ctx.ellipse(5,0,4,2.4,0,0,6.283); ctx.fill();
 ctx.fillStyle='#fff'; ctx.beginPath(); ctx.arc(6.2,-0.7,0.9,0,6.283); ctx.fill();
 // spine stripe
 ctx.strokeStyle='rgba(0,255,255,0.7)'; ctx.lineWidth=1; ctx.beginPath(); ctx.moveTo(-8,0); ctx.lineTo(11,0); ctx.stroke();
 // gun barrels: one per shot (cap visual at 5), fanned
 const nb=Math.min(Math.max(1,p.shots),5);
 ctx.fillStyle='#1a2b33'; ctx.strokeStyle=p.flash>0?'#fff':'#0ff';
 for(let i=0;i<nb;i++){ const yo=(i-(nb-1)/2)*3.4; ctx.fillRect(10,yo-1.2,7,2.4); ctx.strokeRect(10,yo-1.2,7,2.4); }
 // wingtip lights
 ctx.fillStyle='#f44'; ctx.beginPath(); ctx.arc(-10,-10,1.3,0,6.283); ctx.fill();
 ctx.fillStyle='#0f6'; ctx.beginPath(); ctx.arc(-10,10,1.3,0,6.283); ctx.fill();
 ctx.restore();
 if(p.flash>0){ ctx.strokeStyle='rgba(255,255,255,0.7)'; ctx.lineWidth=2; ctx.beginPath(); ctx.arc(p.x,p.y,p.r+4,0,6.283); ctx.stroke(); }
 if(p.surgeT>0){ ctx.strokeStyle='rgba(255,255,0,0.5)'; ctx.beginPath(); ctx.arc(p.x,p.y,p.r+8,0,6.283); ctx.stroke(); }
}
function poly(n,r,rot){ ctx.beginPath(); for(let i=0;i<n;i++){ const a=(rot||0)+i/n*6.283; const px=Math.cos(a)*r, py=Math.sin(a)*r; if(i) ctx.lineTo(px,py); else ctx.moveTo(px,py); } ctx.closePath(); }
// ---------- boss silhouettes ----------
// Twelve distinct reads. Drawn in the boss's local space (already translated and
// scaled by drawEnemy). Shape carries the identity; colour carries the state.
function drawBossShape(e,enrage,flash,trim){
 const def=e.def||BOSSDEF.overlord, R=e.r, col=enrage?'#ff0':(def.col||trim);
 const body=flash?'#fff':'#1b1024';
 switch(def.shape){
  case 'hex': // WARDEN — dashed siege collar, heavy hex core
   ctx.save(); ctx.rotate(e.t*0.4); ctx.strokeStyle=col; ctx.lineWidth=5; ctx.setLineDash([14,8]); ctx.beginPath(); ctx.arc(0,0,R+4,0,6.283); ctx.stroke(); ctx.setLineDash([]); ctx.restore();
   ctx.fillStyle=flash?'#fff':'#42310a'; ctx.strokeStyle=col; ctx.lineWidth=3; poly(6,R-4,e.t*0.25); ctx.fill(); ctx.stroke();
   ctx.fillStyle=col; for(let k=0;k<6;k++){ const a=k/6*6.283-e.t*0.25; ctx.beginPath(); ctx.arc(Math.cos(a)*R*0.55,Math.sin(a)*R*0.55,3,0,6.283); ctx.fill(); }
   ctx.fillStyle=enrage?'#f63':'#ff0'; ctx.beginPath(); ctx.arc(0,0,9,0,6.283); ctx.fill();
   ctx.fillStyle='#fff'; ctx.beginPath(); ctx.arc(0,0,3.5,0,6.283); ctx.fill();
   break;
  case 'diamond': // PHANTOM — ghosted diamond inside a counter-spinning frame
   ctx.globalAlpha=0.85;
   ctx.save(); ctx.rotate(e.t*1.2+Math.PI/4); ctx.strokeStyle=col; ctx.lineWidth=2.5; ctx.strokeRect(-R*0.62,-R*0.62,R*1.24,R*1.24); ctx.restore();
   ctx.fillStyle=flash?'#fff':'#4a1050'; ctx.strokeStyle=col; ctx.lineWidth=2.5; poly(4,R-6,-e.t*1.2); ctx.fill(); ctx.stroke();
   ctx.fillStyle='#0ff'; ctx.beginPath(); ctx.arc(0,0,6,0,6.283); ctx.fill();
   ctx.globalAlpha=1;
   break;
  case 'serpent': // LEVIATHAN — armoured head with mandibles (body drawn separately)
   ctx.save(); ctx.rotate(Math.atan2(player?player.y-e.y:0,player?player.x-e.x:1));
   ctx.fillStyle=flash?'#fff':'#04321f'; ctx.strokeStyle=col; ctx.lineWidth=3;
   ctx.beginPath(); ctx.moveTo(R,0); ctx.lineTo(R*0.2,-R*0.78); ctx.lineTo(-R*0.8,-R*0.5); ctx.lineTo(-R*0.8,R*0.5); ctx.lineTo(R*0.2,R*0.78); ctx.closePath(); ctx.fill(); ctx.stroke();
   ctx.strokeStyle=col; ctx.lineWidth=4; ctx.lineCap='round';
   ctx.beginPath(); ctx.moveTo(R*0.55,-R*0.4); ctx.lineTo(R*1.25,-R*0.72); ctx.moveTo(R*0.55,R*0.4); ctx.lineTo(R*1.25,R*0.72); ctx.stroke();
   ctx.fillStyle=enrage?'#ff0':'#0f8'; ctx.beginPath(); ctx.arc(R*0.1,-R*0.26,4,0,6.283); ctx.arc(R*0.1,R*0.26,4,0,6.283); ctx.fill();
   ctx.restore();
   break;
  case 'eye': // ORACLE — lidded eye, pupil tracks you
   ctx.fillStyle=flash?'#fff':'#0d2438'; ctx.strokeStyle=col; ctx.lineWidth=3;
   ctx.beginPath(); ctx.ellipse(0,0,R,R*0.66,0,0,6.283); ctx.fill(); ctx.stroke();
   { const a=Math.atan2(player?player.y-e.y:0,player?player.x-e.x:1);
     ctx.fillStyle=enrage?'#f63':'#8cf'; ctx.beginPath(); ctx.arc(Math.cos(a)*R*0.34,Math.sin(a)*R*0.22,R*0.30,0,6.283); ctx.fill();
     ctx.fillStyle='#001018'; ctx.beginPath(); ctx.arc(Math.cos(a)*R*0.34,Math.sin(a)*R*0.22,R*0.14,0,6.283); ctx.fill(); }
   ctx.strokeStyle=col; ctx.lineWidth=2;
   ctx.beginPath(); ctx.moveTo(-R,0); ctx.quadraticCurveTo(0,-R*0.95,R,0); ctx.stroke();
   ctx.beginPath(); ctx.moveTo(-R,0); ctx.quadraticCurveTo(0,R*0.95,R,0); ctx.stroke();
   break;
  case 'star': // HARBINGER — eight-point burst, inner ring counter-rotating
   ctx.fillStyle=flash?'#fff':'#3a1c00'; ctx.strokeStyle=col; ctx.lineWidth=2.5;
   ctx.beginPath();
   for(let k=0;k<16;k++){ const a=e.t*0.7+k*0.3927, rr=(k%2?R*0.48:R); const x=Math.cos(a)*rr, y=Math.sin(a)*rr; if(k) ctx.lineTo(x,y); else ctx.moveTo(x,y); }
   ctx.closePath(); ctx.fill(); ctx.stroke();
   ctx.strokeStyle=enrage?'#ff0':'#fa0'; ctx.lineWidth=2; ctx.save(); ctx.rotate(-e.t*1.4); poly(3,R*0.42,0); ctx.stroke(); ctx.restore();
   ctx.fillStyle='#ffd'; ctx.beginPath(); ctx.arc(0,0,4.5,0,6.283); ctx.fill();
   break;
  case 'coil': // BASILISK — coiled plates with a slit gaze
   for(let k=3;k>=1;k--){ ctx.strokeStyle=col; ctx.lineWidth=2; ctx.globalAlpha=0.35+k*0.2;
    ctx.beginPath(); ctx.arc(0,0,R*(0.42+k*0.2),e.t*0.6+k,e.t*0.6+k+4.2); ctx.stroke(); }
   ctx.globalAlpha=1;
   ctx.fillStyle=flash?'#fff':'#1d2e08'; ctx.strokeStyle=col; ctx.lineWidth=3; poly(5,R*0.6,e.t*0.3); ctx.fill(); ctx.stroke();
   { const a=Math.atan2(player?player.y-e.y:0,player?player.x-e.x:1);
     ctx.save(); ctx.rotate(a); ctx.fillStyle=enrage?'#ff0':'#9f4';
     ctx.beginPath(); ctx.ellipse(R*0.22,0,R*0.26,3.2,0,0,6.283); ctx.fill(); ctx.restore(); }
   break;
  case 'ram': // JUGGERNAUT — armoured prow one end, glowing vent the other
   ctx.save(); ctx.rotate(e.facing||0);
   ctx.fillStyle=flash?'#fff':'#3a1508'; ctx.strokeStyle=col; ctx.lineWidth=3;
   ctx.beginPath(); ctx.moveTo(R,0); ctx.lineTo(R*0.3,-R*0.8); ctx.lineTo(-R*0.85,-R*0.62); ctx.lineTo(-R*0.85,R*0.62); ctx.lineTo(R*0.3,R*0.8); ctx.closePath(); ctx.fill(); ctx.stroke();
   ctx.fillStyle='#999'; ctx.strokeStyle='#ccc'; ctx.lineWidth=2; // armour plate
   ctx.beginPath(); ctx.moveTo(R*0.98,0); ctx.lineTo(R*0.34,-R*0.66); ctx.lineTo(R*0.34,R*0.66); ctx.closePath(); ctx.fill(); ctx.stroke();
   ctx.fillStyle=enrage?'#ff0':'#f62'; // rear vent: the weak point
   ctx.fillRect(-R*0.92,-R*0.34,R*0.22,R*0.68);
   ctx.strokeStyle='#ffd'; ctx.lineWidth=1.5; ctx.strokeRect(-R*0.92,-R*0.34,R*0.22,R*0.68);
   ctx.restore();
   break;
  case 'prism': // NULLIFIER — split prism halves with a null core
   ctx.save(); ctx.rotate(e.t*0.5);
   ctx.fillStyle=flash?'#fff':'#2a1038'; ctx.strokeStyle=col; ctx.lineWidth=2.5;
   ctx.beginPath(); ctx.moveTo(0,-R); ctx.lineTo(R*0.86,R*0.5); ctx.lineTo(-R*0.86,R*0.5); ctx.closePath(); ctx.fill(); ctx.stroke();
   ctx.beginPath(); ctx.moveTo(0,R); ctx.lineTo(R*0.86,-R*0.5); ctx.lineTo(-R*0.86,-R*0.5); ctx.closePath(); ctx.stroke();
   ctx.restore();
   ctx.fillStyle='#000'; ctx.beginPath(); ctx.arc(0,0,R*0.26,0,6.283); ctx.fill();
   ctx.strokeStyle=enrage?'#ff0':'#c8f'; ctx.lineWidth=2; ctx.stroke();
   break;
  case 'triad': // CHORUS — three fused lobes around a shared core
   for(let k=0;k<3;k++){ const a=e.t*0.8+k*2.094;
    ctx.fillStyle=flash?'#fff':'#06303c'; ctx.strokeStyle=col; ctx.lineWidth=2.5;
    ctx.beginPath(); ctx.arc(Math.cos(a)*R*0.42,Math.sin(a)*R*0.42,R*0.52,0,6.283); ctx.fill(); ctx.stroke(); }
   ctx.fillStyle=enrage?'#ff0':'#4df'; ctx.beginPath(); ctx.arc(0,0,R*0.28,0,6.283); ctx.fill();
   ctx.fillStyle='#fff'; ctx.beginPath(); ctx.arc(0,0,R*0.12,0,6.283); ctx.fill();
   break;
  case 'crown': // ARCHON — command crown with rank spikes
   ctx.save(); ctx.rotate(e.t*0.3); ctx.strokeStyle=col; ctx.lineWidth=4; ctx.setLineDash([10,7]); ctx.beginPath(); ctx.arc(0,0,R+6,0,6.283); ctx.stroke(); ctx.setLineDash([]); ctx.restore();
   ctx.fillStyle=flash?'#fff':'#2c2a12'; ctx.strokeStyle=col; ctx.lineWidth=3; poly(7,R-5,e.t*0.2); ctx.fill(); ctx.stroke();
   ctx.fillStyle=col;
   for(let k=0;k<5;k++){ const a=-1.5708+(k-2)*0.42;
    ctx.beginPath(); ctx.moveTo(Math.cos(a)*R*0.66,Math.sin(a)*R*0.66); ctx.lineTo(Math.cos(a-0.09)*R*1.16,Math.sin(a-0.09)*R*1.16); ctx.lineTo(Math.cos(a+0.09)*R*1.16,Math.sin(a+0.09)*R*1.16); ctx.closePath(); ctx.fill(); }
   ctx.fillStyle=enrage?'#f63':'#ffd'; ctx.beginPath(); ctx.arc(0,0,R*0.3,0,6.283); ctx.fill();
   break;
  case 'well': // SINGULARITY — accretion rings around a void
   for(let k=0;k<3;k++){ ctx.save(); ctx.rotate(e.t*(0.5+k*0.4)); ctx.globalAlpha=0.75-k*0.18;
    ctx.strokeStyle=k===0?(enrage?'#ff0':'#b6f'):'#7af'; ctx.lineWidth=3-k*0.6;
    ctx.beginPath(); ctx.ellipse(0,0,R*(1.14-k*0.22),R*(0.42-k*0.09),k*0.9,0,6.283); ctx.stroke(); ctx.restore(); }
   ctx.globalAlpha=1;
   ctx.fillStyle='#000'; ctx.beginPath(); ctx.arc(0,0,R*0.52,0,6.283); ctx.fill();
   ctx.strokeStyle=enrage?'#ff0':'#b6f'; ctx.lineWidth=2.5; ctx.stroke();
   ctx.fillStyle=flash?'#fff':'#b6f'; ctx.beginPath(); ctx.arc(0,0,R*0.13,0,6.283); ctx.fill();
   break;
  default: // OVERLORD — dashed ring, eight-sided core, pulsing eye
   ctx.save(); ctx.rotate(e.t*0.6); ctx.strokeStyle=col; ctx.lineWidth=6; ctx.setLineDash([18,10]); ctx.beginPath(); ctx.arc(0,0,R+4,0,6.283); ctx.stroke(); ctx.setLineDash([]); ctx.restore();
   ctx.fillStyle=flash?'#fff':'#303'; ctx.strokeStyle=col; ctx.lineWidth=3; poly(8,R-4,-e.t*0.4); ctx.fill(); ctx.stroke();
   { const pulse=1+Math.sin(e.t*5)*0.12; ctx.save(); ctx.scale(pulse,pulse);
     ctx.fillStyle=enrage?'#f63':'#0ff'; ctx.beginPath(); ctx.arc(0,0,10,0,6.283); ctx.fill();
     ctx.fillStyle='#fff'; ctx.beginPath(); ctx.arc(0,0,4,0,6.283); ctx.fill(); ctx.restore(); }
   if(enrage){ ctx.fillStyle='#f80'; for(let k=0;k<4;k++){ const a=e.t*3+k*1.57; ctx.beginPath(); ctx.moveTo(Math.cos(a)*(R+2),Math.sin(a)*(R+2)); ctx.lineTo(Math.cos(a+0.2)*(R+12),Math.sin(a+0.2)*(R+12)); ctx.lineTo(Math.cos(a-0.2)*(R+12),Math.sin(a-0.2)*(R+12)); ctx.closePath(); ctx.fill(); } }
   break;
 }
 // ORACLE wards ride outside whatever shape carries them
 if(e.wards&&e.wards.length){
  for(const w of e.wards){ const a=w.a+(e.wardA||0);
   ctx.save(); ctx.translate(Math.cos(a)*(R+26),Math.sin(a)*(R+26)); ctx.rotate(a*2);
   ctx.fillStyle='rgba(140,200,255,0.30)'; ctx.strokeStyle='#8cf'; ctx.lineWidth=2;
   poly(3,10,0); ctx.fill(); ctx.stroke(); ctx.restore(); }
 }
 // signature telegraphs that must draw over the body
 if(e.laser){ ctx.strokeStyle='rgba(255,0,0,0.7)'; ctx.lineWidth=1.5; ctx.beginPath(); ctx.moveTo(0,0); ctx.lineTo(Math.cos(e.laser.ang)*700,Math.sin(e.laser.ang)*700); ctx.stroke(); }
 if(e.beamT>0){ ctx.strokeStyle='rgba(160,255,255,0.95)'; ctx.lineWidth=6; ctx.beginPath(); ctx.moveTo(0,0); ctx.lineTo(Math.cos(e.beamA)*700,Math.sin(e.beamA)*700); ctx.stroke(); }
 if(e.gaze){ const a=e.gaze.ang, w=0.45;
  ctx.fillStyle='rgba(153,255,68,'+(0.10+0.16*Math.sin(e.t*16)).toFixed(3)+')';
  ctx.beginPath(); ctx.moveTo(0,0); ctx.arc(0,0,430,a-w,a+w); ctx.closePath(); ctx.fill();
  ctx.strokeStyle='rgba(153,255,68,0.8)'; ctx.lineWidth=2; ctx.stroke(); }
}
function drawEnemy(e){
 ctx.save(); ctx.translate(e.x,e.y); const pop=e.spawnT>0?(1.45-e.spawnT):1; ctx.scale(e.vscale*pop,e.vscale*pop);
 const flash=e.flash>0;
 const trim=arena?arena.theme.wall:'#f0f';
 if(e.type==='drone'){ ctx.rotate(e.t*2); ctx.fillStyle=flash?'#fff':'#a0f'; ctx.strokeStyle='#e0f'; ctx.lineWidth=2; ctx.beginPath(); ctx.arc(0,0,e.r,0,6.283); ctx.fill(); ctx.stroke(); ctx.fillStyle='#0ff'; ctx.fillRect(-3,-3,6,6); }
 else if(e.type==='stalker'){ ctx.rotate(player?Math.atan2(player.y-e.y,player.x-e.x):0); ctx.fillStyle=flash?'#fff':(e.dashState===1?'#f80':'#f40'); ctx.strokeStyle=e.dashState===1?'#fff':'#ff0'; ctx.lineWidth=2; ctx.beginPath(); ctx.moveTo(14,0); ctx.lineTo(-10,-9); ctx.lineTo(-10,9); ctx.closePath(); ctx.fill(); ctx.stroke(); if(e.dashState===1){ ctx.strokeStyle='rgba(255,255,255,0.8)'; ctx.beginPath(); ctx.arc(0,0,18,0,6.283); ctx.stroke(); } }
  else if(e.type==='sniper'){ const aa=player?Math.atan2(player.y-e.y,player.x-e.x):0;
   ctx.save(); ctx.rotate(aa); ctx.fillStyle='#112'; ctx.fillRect(2,-2.5,20,5); ctx.strokeStyle=e.aimT>0?'#f00':'#0ff'; ctx.lineWidth=1.5; ctx.strokeRect(2,-2.5,20,5); ctx.fillStyle=e.aimT>0?'#f00':'#f0f'; ctx.fillRect(20,-1.5,3,3); ctx.restore();
   ctx.fillStyle=flash?'#fff':'#04f'; ctx.strokeStyle=e.aimT>0?'#f00':'#0ff'; ctx.lineWidth=2; poly(6,10,e.t*0.5); ctx.fill(); ctx.stroke();
   ctx.fillStyle='#f0f'; ctx.beginPath(); ctx.arc(0,0,3.5,0,6.283); ctx.fill();
   ctx.fillStyle='#f00'; ctx.beginPath(); ctx.arc(Math.cos(aa)*6,Math.sin(aa)*6,1.6,0,6.283); ctx.fill(); }
 else if(e.type==='mite'){ ctx.rotate(e.wob); ctx.fillStyle=flash?'#fff':'#c0f'; ctx.strokeStyle='#f0f'; ctx.lineWidth=1.6; ctx.beginPath(); ctx.moveTo(9,0); ctx.lineTo(-7,-7); ctx.lineTo(-7,7); ctx.closePath(); ctx.fill(); ctx.stroke(); }
  else if(e.type==='tempest'){ ctx.save(); ctx.rotate(e.t*1.8); for(let k=0;k<3;k++){ ctx.rotate(2.094); ctx.fillStyle=flash?'#fff':'#0a6'; ctx.strokeStyle=e.aimT>0?'#fa0':'#0fc'; ctx.lineWidth=1.5;
    ctx.beginPath(); ctx.moveTo(17,0); ctx.lineTo(8,-3.5); ctx.lineTo(8,3.5); ctx.closePath(); ctx.fill(); ctx.stroke(); } ctx.restore();
   ctx.fillStyle=flash?'#fff':'#067'; ctx.strokeStyle=e.aimT>0?'#fa0':'#0fc'; ctx.lineWidth=2; ctx.beginPath(); ctx.arc(0,0,7,0,6.283); ctx.fill(); ctx.stroke();
   ctx.fillStyle='#ff9'; ctx.beginPath(); ctx.arc(0,0,3,0,6.283); ctx.fill(); }
  else if(e.type==='brute'){ ctx.fillStyle=flash?'#fff':'#821'; ctx.strokeStyle=e.windup>0?'#ff0':trim; ctx.lineWidth=3; poly(6,e.r,e.t*0.3); ctx.fill(); ctx.stroke();
   ctx.fillStyle=e.windup>0?'#ff0':'#f80'; for(let k=0;k<6;k++){ const a=k/6*6.283+e.t*0.3; ctx.beginPath(); ctx.arc(Math.cos(a)*e.r*0.62,Math.sin(a)*e.r*0.62,2.2,0,6.283); ctx.fill(); }
   ctx.fillStyle=flash?'#fff':'#ff0'; ctx.fillRect(-4,-4,8,8);
   if(e.windup>0){ ctx.strokeStyle='rgba(255,0,0,0.5)'; ctx.lineWidth=2; ctx.beginPath(); ctx.arc(0,0,110,0,6.283); ctx.stroke(); } }
  else if(e.type==='boss'){ const enrage=e.hp<e.maxhp*0.3;
   if(e.phased){ // transparent on the spot, recovering — break it out by killing minions
    ctx.globalAlpha=0.3;
    ctx.fillStyle='#4a1050'; ctx.strokeStyle='#c8f'; ctx.lineWidth=2; poly(4,e.r-6,-e.t*1.2); ctx.fill(); ctx.stroke();
    ctx.fillStyle='#0ff'; ctx.beginPath(); ctx.arc(0,0,6,0,6.283); ctx.fill();
    ctx.globalAlpha=1;
    ctx.fillStyle='#c8f'; ctx.font='bold 11px monospace'; ctx.textAlign='center'; ctx.fillText('RECOVERING',0,-e.r-12);
   } else if(e.mode==='warn'){ // re-entry telegraph at the breach point
    ctx.strokeStyle='rgba(255,0,0,'+(0.5+0.3*Math.sin(e.t*14)).toFixed(3)+')'; ctx.lineWidth=3; ctx.beginPath(); ctx.arc(0,0,e.r+8,0,6.283); ctx.stroke();
    ctx.fillStyle='#f00'; ctx.font='bold 12px monospace'; ctx.textAlign='center'; ctx.fillText('!',0,4);
   } else {
    drawBossShape(e,enrage,flash,trim);
    // Codex portraits skip the combat furniture — the shape is the subject.
    // Labels sit OUTSIDE the silhouette: name above, current phase below. Drawn
    // over the body they were unreadable against exactly the bosses that needed
    // reading most.
    if(!codexPreview){
     ctx.textAlign='center';
     ctx.fillStyle='#fff'; ctx.font='bold 11px monospace'; ctx.fillText(e.bname||'BOSS',0,-e.r-30);
     if(enrage){ ctx.fillStyle='#f00'; ctx.font='bold 12px monospace'; ctx.fillText('ENRAGED',0,-e.r-16); }
     const lab=bossLabel(e);
     ctx.font='bold 11px monospace';
     ctx.fillStyle='rgba(0,10,16,0.7)'; ctx.fillRect(-lab.length*3.6,e.r+6,lab.length*7.2,14);
     ctx.fillStyle=enrage?'#ff0':'#0ff'; ctx.fillText(lab,0,e.r+17);
     if(e.mode==='retreat'){ ctx.fillStyle='#fc0'; ctx.fillText('RETREATING',0,e.r+32); }
    } } }
 ctx.restore();
 if(e.slowT>0){ ctx.strokeStyle='rgba(140,255,255,0.8)'; ctx.lineWidth=1.5; ctx.beginPath(); ctx.arc(e.x,e.y,e.r+4,0,6.283); ctx.stroke(); }
 if(!codexPreview&&(e.type==='brute'||e.type==='boss'||e.hp<e.maxhp)&&e.hp>0){ const w=e.type==='boss'?90:34; ctx.fillStyle='#000'; ctx.fillRect(e.x-w/2,e.y-e.r-12,w,5); ctx.fillStyle=e.type==='boss'?'#f0f':'#0f0'; ctx.fillRect(e.x-w/2,e.y-e.r-12,w*clamp(e.hp/e.maxhp,0,1),5); }
}
function drawFx(){
 const n=settings.particles?parts.length:Math.ceil(parts.length/3);
 for(let i=0;i<parts.length;i++){ if(!settings.particles&&i%3!==0) continue; const q=parts[i]; ctx.globalAlpha=clamp(q.life/q.maxlife,0,1); ctx.fillStyle=q.col; ctx.fillRect(q.x-q.r/2,q.y-q.r/2,q.r,q.r); }
 ctx.globalAlpha=1; ctx.textAlign='center';
 for(const f of floaters){ ctx.globalAlpha=clamp(f.life/0.9,0,1); ctx.fillStyle=f.col; ctx.font='bold 13px monospace'; ctx.fillText(f.txt,f.x,f.y); }
 ctx.globalAlpha=1;
}
function bar(x,y,w,h,frac,fg,bg){ ctx.fillStyle=bg||'#222'; ctx.fillRect(x,y,w,h); ctx.fillStyle=fg; ctx.fillRect(x,y,w*clamp(frac,0,1),h); ctx.strokeStyle='#000'; ctx.strokeRect(x,y,w,h); }
// exit guidance: once the gate spawns, always show the way — a glowing ring +
// outlined chevron with a pill-backed distance tag when off-screen, twin
// chevrons nudging toward the gate when it is visible
function drawExitGuide(){
 if(!portal||state!=='playing'||!player) return;
 const px=player.x-cam.x, py=player.y-cam.y, ex=portal.x-cam.x, ey=portal.y-cam.y;
 const dx=ex-px, dy=ey-py, d=Math.hypot(dx,dy)||1, a=Math.atan2(dy,dx);
 const onscreen=ex>40&&ex<W-40&&ey>HUD_H+40&&ey<H-40;
 const pulse=0.5+0.5*Math.sin(performance.now()/280);
 if(!onscreen){
  const ax=clamp(px+Math.cos(a)*130,58,W-58), ay=clamp(py+Math.sin(a)*130,HUD_H+58,H-58);
  ctx.save();
  ctx.strokeStyle='rgba(0,255,255,'+(0.35+0.3*pulse).toFixed(3)+')'; ctx.lineWidth=2;
  ctx.beginPath(); ctx.arc(ax,ay,15+2*pulse,0,6.283); ctx.stroke();
  ctx.translate(ax,ay); ctx.rotate(a);
  ctx.shadowColor='#0ff'; ctx.shadowBlur=12;
  ctx.fillStyle='#0ff'; ctx.beginPath(); ctx.moveTo(12,0); ctx.lineTo(-5,-8); ctx.lineTo(-5,8); ctx.closePath(); ctx.fill();
  ctx.shadowBlur=0;
  ctx.strokeStyle='#fff'; ctx.lineWidth=1.5; ctx.stroke();
  ctx.restore();
  pill(ax,ay+34,'EXIT '+Math.round(d)+'m','bold 12px monospace');
 } else {
  const bob=Math.sin(performance.now()/300)*3;
  ctx.save(); ctx.shadowColor='#0ff'; ctx.shadowBlur=10;
  for(const off of [26,40]){
   ctx.save(); ctx.translate(px+Math.cos(a)*off,py+Math.sin(a)*off+bob); ctx.rotate(a);
   ctx.fillStyle=off===26?'rgba(0,255,255,0.95)':'rgba(0,255,255,0.5)';
   ctx.beginPath(); ctx.moveTo(8,0); ctx.lineTo(-4,-6); ctx.lineTo(-4,6); ctx.closePath(); ctx.fill();
   ctx.restore();
  }
  ctx.restore();
 }
}
// Boss tracker. Bosses blink, retreat and reposition, and the viewport only
// shows part of a deep sector — without an off-screen marker you genuinely lose
// one and end up wandering. Mirrors the exit guide so the read is familiar.
function drawBossGuide(){
 if(state!=='playing'||!player) return;
 const px=player.x-cam.x, py=player.y-cam.y;
 for(const e of enemies){
  if(e.type!=='boss') continue;
  const ex=e.x-cam.x, ey=e.y-cam.y;
  if(ex>30&&ex<W-30&&ey>HUD_H+30&&ey<H-30) continue;
  const a=Math.atan2(ey-py,ex-px), d=Math.hypot(e.x-player.x,e.y-player.y);
  const ax=clamp(px+Math.cos(a)*150,66,W-66), ay=clamp(py+Math.sin(a)*150,HUD_H+66,H-66);
  const col=e.phased?'#c8f':(e.mode==='retreat'?'#fc0':'#f0f');
  ctx.save(); ctx.translate(ax,ay); ctx.rotate(a);
  ctx.shadowColor=col; ctx.shadowBlur=12; ctx.fillStyle=col;
  ctx.beginPath(); ctx.moveTo(13,0); ctx.lineTo(-6,-9); ctx.lineTo(-6,9); ctx.closePath(); ctx.fill();
  ctx.shadowBlur=0; ctx.strokeStyle='#fff'; ctx.lineWidth=1.2; ctx.stroke();
  ctx.restore();
  pill(ax,ay+32,(e.bname||'BOSS')+' '+Math.round(d)+'m','bold 11px monospace',col);
 }
}
function drawHUD(){
 if(!player) return;
 const p=player;
 ctx.fillStyle='rgba(0,0,0,0.72)'; ctx.fillRect(0,0,W,HUD_H);
 bar(12,8,250,14,p.hp/p.maxhp,p.hp>p.maxhp*0.3?'#0f6':'#f44');
 ctx.fillStyle='#fff'; ctx.font='12px monospace'; ctx.textAlign='left'; ctx.fillText('HP '+Math.ceil(p.hp)+'/'+p.maxhp,14,19);
 bar(12,26,250,8,p.xp/p.xpNeed,'#0ff');
  ctx.fillText('LV '+p.level+'  XP '+Math.floor(p.xp)+'/'+p.xpNeed+(p.shieldReady?'  [AEGIS]':'')+(p.wardUp?'  [WARD]':'')+(p.bulwark>0?'  [BULx'+p.bulwark+']':'')+(p.mirrorUp?'  [MIR]':'')+(p.barrier>0?'  [BAR'+Math.ceil(p.barrier)+']':'')+(p.stasisN>0?'  [STASISx'+p.stasisN+']':''),14,43);
 if(!p.dashUnlocked){ bar(278,8,120,14,0,'#333','#111'); ctx.fillStyle='#888'; ctx.font='12px monospace'; ctx.fillText('DASH:LOCKED',280,19); }
 else { bar(278,8,120,14,p.dashCd<=0?1:1-(p.dashCd/p.dashCdMax),'#ff0');
 ctx.fillStyle='#fff'; ctx.fillText(p.dashCd<=0?'DASH [Space]':'DASH '+p.dashCd.toFixed(1),280,19); }
 ctx.fillText(p.autoFire?'AUTO[T]:ON':'AUTO[T]:OFF',280,43);
 // Kinetic Discharge charge meter — it charges on kills, so it needs to be
 // visible to be playable around.
 if(p.shockOn){ const f=clamp(p.shockKills/p.shockNeed,0,1);
  bar(410,8,116,14,f,f>=1?'#0ff':'#066','#111');
  ctx.fillStyle=f>=1?'#0ff':'#8affff'; ctx.font='11px monospace'; ctx.textAlign='left';
  ctx.fillText('DISCHARGE '+p.shockKills+'/'+p.shockNeed,412,19); }
 if(p.jamT>0){ ctx.fillStyle='#c8f'; ctx.font='bold 12px monospace'; ctx.textAlign='left'; ctx.fillText('JAMMED',410,43); }
 else if(p.rootT>0){ ctx.fillStyle='#9f4'; ctx.font='bold 12px monospace'; ctx.textAlign='left'; ctx.fillText('PETRIFIED',410,43); }
 ctx.textAlign='right'; ctx.fillStyle='#0ff'; ctx.font='bold 13px monospace';
  const an=sectorName(arenaIdx)+' · '+(arena?arena.theme.name:'')+' · FOES '+hostiles();
  ctx.fillText(an,W-12,18);
  ctx.fillStyle='#fff'; ctx.font='12px monospace';
  ctx.fillText('Kills '+kills+'  Score '+scoreCalc()+'  Best '+best+'  Depth '+depth,W-12,34);
 ctx.fillStyle='#8affff'; ctx.font='11px monospace';
 let extra='DMG x'+p.dmgMult.toFixed(2)+'  Rate '+p.fireRate.toFixed(1)+'  Shots '+p.shots;
 if(p.homing) extra+='  Seek'+p.homing;
 if(p.bounce) extra+='  Rng'+p.bounce;
 extra+='  Recall:'+(!p.recallUnlocked?'LOCKED':(p.charges+'chg '+(p.recall?(p.recallCd>0?Math.ceil(p.recallCd)+'s':'READY'):'—')));
 if(settings.showSeed&&arena) extra+='  Seed '+arena.seed;
 ctx.fillText(extra,W-12,48);
  if(portal&&state==='playing'){ ctx.textAlign='center'; ctx.fillStyle='#0ff'; ctx.font='bold 14px monospace'; ctx.fillText('Sector clear! Enter the EXIT portal [E]',W/2,HUD_H+18); }
 if(player.hp<=player.maxhp*0.3&&state==='playing'){ const a=0.25+0.2*Math.sin(performance.now()/180); ctx.strokeStyle='rgba(255,0,0,'+a.toFixed(3)+')'; ctx.lineWidth=10; ctx.strokeRect(5,HUD_H+5,W-10,H-HUD_H-10); }
}
// pill-backed label: dark plate + thin border + centered text. measureText is
// guarded (headless stubs / exotic canvases may not implement it) — falls back
// to a 7px-per-char estimate so layout never throws.
function pill(cx,cy,text,font,fg,bg){
 ctx.font=font||'12px monospace';
 let tw=text.length*7; try{ const m=ctx.measureText(text); if(m&&m.width) tw=m.width; }catch(e){}
 const w=tw+22, h=22, x=cx-w/2, y=cy-h/2;
 ctx.fillStyle=bg||'rgba(0,18,26,0.82)'; ctx.beginPath();
 if(ctx.roundRect) ctx.roundRect(x,y,w,h,11); else ctx.rect(x,y,w,h);
 ctx.fill();
 ctx.strokeStyle='rgba(0,255,255,0.55)'; ctx.lineWidth=1; ctx.stroke();
 ctx.fillStyle=fg||'#0ff'; ctx.textAlign='center'; ctx.fillText(text,cx,cy+4);
 return w;
}
function btn(x,y,w,h,label,small){ ctx.fillStyle='#06222a'; ctx.fillRect(x,y,w,h); ctx.strokeStyle='#0ff'; ctx.lineWidth=2; ctx.strokeRect(x,y,w,h); ctx.fillStyle='#fff'; ctx.font='bold '+(small?14:18)+'px monospace'; ctx.textAlign='center'; ctx.fillText(label,x+w/2,y+(small?27:32)); }
function drawTitle(){
 ctx.fillStyle='#0a0e1a'; ctx.fillRect(0,0,W,H);
 ctx.strokeStyle='rgba(0,255,255,0.15)';
 for(let i=0;i<24;i++){ const y=H-40-i*14; ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(W,y); ctx.stroke(); }
 ctx.textAlign='center';
  try{ if(ctx.letterSpacing!==undefined) ctx.letterSpacing='6px'; }catch(e){}
  ctx.fillStyle='#f0f'; ctx.font='900 64px "Cinzel Decorative", "Palatino Linotype", Palatino, serif'; ctx.fillText('KRIEFNE',W/2,132);
  try{ if(ctx.letterSpacing!==undefined) ctx.letterSpacing='0px'; }catch(e){}
  ctx.fillStyle='#0ff'; ctx.font='bold 20px monospace'; ctx.fillText('NEON ROGUELITE — die fast, loot faster',W/2,168);
  ctx.fillStyle='#fff'; ctx.font='14px monospace';
  ctx.fillText('Fight down an endless galaxy trail — clear each sector, draft an upgrade, push on.',W/2,206);
  ctx.fillText('Every 5th sector is a boss NEST. Boss kills bank +2% damage forever.',W/2,228);
  ctx.fillStyle='#8affff'; ctx.font='13px monospace';
  { const pr=codexProgress(); ctx.fillText('46 stackable upgrades · 12 bosses in a chain of command · codex '+pr.n+'/'+pr.tot+' [C]',W/2,258); }
  ctx.fillStyle='#ff0'; ctx.font='13px monospace';
  ctx.fillText('Sniper lasers are telegraphed — dash through them. Brute rings: stay out of the band.',W/2,282);
 btn(BTN.titleStart.x,BTN.titleStart.y,BTN.titleStart.w,BTN.titleStart.h,'START  [Enter]');
 btn(BTN.titleSet.x,BTN.titleSet.y,BTN.titleSet.w,BTN.titleSet.h,'SET [O]',true);
 btn(BTN.titleCodex.x,BTN.titleCodex.y,BTN.titleCodex.w,BTN.titleCodex.h,'CODEX [C]',true);
 btn(BTN.titleHelp.x,BTN.titleHelp.y,BTN.titleHelp.w,BTN.titleHelp.h,'HELP [H]',true);
  ctx.fillStyle='#0f6'; ctx.font='14px monospace'; ctx.fillText('best '+best+' · depth S'+depth,W/2,530);
  ctx.fillStyle='#666'; ctx.font='12px monospace'; ctx.fillText('vanilla Canvas · WebAudio synth · BFS-validated maps · no deps',W/2,552);
  ctx.fillStyle='#78909c'; ctx.fillText('♪ click or press any key for sound ♪',W/2,574);
}
function drawGalaxy(){
 // endless level selector: cleared trail behind, next unlock pulsing, locked dim.
 // START drops you here; every cleared sector returns here for the next pick.
 ctx.fillStyle='#04040c'; ctx.fillRect(0,0,W,H);
 const R=mulberry32(runSeed);
 for(let i=0;i<130;i++){ const x=R()*W, y=R()*H; ctx.globalAlpha=0.15+R()*0.6; ctx.fillStyle='#fff'; const sz=R()<0.12?3:2; ctx.fillRect(x,y,sz,sz); }
 ctx.globalAlpha=1;
 const s=galaxySel, th=THEMES[s%THEMES.length];
 ctx.textAlign='center';
 ctx.fillStyle='#0ff'; ctx.font='bold 26px monospace';
 ctx.fillText('GALAXY — SECTOR '+String(s+1).padStart(2,'0')+' · '+th.name,W/2,86);
 const ns=galNodes();
 ctx.strokeStyle='rgba(0,255,255,0.4)'; ctx.lineWidth=2; ctx.beginPath();
 ns.forEach((n,k)=>{ if(k===0) ctx.moveTo(n.x,n.y); else ctx.lineTo(n.x,n.y); });
 ctx.stroke();
 for(const n of ns){
  const boss=isBossSector(n.i);
  if(n.unlocked) ctx.fillStyle=n.cleared?'#0ff':(n.cur?'#f0f':'#0a8');
  else ctx.fillStyle='#223';
  ctx.beginPath(); ctx.arc(n.x,n.y,n.cur?13:10,0,6.283); ctx.fill();
  if(n.unlocked){ ctx.strokeStyle=n.cur?'#fff':'#0ff'; ctx.lineWidth=n.cur?2.5:1.5; ctx.stroke(); }
  if(boss){ ctx.fillStyle=n.unlocked?'#fff':'#556'; ctx.font='bold 12px monospace'; ctx.fillText('◆',n.x,n.y+4); }
  if(n.cur){ ctx.strokeStyle='#fff'; ctx.lineWidth=2; ctx.beginPath(); ctx.arc(n.x,n.y,18+Math.sin(performance.now()/200)*3,0,6.283); ctx.stroke(); }
  ctx.fillStyle=n.unlocked?(n.cleared?'#0ff':'#fff'):'#556'; ctx.font='11px monospace';
  ctx.fillText('S'+(n.i+1),n.x,n.y+32);
 }
 pill(W/2,H-140,galaxyLore(s,th.name),'14px monospace','#fff');
 pill(W/2,H-112,'[←→] select · [Enter / click] jump · [C] codex · [Esc] title','12px monospace','#78909c','rgba(0,10,16,0.6)');
 const pr=codexProgress();
 btn(BTN.galCodex.x,BTN.galCodex.y,BTN.galCodex.w,BTN.galCodex.h,'CODEX '+pr.n+'/'+pr.tot,true);
}
function drawSettings(){
 ctx.textAlign='center'; ctx.fillStyle='#0ff'; ctx.font='bold 30px monospace'; ctx.fillText('SETTINGS  [O / Esc]',W/2,150);
  const rows=[['1','Screen shake',settings.shake?'ON':'OFF'],['2','Particles',settings.particles?'FULL':'LOW'],['3','Music',settings.music?'ON':'OFF'],['4','Auto-fire default',settings.autofire?'ON':'OFF'],['5','Show seed in HUD',settings.showSeed?'ON':'OFF'],['6','Reset records (best/depth/bosses/codex)','WIPE'],['7','Music volume',Math.round(settings.musicVol*100)+'%'],['8','SFX volume',Math.round(settings.sfxVol*100)+'%']];
  const rr=rowRects();
  rows.forEach((r,i)=>{ ctx.fillStyle='#0a1420'; ctx.fillRect(rr[i].x,rr[i].y,rr[i].w,rr[i].h); ctx.strokeStyle='#0ff'; ctx.lineWidth=1.5; ctx.strokeRect(rr[i].x,rr[i].y,rr[i].w,rr[i].h);
   ctx.fillStyle='#ff0'; ctx.font='bold 14px monospace'; ctx.textAlign='left'; ctx.fillText('['+r[0]+']  '+r[1],rr[i].x+16,rr[i].y+26);
   ctx.fillStyle='#0f6'; ctx.textAlign='right'; ctx.fillText(r[2],rr[i].x+rr[i].w-16,rr[i].y+26); });
 btn(BTN.back.x,BTN.back.y,BTN.back.w,BTN.back.h,'BACK');
}
function drawHelp(){
 const labels=['1 CONTROLS','2 SHIELDS','3 ARSENAL','4 LORE'];
 ctx.textAlign='center'; ctx.fillStyle='#0ff'; ctx.font='bold 28px monospace'; ctx.fillText('HELP',W/2,100);
 ctx.fillStyle='#78909c'; ctx.font='12px monospace';
 ctx.fillText('[1-4 / click / ←→] switch tab · [H / Esc] back · the CODEX is its own screen: [C]',W/2,120);
 const rr=helpTabRects();
 HELP_TABS.forEach((t,i)=>{ const r=rr[i], on=helpTab===t;
  ctx.fillStyle=on?'#0ff':'#06222a'; ctx.fillRect(r.x,r.y,r.w,r.h);
  ctx.strokeStyle='#0ff'; ctx.lineWidth=on?2.5:1.5; ctx.strokeRect(r.x,r.y,r.w,r.h);
  ctx.fillStyle=on?'#000':'#fff'; ctx.font='bold 14px monospace'; ctx.fillText(labels[i],r.x+r.w/2,r.y+21); });
 const L=HELP_TXT[helpTab]||HELP_TXT.controls;
 ctx.textAlign='left'; ctx.font='13px monospace'; ctx.fillStyle='#ddd';
 L.forEach((l,i)=>ctx.fillText(l,80,196+i*24));
 btn(BTN.back.x,BTN.back.y,BTN.back.w,BTN.back.h,'BACK');
}
function codexRects(){ return codexRows().map((r,k)=>({x:56,y:170+k*20,w:200,h:18,row:r})); }
// The preview renders the REAL sprite by building a throwaway entity and calling
// the same draw code the game uses. A second set of codex art would drift out of
// sync the first time a boss was retuned. Locked entries use the same shape as
// a flat shadow, so you can recognise a silhouette before you can read it.
function drawCodexSprite(entry,cx,cy,locked){
 let e=null;
 try{
  e=(codexTab==='bosses')?mkBoss(entry.id,cx,cy,9):mkEnemy(entry.type,cx,cy,2);
 }catch(err){ return; }
 e.x=cx; e.y=cy; e.t=locked?0.6:performance.now()/1000; e.flash=0; e.spawnT=0; e.vscale=1;
 e.hp=e.maxhp; e.mode='hunt'; e.phased=false; e.segs=[]; e.wards=[];
 e.aimT=0; e.windup=0; e.dashState=0; e.slowT=0; e.laser=null; e.beamT=0; e.gaze=null;
 e.facing=0.9;
 const k=codexTab==='bosses'?(44/Math.max(22,e.r)):2.4; // fit the plate, whatever the radius
 codexPreview=true;
 ctx.save();
 if(locked){ try{ ctx.filter='brightness(0) invert(0.2)'; }catch(err){} ctx.globalAlpha=0.9; }
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
 const down=subs.length?'Commands '+plural(TIER_NAMES[t-1])+': '+subs.map(k=>codexKnown(k)?BOSSDEF[k].name:'???').join(', ')
  :'Commands only chaff';
 return up+'  ·  '+down;
}
function drawCodexScreen(){
 const L=codexList();
 if(codexSel>=L.length) codexSel=0;
 const pr=codexProgress();
 ctx.textAlign='center'; ctx.fillStyle='#0ff'; ctx.font='bold 28px monospace'; ctx.fillText('CODEX',W/2,72);
 ctx.fillStyle='#8cf'; ctx.font='12px monospace';
 ctx.fillText('DEFEATED '+pr.n+' / '+pr.tot+'  ·  entries unlock on your first kill  ·  [1/2 ←→] tab  [↑↓] entry  [C / Esc] back',W/2,98);
 const tr=codexTabRects();
 ['1 BESTIARY','2 BOSSES'].forEach((lab,i)=>{ const r=tr[i], on=codexTab===CODEX_TABS[i];
  ctx.fillStyle=on?'#0ff':'#06222a'; ctx.fillRect(r.x,r.y,r.w,r.h);
  ctx.strokeStyle='#0ff'; ctx.lineWidth=on?2.5:1.5; ctx.strokeRect(r.x,r.y,r.w,r.h);
  ctx.fillStyle=on?'#000':'#fff'; ctx.font='bold 14px monospace'; ctx.fillText(lab,r.x+r.w/2,r.y+21); });
 // index column: rank headers + entries (bosses), or a flat list (bestiary)
 ctx.textAlign='left';
 for(const r of codexRects()){
  if(r.row.hdr){ ctx.fillStyle='#fc0'; ctx.font='bold 10px monospace'; ctx.fillText(r.row.hdr,r.x+2,r.y+13); continue; }
  const it=r.row.entry, on=r.row.i===codexSel, known=codexKnown(codexId(it));
  ctx.fillStyle=on?'rgba(0,255,255,0.16)':'rgba(255,255,255,0.03)'; ctx.fillRect(r.x,r.y,r.w,r.h);
  if(on){ ctx.strokeStyle='#0ff'; ctx.lineWidth=1; ctx.strokeRect(r.x,r.y,r.w,r.h); }
  ctx.font='12px monospace'; ctx.fillStyle=known?(on?'#0ff':'#9ab'):'#445';
  const nm=known?(it.name||BOSSDEF[it.id].name):'? ? ? ? ?';
  ctx.fillText((codexTab==='bosses'?'  ':'')+nm,r.x+8,r.y+13);
  if(codexTab==='bosses'){ ctx.fillStyle=on?'#ff0':'#556'; ctx.textAlign='right'; ctx.fillText('S'+BOSSDEF[it.id].debut,r.x+r.w-8,r.y+13); ctx.textAlign='left'; }
 }
 const entry=L[codexSel];
 if(!entry){ btn(BTN.back.x,BTN.back.y,BTN.back.w,BTN.back.h,'BACK'); return; }
 const known=codexKnown(codexId(entry)), boss=codexTab==='bosses';
 // detail pane
 const px=286, pw=W-px-46, py=164;
 ctx.fillStyle='rgba(0,255,255,0.04)'; ctx.fillRect(px,py,pw,380);
 ctx.strokeStyle='rgba(0,255,255,0.28)'; ctx.lineWidth=1; ctx.strokeRect(px,py,pw,380);
 drawCodexSprite(entry,px+64,py+62,!known);
 ctx.textAlign='left';
 if(!known){
  ctx.fillStyle='#556'; ctx.font='bold 22px monospace'; ctx.fillText('? ? ? ? ?',px+126,py+40);
  ctx.fillStyle='#667'; ctx.font='12px monospace';
  ctx.fillText(boss?'Unidentified  ·  first met around S'+BOSSDEF[entry.id].debut:'Unidentified hostile',px+126,py+60);
  ctx.fillStyle='#8cf'; ctx.font='13px monospace';
  ctx.fillText('No kill logged.',px+18,py+150);
  ctx.fillStyle='#9ab'; ctx.font='12px monospace';
  ctx.fillText('Defeat one to unlock its rank, tells, counters and field notes.',px+18,py+172);
  btn(BTN.back.x,BTN.back.y,BTN.back.w,BTN.back.h,'BACK');
  return;
 }
 const name=entry.name||BOSSDEF[entry.id].name;
 ctx.fillStyle='#0ff'; ctx.font='bold 22px monospace'; ctx.fillText(name,px+126,py+40);
 ctx.fillStyle='#8affff'; ctx.font='12px monospace';
 const rank=boss?TIER_NAMES[BOSSDEF[entry.id].tier]+'  ·  ':'';
 ctx.fillText(rank+entry.role+'  ·  '+entry.threat+(boss?'  ·  first seen S'+BOSSDEF[entry.id].debut:''),px+126,py+60);
 if(boss){ ctx.fillStyle='#fc0'; ctx.font='11px monospace'; wrapLines(commandLine(entry.id),72).forEach((l,i)=>ctx.fillText(l,px+126,py+80+i*14)); }
 let y=py+126;
 const block=(label,text,col)=>{
  ctx.fillStyle=col; ctx.font='bold 11px monospace'; ctx.fillText(label,px+18,y);
  ctx.fillStyle='#ddd'; ctx.font='12px monospace';
  const lines=wrapLines(text,80);
  lines.forEach((l,i)=>ctx.fillText(l,px+18,y+17+i*16));
  y+=17+lines.length*16+10;
 };
 block('TELL',entry.tell,'#ff0');
 block('COUNTER',entry.counter,'#0f6');
 ctx.fillStyle='#c8f'; ctx.font='bold 11px monospace'; ctx.fillText('FIELD NOTE',px+18,y);
 ctx.fillStyle='#9ab'; ctx.font='italic 12px monospace';
 wrapLines(entry.lore,82).forEach((l,i)=>ctx.fillText(l,px+18,y+17+i*16));
 btn(BTN.back.x,BTN.back.y,BTN.back.w,BTN.back.h,'BACK');
}
// Arrow navigation walks entries in the order they are LISTED (rank order for
// bosses), skipping headers.
function codexStep(dir){
 const order=codexRows().filter(r=>!r.hdr).map(r=>r.i);
 let k=order.indexOf(codexSel); if(k<0) k=0;
 codexSel=order[(k+dir+order.length)%order.length];
}
function drawIcon(id,cx,cy,s){
 ctx.save(); ctx.translate(cx,cy); const u=s/20;
 ctx.fillStyle='rgba(0,40,50,0.9)'; ctx.beginPath(); ctx.arc(0,0,s+4,0,6.283); ctx.fill();
 ctx.strokeStyle='rgba(0,255,255,0.5)'; ctx.lineWidth=1.5; ctx.beginPath(); ctx.arc(0,0,s+4,0,6.283); ctx.stroke();
 ctx.lineWidth=2; ctx.lineCap='round';
 switch(id){
  case 'rate': ctx.strokeStyle='#ff0'; for(let i=-1;i<=1;i++){ ctx.beginPath(); ctx.moveTo(-12*u,i*7*u); ctx.lineTo(12*u,i*7*u); ctx.stroke(); } break;
  case 'dmg': ctx.strokeStyle='#0ff'; ctx.beginPath(); ctx.arc(0,0,10*u,0,6.283); ctx.stroke(); ctx.fillStyle='#f44'; ctx.beginPath(); ctx.arc(0,0,3*u,0,6.283); ctx.fill();
   ctx.beginPath(); ctx.moveTo(0,-14*u); ctx.lineTo(0,-10*u); ctx.moveTo(0,10*u); ctx.lineTo(0,14*u); ctx.moveTo(-14*u,0); ctx.lineTo(-10*u,0); ctx.moveTo(10*u,0); ctx.lineTo(14*u,0); ctx.stroke(); break;
  case 'hp': ctx.fillStyle='#0f6'; ctx.fillRect(-4*u,-12*u,8*u,24*u); ctx.fillRect(-12*u,-4*u,24*u,8*u); break;
  case 'spd': ctx.fillStyle='#f80'; ctx.beginPath(); ctx.moveTo(-10*u,8*u); ctx.lineTo(2*u,0); ctx.lineTo(-10*u,-8*u); ctx.lineTo(-5*u,0); ctx.closePath(); ctx.fill();
   ctx.strokeStyle='#ff0'; ctx.beginPath(); ctx.moveTo(2*u,-6*u); ctx.lineTo(12*u,-6*u); ctx.moveTo(2*u,6*u); ctx.lineTo(12*u,6*u); ctx.stroke(); break;
  case 'slip': ctx.strokeStyle='#8ff'; for(let i=-1;i<=1;i++){ ctx.beginPath(); ctx.moveTo(-13*u,i*7*u); ctx.quadraticCurveTo(-4*u,i*7*u-5*u,4*u,i*7*u); ctx.quadraticCurveTo(9*u,i*7*u+3*u,13*u,i*7*u-2*u); ctx.stroke(); } break;
  case 'split': ctx.strokeStyle='#fff'; ctx.beginPath(); ctx.moveTo(-13*u,0); ctx.lineTo(-1*u,0); ctx.moveTo(-1*u,0); ctx.lineTo(11*u,-8*u); ctx.moveTo(-1*u,0); ctx.lineTo(11*u,8*u); ctx.stroke();
   ctx.fillStyle='#fff'; ctx.beginPath(); ctx.arc(11*u,-8*u,2.4*u,0,6.283); ctx.arc(11*u,8*u,2.4*u,0,6.283); ctx.fill(); break;
  case 'vamp': ctx.translate(0,-1.5*u); ctx.fillStyle='#f24'; ctx.beginPath(); ctx.moveTo(0,-13*u); ctx.quadraticCurveTo(10*u,2*u,10*u,6*u); ctx.arc(0,6*u,10*u,0,Math.PI); ctx.quadraticCurveTo(-10*u,2*u,0,-13*u); ctx.fill();
   ctx.fillStyle='#fcc'; ctx.beginPath(); ctx.arc(-3*u,5*u,2.4*u,0,6.283); ctx.fill(); break;
  case 'seek': ctx.strokeStyle='#f0f'; ctx.beginPath(); ctx.arc(0,0,10*u,0.6,5.2); ctx.stroke();
   ctx.fillStyle='#f0f'; ctx.beginPath(); ctx.moveTo(12*u,-4*u); ctx.lineTo(14*u,6*u); ctx.lineTo(5*u,3*u); ctx.closePath(); ctx.fill();
   ctx.beginPath(); ctx.arc(0,0,2.4*u,0,6.283); ctx.fill(); break;
  case 'rico': ctx.strokeStyle='#ff0'; ctx.beginPath(); ctx.moveTo(-13*u,9*u); ctx.lineTo(-5*u,-8*u); ctx.lineTo(3*u,9*u); ctx.lineTo(11*u,-8*u); ctx.stroke();
   ctx.strokeStyle='#888'; ctx.beginPath(); ctx.moveTo(-14*u,-12*u); ctx.lineTo(14*u,-12*u); ctx.stroke(); break;
  case 'aegis': ctx.fillStyle='rgba(0,255,255,0.25)'; ctx.strokeStyle='#0ff'; ctx.beginPath(); ctx.moveTo(0,-13*u); ctx.lineTo(10*u,-8*u); ctx.lineTo(10*u,1*u); ctx.quadraticCurveTo(10*u,9*u,0,13*u); ctx.quadraticCurveTo(-10*u,9*u,-10*u,1*u); ctx.lineTo(-10*u,-8*u); ctx.closePath(); ctx.fill(); ctx.stroke(); break;
  case 'crit': ctx.fillStyle='#ff0'; ctx.beginPath(); ctx.moveTo(0,-13*u); ctx.lineTo(3*u,-3*u); ctx.lineTo(13*u,0); ctx.lineTo(3*u,3*u); ctx.lineTo(0,13*u); ctx.lineTo(-3*u,3*u); ctx.lineTo(-13*u,0); ctx.lineTo(-3*u,-3*u); ctx.closePath(); ctx.fill(); break;
  case 'surge': ctx.fillStyle='#fa0'; ctx.beginPath(); ctx.moveTo(1*u,-13*u); ctx.lineTo(8*u,-13*u); ctx.lineTo(2*u,-1*u); ctx.lineTo(7*u,-1*u); ctx.lineTo(-4*u,13*u); ctx.lineTo(-1*u,2*u); ctx.lineTo(-6*u,2*u); ctx.closePath(); ctx.fill(); break;
  case 'tract': ctx.translate(0,2.5*u); ctx.strokeStyle='#f44'; ctx.lineWidth=6*u; ctx.beginPath(); ctx.arc(0,1*u,8*u,Math.PI,0); ctx.stroke(); ctx.lineWidth=2;
   ctx.fillStyle='#fff'; ctx.fillRect(-11*u,-2*u,6*u,7*u); ctx.fillRect(5*u,-2*u,6*u,7*u); break;
   case 'pcell': ctx.fillStyle='rgba(255,255,0,0.3)'; ctx.strokeStyle='#ff0'; ctx.beginPath(); ctx.moveTo(0,-12*u); ctx.lineTo(10*u,0); ctx.lineTo(0,12*u); ctx.lineTo(-10*u,0); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle='#ff0'; ctx.beginPath(); ctx.arc(0,0,3*u,0,6.283); ctx.fill(); break;
   case 'shock': ctx.strokeStyle='#0ff'; ctx.lineWidth=2; for(let i=1;i<=3;i++){ ctx.globalAlpha=1-i*0.22; ctx.beginPath(); ctx.arc(0,0,i*4.5*u,0,6.283); ctx.stroke(); } ctx.globalAlpha=1;
    ctx.fillStyle='#0ff'; ctx.beginPath(); ctx.arc(0,0,3*u,0,6.283); ctx.fill(); break;
   case 'shockcap': ctx.strokeStyle='#0ff'; ctx.lineWidth=3*u; ctx.beginPath(); ctx.moveTo(-3*u,-11*u); ctx.lineTo(-3*u,11*u); ctx.moveTo(4*u,-11*u); ctx.lineTo(4*u,11*u); ctx.stroke(); ctx.lineWidth=2;
    ctx.strokeStyle='#ff0'; ctx.beginPath(); ctx.moveTo(-12*u,0); ctx.lineTo(-6*u,0); ctx.moveTo(7*u,0); ctx.lineTo(13*u,0); ctx.stroke(); break;
   case 'shockamp': ctx.strokeStyle='#0ff'; ctx.beginPath(); ctx.arc(0,2*u,11*u,Math.PI,0); ctx.stroke();
    ctx.fillStyle='#ff0'; ctx.beginPath(); ctx.moveTo(1*u,-12*u); ctx.lineTo(7*u,-12*u); ctx.lineTo(2*u,-2*u); ctx.lineTo(6*u,-2*u); ctx.lineTo(-3*u,10*u); ctx.lineTo(0,-1*u); ctx.lineTo(-5*u,-1*u); ctx.closePath(); ctx.fill(); break;
   case 'shockrad': ctx.strokeStyle='#8ff'; ctx.setLineDash([4*u,3*u]); ctx.beginPath(); ctx.arc(0,0,12*u,0,6.283); ctx.stroke(); ctx.setLineDash([]);
    ctx.strokeStyle='#0ff'; ctx.beginPath(); ctx.arc(0,0,6*u,0,6.283); ctx.stroke();
    ctx.fillStyle='#cff'; ctx.beginPath(); ctx.arc(0,0,2.4*u,0,6.283); ctx.fill(); break;
   case 'orbital': ctx.fillStyle='#ff0'; ctx.beginPath(); ctx.arc(0,-11*u,3*u,0,6.283); ctx.fill();
    ctx.strokeStyle='#ff0'; ctx.lineWidth=2; ctx.beginPath(); ctx.moveTo(0,-8*u); ctx.lineTo(0,4*u); ctx.stroke();
    ctx.beginPath(); ctx.arc(0,8*u,8*u,0,6.283); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-11*u,8*u); ctx.lineTo(11*u,8*u); ctx.stroke(); break;
   case 'lance': ctx.strokeStyle='#8ff'; ctx.lineWidth=5*u; ctx.beginPath(); ctx.moveTo(-13*u,6*u); ctx.lineTo(13*u,-6*u); ctx.stroke(); ctx.lineWidth=2;
    ctx.strokeStyle='#fff'; ctx.beginPath(); ctx.moveTo(-13*u,6*u); ctx.lineTo(13*u,-6*u); ctx.stroke();
    ctx.fillStyle='#cff'; ctx.beginPath(); ctx.arc(12*u,-6*u,3*u,0,6.283); ctx.fill(); break;
   case 'flak': ctx.fillStyle='#fa0'; ctx.beginPath(); ctx.arc(0,0,4*u,0,6.283); ctx.fill();
    ctx.strokeStyle='#f60'; ctx.lineWidth=2; for(let i=0;i<8;i++){ const a=i*0.7854; ctx.beginPath(); ctx.moveTo(Math.cos(a)*6*u,Math.sin(a)*6*u); ctx.lineTo(Math.cos(a)*12*u,Math.sin(a)*12*u); ctx.stroke(); } break;
   case 'corrode': ctx.fillStyle='#9f4'; ctx.beginPath(); ctx.arc(0,-4*u,5*u,0,6.283); ctx.fill();
    ctx.strokeStyle='#9f4'; ctx.lineWidth=2; ctx.beginPath(); ctx.moveTo(-8*u,4*u); ctx.quadraticCurveTo(0,12*u,8*u,4*u); ctx.stroke();
    ctx.fillStyle='#6c2'; ctx.beginPath(); ctx.arc(-5*u,8*u,2*u,0,6.283); ctx.arc(5*u,9*u,1.6*u,0,6.283); ctx.fill(); break;
   case 'chain': ctx.strokeStyle='#8ff'; ctx.lineWidth=2.4; ctx.beginPath(); ctx.moveTo(-12*u,-8*u); ctx.lineTo(-3*u,-1*u); ctx.lineTo(-7*u,3*u); ctx.lineTo(3*u,10*u); ctx.stroke();
    ctx.fillStyle='#cff'; ctx.beginPath(); ctx.arc(-12*u,-8*u,2.6*u,0,6.283); ctx.arc(3*u,10*u,2.6*u,0,6.283); ctx.fill();
    ctx.strokeStyle='#ff0'; ctx.beginPath(); ctx.moveTo(6*u,-10*u); ctx.lineTo(12*u,-4*u); ctx.stroke(); break;
   case 'overcharge': ctx.translate(-3.5*u,0); ctx.fillStyle='#ff0'; ctx.beginPath(); ctx.moveTo(-2*u,-13*u); ctx.lineTo(6*u,-13*u); ctx.lineTo(0,-2*u); ctx.lineTo(5*u,-2*u); ctx.lineTo(-4*u,13*u); ctx.lineTo(-1*u,1*u); ctx.lineTo(-6*u,1*u); ctx.closePath(); ctx.fill();
    ctx.strokeStyle='#fa0'; ctx.lineWidth=2; ctx.beginPath(); ctx.arc(0,0,12*u,-0.6,0.6); ctx.stroke(); break;
   case 'adrenal': ctx.fillStyle='#f24'; ctx.beginPath(); ctx.arc(0,0,10*u,0,6.283); ctx.fill();
    ctx.strokeStyle='#fff'; ctx.lineWidth=2; ctx.beginPath();
    ctx.moveTo(-11*u,0); ctx.lineTo(-5*u,0); ctx.lineTo(-2*u,-7*u); ctx.lineTo(2*u,7*u); ctx.lineTo(5*u,0); ctx.lineTo(11*u,0); ctx.stroke(); break;
   case 'repair': ctx.strokeStyle='#0f6'; ctx.lineWidth=2; ctx.beginPath(); ctx.arc(0,-2*u,6*u,0,6.283); ctx.stroke();
    ctx.fillStyle='#0f6'; ctx.fillRect(-2*u,-6*u,4*u,8*u); ctx.fillRect(-6*u,-3*u,12*u,3*u);
    ctx.strokeStyle='#8fc'; ctx.beginPath(); ctx.moveTo(-10*u,8*u); ctx.lineTo(-4*u,8*u); ctx.moveTo(4*u,8*u); ctx.lineTo(10*u,8*u); ctx.stroke(); break;
   case 'shrap': ctx.fillStyle='#fc6'; for(let i=0;i<7;i++){ const a=i*0.897; ctx.save(); ctx.rotate(a); ctx.beginPath(); ctx.moveTo(5*u,0); ctx.lineTo(12*u,-2.6*u); ctx.lineTo(12*u,2.6*u); ctx.closePath(); ctx.fill(); ctx.restore(); }
    ctx.strokeStyle='#f60'; ctx.lineWidth=2; ctx.beginPath(); ctx.arc(0,0,3.4*u,0,6.283); ctx.stroke(); break;
   case 'salvage': ctx.strokeStyle='#3ff'; ctx.lineWidth=2; ctx.save(); ctx.rotate(Math.PI/4); ctx.strokeRect(-6*u,-6*u,12*u,12*u); ctx.restore();
    ctx.fillStyle='#0f6'; ctx.fillRect(-2*u,-9*u,4*u,6*u); ctx.fillRect(-5*u,-7.5*u,10*u,3*u);
    ctx.fillStyle='#3ff'; ctx.beginPath(); ctx.arc(-9*u,7*u,2.4*u,0,6.283); ctx.arc(9*u,6*u,2*u,0,6.283); ctx.fill(); break;
   case 'refit': ctx.strokeStyle='#0f6'; ctx.lineWidth=2.4; ctx.beginPath(); ctx.arc(0,0,10*u,0.6,5.0); ctx.stroke();
    ctx.fillStyle='#0f6'; ctx.beginPath(); ctx.moveTo(10*u,-6*u); ctx.lineTo(13*u,2*u); ctx.lineTo(5*u,0); ctx.closePath(); ctx.fill();
    ctx.fillStyle='#0f6'; ctx.fillRect(-2*u,-5*u,4*u,10*u); ctx.fillRect(-5*u,-2*u,10*u,4*u); break;
  case 'gatecd': ctx.strokeStyle='#0fc'; ctx.beginPath(); ctx.arc(0,0,11*u,0,6.283); ctx.stroke();
   ctx.beginPath(); ctx.moveTo(0,0); ctx.lineTo(0,-7*u); ctx.moveTo(0,0); ctx.lineTo(5*u,2*u); ctx.stroke();
   ctx.fillStyle='#0fc'; ctx.beginPath(); ctx.arc(0,-11*u,2*u,0,6.283); ctx.fill(); break;
  case 'transit': ctx.fillStyle='#0ff'; ctx.beginPath(); ctx.moveTo(-11*u,-9*u); ctx.lineTo(-1*u,0); ctx.lineTo(-11*u,9*u); ctx.lineTo(-6*u,0); ctx.closePath(); ctx.fill();
   ctx.beginPath(); ctx.moveTo(-1*u,-9*u); ctx.lineTo(9*u,0); ctx.lineTo(-1*u,9*u); ctx.lineTo(4*u,0); ctx.closePath(); ctx.fill(); break;
  case 'orbit': ctx.fillStyle='#fc0'; ctx.beginPath(); ctx.arc(0,0,3.4*u,0,6.283); ctx.fill();
   ctx.strokeStyle='#fc0'; ctx.beginPath(); ctx.ellipse(0,0,12*u,6*u,0.5,0,6.283); ctx.stroke();
   ctx.fillStyle='#fff'; ctx.beginPath(); ctx.arc(10*u,-5*u,2.6*u,0,6.283); ctx.fill(); break;
  case 'nova': ctx.strokeStyle='#8ff'; for(let i=0;i<3;i++){ const a=i*Math.PI/3; ctx.beginPath(); ctx.moveTo(-Math.cos(a)*12*u,-Math.sin(a)*12*u); ctx.lineTo(Math.cos(a)*12*u,Math.sin(a)*12*u); ctx.stroke(); }
   ctx.fillStyle='#fff'; ctx.beginPath(); ctx.arc(0,0,2.6*u,0,6.283); ctx.fill(); break;
  case 'tesla': ctx.strokeStyle='#8ff'; ctx.beginPath(); ctx.moveTo(-8*u,12*u); ctx.lineTo(8*u,12*u); ctx.moveTo(0,12*u); ctx.lineTo(0,-10*u); ctx.stroke();
   ctx.beginPath(); ctx.moveTo(-6*u,4*u); ctx.lineTo(6*u,4*u); ctx.moveTo(-4*u,-2*u); ctx.lineTo(4*u,-2*u); ctx.stroke();
   ctx.strokeStyle='#ff0'; ctx.beginPath(); ctx.moveTo(-11*u,-4*u); ctx.quadraticCurveTo(-14*u,-9*u,-9*u,-11*u); ctx.moveTo(11*u,-4*u); ctx.quadraticCurveTo(14*u,-9*u,9*u,-11*u); ctx.stroke();
   ctx.fillStyle='#ff0'; ctx.beginPath(); ctx.arc(0,-10*u,2.4*u,0,6.283); ctx.fill(); break;
  case 'pierce': ctx.strokeStyle='#888'; ctx.lineWidth=4*u; ctx.beginPath(); ctx.moveTo(-4*u,-11*u); ctx.lineTo(-4*u,11*u); ctx.moveTo(4*u,-11*u); ctx.lineTo(4*u,11*u); ctx.stroke(); ctx.lineWidth=2;
   ctx.fillStyle='#ff0'; ctx.beginPath(); ctx.moveTo(-13*u,0); ctx.lineTo(8*u,0); ctx.lineTo(8*u,-5*u); ctx.lineTo(14*u,0); ctx.lineTo(8*u,5*u); ctx.lineTo(8*u,0); ctx.closePath(); ctx.fill(); break;
  case 'wind': ctx.fillStyle='#0f6'; ctx.beginPath(); ctx.arc(-4*u,0,5.5*u,Math.PI*0.5,Math.PI*1.5); ctx.arc(4*u,0,5.5*u,Math.PI*0.5,Math.PI*1.5); ctx.fill();
   ctx.beginPath(); ctx.moveTo(-9*u,3*u); ctx.lineTo(0,12*u); ctx.lineTo(9*u,3*u); ctx.closePath(); ctx.fill();
   ctx.strokeStyle='#fff'; ctx.beginPath(); ctx.moveTo(-9*u,-6*u); ctx.quadraticCurveTo(-14*u,-10*u,-13*u,-13*u); ctx.moveTo(9*u,-6*u); ctx.quadraticCurveTo(14*u,-10*u,13*u,-13*u); ctx.stroke(); break;
   case 'array': ctx.translate(-8.9*u,0); ctx.fillStyle='#1a2b33'; ctx.strokeStyle='#0ff'; for(let i=-1;i<=1;i++){ ctx.fillRect(2*u,i*6*u-2*u,12*u,4*u); ctx.strokeRect(2*u,i*6*u-2*u,12*u,4*u); }
    ctx.fillStyle='#ff0'; ctx.beginPath(); ctx.arc(14*u,-6*u,1.8*u,0,6.283); ctx.arc(14*u,0,1.8*u,0,6.283); ctx.arc(14*u,6*u,1.8*u,0,6.283); ctx.fill(); break;
   case 'minigun': ctx.strokeStyle='#ff0'; ctx.lineWidth=3*u; for(let i=-1;i<=1;i++){ ctx.beginPath(); ctx.moveTo(-4*u,i*6*u); ctx.lineTo(10*u,i*8*u); ctx.stroke(); } ctx.lineWidth=2;
    ctx.fillStyle='#f60'; ctx.fillRect(-12*u,-7*u,8*u,14*u); ctx.strokeStyle='#fff'; ctx.strokeRect(-12*u,-7*u,8*u,14*u); break;
   case 'inc': ctx.fillStyle='#f60'; ctx.beginPath(); ctx.moveTo(0,-13*u); ctx.quadraticCurveTo(11*u,-2*u,7*u,7*u); ctx.quadraticCurveTo(4*u,13*u,0,13*u); ctx.quadraticCurveTo(-4*u,13*u,-7*u,7*u); ctx.quadraticCurveTo(-11*u,-2*u,0,-13*u); ctx.fill();
    ctx.fillStyle='#ff0'; ctx.beginPath(); ctx.arc(0,5*u,4*u,0,6.283); ctx.fill(); break;
   case 'cryo': ctx.fillStyle='rgba(140,255,255,0.35)'; ctx.strokeStyle='#8ff'; ctx.beginPath(); ctx.moveTo(0,-12*u); ctx.lineTo(9*u,0); ctx.lineTo(0,12*u); ctx.lineTo(-9*u,0); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.strokeStyle='#fff'; ctx.beginPath(); ctx.moveTo(-5*u,-5*u); ctx.lineTo(5*u,5*u); ctx.moveTo(5*u,-5*u); ctx.lineTo(-5*u,5*u); ctx.stroke(); break;
   case 'slug': ctx.fillStyle='#fc0'; ctx.strokeStyle='#fff'; ctx.beginPath(); ctx.moveTo(-6*u,-6*u); ctx.lineTo(8*u,-6*u); ctx.quadraticCurveTo(13*u,0,8*u,6*u); ctx.lineTo(-6*u,6*u); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle='#a60'; ctx.fillRect(-10*u,-5*u,4*u,10*u); break;
   case 'ward': ctx.fillStyle='rgba(255,255,255,0.25)'; ctx.strokeStyle='#fff'; ctx.beginPath(); ctx.moveTo(0,-13*u); ctx.lineTo(10*u,-8*u); ctx.lineTo(10*u,1*u); ctx.quadraticCurveTo(10*u,9*u,0,13*u); ctx.quadraticCurveTo(-10*u,9*u,-10*u,1*u); ctx.lineTo(-10*u,-8*u); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.strokeStyle='#0f6'; ctx.beginPath(); ctx.moveTo(-5*u,1*u); ctx.lineTo(-1*u,5*u); ctx.lineTo(6*u,-4*u); ctx.stroke(); break;
   case 'bulwark': ctx.translate(0,7.75*u); ctx.strokeStyle='#fc0'; for(let i=0;i<3;i++){ ctx.beginPath(); ctx.arc(0,(8-i*7)*u,11*u,Math.PI*1.2,Math.PI*1.8); ctx.stroke(); } break;
   case 'mirror': ctx.fillStyle='rgba(200,120,255,0.3)'; ctx.strokeStyle='#c8f'; ctx.beginPath(); ctx.moveTo(0,-12*u); ctx.lineTo(10*u,0); ctx.lineTo(0,12*u); ctx.lineTo(-10*u,0); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.strokeStyle='#fff'; ctx.beginPath(); ctx.moveTo(-12*u,6*u); ctx.lineTo(-2*u,-2*u); ctx.lineTo(6*u,6*u); ctx.stroke();
    ctx.fillStyle='#fff'; ctx.beginPath(); ctx.arc(6*u,6*u,2*u,0,6.283); ctx.fill(); break;
   case 'barrier': ctx.fillStyle='#0fc'; ctx.fillRect(-12*u,-8*u,24*u,6*u); ctx.fillRect(-12*u,0,24*u,6*u); ctx.fillRect(-12*u,8*u,24*u,4*u);
    ctx.fillStyle='#063'; ctx.fillRect(-1*u,-8*u,2*u,6*u); ctx.fillRect(-7*u,0,2*u,6*u); ctx.fillRect(5*u,0,2*u,6*u); break;
   case 'stasis': ctx.strokeStyle='#c8f'; ctx.beginPath(); ctx.moveTo(-9*u,-11*u); ctx.lineTo(9*u,-11*u); ctx.moveTo(-9*u,11*u); ctx.lineTo(9*u,11*u); ctx.stroke();
    ctx.fillStyle='rgba(200,120,255,0.4)'; ctx.beginPath(); ctx.moveTo(-9*u,-11*u); ctx.lineTo(9*u,-11*u); ctx.lineTo(0,0); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(-9*u,11*u); ctx.lineTo(9*u,11*u); ctx.lineTo(0,0); ctx.closePath(); ctx.fill(); break;
   case 'magnet': ctx.strokeStyle='#0ff'; ctx.lineWidth=6*u; ctx.beginPath(); ctx.arc(0,1*u,8*u,Math.PI,0); ctx.stroke(); ctx.lineWidth=2;
    ctx.fillStyle='#f0f'; ctx.fillRect(-11*u,-2*u,6*u,7*u); ctx.fillRect(5*u,-2*u,6*u,7*u);
    ctx.fillStyle='#ff0'; ctx.beginPath(); ctx.arc(0,10*u,2*u,0,6.283); ctx.fill(); break;
   default: ctx.fillStyle='#fff'; ctx.font='bold 20px monospace'; ctx.textAlign='center'; ctx.fillText('?',0,7);
 }
 ctx.restore();
}
function drawLevelUp(){
 ctx.fillStyle='rgba(0,0,10,0.72)'; ctx.fillRect(0,0,W,H);
 ctx.textAlign='center'; ctx.fillStyle='#ff0'; ctx.font='bold 28px monospace';
 ctx.fillText('LEVEL '+player.level+' — CHOOSE UPGRADE',W/2,170);
 ctx.fillStyle='#fff'; ctx.font='14px monospace'; ctx.fillText('press 1 / 2 / 3 or click',W/2,194);
  levelChoices.forEach((u,i)=>{ const bx=130+i*240, by=220, bw=220, bh=200;
   ctx.fillStyle='#0a1420'; ctx.fillRect(bx,by,bw,bh);
   const bc=u.id==='pcell'?'#ff0':(u.r===2?'#f0f':(u.r===1?'#0f6':'#0ff'));
   ctx.strokeStyle=bc; ctx.lineWidth=u.r===2?3:2; ctx.strokeRect(bx,by,bw,bh);
   ctx.fillStyle=bc; ctx.font='bold 14px monospace'; ctx.textAlign='center';
   ctx.fillText('['+(i+1)+']'+(u.r===2?' ★RARE':''),bx+bw/2,by+24);
  drawIcon(u.id,bx+bw/2,by+58,19);
  const dn=(typeof u.dyn==='function')?u.dyn(player):null;
  ctx.fillStyle='#fff'; ctx.font='bold 14px monospace'; wrapText((dn&&dn.name)||u.name,bx+bw/2,by+96,bw-20);
  ctx.fillStyle='#8affff'; ctx.font='12px monospace'; wrapText((dn&&dn.desc)||u.desc,bx+bw/2,by+130,bw-20);
 });
}
function wrapText(t,x,y,mw){ const words=t.split(' '); let line='', yy=y; ctx.textAlign='center';
 for(const w of words){ if((line+' '+w).length>20){ ctx.fillText(line,x,yy); yy+=20; line=w; } else line=(line?line+' ':'')+w; }
 ctx.fillText(line,x,yy);
}
function drawPaused(){
 ctx.fillStyle='rgba(0,0,0,0.65)'; ctx.fillRect(0,0,W,H);
 ctx.textAlign='center'; ctx.fillStyle='#0ff'; ctx.font='bold 38px monospace'; ctx.fillText(autoPaused?'AUTO-PAUSED':'PAUSED',W/2,220);
 ctx.fillStyle='#fff'; ctx.font='14px monospace'; ctx.fillText(autoPaused?'tab hidden — ESC / click resume':'ESC resume · H help · C codex · O settings · R restart',W/2,252);
 btn(BTN.pauseResume.x,BTN.pauseResume.y,BTN.pauseResume.w,BTN.pauseResume.h,'RESUME [ESC]',true);
 btn(BTN.pauseSet.x,BTN.pauseSet.y,BTN.pauseSet.w,BTN.pauseSet.h,'SETTINGS [O]',true);
 btn(BTN.pauseHelp.x,BTN.pauseHelp.y,BTN.pauseHelp.w,BTN.pauseHelp.h,'HELP [H]',true);
 btn(BTN.pauseCodex.x,BTN.pauseCodex.y,BTN.pauseCodex.w,BTN.pauseCodex.h,'CODEX [C]',true);
 btn(BTN.pauseRestart.x,BTN.pauseRestart.y,BTN.pauseRestart.w,BTN.pauseRestart.h,'RESTART [R]',true);
}
function drawEnd(){
 ctx.fillStyle='rgba(0,0,0,0.7)'; ctx.fillRect(0,0,W,H);
 ctx.textAlign='center';
 ctx.fillStyle='#f44'; ctx.font='bold 52px monospace';
 ctx.fillText('YOU DIED',W/2,200);
 ctx.fillStyle='#fff'; ctx.font='16px monospace';
 const s=scoreCalc();
 ctx.fillText('Score '+s+'   Best '+best+'   Kills '+kills+'   Level '+player.level+'   Time '+Math.floor(timeSec)+'s',W/2,250);
 ctx.fillText('Reached sector '+sectorName(arenaIdx)+'   Best depth S'+depth+'   Bosses '+bosses,W/2,278);
 ctx.fillStyle='#8affff'; ctx.font='14px monospace';
 ctx.fillText('Each boss kill banks permanent +2% damage. Go again!',W/2,308);
 btn(BTN.endRestart.x,BTN.endRestart.y,BTN.endRestart.w,BTN.endRestart.h,'RETRY [R]');
 btn(BTN.endTitle.x,BTN.endTitle.y,BTN.endTitle.w,BTN.endTitle.h,'TITLE [ESC]',true);
}

// ---------- main loop ----------
let last=performance.now(), acc=0; const STEP=1000/60;
function frame(now){ requestAnimationFrame(frame); let dt=now-last; last=now; if(dt>250) dt=250; acc+=dt; let n=0; while(acc>=STEP&&n<5){ update(STEP/1000); acc-=STEP; n++; } if(n===5) acc=0; render(); }
arena={seed:1337, obs:[], theme:THEMES[0], spawns:[], port:{x:800,y:500}, validated:true, ratio:1};
  try{ window.__kriefne={ startRun, loadArena, loadSector, killEnemy, nextArena, gainXp, pickUpgrade, hurtPlayer, doPortalKey, tryDash, update, render, focusWatch, xpNeedFor, openHelp, handleKeyPress, handleClick,
   spawnEnemy, steer, hostiles, collectGems, isBossSector, bossKindsFor, compFor, sectorName, sectorWorld, galNodes, reflectBullet, bulletBlocked,
   forceState(s){ state=s; }, get upgrades(){ return UPGRADES; }, get helpTab(){ return helpTab; },
   get bossdefs(){ return BOSSDEF; }, get hazards(){ return hazards; }, get signatureNests(){ return SIGNATURE_NESTS; },
   get tierNames(){ return TIER_NAMES; }, get bossesByTier(){ return BOSSES_BY_TIER; }, get nestLtLeft(){ return nestLtLeft; },
   commandDepth, ltBudgetFor, escortsFor, subordinateKinds, mkLieutenant, nestLore, get debutLore(){ return DEBUT_LORE; },
   drawIcon, get ctx(){ return ctx; },
   get helpTabs(){ return HELP_TABS; }, get codexFoes(){ return CODEX_FOES; }, get codexBosses(){ return CODEX_BOSSES; },
   setHelpTab(t){ helpTab=t; },
   openCodex, closeCodex, codexKnown, codexProgress, commandLine,
   get codexTab(){ return codexTab; }, setCodexTab(t){ codexTab=t; codexSel=0; }, get codexSel(){ return codexSel; },
  pool(){ return UPGRADES.filter(u=>(!u.req||u.req(player))&&(!u.max||(upgradeCounts[u.id]||0)<u.max)).map(u=>u.id); },
  get autoPaused(){ return autoPaused; }, get queue(){ return spawnQueue; }, get cam(){ return cam; },
  get pendingLevels(){ return pendingLevels; },
  get depth(){ return depth; }, get bosses(){ return bosses; }, get best(){ return best; },
  get cleared(){ return clearedMax; }, get galaxySel(){ return galaxySel; }, get time(){ return timeSec; },
   get state(){return state;}, get player(){return player;}, get enemies(){return enemies;}, get gems(){return gems;}, get settings(){return settings;}, get arena(){return arena;}, get portal(){return portal;}, get choices(){return levelChoices;}, keys, mouse }; }catch(e){}
requestAnimationFrame(frame);
})();
