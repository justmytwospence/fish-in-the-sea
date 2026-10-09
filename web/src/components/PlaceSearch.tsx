"use client";
import { useEffect, useId, useMemo, useState } from 'react';
import { loadPlaceIndex, searchPlaces, type Hit, type PlaceIndex } from '@/lib/place-search';
export default function PlaceSearch({ label, placeholder, onPick }: { label:string; placeholder:string; onPick:(h:Hit)=>void }) {
  const id = useId();
  const [idx,setIdx] = useState<PlaceIndex | null>(null);
  const [text,setText] = useState('');
  const [open,setOpen] = useState(false);
  const [active,setActive] = useState(-1);
  const [error,setError] = useState(false);
  const hits = useMemo(() => idx && text ? searchPlaces(idx,text,8) : [],[idx,text]);
  useEffect(() => { if(open) loadPlaceIndex().then(setIdx).catch(() => setError(true)); },[open]);
  const pick = (h:Hit) => { onPick(h); setOpen(false); setText(''); setActive(-1); };
  return <div className="relative inline-block">
    <input className="field w-[min(15rem,70vw)]" role="combobox" aria-autocomplete="list" aria-label={label}
      aria-expanded={open} aria-controls={`${id}-list`} aria-activedescendant={open && hits[active] ? `${id}-${active}` : undefined}
      value={text} placeholder={placeholder} onFocus={() => { setOpen(true); setError(false); }}
      onBlur={() => setTimeout(() => setOpen(false),150)} onChange={(e) => { setText(e.target.value); setActive(-1); }}
      onKeyDown={(e) => {
        if(e.key === 'ArrowDown') { setOpen(true); setActive(a => Math.min(a+1,Math.max(0,hits.length-1))); }
        else if(e.key === 'ArrowUp') setActive(a => Math.max(0,a-1));
        else if(e.key === 'Enter' && hits[active]) pick(hits[active]);
        else if(e.key === 'Escape') { setOpen(false); setText(''); }
        else return;
        e.preventDefault();
      }} />
    {open && <ul id={`${id}-list`} role="listbox" aria-label={label} className="absolute left-0 top-full z-20 mt-2 w-[min(22rem,88vw)] rounded border border-rule bg-card font-sans text-sm shadow-lg">
      {hits.map((h,i) => <li id={`${id}-${i}`} key={`${h.market}-${h.label}`} role="option" aria-selected={i===active}
        onPointerDown={(e) => { e.preventDefault(); pick(h); }} onPointerEnter={() => setActive(i)} className={`cursor-pointer p-3 ${i===active?'bg-accent-soft':''}`}>
        <p>{h.label}</p><p className="text-xs text-muted">{h.sub}</p>
      </li>)}
      {!hits.length && <li role="presentation" className="p-3">{error ? 'Search data unavailable. Close and reopen to retry.' : !idx ? 'Loading places…' : text ? 'No matching places.' : 'Type a town or area.'}</li>}
    </ul>}
  </div>;
}
