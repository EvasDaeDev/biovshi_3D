/** Provisional lab locomotion constraints, not product combat balance. */
export type MobilityMode = 'biped' | 'single-support' | 'unsupported';
export interface Mobility { readonly mode:MobilityMode; readonly support:readonly [boolean,boolean]; readonly speedScale:number; readonly canSprint:boolean }
export function mobilityFor(segments:readonly string[]):Mobility {
 const leg=(side:string)=>['upperLeg','lowerLeg','foot'].every(part=>segments.includes(side+'.'+part));
 const left=leg('L'),right=leg('R');
 if(left&&right)return {mode:'biped',support:[left,right],speedScale:1,canSprint:true};
 if(left||right)return {mode:'single-support',support:[left,right],speedScale:.30,canSprint:false};
 return {mode:'unsupported',support:[false,false],speedScale:0,canSprint:false};
}
