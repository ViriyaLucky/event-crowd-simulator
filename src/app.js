const canvas = document.querySelector('#sim');
const ctx = canvas.getContext('2d');
const ui = Object.fromEntries(['simTime','spawned','shoeQueue','completed','peakQueue','runStatus','attendees','arrivalMinutes','shoePics','serviceSeconds','speed','start','pause'].map(id => [id, document.querySelector('#'+id)]));

let venue;
let agents = [];
let simTime = 0;
let running = false;
let last = performance.now();
let peakQueue = 0;
let nextId = 1;
let serviceSlots = [];

const stateColor = { walking:'#1976d2', queue:'#e53935', served:'#43a047' };

async function init(){
  venue = await fetch('./data/venues/wihara-floor1.json').then(r => r.json());
  reset();
  requestAnimationFrame(loop);
}

function reset(){
  agents=[]; simTime=0; peakQueue=0; nextId=1; serviceSlots=[]; running=true;
  ui.runStatus.textContent='RUNNING'; ui.pause.textContent='Pause';
}

function spawnAgent(){
  const p=venue.waypoints.spawn;
  agents.push({ id:nextId++, x:p.x+(Math.random()-.5)*3, y:p.y+(Math.random()-.5), speed:.9+Math.random()*.5, state:'walking', stage:0, serviceRemaining:0, done:false });
}

const targets = () => [venue.waypoints.clear, venue.waypoints.shoeQueue, venue.waypoints.shoeService, venue.waypoints.stairs];

function moveToward(a,t,dt){
  const dx=t.x-a.x, dy=t.y-a.y, d=Math.hypot(dx,dy);
  if(d<.35) return true;
  const step=Math.min(d,a.speed*dt);
  a.x+=dx/d*step; a.y+=dy/d*step;
  return false;
}

function update(dt){
  simTime+=dt;
  const total=+ui.attendees.value;
  const arrivalSeconds=Math.max(1,+ui.arrivalMinutes.value*60);
  const expected=Math.min(total, Math.floor(total*Math.min(1,simTime/arrivalSeconds)));
  while(agents.length<expected) spawnAgent();

  const pics=Math.max(1,+ui.shoePics.value);
  const meanService=Math.max(2,+ui.serviceSeconds.value);
  const queue=agents.filter(a=>a.state==='queue');
  peakQueue=Math.max(peakQueue,queue.length);

  for(const a of agents){
    if(a.done) continue;
    if(a.state==='queue') continue;
    if(a.state==='service'){
      a.serviceRemaining-=dt;
      if(a.serviceRemaining<=0){ a.state='served'; a.stage=3; serviceSlots=serviceSlots.filter(id=>id!==a.id); }
      continue;
    }
    const t=targets()[a.stage];
    if(moveToward(a,t,dt)){
      if(a.stage===0) a.stage=1;
      else if(a.stage===1){ a.state='queue'; }
      else if(a.stage===3){ a.done=true; }
    }
  }

  const waiting=agents.filter(a=>a.state==='queue').sort((a,b)=>a.id-b.id);
  while(serviceSlots.length<pics && waiting.length){
    const a=waiting.shift();
    a.state='service'; a.stage=2; a.x=venue.waypoints.shoeService.x+(serviceSlots.length-(pics-1)/2)*.65; a.y=venue.waypoints.shoeService.y;
    a.serviceRemaining=meanService*(.75+Math.random()*.5);
    serviceSlots.push(a.id);
  }

  // Simple visual queue formation; service order remains FIFO.
  agents.filter(a=>a.state==='queue').forEach((a,i)=>{
    const cols=12;
    a.x=venue.waypoints.shoeQueue.x+(i%cols)*.55-cols*.27;
    a.y=venue.waypoints.shoeQueue.y+(Math.floor(i/cols))* .55;
  });
}

function transform(){
  const pad=25, sx=(canvas.width-pad*2)/venue.bounds.width, sy=(canvas.height-pad*2)/venue.bounds.height;
  return {pad,s:Math.min(sx,sy)};
}
function rect(z){ const {pad,s}=transform(); return [pad+z.x*s,pad+z.y*s,z.w*s,z.h*s]; }
function point(x,y){ const {pad,s}=transform(); return [pad+x*s,pad+y*s]; }

function draw(){
  ctx.clearRect(0,0,canvas.width,canvas.height);
  ctx.fillStyle='#f8fafc'; ctx.fillRect(0,0,canvas.width,canvas.height);
  for(const z of venue.zones){
    const [x,y,w,h]=rect(z);
    ctx.fillStyle=z.type==='blocked'?'#d9dde3':z.type==='service'?'#ffe8a3':z.type==='destination'?'#cdeccf':z.type==='spawn'?'#cfe3ff':z.type==='event_reference'?'#eee3d4':'#e4f3dc';
    ctx.fillRect(x,y,w,h); ctx.strokeStyle='#7b8491'; ctx.strokeRect(x,y,w,h);
    ctx.fillStyle='#303640'; ctx.font='12px system-ui'; ctx.textAlign='center'; ctx.fillText(z.label,x+w/2,y+h/2+4);
  }
  for(const a of agents){
    if(a.done) continue;
    const [x,y]=point(a.x,a.y);
    ctx.beginPath(); ctx.arc(x,y,3.2,0,Math.PI*2);
    ctx.fillStyle=a.state==='queue'?stateColor.queue:(a.state==='service'||a.state==='served'?stateColor.served:stateColor.walking); ctx.fill();
  }
}

function updateUi(){
  const q=agents.filter(a=>a.state==='queue').length;
  ui.simTime.textContent=`${String(Math.floor(simTime/60)).padStart(2,'0')}:${String(Math.floor(simTime%60)).padStart(2,'0')}`;
  ui.spawned.textContent=agents.length; ui.shoeQueue.textContent=q; ui.completed.textContent=agents.filter(a=>a.done).length; ui.peakQueue.textContent=peakQueue;
}

function loop(now){
  const realDt=Math.min(.05,(now-last)/1000); last=now;
  if(running){ const multiplier=+ui.speed.value; update(realDt*multiplier); }
  draw(); updateUi(); requestAnimationFrame(loop);
}

ui.start.addEventListener('click',reset);
ui.pause.addEventListener('click',()=>{ running=!running; ui.pause.textContent=running?'Pause':'Resume'; ui.runStatus.textContent=running?'RUNNING':'PAUSED'; });
init();
