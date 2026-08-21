import { NavigationGrid } from './navigation.js';

const canvas = document.querySelector('#sim');
const ctx = canvas.getContext('2d');
const ids = [
  'simTime','spawned','shoeQueue','avgShoeWait','completed','runStatus',
  'attendees','arrivalMinutes','walkAvg','walkMin','walkMax',
  'shoePics','shoeServiceAvg','shoeServiceMin','shoeServiceMax',
  'speed','start','pause'
];
const ui = Object.fromEntries(ids.map(id => [id, document.querySelector('#' + id)]));

let venue, scenario, nav;
let agents = [];
let simTime = 0;
let running = false;
let last = performance.now();
let nextId = 1;
let shoeWaitSamples = [];

const BODY_RADIUS = .28;
const COMFORT_RADIUS = .75;
const MAX_NEIGHBOR_RADIUS = 1.8;
const colors = { walking:'#1976d2', queue:'#e53935', service:'#43a047' };

async function init(){
  [venue, scenario] = await Promise.all([
    fetch(`./data/venues/wihara-floor1.json?v=${Date.now()}`, { cache:'no-store' }).then(r => r.json()),
    fetch(`./data/scenarios/poc-ingress.json?v=${Date.now()}`, { cache:'no-store' }).then(r => r.json())
  ]);
  nav = new NavigationGrid(venue, 1);
  applyScenarioDefaults();
  reset();
  requestAnimationFrame(loop);
}

function applyScenarioDefaults(){
  const w = scenario.walkingSpeed;
  const s = scenario.shoeDeposit;
  ui.walkMin.value = w.min;
  ui.walkAvg.value = w.average;
  ui.walkMax.value = w.max;
  ui.shoePics.value = s.picCount;
  ui.shoeServiceMin.value = s.serviceSeconds.min;
  ui.shoeServiceAvg.value = s.serviceSeconds.average;
  ui.shoeServiceMax.value = s.serviceSeconds.max;
}

function routeNames(){ return venue.flow.ingress; }
function venueRoute(){ return routeNames().map(name => venue.waypoints[name]).filter(Boolean); }

function reset(){
  agents = [];
  simTime = 0;
  nextId = 1;
  shoeWaitSamples = [];
  running = true;
  ui.runStatus.textContent = 'RUNNING';
  ui.pause.textContent = 'Pause';
}

function clampConfig(min, avg, max){
  min = Number(min); avg = Number(avg); max = Number(max);
  if(min > max) [min, max] = [max, min];
  avg = Math.max(min, Math.min(max, avg));
  return { min, avg, max };
}

function triangular(min, mode, max){
  if(max <= min) return min;
  const u = Math.random();
  const f = (mode - min) / (max - min);
  return u < f
    ? min + Math.sqrt(u * (max - min) * (mode - min))
    : max - Math.sqrt((1 - u) * (max - min) * (max - mode));
}

function walkingSpeed(){
  const c = clampConfig(ui.walkMin.value, ui.walkAvg.value, ui.walkMax.value);
  return triangular(c.min, c.avg, c.max);
}

function serviceSeconds(){
  const c = clampConfig(ui.shoeServiceMin.value, ui.shoeServiceAvg.value, ui.shoeServiceMax.value);
  return triangular(c.min, c.avg, c.max);
}

function spreadTarget(a, stage){
  const name = routeNames()[stage];
  const base = venue.waypoints[name];
  if(!base) return base;
  const lane = ((a.id % 7) - 3) / 3;
  if(name === 'hiolo') return { x: base.x + lane * 1.2, y: base.y + lane * .8 };
  if(name === 'viharaEntry') return { x: base.x, y: base.y + lane * .8 };
  if(name === 'jalanUmatEntry' || name === 'jalanUmat' || name === 'stairsEntry') return { x: base.x, y: base.y + lane * 1.0 };
  return base;
}

