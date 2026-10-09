"use client";
import { useEffect, useState } from 'react';
import { DEFAULT_QUERY, parseQuery, serializeQuery } from '@/lib/query';
import type { Query } from '@/lib/model';
const KEY = 'fish-in-the-sea:search';
const OLD = 'the-denominator:search';

export default function SearchActions({ query, onLoad }: { query: Query; onLoad: (q: Query) => void }) {
  const [saved, setSaved] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [sharing, setSharing] = useState(false);
  const [full, setFull] = useState(false);
  useEffect(() => {
    try { const s = localStorage.getItem(KEY) ?? localStorage.getItem(OLD); if(s) queueMicrotask(() => setSaved(s)); } catch {}
  }, []);
  const share = serializeQuery(full ? query : { ...structuredClone(DEFAULT_QUERY), market: query.market, me: query.me, seek: query.seek });
  return <div className="mt-4 text-sm">
    <div className="flex flex-wrap gap-4">
      <button type="button" className="underline" onClick={() => {
        try { const s = serializeQuery(query); localStorage.setItem(KEY,s); setSaved(s); setMessage('Search saved in this browser.'); }
        catch { setMessage('Browser storage is unavailable.'); }
      }}>Save this search</button>
      <button type="button" className="underline" onClick={() => setSharing(!sharing)}>Share</button>
      <button type="button" className="underline" onClick={() => onLoad(structuredClone(DEFAULT_QUERY))}>Reset search</button>
      {saved && <><button type="button" className="underline" onClick={() => { try { onLoad(parseQuery(new URLSearchParams(saved))); } catch { setMessage('Saved query version is unsupported. Forget it or start a new search.'); } }}>Load saved search</button>
      <button type="button" className="underline" onClick={() => { try { localStorage.removeItem(KEY); localStorage.removeItem(OLD); localStorage.removeItem('fish-in-the-sea:elsewhere'); setSaved(null); setMessage('Saved settings forgotten.'); } catch { setMessage('Could not clear browser storage.'); } }}>Forget saved search</button></>}
    </div>
    {sharing && <div className="mt-3 rounded border border-rule p-3">
      <p>Anyone with the link can read its settings. Basic links include your location, age, sex and target age/sex.</p>
      <label className="mt-2 block"><input type="checkbox" checked={full} onChange={(e) => setFull(e.target.checked)} /> Include all preferences and personal profile</label>
      <input aria-label="Share link preview" readOnly value={typeof window === 'undefined' ? '' : `${window.location.origin}/?${share}`} className="mt-2 w-full rounded border border-rule p-2" />
      <button type="button" className="mt-2 underline" onClick={async () => { try { await navigator.clipboard.writeText(`${location.origin}/?${share}`); setMessage('Link copied.'); } catch { setMessage('Select and copy the link above.'); } }}>Copy link</button>
    </div>}
    <p aria-live="polite" className="mt-2 text-muted">{message || 'Edits stay in this session unless you save or share. Nationwide comparisons send settings to the server.'}</p>
  </div>;
}
