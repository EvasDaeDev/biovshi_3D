/** Provisional lab locomotion constraints, not product combat balance. */
export type MobilityMode = 'biped' | 'single-support' | 'arm-crawl' | 'head-crawl' | 'torso-crawl' | 'unsupported';
export interface Mobility {
 readonly mode:MobilityMode; readonly support:readonly [boolean,boolean];
 readonly arms:readonly [number,number]; readonly prone:boolean;
 readonly speedScale:number; readonly canSprint:boolean;
}
export function mobilityFor(segments:readonly string[]):Mobility {
 const has=(id:string)=>segments.includes(id);
 const leg=(side:string)=>has('pelvis')&&['upperLeg','lowerLeg','foot'].every(part=>has(side+'.'+part));
 const arm=(side:string)=>!has('chest')||!has(side+'.upperArm')?0:!has(side+'.lowerArm')?1:!has(side+'.hand')?2:3;
 const left=leg('L'),right=leg('R'),arms=[arm('L'),arm('R')] as const;
 const base={support:[left,right] as const,arms};
 if(left&&right)return {...base,mode:'biped',prone:false,speedScale:1,canSprint:true};
 if(left||right)return {...base,mode:'single-support',prone:false,speedScale:.30,canSprint:false};
 if(arms[0]||arms[1])return {...base,mode:'arm-crawl',prone:true,speedScale:arms[0]&&arms[1]?.24:.13,canSprint:false};
 if(has('chest')&&has('neck')&&has('head'))return {...base,mode:'head-crawl',prone:true,speedScale:.09,canSprint:false};
 if(has('pelvis')&&has('abdomen')&&has('chest'))return {...base,mode:'torso-crawl',prone:true,speedScale:.045,canSprint:false};
 return {...base,mode:'unsupported',prone:true,speedScale:0,canSprint:false};
}