function setPathForStage(a, stage){
  a.routeStage = stage;
  const target = spreadTarget(a, stage);
  a.path = nav.findPath({x:a.x,y:a.y}, target);
  a.pathIndex = Math.min(1, a.path.length - 1);
}

function setPath(a, target){
  a.path = nav.findPath({x:a.x,y:a.y}, target);
  a.pathIndex = Math.min(1, a.path.length - 1);
}

function spawnAgent(){
  const p = venue.waypoints.spawn;
  const a = {
    id: nextId++,
    x: p.x + (Math.random() - .5) * 2,
    y: p.y,
    speed: walkingSpeed(),
    state: scenario.shoeDeposit.enabled ? 'to-shoes' : 'walking',
    routeStage: 1,
    queueEnterTime: null,
    serviceRemaining: 0,
    serviceSlot: null,
    done: false,
    path: [],
    pathIndex: 0
  };
  if(scenario.shoeDeposit.enabled) setPath(a, scenario.shoeDeposit.queuePoint);
  else setPathForStage(a, 1);
  agents.push(a);
}

function separationVector(a){
  let sx = 0, sy = 0, n = 0;
  for(const b of agents){
    if(b === a || b.done || b.state === 'queue' || b.state === 'service') continue;
    const dx = a.x - b.x, dy = a.y - b.y, d = Math.hypot(dx,dy);
    if(d > 0 && d < MAX_NEIGHBOR_RADIUS){
      const f = d < COMFORT_RADIUS
        ? (COMFORT_RADIUS - d) / COMFORT_RADIUS
        : .08 * (MAX_NEIGHBOR_RADIUS - d) / MAX_NEIGHBOR_RADIUS;
      sx += dx / d * f; sy += dy / d * f; n++;
    }
  }
  return n ? {x:sx/n,y:sy/n} : {x:0,y:0};
}

function blocked(x,y,a){
  const c = nav.toCell({x,y});
  if(nav.isBlocked(c.c,c.r)) return true;
  return agents.some(b => b !== a && !b.done && b.state !== 'queue' && b.state !== 'service' && Math.hypot(x-b.x,y-b.y) < BODY_RADIUS*2);
}

function tryStep(a, vx, vy, step){
  const nx = a.x + vx * step, ny = a.y + vy * step;
  if(blocked(nx,ny,a)) return false;
  a.x = nx; a.y = ny;
  return true;
}

function move(a,dt){
  if(!a.path?.length) return true;
  const node = a.path[Math.min(a.pathIndex,a.path.length-1)];
  const dx = node.x-a.x, dy=node.y-a.y, d=Math.hypot(dx,dy);
  if(d < .4){
    if(a.pathIndex < a.path.length-1){ a.pathIndex++; return false; }
    return true;
  }

  const sep = separationVector(a);
  let vx = dx/d + sep.x*1.5, vy = dy/d + sep.y*1.5;
  const l = Math.hypot(vx,vy) || 1; vx/=l; vy/=l;
  const step = Math.min(d,a.speed*dt);
  if(tryStep(a,vx,vy,step)) return false;

  // Local steering avoids gridlock when several agents meet on the same A* line.
  for(const angle of [Math.PI/6,-Math.PI/6,Math.PI/3,-Math.PI/3,Math.PI/2,-Math.PI/2]){
    const cs=Math.cos(angle),sn=Math.sin(angle);
    const sx=vx*cs-vy*sn,sy=vx*sn+vy*cs;
    if(tryStep(a,sx,sy,step*.75)) return false;
  }
  return false;
}

function assignQueuePositions(){
  const waiting = agents.filter(a => a.state === 'queue').sort((a,b) => a.id-b.id);
  const q = scenario.shoeDeposit.queuePoint;
  const cols = 12, spacing = .65;
  waiting.forEach((a,i) => {
    a.x = q.x + ((i % cols) - (cols-1)/2) * spacing;
    a.y = q.y + Math.floor(i/cols) * spacing;
  });
}

