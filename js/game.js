'use strict';

const $ = id => document.getElementById(id);
const canvas = $('board'), ctx = canvas.getContext('2d');
const hud = {score: $('score'), best: $('best'), merges: $('merges'), stage: $('stageNumber'), charges: $('charges')};
const COLORS = ['#ffae3d', '#ff744b', '#e04e8a', '#b464e8'];
const POWER = {pulse: ['◎', 'Pulse', 'Push every orb outward to clear space near the planet.'], stabilize: ['Ⅱ', 'Stabilize', 'Slow orbital drift for seven seconds.'], expand: ['⊙', 'Expand field', 'Three wider capture rings, each 0.5 seconds slower.'], focus: ['◉', 'Focus field', 'Three tighter capture rings, each 0.35 seconds faster.'], thin: ['⌁', 'Thin field', 'Remove the outermost 25% of loose matter.']};
const DIRECTIONS = {none:[0,0], north:[0,-1], northEast:[.7071,-.7071], east:[1,0], southEast:[.7071,.7071], south:[0,1], southWest:[-.7071,.7071], west:[-1,0], northWest:[-.7071,-.7071]};
const DIRECTION_LABELS = {none:'Off', north:'Up', northEast:'Up right', east:'Right', southEast:'Down right', south:'Down', southWest:'Down left', west:'Left', northWest:'Up left'};
const DEFAULT_SETTINGS = {sound:true, haptics:true, easy:false, unlimited:false, captureTime:1.5, touchDirection:'none', touchDistance:60};
let settings = {...DEFAULT_SETTINGS, ...read('luma-well-settings', {})};
let game = loadGame() || freshGame();
let dpr = 1, width = 1, height = 1, scale = 1, last = performance.now(), active = !document.hidden, toastTimer, audio;

