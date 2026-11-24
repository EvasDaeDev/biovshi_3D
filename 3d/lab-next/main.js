import { LabSimulationCore, createLabConfig, FixedClock } from '../core/dist/index.js';

const canvas = document.getElementById('view');
const ctx = canvas.getContext('2d');
const stats = document.getElementById('stats');
const pauseButton = document.getElementById('pause');
const core = new LabSimulationCore();
const clock = new FixedClock();
const keys = new Set();
const seed = 7;
let paused = false, previous = null;
const controls = new Set(['KeyW','KeyS','KeyA','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','ShiftLeft','ShiftRight']);
function reset() {
  core.initialize(createLabConfig(seed)); clock.reset(); keys.clear(); previous = null;
}
function input() {
  const has = (...codes) => Number(codes.some(code => keys.has(code)));
  return { commands: [{fighterId:0, forward:has('KeyW','ArrowUp')-has('KeyS','ArrowDown'),
    turn:has('KeyD','ArrowRight')-has('KeyA','ArrowLeft'), sprint:!!has('ShiftLeft','ShiftRight')}] };
}
window.addEventListener('keydown', e => { if (controls.has(e.code)) { e.preventDefault(); keys.add(e.code); } });
window.addEventListener('keyup', e => keys.delete(e.code));
window.addEventListener('blur', () => keys.clear());
document.addEventListener('visibilitychange', () => { keys.clear(); clock.reset(); previous=null; });
pauseButton.onclick = () => { paused=!paused; keys.clear(); pauseButton.textContent=paused?'Продолжить':'Пауза'; };
document.getElementById('reset').onclick = reset;
function draw(s) {
  const scale=canvas.width/14, center=canvas.width/2;
  ctx.clearRect(0,0,canvas.width,canvas.height);
  ctx.strokeStyle='#53695b'; ctx.strokeRect(center-5.65*scale,center-5.65*scale,11.3*scale,11.3*scale);
  for(let i=0;i<s.fighterIds.length;i++) {
    const x=center+s.roots[i*4]*scale, z=center+s.roots[i*4+2]*scale, yaw=s.roots[i*4+3];
    ctx.fillStyle=s.fighterIds[i]===0?'#a6efba':'#ba9c93';
    ctx.beginPath(); ctx.arc(x,z,12,0,Math.PI*2); ctx.fill();
    ctx.strokeStyle=ctx.fillStyle; ctx.beginPath(); ctx.moveTo(x,z);
    ctx.lineTo(x+Math.sin(yaw)*25,z-Math.cos(yaw)*25); ctx.stroke();
    ctx.fillText(String(s.fighterIds[i]),x+16,z+5);
  }
  stats.textContent=`ROOT ONLY | seed ${seed} | tick ${s.tick} | ${s.fighterIds.length} patients | ${paused?'PAUSED':'RUNNING'}`;
  stats.dataset.tick=String(s.tick);
}
function frame(now) {
  const elapsed=previous===null?0:(now-previous)/1000; previous=now;
  clock.advance(elapsed,dt=>core.step(dt,input()),paused||document.hidden);
  draw(core.getSnapshot()); requestAnimationFrame(frame);
}
reset(); requestAnimationFrame(frame);
