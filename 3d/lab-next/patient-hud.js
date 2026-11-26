/** Compact anatomical status overlay. Read-only view of the same fixed
 * snapshot used by the arena; never simulates damage, bleeding or time. */
export const BODY_MAP=Object.freeze([
 ['head','Голова',31,2,18,19],['neck','Шея',36,23,8,6],
 ['chest','Грудная клетка',23,31,34,20],['abdomen','Живот / позвоночник',30,53,20,16],['pelvis','Таз',25,71,30,11],
 ['L.upperArm','Левое плечо',9,31,12,19],['L.lowerArm','Левое предплечье',7,52,12,18],['L.hand','Левая кисть',7,72,12,10],
 ['R.upperArm','Правое плечо',59,31,12,19],['R.lowerArm','Правое предплечье',61,52,12,18],['R.hand','Правая кисть',61,72,12,10],
 ['L.upperLeg','Левое бедро',25,84,13,21],['L.lowerLeg','Левая голень',25,107,12,21],['L.foot','Левая стопа',23,130,14,7],
 ['R.upperLeg','Правое бедро',42,84,13,21],['R.lowerLeg','Правая голень',43,107,12,21],['R.foot','Правая стопа',43,130,14,7]
]);
const clamp=v=>Math.max(0,Math.min(1,v));
const number=n=>Number(n.toFixed(1)).toLocaleString('ru-RU',{maximumFractionDigits:1});
export function segmentPresentation(part){
 const ratio=part?.attached&&part.maxHp>0?clamp(part.hp/part.maxHp):0;
 if(!ratio)return {ratio,state:'destroyed',fill:'#69736f',detail:part?.attached?'разрушен (на месте)':'отсутствует'};
 return {ratio,state:ratio>=1?'healthy':'damaged',fill:'hsl('+Math.round(120*ratio)+' 76% 49%)',detail:number(part.hp)+' / '+number(part.maxHp)+' HP'};
}
export function patientPresentation(health,oil,life,fight,id,distress){
 const current=health?.endurance??0,max=health?.maxEndurance??0,base=health?.baseEndurance??24,wounds=oil?.wounds?.length??0;
 const alive=life==='active',finished=!!fight?.ended;
 const state=!alive?'Выбыл':finished?(fight.winnerId===id?'Победитель':'Бой завершён'):distress?.mode==='prey'?'Жертва':distress?.mode==='hysteria'?'Истерика':distress?.mode==='last-stand'?'Последний бой':'В бою';
 const bleeding=!alive?'Нет':finished?(wounds?'Остановлено':'Нет'):oil?.remainingTicks!=null?'Отказ через '+Math.ceil(oil.remainingTicks/60)+' с':wounds?'Истекание · '+wounds+' ран':'Нет истекания';
 return {state,bleeding,wounds,current,max,base,capacity:clamp(max/base),remaining:clamp(current/base),lost:health?.lostSegments??0,critical:alive&&!finished&&oil?.remainingTicks!=null,label:number(current)+' / '+number(max)};
}
const SVG='http://www.w3.org/2000/svg';
const element=(doc,tag,cls,parent)=>{const node=doc.createElement(tag);node.className=cls;parent?.append(node);return node;};
const txt=(node,value)=>{if(node.textContent!==value)node.textContent=value;};
const attr=(node,key,value)=>{const v=String(value);if(node.getAttribute(key)!==v)node.setAttribute(key,v);};
export class PatientHud{
 constructor(root){this.root=root;this.doc=root.ownerDocument;this.cards=new Map();this.last=null;}
 card(id){
  const doc=this.doc,card=element(doc,'article','patient-card',this.root);card.dataset.patientId=String(id);
  const figure=doc.createElementNS(SVG,'svg');attr(figure,'viewBox','0 0 80 139');attr(figure,'class','patient-anatomy');attr(figure,'role','img');attr(figure,'aria-label','Состояние всех 17 сегментов');card.append(figure);
  const segments=new Map();
  for(const [key,label,x,y,width,height] of BODY_MAP){
   const rect=doc.createElementNS(SVG,'rect');
   for(const [k,v] of Object.entries({x,y,width,height,rx:2,'data-segment':key,stroke:'#0c1712','stroke-width':.8}))attr(rect,k,v);
   const title=doc.createElementNS(SVG,'title');rect.append(title);figure.append(rect);segments.set(key,{rect,title,label});
  }
  const info=element(doc,'div','patient-info',card),name=element(doc,'div','patient-name',info);
  const dot=element(doc,'span','patient-dot',name);dot.style.background=id===0?'#a6efba':'#a58c83';
  const title=element(doc,'strong','',name);txt(title,'Пациент №'+id);
  const state=element(doc,'div','patient-state',info),label=element(doc,'div','patient-label',info);txt(label,'Выносливость');
  const value=element(doc,'div','patient-value',info),bar=element(doc,'div','patient-bar',info);attr(bar,'role','meter');attr(bar,'aria-label','Выносливость');
  const capacity=element(doc,'span','patient-capacity',bar),remaining=element(doc,'span','patient-remaining',bar);
  const losses=element(doc,'div','patient-losses',info),bleeding=element(doc,'div','patient-bleeding',info);
  const item={card,segments,state,value,bar,capacity,remaining,losses,bleeding};this.cards.set(id,item);return item;
 }
 draw(snapshot){
  if(this.last===snapshot)return;this.last=snapshot;
  const ids=Array.from(snapshot.fighterIds??[]);
  for(const [id,c] of this.cards)if(!ids.includes(id)){c.card.remove();this.cards.delete(id);}
  ids.forEach((id,i)=>{
   const c=this.cards.get(id)??this.card(id),health=snapshot.health?.[i],oil=snapshot.oil?.[i],life=snapshot.lifeStates?.[i];
   const p=patientPresentation(health,oil,life,snapshot.fight,id,snapshot.distress?.[i]);
   const parts=new Map((health?.segments??[]).map(v=>[v.id,v]));
   for(const [key,node] of c.segments){
    const part=parts.get(key),v=segmentPresentation(part);
    attr(node.rect,'fill',v.fill);attr(node.rect,'data-state',v.state);attr(node.rect,'data-hp',part?.hp??0);
    txt(node.title,node.label+': '+v.detail);
   }
   attr(c.card,'data-life',life??'unknown');attr(c.card,'data-bleeding',p.critical?'critical':p.wounds?'active':'none');
   txt(c.state,p.state);txt(c.value,p.label);txt(c.losses,'Утрачено: '+p.lost+' / 17');txt(c.bleeding,p.bleeding);
   attr(c.bar,'aria-valuemin',0);attr(c.bar,'aria-valuemax',p.max);attr(c.bar,'aria-valuenow',p.current);
   attr(c.bar,'aria-valuetext',p.label);
   const cap=(p.capacity*100).toFixed(2)+'%',remain=(p.remaining*100).toFixed(2)+'%';
   if(c.capacity.style.width!==cap)c.capacity.style.width=cap;
   if(c.remaining.style.width!==remain)c.remaining.style.width=remain;
   const color='hsl('+Math.round(120*clamp(p.max?p.current/p.max:0))+' 76% 49%)';
   if(c.remaining.dataset.color!==color){c.remaining.dataset.color=color;c.remaining.style.background=color;}
  });
 }
}
