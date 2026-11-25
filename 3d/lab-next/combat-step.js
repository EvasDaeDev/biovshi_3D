/** Shared fixed-step orchestration for browser and headless verification.
 * External physics never changes the combat rules or owns fighter health. */
export function advanceCombatStep(core,debris,dt,input,damage=null){
 core.setTerrainMounds(debris.moundSnapshot());
 core.step(dt,input);
 if(damage)core.applyDamage(damage);
 const events=core.drainEvents();
 for(const e of events)debris.accept(e);
 debris.step(dt);
 for(const b of debris.bodySnapshot())core.setIncapacitatedPose(b.fighterId,b.parts,b.settled);
 return events;
}
