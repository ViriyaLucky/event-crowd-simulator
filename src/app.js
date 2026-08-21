import { NavigationGrid } from './navigation.js';

const canvas = document.querySelector('#sim');
const ctx = canvas.getContext('2d');
const ui = Object.fromEntries(['simTime','spawned','completed','runStatus','attendees','arrivalMinutes','speed','start','pause'].map(id => [id, document.querySelector('#'+id)]));
let venue, nav, agents=[], simTime=0, running=false, last=performance.now(), nextId=1;
const BODY_RADIUS=.28, COMFORT_RADIUS=.75, MAX_NEIGHBOR_RADIUS=1.8;

async function init(){
  venue = await fetch(`./data/venues/wihara-floor1.json?v=${Date.now()}`, { cache: 'no-store' }).then(r => r.json());
  nav = new NavigationGrid(venue,1);
  reset();
  requestAnimationFrame(loop);
}
function route(){return venue.flow.ingress.map(name=>venue.waypoints[name]).filter(Boolean)}
function reset(){agents=[];simTime=0;nextId=1;running=true;ui.runStatus.textContent='RUNNING';ui.pause.textContent='Pause'}
function setPath(a,target){a.path=nav.findPath({x:a.x,y:a.y},target);a.pathIndex=Math.min(1,a.path.length-1)}
function spawnAgent(){const p=venue.waypoints.spawn,a={id:nextId++,x:p.x+(Math.random()-.5)*2,y:p.y,speed:.9+Math.random()*.5,stage:1,done:false,path:[],pathIndex:0};setPath(a,route()[1]);agents.push(a)}
function separationVector(a){let sx=0,sy=0,n=0;for(const b of agents){if(b===a||b.done)continue;const dx=a.x-b.x,dy=a.y-b.y,d=Math.hypot(dx,dy);if(d>0&&d<MAX_NEIGHBOR_RADIUS){const f=d<COMFORT_RADIUS?(COMFORT_RADIUS-d)/COMFORT_RADIUS:.08*(MAX_NEIGHBOR_RADIUS-d)/MAX_NEIGHBOR_RADIUS;sx+=dx/d*f;sy+=dy/d*f;n++}}return n?{x:sx/n,y:sy/n}:{x:0,y:0}}
function blocked(x,y,a){const c=nav.toCell({x,y});if(nav.isBlocked(c.c,c.r))return true;return agents.some(b=>b!==a&&!b.done&&Math.hypot(x-b.x,y-b.y)<BODY_RADIUS*2)}
function move(a,dt){const node=a.path[Math.min(a.pathIndex,a.path.length-1)],dx=node.x-a.x,dy=node.y-a.y,d=Math.hypot(dx,dy);if(d<.4){if(a.pathIndex<a.path.length-1){a.pathIndex++;return false}return true}const sep=separationVector(a);let vx=dx/d+sep.x*1.5,vy=dy/d+sep.y*1.5,l=Math.hypot(vx,vy)||1;vx/=l;vy/=l;const step=Math.min(d,a.speed*dt),nx=a.x+vx*step,ny=a.y+vy*step;if(!blocked(nx,ny,a)){a.x=nx;a.y=ny}return false}
function update(dt){simTime+=dt;const total=+ui.attendees.value,duration=Math.max(1,+ui.arrivalMinutes.value*60),expected=Math.min(total,Math.floor(total*Math.min(1,simTime/duration)));while(agents.length<expected)spawnAgent();const r=route();for(const a of agents){if(a.done)continue;if(move(a,dt)){a.stage++;if(a.stage>=r.length)a.done=true;else setPath(a,r[a.stage])}}}
function transform(){const pad=25,sx=(canvas.width-pad*2)/venue.bounds.width,sy=(canvas.height-pad*2)/venue.bounds.height;return{pad,s:Math.min(sx,sy)}}
function rect(z){const{pad,s}=transform();return[pad+z.x*s,pad+z.y*s,z.w*s,z.h*s]}
function point(x,y){const{pad,s}=transform();return[pad+x*s,pad+y*s]}
function drawRoute(){const r=route();ctx.save();ctx.strokeStyle='#2563eb';ctx.lineWidth=2;ctx.setLineDash([6,5]);ctx.beginPath();r.forEach((p,i)=>{const[x,y]=point(p.x,p.y);i?ctx.lineTo(x,y):ctx.moveTo(x,y)});ctx.stroke();ctx.restore()}
function zoneColor(z){if(z.type==='blocked')return'#d9dde3';if(z.type==='seating')return'#f3d7a4';if(z.type==='destination')return'#cdeccf';if(z.type==='spawn')return'#cfe3ff';return'#e4f3dc'}
function draw(){ctx.clearRect(0,0,canvas.width,canvas.height);ctx.fillStyle='#f8fafc';ctx.fillRect(0,0,canvas.width,canvas.height);for(const z of venue.zones){const[x,y,w,h]=rect(z);ctx.fillStyle=zoneColor(z);ctx.fillRect(x,y,w,h);ctx.strokeStyle='#7b8491';ctx.strokeRect(x,y,w,h);ctx.fillStyle='#303640';ctx.font='12px system-ui';ctx.textAlign='center';ctx.fillText(z.label,x+w/2,y+h/2+4)}drawRoute();for(const a of agents){if(a.done)continue;const[x,y]=point(a.x,a.y);ctx.beginPath();ctx.arc(x,y,3.2,0,Math.PI*2);ctx.fillStyle='#1976d2';ctx.fill()}}
function updateUi(){ui.simTime.textContent=`${String(Math.floor(simTime/60)).padStart(2,'0')}:${String(Math.floor(simTime%60)).padStart(2,'0')}`;ui.spawned.textContent=agents.length;ui.completed.textContent=agents.filter(a=>a.done).length}
function loop(now){const dt=Math.min(.05,(now-last)/1000);last=now;if(running)update(dt*(+ui.speed.value));draw();updateUi();requestAnimationFrame(loop)}
ui.start.addEventListener('click',reset);ui.pause.addEventListener('click',()=>{running=!running;ui.pause.textContent=running?'Pause':'Resume';ui.runStatus.textContent=running?'RUNNING':'PAUSED'});init();