function usedServiceSlots(){
  return new Set(agents.filter(a => a.state === 'service').map(a => a.serviceSlot));
}

function servicePosition(slot,pics){
  const z = scenario.shoeDeposit.zone;
  const gap = z.w / Math.max(1,pics);
  return { x: z.x + gap*(slot+.5), y: scenario.shoeDeposit.servicePoint.y };
}

function startShoeServices(){
  const pics = Math.max(1, Math.floor(Number(ui.shoePics.value) || 1));
  const used = usedServiceSlots();
  const waiting = agents.filter(a => a.state === 'queue').sort((a,b) => a.queueEnterTime-b.queueEnterTime || a.id-b.id);
  for(let slot=0; slot<pics && waiting.length; slot++){
    if(used.has(slot)) continue;
    const a = waiting.shift();
    a.state = 'service';
    a.serviceSlot = slot;
    a.serviceRemaining = serviceSeconds();
    shoeWaitSamples.push(Math.max(0,simTime-a.queueEnterTime));
    const p = servicePosition(slot,pics); a.x=p.x; a.y=p.y;
  }
}

function finishShoeService(a){
  a.state = 'walking';
  a.serviceSlot = null;
  // Shoe deposit is already inside the parking area. Do not force everyone
  // through one artificial parking waypoint; continue directly to Hiolo.
  const hioloStage = Math.max(1, routeNames().indexOf('hiolo'));
  setPathForStage(a, hioloStage);
}

function update(dt){
  simTime += dt;
  const total = Number(ui.attendees.value);
  const duration = Math.max(1, Number(ui.arrivalMinutes.value)*60);
  const expected = Math.min(total, Math.floor(total*Math.min(1,simTime/duration)));
  while(agents.length < expected) spawnAgent();

  const r = venueRoute();
  for(const a of agents){
    if(a.done || a.state === 'queue') continue;
    if(a.state === 'service'){
      a.serviceRemaining -= dt;
      if(a.serviceRemaining <= 0) finishShoeService(a);
      continue;
    }
    if(move(a,dt)){
      if(a.state === 'to-shoes'){
        a.state = 'queue';
        a.queueEnterTime = simTime;
        a.path = [];
      } else {
        const nextStage = a.routeStage + 1;
        if(nextStage >= r.length){ a.done=true; a.state='done'; }
        else setPathForStage(a,nextStage);
      }
    }
  }

  assignQueuePositions();
  startShoeServices();

  if(agents.length >= total && agents.filter(a=>a.done).length >= total){
    running = false;
    ui.runStatus.textContent = 'COMPLETE';
  }
}

function transform(){
  const pad=25,sx=(canvas.width-pad*2)/venue.bounds.width,sy=(canvas.height-pad*2)/venue.bounds.height;
  return {pad,s:Math.min(sx,sy)};
}
function rect(z){const{pad,s}=transform();return[pad+z.x*s,pad+z.y*s,z.w*s,z.h*s]}
function point(x,y){const{pad,s}=transform();return[pad+x*s,pad+y*s]}

function visualRoute(){
  const r=venueRoute();
  const hioloIndex=Math.max(1,routeNames().indexOf('hiolo'));
  return [venue.waypoints.spawn, scenario.shoeDeposit.queuePoint, scenario.shoeDeposit.servicePoint, ...r.slice(hioloIndex)];
}

function drawRoute(){
  const r=visualRoute();
  ctx.save(); ctx.strokeStyle='#2563eb';ctx.lineWidth=2;ctx.setLineDash([6,5]);ctx.beginPath();
  r.forEach((p,i)=>{const[x,y]=point(p.x,p.y);i?ctx.lineTo(x,y):ctx.moveTo(x,y)});
  ctx.stroke();ctx.restore();
}

function zoneColor(z){
  if(z.type==='blocked')return'#d9dde3';
  if(z.type==='seating')return'#f3d7a4';
  if(z.type==='destination')return'#cdeccf';
  if(z.type==='spawn')return'#cfe3ff';
  return'#e4f3dc';
}

