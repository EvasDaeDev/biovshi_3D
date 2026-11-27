export async function loadArenaCatalog(){
 const response=await fetch(new URL('./location-catalog.json',import.meta.url));
 if(!response.ok)throw Error('Каталог локаций: HTTP '+response.status);
 return response.json();
}

export function populatePatientCounts(input,capacity,preferred){
 const count=Number(preferred);
 const value=Math.min(capacity,Math.max(2,Number.isInteger(count)&&count>0?count:3));
 const options=Array.from({length:capacity-1},(_,i)=>new Option(String(i+2),String(i+2)));
 input.replaceChildren(...options);
 input.value=String(value);
}