function read(key, fallback) { try { return JSON.parse(localStorage.getItem(key)) || fallback; } catch { return fallback; } }
function write(key, value) { localStorage.setItem(key, JSON.stringify(value)); }
function freshGame() {
  const state = {score:0, best:Number(localStorage.getItem('luma-well-best')) || 0, merges:0, stage:1, charges:1, planetMass:4, orbs:[], nextId:1, spawnFor:0, stabilizedFor:0, expanded:0, focused:0, capture:null, merge:null, saveFor:0};
  for (let i = 0; i < (settings.easy ? 14 : 18); i++) spawn(state);
  return state;
}
function loadGame() {
  const saved = read('luma-well-run', null);
  if (!saved || !Array.isArray(saved.orbs) || !saved.orbs.length || saved.orbs.length > 250) return null;
  const valid = saved.orbs.every(o => Number.isFinite(o.mass) && o.mass > 0 && Number.isInteger(o.kind) && o.kind >= 0 && o.kind < 6 && Number.isFinite(o.x) && Number.isFinite(o.y) && Number.isFinite(o.drift));
  if (!valid) return null;
  return {...saved, best:Number(localStorage.getItem('luma-well-best')) || 0, nextId:Math.max(...saved.orbs.map(o => o.id || 0), 0) + 1, spawnFor:0, stabilizedFor:0, capture:null, merge:null, saveFor:0};
}
function saveGame() { write('luma-well-run', {score:game.score, merges:game.merges, stage:game.stage, charges:game.charges, planetMass:game.planetMass, expanded:game.expanded, focused:game.focused, orbs:game.orbs}); }
function spawn(state) {
  const angle = Math.random() * Math.PI * 2, distance = .42 + Math.random() * .8, isPower = Math.floor(Math.random() * 18) === 0;
  const roll = Math.floor(Math.random() * 3);
  state.orbs.push({id:state.nextId++, mass:1 + Math.floor(Math.random() * 3), kind:Math.floor(Math.random() * Math.min(6, state.stage + 1)), power:isPower ? (roll === 1 ? 'expand' : roll === 2 ? 'focus' : 'charge') : null, x:Math.cos(angle)*distance, y:Math.sin(angle)*distance, drift:(Math.random()-.5)*.16});
}
function radiusFor(orb) { return .024 + Math.sqrt(orb.mass) * .016; }
function planetRadius() { return Math.min(.34, .07 + Math.sqrt(game.planetMass)*.013); }
function captureConfig() { return {radius:game.expanded ? .31 : game.focused ? .17 : .23, time:settings.captureTime + (game.expanded ? .5 : game.focused ? -.35 : 0)}; }
function spawnInterval() { return Math.min(3, Math.max(settings.easy ? 1.5 : 1.05, 2.1-game.stage*.16) + Math.max(0, game.orbs.length-48)*.12); }
function updateCapture() {
  const c = game.capture; if (!c) return;
  const candidates = game.orbs.filter(o => Math.hypot(o.x-c.x, o.y-c.y) <= c.radius);
  const normal = candidates.filter(o => !o.power), hasPower = candidates.some(o => o.power);
  c.blocked = normal.length + (hasPower ? candidates.length-normal.length : 0) < 2 || (hasPower && normal.length < 2) || (normal.length && Math.max(...normal.map(o=>o.kind))-Math.min(...normal.map(o=>o.kind)) > 1);
  c.ids = c.blocked ? [] : candidates.map(o=>o.id);
}
function completeCapture() {
  const c = game.capture, orbs = game.orbs.filter(o => c.ids.includes(o.id));
  if (orbs.length < 2 || c.blocked) { c.elapsed = .001; updateCapture(); return; }
  let powerMessage = '';
  for (const o of orbs.filter(o=>o.power)) {
    if (o.power === 'expand') { game.expanded += 3; game.focused = 0; powerMessage = 'Expanded capture field collected'; }
    else if (o.power === 'focus') { game.focused += 3; game.expanded = 0; powerMessage = 'Focused capture field collected'; }
    else { game.charges++; powerMessage = 'Power-up charge collected'; }
  }
  const mass = orbs.reduce((sum,o) => sum + o.mass*(o.kind+1), 0), points = Math.round(mass) * orbs.length ** 3;
  const beforeStage = game.stage;
  game.merge = {x:orbs.reduce((s,o)=>s+o.x,0)/orbs.length, y:orbs.reduce((s,o)=>s+o.y,0)/orbs.length, points, age:0};
  game.orbs = game.orbs.filter(o => !c.ids.includes(o.id)); game.planetMass += mass; game.score += points; game.merges++;
  while (game.planetMass >= 4 + game.stage*28) { game.stage++; game.charges++; }
  if (game.score > game.best) { game.best = game.score; localStorage.setItem('luma-well-best', game.best); }
  if (game.expanded) game.expanded--; if (game.focused) game.focused--;
  game.capture = null; sound(beforeStage < game.stage ? 'stage' : 'merge', points); if (powerMessage) { sound('collect'); toast(powerMessage); } if (settings.haptics && navigator.vibrate) navigator.vibrate(22); saveGame();
}
function advance(dt) {
  dt = Math.min(dt, .04); game.stabilizedFor = Math.max(0, game.stabilizedFor-dt);
  for (const o of game.orbs) {
    if (game.capture && game.capture.ids.includes(o.id)) { o.x += (game.capture.x-o.x)*dt*2.2; o.y += (game.capture.y-o.y)*dt*2.2; continue; }
    const angle = Math.atan2(o.y,o.x) + o.drift*dt*(game.stabilizedFor ? .15 : 1), distance = Math.hypot(o.x,o.y); o.x = Math.cos(angle)*distance; o.y = Math.sin(angle)*distance;
  }
  game.spawnFor += dt; if (game.spawnFor >= spawnInterval()) { game.spawnFor=0; spawn(game); }
  if (game.capture) { updateCapture(); if (game.capture.ids.length >= 2) { game.capture.elapsed += dt; if (game.capture.elapsed >= game.capture.time) completeCapture(); } else game.capture.elapsed = .001; }
  if (game.merge) { game.merge.age += dt; if (game.merge.age > .68) game.merge=null; }
  game.saveFor += dt; if (game.saveFor > 2) { game.saveFor=0; saveGame(); }
}
function resize() { const rect=canvas.getBoundingClientRect(); dpr=Math.min(devicePixelRatio||1,2); width=rect.width; height=rect.height; scale=Math.min(width,height)/2; canvas.width=Math.round(width*dpr); canvas.height=Math.round(height*dpr); ctx.setTransform(dpr,0,0,dpr,0,0); }
function xy(x,y) { return [width/2+x*scale,height/2+y*scale]; }
function draw() {
  ctx.fillStyle='#080a11';ctx.fillRect(0,0,width,height); ctx.fillStyle='rgba(255,255,255,.24)'; for(let i=0;i<90;i++){ctx.beginPath();ctx.arc((i*71%997)/997*width,(i*149%991)/991*height,i%5? .6:1.1,0,Math.PI*2);ctx.fill();}
  const [cx,cy]=xy(0,0), pr=planetRadius()*scale; ctx.strokeStyle='#1c2029';ctx.lineWidth=3;for(let i=0;i<56;i++){const a=i*Math.PI*2/56;ctx.beginPath();ctx.moveTo(cx+Math.cos(a)*pr*.55,cy+Math.sin(a)*pr*.55);ctx.lineTo(cx+Math.cos(a)*pr*1.6,cy+Math.sin(a)*pr*1.6);ctx.stroke();} const pg=ctx.createRadialGradient(cx-pr*.3,cy-pr*.3,1,cx,cy,pr);pg.addColorStop(0,'#3a414b');pg.addColorStop(1,'#171a21');ctx.fillStyle=pg;ctx.beginPath();ctx.arc(cx,cy,pr,0,Math.PI*2);ctx.fill();
  for(const o of game.orbs) drawOrb(o);
  if(game.capture) drawCapture(); if(game.merge) drawMerge();
  updateHud();
}
function color(o){return o.power === 'expand' ? '#52dde6' : o.power === 'focus' ? '#b464e8' : o.power ? '#ffd26a' : COLORS[Math.min(3,o.kind)];}
function drawOrb(o) { const [x,y]=xy(o.x,o.y), selected=game.capture?.ids.includes(o.id), r=Math.max(13,radiusFor(o)*scale)*(selected?1.35:1), c=color(o), g=ctx.createRadialGradient(x-r*.35,y-r*.4,1,x,y,r);g.addColorStop(0,c);g.addColorStop(1,c+'75');ctx.shadowColor=c;ctx.shadowBlur=r*1.6;ctx.fillStyle=g;ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fill();ctx.shadowBlur=0;ctx.strokeStyle=selected?'#fff':'rgba(255,255,255,.5)';ctx.lineWidth=selected?2:1;ctx.stroke();ctx.fillStyle='#fff';ctx.font=`800 ${Math.max(12,r*.85)}px system-ui`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(o.power?'\u2726':o.kind+1,x,y+1); }
function drawCapture(){const c=game.capture,[x,y]=xy(c.x,c.y),r=c.radius*scale,valid=c.ids.length>=2&&!c.blocked;ctx.strokeStyle=c.blocked?'rgba(255,82,82,.85)':'rgba(255,255,255,.32)';ctx.lineWidth=2;ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.stroke();ctx.strokeStyle=c.blocked?'#ff5252':'rgba(255,255,255,.9)';ctx.lineWidth=3;ctx.beginPath();ctx.arc(x,y,r,-Math.PI/2,-Math.PI/2+(valid?c.elapsed/c.time:.22)*Math.PI*2);ctx.stroke();ctx.fillStyle='#fff';ctx.font='800 12px system-ui';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(c.time.toFixed(2)+'s',x,y);}
function drawMerge(){const m=game.merge,t=Math.min(1,m.age/.68),q=t*t*t,[sx,sy]=xy(m.x*(1-q),m.y*(1-q)),r=26-16*t;ctx.globalAlpha=1-t;ctx.fillStyle='#ffd26a';ctx.shadowColor='#ffa52e';ctx.shadowBlur=16;ctx.beginPath();ctx.arc(sx,sy,r,0,Math.PI*2);ctx.fill();ctx.shadowBlur=0;ctx.font='800 20px system-ui';ctx.textAlign='center';ctx.fillText('+'+m.points,width/2,height/2-40-t*20);ctx.globalAlpha=1;}
function updateHud(){hud.score.textContent=game.score;hud.best.textContent=game.best;hud.merges.textContent=game.merges;hud.stage.textContent=game.stage;hud.charges.textContent=settings.unlimited?'\u221e':game.charges;$('powersButton').disabled=!settings.unlimited&&game.charges===0;}
function point(event){const r=canvas.getBoundingClientRect(),dir=DIRECTIONS[settings.touchDirection],x=event.clientX-r.left+dir[0]*settings.touchDistance,y=event.clientY-r.top+dir[1]*settings.touchDistance;return {x:(x-width/2)/scale,y:(y-height/2)/scale};}
canvas.addEventListener('pointerdown', e=>{e.preventDefault();canvas.setPointerCapture(e.pointerId);const p=point(e),c=captureConfig();game.capture={x:p.x,y:p.y,radius:c.radius,time:c.time,elapsed:.001,ids:[],blocked:false};updateCapture();});
canvas.addEventListener('pointermove', e=>{if(!game.capture)return;const p=point(e);game.capture.x=p.x;game.capture.y=p.y;updateCapture();});
function endCapture(){if(game.capture){game.capture=null;saveGame();}} canvas.addEventListener('pointerup',endCapture);canvas.addEventListener('pointercancel',endCapture);
function toast(message){const el=$('toast');el.textContent=message;el.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('show'),2600);}
function sound(type, points=0){if(!settings.sound)return;try{audio ||= new AudioContext();const now=audio.currentTime;if(type==='stage'){[440,554,660,880].forEach((f,i)=>tone(f, i===3?.3:.18, now+i*.32, 'triangle',.2));}else if(type==='merge')tone(points<40?380:points<120?475:points<300?570:665,.22,now,'sine',.22,140);else if(type==='collect')tone(900,.14,now,'sine',.2,220);else tone(180,.18,now,'triangle',.12);}catch{}}
function tone(freq,duration,start,wave,gain,slide=0){const o=audio.createOscillator(),g=audio.createGain();o.type=wave;o.frequency.setValueAtTime(freq,start);o.frequency.linearRampToValueAtTime(freq+slide,start+duration);g.gain.setValueAtTime(gain,start);g.gain.exponentialRampToValueAtTime(.001,start+duration);o.connect(g).connect(audio.destination);o.start(start);o.stop(start+duration);}
function openModal(content){$('sheet').innerHTML=content;$('modal').classList.remove('hidden');$('modal').setAttribute('aria-hidden','false');}function closeModal(){$('modal').classList.add('hidden');$('modal').setAttribute('aria-hidden','true');}
function powerMenu(){openModal(`<div class="handle"></div><h2>POWER-UPS</h2>${Object.entries(POWER).map(([id,p])=>`<button class="choice" data-power="${id}"><span class="choice-icon">${p[0]}</span><span><strong>${p[1]}</strong><small>${p[2]}</small></span></button>`).join('')}<button class="close" data-close>CLOSE</button>`);}
function usePower(type){if(!settings.unlimited){if(!game.charges)return;game.charges--;}if(type==='pulse')game.orbs.forEach(o=>{o.x*=1.18;o.y*=1.18;});if(type==='stabilize')game.stabilizedFor=7;if(type==='expand'){game.expanded+=3;game.focused=0;}if(type==='focus'){game.focused+=3;game.expanded=0;}if(type==='thin'){game.orbs.sort((a,b)=>Math.hypot(b.x,b.y)-Math.hypot(a.x,a.y));game.orbs.splice(0,Math.ceil(game.orbs.length*.25));}sound('power');saveGame();}
function settingsMenu(){const dirs=Object.keys(DIRECTIONS);openModal(`<div class="handle"></div><h2>SETTINGS</h2><div class="setting"><label class="switch"><input type="checkbox" data-setting="sound" ${settings.sound?'checked':''}> Sound</label><small>Play synthesized merge and power sounds.</small></div><div class="setting"><label class="switch"><input type="checkbox" data-setting="haptics" ${settings.haptics?'checked':''}> Haptics</label><small>Vibrate briefly after a successful merge.</small></div><div class="setting"><a class="choice" href="help.html"><span class="choice-icon">?</span><span><strong>How to play</strong><small>Learn the capture, scoring, and power-up rules.</small></span></a></div><div class="setting"><label class="switch"><input type="checkbox" data-setting="easy" ${settings.easy?'checked':''}> Gentle start</label><small>Start future new games with fewer orbs and slower early spawning.</small></div><div class="setting"><label>Capture hold time</label><select data-setting="captureTime">${[.5,1,1.5,2].map(v=>`<option value="${v}" ${settings.captureTime===v?'selected':''}>${v.toFixed(1)} seconds</option>`).join('')}</select></div><div class="setting"><label>Touch offset</label><small>Move the capture ring away from your finger.</small><div class="direction-grid">${dirs.map(d=>`<button data-direction="${d}" class="${settings.touchDirection===d?'selected':''}">${DIRECTION_LABELS[d]}</button>`).join('')}</div><input type="range" data-setting="touchDistance" min="0" max="120" step="10" value="${settings.touchDistance}"><small id="distanceText">${settings.touchDistance}px offset</small></div><div class="setting"><label class="switch"><input type="checkbox" data-setting="unlimited" ${settings.unlimited?'checked':''}> Unlimited power-ups</label><small>Use powers without spending charges.</small></div><button class="choice" data-confirm-new><span class="choice-icon">&#8635;</span><span><strong>Start a new game</strong><small>Replace this run while keeping your best score.</small></span></button><button class="close" data-close>CLOSE</button>`);}
$('powersButton').onclick=powerMenu;$('settingsButton').onclick=settingsMenu;
$('modal').addEventListener('click',e=>{if(e.target===$('modal')||e.target.closest('[data-close]'))closeModal();const p=e.target.closest('[data-power]');if(p){usePower(p.dataset.power);closeModal();}if(e.target.closest('[data-confirm-new]'))openModal(`<div class="handle"></div><h2>START A NEW GAME?</h2><p>This replaces your current run. Your best score will be kept.</p><div class="confirmation"><button data-close>CANCEL</button><button class="danger" data-new>NEW GAME</button></div>`);if(e.target.closest('[data-new]')){game=freshGame();saveGame();closeModal();}const dir=e.target.closest('[data-direction]');if(dir){settings.touchDirection=dir.dataset.direction;write('luma-well-settings',settings);settingsMenu();}const input=e.target.closest('[data-setting]');if(input){const key=input.dataset.setting;settings[key]=input.type==='checkbox'?input.checked:key==='captureTime'?Number(input.value):Number(input.value);write('luma-well-settings',settings);updateHud();if(key==='touchDistance')$('distanceText').textContent=settings.touchDistance+'px offset';}});
$('modal').addEventListener('change', e => {
  const input = e.target.closest('[data-setting]');
  if (!input) return;
  const key = input.dataset.setting;
  settings[key] = input.type === 'checkbox' ? input.checked : Number(input.value);
  write('luma-well-settings', settings);
  updateHud();
});
$('modal').addEventListener('input', e => {
  const input = e.target.closest('[data-setting="touchDistance"]');
  if (!input) return;
  settings.touchDistance = Number(input.value);
  write('luma-well-settings', settings);
  $('distanceText').textContent = settings.touchDistance + 'px offset';
});
window.addEventListener('resize',resize);document.addEventListener('visibilitychange',()=>{active=!document.hidden;if(!active)saveGame();last=performance.now();});window.addEventListener('pagehide',saveGame);resize();
function frame(now){requestAnimationFrame(frame);const dt=Math.min(.25,(now-last)/1000);last=now;if(active)advance(dt);draw();}requestAnimationFrame(frame);