function drawScenario(){
  if(!scenario.shoeDeposit.enabled) return;
  const z=scenario.shoeDeposit.zone,[x,y,w,h]=rect(z);
  const pics=Math.max(1,Math.floor(Number(ui.shoePics.value)||1));

  ctx.save();
  ctx.fillStyle='#ffe8a3';ctx.fillRect(x,y,w,h);
  ctx.strokeStyle='#9a7b2f';ctx.lineWidth=2;ctx.strokeRect(x,y,w,h);
  ctx.fillStyle='#5b4613';ctx.font='bold 12px system-ui';ctx.textAlign='center';
  ctx.fillText('PENITIPAN SEPATU',x+w/2,y+14);

  const slotW=w/pics;
  for(let i=0;i<pics;i++){
    const sx=x+i*slotW;
    ctx.strokeStyle='#b79542';ctx.lineWidth=1;ctx.strokeRect(sx,y+18,slotW,h-20);
    ctx.fillStyle='#5b4613';ctx.font='10px system-ui';ctx.fillText(`PIC ${i+1}`,sx+slotW/2,y+h-6);
  }

  const [qx,qy]=point(scenario.shoeDeposit.queuePoint.x,scenario.shoeDeposit.queuePoint.y);
  ctx.beginPath();ctx.arc(qx,qy,7,0,Math.PI*2);ctx.fillStyle='rgba(229,57,53,.18)';ctx.fill();
  ctx.strokeStyle='#e53935';ctx.setLineDash([4,3]);ctx.stroke();ctx.setLineDash([]);
  ctx.fillStyle='#b42318';ctx.font='bold 10px system-ui';ctx.fillText('QUEUE',qx,qy+18);
  ctx.restore();
}

function draw(){
  ctx.clearRect(0,0,canvas.width,canvas.height);ctx.fillStyle='#f8fafc';ctx.fillRect(0,0,canvas.width,canvas.height);
  for(const z of venue.zones){
    const[x,y,w,h]=rect(z);ctx.fillStyle=zoneColor(z);ctx.fillRect(x,y,w,h);ctx.strokeStyle='#7b8491';ctx.strokeRect(x,y,w,h);
    ctx.fillStyle='#303640';ctx.font='12px system-ui';ctx.textAlign='center';ctx.fillText(z.label,x+w/2,y+h/2+4);
  }
  drawScenario();drawRoute();
  for(const a of agents){
    if(a.done)continue;const[x,y]=point(a.x,a.y);ctx.beginPath();ctx.arc(x,y,3.2,0,Math.PI*2);
    ctx.fillStyle=a.state==='queue'?colors.queue:a.state==='service'?colors.service:colors.walking;ctx.fill();
  }
}

function fmtSeconds(sec){
  const m=Math.floor(sec/60),s=Math.floor(sec%60);return `${m}:${String(s).padStart(2,'0')}`;
}
function updateUi(){
  const q=agents.filter(a=>a.state==='queue').length;
  const avgWait=shoeWaitSamples.length?shoeWaitSamples.reduce((a,b)=>a+b,0)/shoeWaitSamples.length:0;
  ui.simTime.textContent=fmtSeconds(simTime);
  ui.spawned.textContent=agents.length;
  ui.shoeQueue.textContent=q;
  ui.avgShoeWait.textContent=fmtSeconds(avgWait);
  ui.completed.textContent=agents.filter(a=>a.done).length;
}
function loop(now){
  const dt=Math.min(.05,(now-last)/1000);last=now;
  if(running)update(dt*(Number(ui.speed.value)||1));
  draw();updateUi();requestAnimationFrame(loop);
}
ui.start.addEventListener('click',reset);
ui.pause.addEventListener('click',()=>{running=!running;ui.pause.textContent=running?'Pause':'Resume';ui.runStatus.textContent=running?'RUNNING':'PAUSED'});
init();
