import {loadArenaCatalog,populatePatientCounts} from './arena-options.js';

const arena=document.getElementById('arena'),patients=document.getElementById('participants');
const start=document.getElementById('start-match'),status=document.getElementById('setup-status');

try{
 const catalog=await loadArenaCatalog();
 const byScenario=new Map(Object.values(catalog).map(location=>['location-'+location.id,location]));
 arena.replaceChildren(...Array.from(byScenario,([key,location])=>new Option(location.name,key)));
 function updateCounts(){populatePatientCounts(patients,byScenario.get(arena.value).capacity,patients.value);}
 arena.addEventListener('change',updateCounts);
 updateCounts();
 arena.disabled=patients.disabled=start.disabled=false;
 status.hidden=true;
}catch(error){
 status.textContent='Не удалось загрузить арены. '+error.message;
}
