import {appendFile,writeFile} from 'node:fs/promises';

const formatNumber=value=>Number.isFinite(value)?value.toFixed(2):'—';
const cell=value=>String(value??'—').replace(/\|/g,'\\|').replace(/[\r\n]/g,' ');

/** A finite observation window is not a victory condition. Preserve both open states. */
export function summarizeCombatAudit(reports){
 const summary={cases:reports.length,complete:0,combatOpen:0,physicsOpen:0};
 for(const report of reports){
  if(report.status==='complete')summary.complete++;
  else if(report.status==='combat-open')summary.combatOpen++;
  else if(report.status==='physics-open')summary.physicsOpen++;
  else throw new RangeError('Unknown combat audit status: '+report.status);
 }
 return summary;
}

export function formatCombatAuditMarkdown(reports){
 const summary=summarizeCombatAudit(reports);
 const lines=[
  '## P3 — integrated combat audit (TypeScript + Rapier)',
  '',
  '**'+summary.complete+'/'+summary.cases+' complete** · '+summary.combatOpen+' combat-open · '+summary.physicsOpen+' physics-open',
  '',
  '| Mode | Seed | Status | Winner | Combat (s) | Observed (s) | Hits | Detached | Unsettled bodies/debris | Longest no-hit (s) | Step CPU p95 (ms) |',
  '| --- | ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |',
 ];
 for(const r of reports){
  const fields=[r.mode,r.seed,r.status,r.winnerId??'—',formatNumber(r.combatSeconds),formatNumber(r.observedSeconds),r.hits,r.detached,r.unsettledBodies.length+'/'+r.unsettledDebris.length,formatNumber(r.longestNoHitSeconds),formatNumber(r.cpuMs.p95)];
  lines.push('| '+fields.map(cell).join(' | ')+' |');
 }
 lines.push('','**Acceptance note:** invariants are enforced as hard assertions; combat-open and physics-open remain diagnostic, not silently counted as completed fights. Time limits do not grant wins.','','Detailed machine-readable cases are stored in the combat-audit artifact.','');
 return lines.join('\n');
}

export async function writeCombatAuditArtifacts(reports,{outputFile=new URL('../combat-audit-report.json',import.meta.url),stepSummaryPath=process.env.GITHUB_STEP_SUMMARY}={}){
 const summary=summarizeCombatAudit(reports);
 await writeFile(outputFile,JSON.stringify({schemaVersion:1,summary,cases:reports},null,2)+'\n','utf8');
 if(stepSummaryPath)await appendFile(stepSummaryPath,formatCombatAuditMarkdown(reports),'utf8');
 return summary;
}
