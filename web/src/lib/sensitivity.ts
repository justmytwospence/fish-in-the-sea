import { compute, type Global, type Query, type Shard } from './model';
import type { Choice } from './competition';
export interface Sensitivity {label:string;index:number|null;multiplier:number|null}
export function sensitivities(s:Shard,g:Global,q:Query,c:Choice):Sensitivity[] {
 const result=(label:string,choice=c,global=g,height=false,kids=false)=>{
  const r=compute(s,global,q,choice,false,height,kids).competition;
  return {label,index:r?.adjusted??null,multiplier:r?.multiplier??null};
 };
 const options=[result('Base model')];
 for(const key of ['edu','inc','prev','race'] as const) {
  const d=structuredClone(c);
  Object.values(d.dirs).forEach(dir=>{if(dir[key])dir[key]=dir[key]!.map(row=>row.map(()=>0));});
  options.push(result(`Without ${key==='inc'?'income':key==='edu'?'education':key==='prev'?'prior-marriage':'race'} pairing association`,d));
 }
 options.push(result('Without height assumption',c,g,true),result('Without children-at-home assumption',c,g,false,true));
 const noPairing={...g,religion:g.religion?{...g.religion,pairing:{}}:undefined,politics:g.politics?{...g.politics,pairing:{}}:undefined};
 options.push(result('Without religious/political pairing associations',c,noPairing));
 options.push(result('Without ecological local survey adjustments',c,{...g,ctx:undefined}));
 return options;
}
