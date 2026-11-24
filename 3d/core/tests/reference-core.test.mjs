import assert from 'node:assert/strict';
import test from 'node:test';
import { ReferenceCore } from '../dist/index.js';

const definition = { seed: 7, fighters: [
  { id: 5, origin: [0, 1, 0], yawRad: 0, segmentIds: ['head', 'spine-0'] },
  { id: 1, origin: [2, 1, 3], yawRad: Math.PI / 2, segmentIds: ['head'] }
] };

test('fixed-step movement is deterministic and IDs have stable order', () => {
  const sequence = () => {
    const core = new ReferenceCore();
    core.initialize(definition);
    for (let i=0; i<60; i++) core.step(1/60, { commands: [
      { fighterId:5, forward:1, turn:0.2, sprint:false },
      { fighterId:1, forward:-1, turn:0, sprint:true }
    ] });
    return core.getSnapshot();
  };
  const a = sequence(), b = sequence();
  assert.deepEqual(Array.from(a.fighterIds), [1,5]);
  assert.deepEqual(Array.from(a.roots), Array.from(b.roots));
  assert.equal(a.tick, 60);
  assert.ok(Math.abs(a.elapsedSeconds - 1) < 1e-12);
});

test('snapshot buffers do not mutate the world', () => {
  const core = new ReferenceCore(); core.initialize(definition);
  const initial = core.getSnapshot();
  initial.roots.fill(999); initial.fighterIds.fill(999);
  const next = core.getSnapshot();
  assert.equal(next.fighterIds[0], 1);
  assert.notEqual(next.roots[0], 999);
  assert.equal(core.drainEvents().length,0);
});

test('rejects invalid fighter IDs, input, and timestep', () => {
  const core = new ReferenceCore();
  assert.throws(() => core.step(1/60, {commands:[]}));
  assert.throws(() => core.initialize({seed:0,fighters:[
    {id:1,origin:[0,0,0],yawRad:0,segmentIds:[]},
    {id:1,origin:[0,0,0],yawRad:0,segmentIds:[]}
  ]}));
  core.initialize(definition);
  assert.throws(() => core.step(0, {commands:[]}));
  assert.throws(() => core.step(1/60, {commands:[{fighterId:5,forward:2,turn:0,sprint:false}]}));
  core.dispose();
  assert.throws(() => core.getSnapshot());
});
