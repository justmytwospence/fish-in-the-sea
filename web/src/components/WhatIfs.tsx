"use client";
import type { Query } from '@/lib/model';
import type { WhatIf } from '@/lib/whatif';
import { fmt } from '@/lib/format';
export default function WhatIfs({options,onApply}: {base:{raw:number;adjusted:number|null};options:WhatIf[];onApply:(q:Query)=>void}) {
  const signed=(n:number)=>`${n>=0?'+':'−'}${fmt(Math.abs(n))}`;
  return <section className="mt-12" aria-label="Filter scenarios"><h2 className="font-display text-3xl">Filter scenarios</h2>
    <p className="mt-3 text-muted">One change at a time, ordered by scenario pool increase (including the enabled spark assumption). Index changes are model comparisons, not additional people.</p>
    <ol className="mt-4 divide-y divide-rule">{[...options].sort((a,b)=>b.dRaw-a.dRaw).map(o=><li key={o.key}><button type="button" className="w-full py-3 text-left" onClick={()=>onApply(o.query)}><span className="underline">{o.label}</span><span className="block text-sm text-muted">Scenario pool {signed(o.dRaw)} · competition index {o.dAdjusted===null?'unavailable':signed(o.dAdjusted)}</span></button></li>)}</ol>
  </section>;
}
