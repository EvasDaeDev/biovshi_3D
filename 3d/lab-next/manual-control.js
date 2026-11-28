/** UI-only command routing. No synthetic commands for other AI patients. */
export function manualInput(ids,states,selected,has,fall=false,player=null){
 const fighterId=selected===''?null:Number(selected),index=fighterId===null?-1:ids.indexOf(fighterId);
 if(index<0||states[index]!=='active')return {commands:[]};
 const attackKind=player?.attackKind??(has('KeyJ')?'arm':has('KeyK')?'leg':has('KeyL')?'head':null);
 const lateral=has('KeyD','ArrowRight')-has('KeyA','ArrowLeft');
 const command={fighterId,forward:has('KeyW','ArrowUp')-has('KeyS','ArrowDown'),turn:player?0:lateral,sprint:!!has('ShiftLeft','ShiftRight'),jump:!!has('Space')||!!player?.jump,attack:attackKind!==null,...(attackKind?{attackKind}:{}),...(player?{player:{yawDelta:player.yawDelta,pitch:player.pitch,strafe:lateral,crouch:!!has('ControlLeft','ControlRight')}}:{})};
 return {commands:[command,...(fall?Array.from(ids).filter((id,i)=>id!==fighterId&&states[i]==='active').map(fighterId=>({fighterId,forward:0,turn:0,sprint:false,attack:false})):[])]};
}

/** Checkboxes/radios/buttons are not text entry. Keeping their focus after
 * toggling a diagnostic must not disable WASD. Selects retain normal keyboard
 * navigation while focused. The scene reclaims focus after a selection. */
export function capturesTextInput(element){
 if(!element)return false;
 if(element.isContentEditable||element.tagName==='TEXTAREA')return true;
 if(element.tagName!=='INPUT')return false;
 return !['checkbox','radio','button','submit','reset','range','color','file','image','hidden'].includes(element.type);
}
