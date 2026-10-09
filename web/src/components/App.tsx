"use client";

import { useEffect, useMemo, useRef, useState } from 'react';
import { LOW_RECORDS, noun, type Query, type Result } from '@/lib/model';
import { approx, shortCity } from '@/lib/format';
import { serializeQuery } from '@/lib/query';
import QueryForm from './QueryForm';
import SearchActions from './SearchActions';
import Sieve from './Sieve';
import Receipts from './Receipts';
import Verdict from './Verdict';
import WhoIsLeft from './WhoIsLeft';
import WhatIfs from './WhatIfs';
import type { whatIfs } from '@/lib/whatif';
import type { AgePoint } from '@/lib/overtime';
import type { Sensitivity } from '@/lib/sensitivity';
import OverTime from './OverTime';
import Competition, {PersonalProfile} from './Competition';
import Leaderboard from './Leaderboard';
import Method from './Method';

type Details = { loosen: ReturnType<typeof whatIfs>; timeline: { sliding: AgePoint[]; fixed: AgePoint[] }; sensitivity:Sensitivity[] };
export default function App({ initialQuery, initialResult, dataYear, located }: {
  initialQuery: Query; initialResult: Result; dataYear: string; located: string | null;
}) {
  const [query, setQuery] = useState(initialQuery);
  const [committed, setCommitted] = useState({ query: initialQuery, result: initialResult });
  const [status, setStatus] = useState('');
  const [calculationReady,setCalculationReady]=useState(false);
  const [details, setDetails] = useState<Details | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  const [retry, setRetry] = useState(0);
  const [locateState, setLocateState] = useState('');
  const worker = useRef<Worker | null>(null);
  const seq = useRef(0);
  const qs = useMemo(() => serializeQuery(query), [query]);
  const stale = serializeQuery(committed.query) !== qs;

  useEffect(() => {
    const w = new Worker(new URL('../lib/calculator.worker.ts', import.meta.url));
    worker.current = w;
    w.onerror = () => setStatus('Calculation worker failed. Reload to retry.');
    return () => { w.terminate(); worker.current = null; };
  }, [retry]);
  useEffect(() => {
    const w = worker.current;
    if (!w) return;
    const id = ++seq.current;
    // Explicitly opened shared searches are read once; edits never publish
    // new sensitive settings into history.
    if (qs !== serializeQuery(initialQuery)) window.history.replaceState(null, '', window.location.pathname);
    w.onmessage = (event) => {
      if (event.data.id !== seq.current) return;
      if (event.data.error) { setStatus(event.data.error); return; }
      if (event.data.kind === 'result') {
        setCommitted({ query, result: event.data.result });
        setCalculationReady(true);
        setDetails(null);
        setStatus('');
        if (showDetails && !event.data.result.issues.length) w.postMessage({ id, query, kind:'details' });
      } else { setDetails(event.data); setStatus(''); }
    };
    const timer=setTimeout(()=>w.postMessage({ id, query, kind:'result' }),120);
    return ()=>clearTimeout(timer);
  }, [qs, query, retry, showDetails, initialQuery]);
  const { result, query: displayed } = committed;
  const thin = result.effectiveSupport < LOW_RECORDS;
  const issue = !stale && result.issues.length > 0;
  const update = (q: Query) => { setCalculationReady(false); setStatus('Updating…'); setQuery(q); };
  const locate = () => {
    if (!navigator.geolocation) return setLocateState('Location is unavailable. Search for a town instead.');
    setLocateState('Locating…');
    navigator.geolocation.getCurrentPosition(async ({ coords }) => {
      try {
        const r = await fetch(`/api/locate?lat=${coords.latitude.toFixed(2)}&lon=${coords.longitude.toFixed(2)}`);
        if (!r.ok) throw new Error();
        const hit = await r.json();
        update({ ...query, market: hit.market }); setLocateState(`Near ${hit.place}.`);
      } catch { setLocateState('Could not locate you. Retry or search for a town.'); }
    }, () => setLocateState('Location permission unavailable. Search for a town instead.'), { maximumAge:600000, timeout:10000 });
  };
  return <main data-calculation-ready={calculationReady && !stale} className="mx-auto max-w-3xl px-4 pb-24 pt-10 sm:px-6 sm:pt-16">
    <header className="mb-8"><p className="text-xs font-semibold uppercase tracking-widest text-muted">Fish in the Sea</p>
      <h1 className="mt-3 font-display text-4xl sm:text-5xl">Explore your dating market.</h1>
      <p className="mt-4 text-muted">Population estimates and an observed-pairing competition model—not a prediction of who will date you.</p>
    </header>
    <QueryForm query={query} marketName={result.market.name} onChange={update} />
    <PersonalProfile query={query} onYou={you=>update({...query,you})}/>
    <SearchActions query={query} onLoad={update} />
    <p className="mt-3 text-xs text-muted">{locateState || (located ? `Connection-based guess: ${located}. ` : '')} <button type="button" className="underline" onClick={locate}>Use my location (coordinates rounded before sending)</button></p>
    <div role="status" className="mt-4">{status}{stale && ' Previous results below are for the previous search.'}
      {status.includes('failed') && <button type="button" className="ml-3 underline" onClick={() => { setStatus('Retrying…'); setRetry(retry+1); }}>Retry</button>}
    </div>
    {issue ? <section className="mt-6 rounded border border-rule p-4" role="alert" aria-label="Unsupported search">
      {result.issues.map((text) => <p key={text}>{text}</p>)}
      <button type="button" className="mr-4 underline" onClick={() => update({ ...query, seek: { ...query.seek, lo: Math.min(49,query.seek.lo), hi:49 } })}>Limit ages to 49</button>
      <button type="button" className="underline" onClick={() => update({ ...query, filters: { ...query.filters, wantKids:[] } })}>Remove kids-someday filter</button>
    </section> : <div aria-busy={stale} className={stale ? 'opacity-50' : ''}>
      <section className="mt-6 rounded-xl border border-rule bg-card p-5" aria-label="Search summary">
        <p className="text-xs text-muted">Estimated pre-spark pool · ages {displayed.seek.lo}–{displayed.seek.hi} · {result.market.name} ({result.market.kind === 'rural' ? 'county boundary' : 'Census statistical area, not city limits'})</p>
        <p className="mt-2 font-display text-4xl">≈{approx(result.demographicPool)} {noun(displayed.seek.sex)}</p>
        {displayed.model.spark !== null && <p className="mt-2 text-sm">Optional spark scenario pool: {approx(result.scenarioPool)} (user assumption {Math.round(displayed.model.spark*100)}%)</p>}
        <p className="mt-2 text-sm text-muted">{result.competition ? `Competition-adjusted index: ${approx(result.competition.adjusted)} · model multiplier ×${result.competition.multiplier.toFixed(2)}` : 'Competition unavailable: validation/age support or fewer than 50 estimated targets or competitors.'}</p>
        {displayed.seek.hi===90 && <p className="mt-2 text-sm text-muted">The upper age of 90 represents 90+ in this model.</p>}
        <p className="mt-2 text-xs text-muted">{dataYear}. Estimates are conditional on model assumptions, not actual reachable people.</p>
        {thin && <p className="mt-2 text-sm text-muted">Low effective weighted support. This estimate borrows regional information; magnitude and direction are uncertain.</p>}
        {result.demographicPool<1 && <p className="mt-2 text-sm">Estimate below one person. Try loosening partner preferences or resetting the search; this is not evidence that no compatible people exist.</p>}
      </section>
      <Competition result={result} query={displayed} />
      <details className="mt-8"><summary className="cursor-pointer">Explain the estimate: sieve and sources</summary>
        <Sieve key={JSON.stringify(result.steps.map(s => [s.key,s.value]))} steps={result.steps} thin={thin} />
        <Receipts steps={result.steps} thin={thin} effectiveSupport={result.effectiveSupport} />
      </details>
      <Verdict result={result} query={displayed} />
      <WhoIsLeft result={result} query={displayed} dataYear={dataYear} />
      <section className="mt-10"><button type="button" className="underline" disabled={stale} onClick={() => setShowDetails(!showDetails)}>{showDetails ? 'Hide scenarios' : 'Explore filter and age scenarios'}</button></section>
      {showDetails && !details && <p role="status">{status.includes('failed')?'Scenarios unavailable; retry above.':'Calculating scenarios…'}</p>}
      {showDetails && details && <>
        <WhatIfs base={details.loosen.base} options={details.loosen.options} onApply={update} />
        {displayed.me.age !== undefined && details.timeline.sliding.length > 0 && details.timeline.fixed.length > 0 ? <OverTime sliding={details.timeline.sliding} fixed={details.timeline.fixed} query={displayed} /> : <p className="mt-6 text-muted">Age scenarios require a profile age and supported competition estimates throughout the range.</p>}
        <section className="mt-10" aria-label="Model sensitivity"><h2 className="font-display text-2xl">Model sensitivity</h2><p className="mt-2 text-muted">Remove one assumed association at a time, without refitting. Large changes indicate unstable conclusions. This does not measure rank confidence.</p><ul className="mt-3">{details.sensitivity.map(s=><li key={s.label} className="border-b border-rule py-2">{s.label}: {s.index===null?'unavailable':`${approx(s.index)} index units · ×${s.multiplier!.toFixed(2)}`}</li>)}</ul></section>
      </>}
    </div>}
    {!issue && <Leaderboard qs={qs} query={query} onPick={(market) => update({ ...query, market })} />}
    <Method dataYear={dataYear} />
    <p className="mt-6 text-xs text-muted">Selected area: {shortCity(result.market.name)}. This app records Census sex, not gender identity.</p>
  </main>;
}
