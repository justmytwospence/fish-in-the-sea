"use client";
import { useEffect, useRef, useState } from 'react';
import type { Row } from './Leaderboard';
import { fmt, shortCity } from '@/lib/format';
export default function MetroChart({ rows:input,topIds,pinIds,current,onPick }: {
 rows:Row[]; topIds:Set<string>; neighborIds:Set<string>; pinIds:Set<string>; current:string; onPick:(id:string)=>void;
}) {
  const ref=useRef<HTMLDivElement>(null);
  const [w,setW]=useState(600);
  const [hover,setHover]=useState<Row|null>(null);
  useEffect(()=>{const ro=new ResizeObserver(([e])=>setW(e.contentRect.width));ro.observe(ref.current!);return()=>ro.disconnect();},[]);
  const rows=input.filter(r=>r.pool>=1 && r.competitors!==null && r.competitors>0);
  const xmin=Math.floor(Math.log10(Math.max(1,Math.min(...rows.map(r=>r.pool)))));
  const xmax=Math.max(xmin+1,Math.ceil(Math.log10(Math.max(10,...rows.map(r=>r.pool)))));
  const ymin=Math.log10(Math.min(1,...rows.map(r=>r.competitors!)));
  const ymax=Math.max(ymin+1,Math.log10(Math.max(1,...rows.map(r=>r.competitors!))));
  const h=320;
  const px=(x:number)=>55+(Math.log10(x)-xmin)/(xmax-xmin)*Math.max(1,w-80);
  const py=(y:number)=>25+(Math.log10(y)-ymin)/(ymax-ymin)*240;
  const highlighted=rows.filter(r=>r.id===current || topIds.has(r.id) || pinIds.has(r.id));
  return <div ref={ref} className="mt-6">
    {rows.length>0 && <svg width={w} height={h} role="img" aria-label="Areas by estimated pool and modeled competitors per target. Larger pools are right; less crowding is up. Use the buttons or table for details.">
      <line x1={55} x2={w-25} y1={265} y2={265} className="stroke-rule"/><line x1={55} x2={55} y1={25} y2={265} className="stroke-rule"/>
      <text x={w/2} y={310} textAnchor="middle" className="fill-muted text-xs">Estimated pool (log scale)</text>
      <text x={10} y={15} className="fill-muted text-xs">Less crowded ↑ (log scale)</text>
      {[xmin,xmax].map(x=><text key={x} x={px(10**x)} y={283} textAnchor="middle" className="fill-muted text-xs">{fmt(10**x)}</text>)}
      {rows.map(r=><circle key={r.id} cx={px(r.pool)} cy={py(r.competitors!)} r={r.id===current?6:3} className={r.id===current?'fill-accent':'fill-muted'} opacity={.7}
        onPointerEnter={()=>setHover(r)} onPointerLeave={()=>setHover(null)} onClick={()=>onPick(r.id)}><title>{r.name}: pool {fmt(r.pool)}, competitors {r.competitors!.toFixed(2)}</title></circle>)}
    </svg>}
    {hover && <p role="status" className="text-sm">{hover.name}: pool {fmt(hover.pool)}, competitors {hover.competitors?.toFixed(2)}, index {hover.adjusted===null?'unavailable':fmt(hover.adjusted)}</p>}
    <div className="mt-2 flex flex-wrap gap-3">{highlighted.map(r=><button type="button" className="underline text-sm" key={r.id} onClick={()=>onPick(r.id)} onFocus={()=>setHover(r)} onBlur={()=>setHover(null)}>{shortCity(r.name)}</button>)}</div>
    <p className="mt-2 text-xs text-muted">Use the accessible comparison table above for every area and value. A dot is a statistical area, not a city-limit or travel-distance estimate.</p>
  </div>;
}
