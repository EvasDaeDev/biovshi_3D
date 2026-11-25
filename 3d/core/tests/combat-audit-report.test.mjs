import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {formatCombatAuditMarkdown,summarizeCombatAudit,writeCombatAuditArtifacts} from '../scripts/combat-audit-report.mjs';

const makeCase=(status,seed)=>({mode:'vision',seed,status,winnerId:status==='complete'?1:null,combatSeconds:status==='combat-open'?null:12.5,observedSeconds:35,hits:18,detached:4,unsettledBodies:status==='physics-open'?[{id:1}]:[],unsettledDebris:[],longestNoHitSeconds:2.5,cpuMs:{p95:0.175}});

test('combat audit report preserves open outcomes rather than manufacturing winners',()=>{
 const cases=[makeCase('complete',7),makeCase('combat-open',19),makeCase('physics-open',42)];
 assert.deepEqual(summarizeCombatAudit(cases),{cases:3,complete:1,combatOpen:1,physicsOpen:1});
 const markdown=formatCombatAuditMarkdown(cases);
 assert.match(markdown,/1\/3 complete/);
 assert.match(markdown,/combat-open/);
 assert.match(markdown,/physics-open/);
 assert.match(markdown,/not silently counted/);
 assert.match(markdown,/0\.17/);
 assert.throws(()=>summarizeCombatAudit([{status:'unknown'}]),/Unknown combat audit status/);
});

test('combat audit saves JSON artifact and appends GitHub Actions summary',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'eccepry-audit-'));
 try{
  const outputFile=join(dir,'report.json'),stepSummaryPath=join(dir,'summary.md');
  await writeFile(stepSummaryPath,'Previous step\n');
  const cases=[makeCase('complete',7),makeCase('combat-open',19)];
  const summary=await writeCombatAuditArtifacts(cases,{outputFile,stepSummaryPath});
  assert.equal(summary.combatOpen,1);
  const json=JSON.parse(await readFile(outputFile,'utf8'));
  assert.equal(json.schemaVersion,1);
  assert.deepEqual(json.cases,cases);
  assert.deepEqual(json.summary,summary);
  const markdown=await readFile(stepSummaryPath,'utf8');
  assert.ok(markdown.startsWith('Previous step\n'));
  assert.match(markdown,/P3 — integrated combat audit/);
 }finally{await rm(dir,{recursive:true,force:true});}
});
