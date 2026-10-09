import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { compute, heightFilter, mergeContext, type Shard } from './model';
import { DEFAULT_QUERY, parseQuery, serializeQuery } from './query';
import type { Choice } from './competition';
import { jointMargins } from './distribution';
const json=(name:string)=>JSON.parse(readFileSync(`public/data/${name}.json`,'utf8'));
const g=mergeContext(json('global'),json('context'),json('religion'),json('politics'),json('kids'),json('beliefs'));
const s:Shard=json(`m/${DEFAULT_QUERY.market}`);
// Analytic neutral synthetic pairing model; production support tested separately.
const dir={n:1000,validation:{status:'validated' as const},age:[0,0],edu:Array.from({length:3},()=>[0,0,0]),inc:Array.from({length:4},()=>[0,0,0,0]),prev:[[0,0],[0,0]]};
const choice:Choice={dKnots:[],ageKnots:[],dirs:{'12':dir,'21':dir,'11':dir,'22':dir}};
const run=(q=structuredClone(DEFAULT_QUERY))=>compute(s,g,q,choice,false);
describe('calculator invariants',()=>{
 it('has finite ordered stages and reconciled composition',()=>{ const r=run();r.steps.forEach((st,i)=>{expect(Number.isFinite(st.value)).toBe(true);expect(st.value).toBeGreaterThanOrEqual(0);if(i)expect(st.value).toBeLessThanOrEqual(r.steps[i-1].value+1);});expect(r.composition.total).toBeCloseTo(r.demographicPool,4); });
 it('income precedes race and tightening cannot increase counts',()=>{const q=structuredClone(DEFAULT_QUERY);q.filters.incomeMin=60;q.filters.races=[0];const r=run(q);expect(r.steps.findIndex(s=>s.key==='income')).toBeLessThan(r.steps.findIndex(s=>s.key==='race'));expect(r.final.value).toBeLessThan(run().final.value);});
 it.each([0,.03425,.05,1])('spark %s agrees with index and leaves multiplier unchanged',spark=>{const q=structuredClone(DEFAULT_QUERY);q.model.spark=spark;const a=run(),b=run(q);expect(b.final.value).toBeCloseTo(a.final.value*spark,5);expect(b.competition!.adjusted).toBeCloseTo(a.competition!.adjusted*spark,5);expect(b.competition!.multiplier).toBeCloseTo(a.competition!.multiplier,8);expect(b.composition.total).toBeCloseTo(a.composition.total,5);});
 it('extreme supported height filters produce finite estimates',()=>{const q=structuredClone(DEFAULT_QUERY);q.filters.height={lo:54,hi:54};const r=run(q);expect(Number.isFinite(r.final.value)).toBe(true);expect(r.competition===null || Number.isFinite(r.competition.adjusted)).toBe(true);});
 it('profile height and age do not change market crowding',()=>{const a=run();const q=structuredClone(DEFAULT_QUERY);q.me.age=60;q.you.height=75;expect(heightFilter(q)).toBeNull();expect(run(q).competition!.ratio).toBeCloseTo(a.competition!.ratio,8);});
 it('unsupported kids ages do not silently extrapolate',()=>{const q=structuredClone(DEFAULT_QUERY);q.seek.hi=60;q.filters.wantKids=[0,1];const r=run(q);expect(r.issues.length).toBe(1);expect(r.competition).toBeNull();});
 it('unvalidated competition is unavailable, not zero',()=>{const unsupported={...choice,dirs:{'21':{...dir,validation:{status:'unsupported' as const}}}};expect(compute(s,g,DEFAULT_QUERY,unsupported).competition).toBeNull();});
});
describe('query compatibility',()=>{
 it.each([54,84])('height %s round trips without implicit filters',height=>{const q=structuredClone(DEFAULT_QUERY);q.you.height=height;q.model.spark=0;expect(parseQuery(new URLSearchParams(serializeQuery(q)))).toEqual(q);});
 it('rejects unknown query versions',()=>{expect(()=>parseQuery(new URLSearchParams('v=3'))).toThrow('Unsupported query version');});
 it('legacy height and disabled spark retain semantics',()=>{const q=parseQuery(new URLSearchParams('me=m36&seek=f30-39&you=h70&spark=0'));expect(q.model.spark).toBeNull();expect(q.filters.height).toEqual({lo:54,hi:70});});
});
describe('joint margin calibration',()=>{
 it('preserves local rows and columns under strong tilt and zeros',()=>{const p=jointMargins([.8,.2,0],[.1,.7,.2],[[100,.1,.2],[.1,100,.2]]);p.forEach((r,i)=>expect(r.reduce((a,b)=>a+b,0)).toBeCloseTo([.8,.2,0][i],7));[0,1,2].forEach(j=>expect(p.reduce((a,r)=>a+r[j],0)).toBeCloseTo([.1,.7,.2][j],7));});
});
