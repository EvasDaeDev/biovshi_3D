/** UI-only command routing. No synthetic commands for other AI patients. */
export function manualInput(ids,states,selected,has,fall=false){
 const fighterId=selected===''?null:Number(selected),index=fighterId===null?-1:ids.indexOf(fighterId);
 if(index<0||states[index]!=='active')return {commands:[]};
 const attackKind=has('KeyJ')?'arm':has('KeyK')?'leg':has('KeyL')?'head':null;
 const command={fighterId,forward:has('KeyW','ArrowUp')-has('KeyS','ArrowDown'),turn:has('KeyD','ArrowRight')-has('KeyA','ArrowLeft'),sprint:!!has('ShiftLeft','ShiftRight'),jump:!!has('Space'),attack:attackKind!==null,...(attackKind?{attackKind}:{})};
 return {commands:[command,...(fall?Array.from(ids).filter((id,i)=>id!==fighterId&&states[i]==='active').map(fighterId=>({fighterId,forward:0,turn:0,sprint:false,attack:false})):[])]};
}

/** Checkboxes/radios/buttons are not text entry. Keeping their focus after
 * toggling a diagnostic must not disable WASD. Selects retain normal keyboard
 * navigation; scenario/control selects explicitly blur on change. */
export function capturesTextInput(element){
 if(!element)return false;
 if(element.isContentEditable||element.tagName==='TEXTAREA')return true;
 if(element.tagName!=='INPUT')return false;
 return !['checkbox','radio','button','submit','reset','range','color','file','image','hidden'].includes(element.type);
}
