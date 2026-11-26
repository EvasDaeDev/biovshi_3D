import test from 'node:test';
import assert from 'node:assert/strict';
import {formatRoundTime,RoundClock,FrameMeter} from '../../lab-next/round-telemetry.js';

test('round clock matches the 2D display and holds the result until reset',()=>{
 assert.deepEqual([0,.016666666666666666,59.999,60.01,3601.25].map(formatRoundTime),['0:00','0:01','59:99','1:00:01','1:00:01:25']);
 const clock=new RoundClock(),tick=(elapsedSeconds,ended=false)=>clock.sample({elapsedSeconds,fight:{ended}});
 assert.equal(tick(2),'2:00');
 assert.equal(tick(3.25,true),'3:25');
 assert.equal(tick(8,true),'3:25');
 clock.reset();
 assert.equal(tick(0),'0:00');
});

test('frame meter derives FPS and scene duty and leaves unavailable GPU data blank',()=>{
 const output={},meter=new FrameMeter({getExtension:()=>null},output);
 assert.equal(meter.begin(),null);
 meter.end(null);
 for(let i=0;i<=30;i++)meter.frame(i*20,5);
 assert.match(output.textContent,/^50 FPS · CPU 25% \(5.0 мс\) · GPU —$/);
});
