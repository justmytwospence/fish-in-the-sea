"use client";
import { useEffect, useMemo, useRef, useState } from 'react';
import { ARTIFACT_VERSION, PARTS, type RankResponse, type RankRow, type Sort } from '@/lib/rank';
import type { Query } from '@/lib/model';
import { parseQuery, serializeQuery } from '@/lib/query';
import { fmt } from '@/lib/format';
import { statesOf } from '@/lib/states';
import PlaceSearch from './PlaceSearch';
import MetroChart from './MetroChart';
export type Row = RankRow;
const MODES: {key:Sort;label:string;description:string}[] = [
  {key:'raw',label:'Estimated pool',description:'People estimated to pass the filters. Population size matters.'},
  {key:'adjusted',label:'Competition index',description:'A comparative index, not a reachable headcount or a validated moving recommendation.'},
  {key:'crowd',label:'Least crowded',description:'Modeled competitors per target before your preferences; lower is less crowded.'},
  {key:'odds',label:'Model multiplier',description:'Competition adjustment relative to the pool—not a probability of dating success.'},
];
const SETS = ['mountain','resort','college','retire','big','small'];
const value = (s:Sort,r:Row) => s==='raw'?r.pool:s==='adjusted'?r.adjusted:s==='crowd'?r.competitors:r.multiplier;
const cell = (s:Sort,r:Row) => { const v = value(s,r); return v===null ? 'Unavailable' : s==='odds' ? `×${v.toFixed(2)}` : s==='crowd'?v.toFixed(2):fmt(v); };
export default function Leaderboard({ qs, query, onPick }: { qs:string; query:Query; onPick:(id:string)=>void }) {
  const ref = useRef<HTMLElement>(null);
  const [visible,setVisible] = useState(false);
  const [data,setData] = useState<{key:string;rows:Row[]} | null>(null);
  const [error,setError] = useState('');
  const [retry,setRetry] = useState(0);
  const [sort,setSort] = useState<Sort>('adjusted');
  const [set,setSet] = useState('');
  const [state,setState] = useState('');
  const [pins,setPins] = useState<{market:string;label:string}[]>([]);
  const [shown,setShown] = useState(10);
  const rankKey = useMemo(() => { const q = parseQuery(new URLSearchParams(qs)); q.market='all'; return serializeQuery(q); },[qs]);
  useEffect(() => {
    const observer = new IntersectionObserver(([entry])=> { if(entry.isIntersecting) setVisible(true); },{rootMargin:'200px'});
    observer.observe(ref.current!); return ()=>observer.disconnect();
  },[]);
  useEffect(() => {
    if(!visible) return;
    const controller = new AbortController();
    const timer = setTimeout(async ()=> {
      setError('');
      const parts:RankResponse[] = new Array(PARTS);
      let next=0;
      const run = async () => {
        while(next<PARTS) {
          const part=next++;
          let response:RankResponse | undefined;
          for(let attempt=0;attempt<2;attempt++) {
            try {
              const r = await fetch('/api/rank',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({query:rankKey,part}),signal:controller.signal});
              if(!r.ok) { await r.arrayBuffer(); throw new Error('Ranking unavailable'); }
              response=await r.json();
              if(response!.artifactVersion !== ARTIFACT_VERSION || response!.part !== part || !Number.isInteger(response!.totalMarkets) || response!.totalMarkets<=0 || !Array.isArray(response!.all)) throw new Error('Incompatible ranking');
              break;
            } catch(e) { if(controller.signal.aborted || attempt===1) throw e; }
          }
          parts[part]=response!;
        }
      };
      const lanes=[run(),run()];
      try { await Promise.all(lanes); if(parts.some(p=>p.buildId!==parts[0].buildId || !p.buildId || p.totalMarkets!==parts[0].totalMarkets) || new Set(parts.flatMap(p=>p.all.map(r=>r.id))).size!==parts[0].totalMarkets) throw new Error('Mixed or incomplete snapshots'); if(!controller.signal.aborted) { setData({key:rankKey,rows:parts.flatMap(p=>p.all)}); setError(''); } }
      catch { if(!controller.signal.aborted) { controller.abort(); await Promise.allSettled(lanes); setError('Nationwide comparison failed. No partial ranks are shown.'); } }
    },350);
    return ()=> { clearTimeout(timer); controller.abort(); };
  },[rankKey,visible,retry]);
  const loading = !data || data.key!==rankKey;
  const rows = useMemo(() => (data?.rows ?? []).filter(r=>(!set || r.tags.includes(set)) && (!state || statesOf(r.name).includes(state))),[data,set,state]);
  const zeroIndex=sort==='adjusted' && query.model.spark===0;
  const ranked = useMemo(() => zeroIndex?[]:[...rows].filter(r=>value(sort,r)!==null).sort((a,b)=>sort==='crowd'?value(sort,a)!-value(sort,b)!:value(sort,b)!-value(sort,a)!),[rows,sort,zeroIndex]);
  const states = [...new Set((data?.rows ?? []).flatMap(r=>statesOf(r.name)))].sort();
  const mine = ranked.findIndex(r=>r.id===query.market);
  const keep = new Set(ranked.slice(0,shown).map(r=>r.id));
  if(mine>=0) ranked.slice(Math.max(0,mine-2),mine+3).forEach(r=>keep.add(r.id));
  pins.forEach(p=>{ const i=ranked.findIndex(r=>r.id===p.market); if(i>=0) ranked.slice(Math.max(0,i-2),i+3).forEach(r=>keep.add(r.id)); });
  const pick = (id:string)=> { onPick(id); window.scrollTo({top:0,behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'}); };
  return <section ref={ref} aria-label="Other cities" className="mt-16 border-t border-rule pt-10">
    <h2 className="font-display text-3xl">Compare places</h2>
    <p className="mt-2 text-sm text-muted">A model comparison, not advice to move. Local networks, travel distance and dating outcomes are not measured.</p>
    <div className="mt-4 flex flex-wrap gap-2">{MODES.map(m=><button type="button" key={m.key} aria-pressed={sort===m.key} onClick={()=>setSort(m.key)} className={`rounded-full border border-rule px-3 py-2 ${sort===m.key?'bg-ink text-paper':''}`}>{m.label}</button>)}</div>
    <p className="mt-3 text-sm text-muted">{MODES.find(m=>m.key===sort)!.description}</p>
    <div className="mt-4 flex flex-wrap gap-3">
      <label>Place type <select className="field" value={set} onChange={e=>setSet(e.target.value)}><option value="">Everywhere</option>{SETS.map(s=><option key={s}>{s}</option>)}</select></label>
      <label>State <select className="field" value={state} onChange={e=>setState(e.target.value)}><option value="">All</option>{states.map(s=><option key={s}>{s}</option>)}</select></label>
      <PlaceSearch label="Find a town to compare" placeholder="Compare a town…" onPick={h=>setPins(p=>[...p.filter(x=>x.market!==h.market),{market:h.market,label:h.label}].slice(-6))} />
    </div>
    <div className="mt-3 flex flex-wrap gap-3">{pins.map(p=><span key={p.market}><button type="button" className="underline" onClick={()=>pick(p.market)}>{p.label}</button> <button type="button" aria-label={`Stop comparing ${p.label}`} onClick={()=>setPins(pins.filter(x=>x.market!==p.market))}>×</button></span>)}</div>
    <p role="status" className="mt-4">{error || (loading ? 'Loading all eight nationwide partitions…' : mine>=0 ? `Selected place: #${mine+1} of ${ranked.length} supported places in view.` : `${ranked.length} supported places in view. Selected place has no supported rank here.`)}</p>
    {error && <button type="button" className="underline" onClick={()=>{setError('');setRetry(retry+1);}}>Retry comparison</button>}
    {!loading && !error && <>
      {ranked.length ? <div className="overflow-x-auto"><table className="mt-4 w-full text-sm"><caption className="sr-only">Comparison by {MODES.find(m=>m.key===sort)!.label}</caption><thead><tr><th scope="col">Rank</th><th scope="col">Area</th>{MODES.map(m=><th scope="col" key={m.key} aria-sort={sort===m.key?(sort==='crowd'?'ascending':'descending'):'none'}><button type="button" onClick={()=>setSort(m.key)}>{m.label}</button></th>)}</tr></thead>
      <tbody>{ranked.map((r,i)=>keep.has(r.id)?<tr key={r.id} className={`border-b border-rule ${r.id===query.market?'bg-accent-soft':''}`}><td className="p-2">{i+1}</td><th scope="row" className="p-2 text-left font-normal"><button type="button" className="underline" onClick={()=>pick(r.id)}>{r.name}</button>{r.status==='thin' && <span className="block text-xs">Thin effective support—rank may be unstable</span>}</th>{MODES.map(m=><td key={m.key} className="p-2 text-right tabular-nums">{cell(m.key,r)}</td>)}</tr>:null)}</tbody></table></div>:<p className="mt-4">{zeroIndex?'Spark is zero, so index values have no meaningful ordering. Choose Estimated pool or Model multiplier.':'No supported results match this view. Change the place type, state, or ranking measure.'}</p>}
      {shown<ranked.length && <button type="button" className="mt-3 underline" onClick={()=>setShown(shown+25)}>Show more</button>}
      {shown>10 && <button type="button" className="ml-3 underline" onClick={()=>setShown(10)}>Show fewer</button>}
      <MetroChart rows={rows} topIds={new Set(ranked.slice(0,5).map(r=>r.id))} neighborIds={new Set()} pinIds={new Set(pins.map(p=>p.market))} current={query.market} onPick={pick} />
    </>}
    <p className="mt-3 text-xs text-muted">Indices and crowding unavailable below 50 estimated people or outside validated model support. All comparisons use the same filters. Approximate support does not establish rank precision.</p>
  </section>;
}
