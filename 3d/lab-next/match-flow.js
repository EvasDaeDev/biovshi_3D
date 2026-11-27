const PREPARATION_SECONDS=4;

export class MatchFlow{
 constructor(preparation,result){
  this.preparation=preparation;
  this.result=result;
  this.title=result.querySelector('h2');
  this.summary=result.querySelector('p');
 }

 reset(){
  this.remaining=PREPARATION_SECONDS;
  this.preparation.textContent='До начала боя 4';
  this.preparation.hidden=false;
  this.result.hidden=true;
 }

 advance(seconds,hidden){
  if(hidden)return 0;
  if(this.remaining<=0)return seconds;
  const preparation=Math.min(seconds,this.remaining);
  this.remaining-=preparation;
  this.preparation.hidden=this.remaining===0;
  if(!this.preparation.hidden){
   const label='До начала боя '+Math.ceil(this.remaining);
   if(this.preparation.textContent!==label)this.preparation.textContent=label;
  }
  return seconds-preparation;
 }

 showResult(snapshot,time){
  if(!snapshot.fight.ended||!this.result.hidden)return;
  const winner=snapshot.fight.winnerId;
  this.title.textContent=winner===null?'Ничья':'Победил пациент № '+winner;
  this.summary.textContent='Время боя '+time+' · Попаданий '+snapshot.damageStats.hits;
  this.result.hidden=false;
  this.result.querySelector('a').focus();
 }
}
