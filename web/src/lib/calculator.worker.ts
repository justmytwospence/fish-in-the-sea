import { compute, mergeContext, type Query } from './model';
import { whatIfs } from './whatif';
import { overTime } from './overtime';
import { sensitivities } from './sensitivity';
import type { Choice } from './competition';
import type { Global, Shard } from './model';

const shards = new Map<string, Promise<Shard>>();
let staticData: Promise<[Global, Choice]> | undefined;
let manifest: Promise<{ schemaVersion:number; buildId:string }> | undefined;
async function json(file: string) {
  const m = await (manifest ??= fetch('/data/manifest.json', {cache:'no-store'}).then((r) => {
    if (!r.ok) throw new Error('Manifest unavailable'); return r.json();
  }).catch((e) => { manifest=undefined; throw e; }));
  if (m.schemaVersion!==2) throw new Error('Incompatible manifest');
  const response = await fetch(`/data/${file}.json?v=${m.buildId}`);
  if (!response.ok) throw new Error('Data could not be loaded. Please retry.');
  const data=await response.json();
  if (data.buildId!==m.buildId || data.schemaVersion!==2) { manifest=undefined; staticData=undefined; shards.clear(); throw new Error('Snapshot changed; retry'); }
  return data;
}
function load() {
  return staticData ??= Promise.all([
    Promise.all(['global','context','religion','politics','kids','beliefs'].map(json))
      .then(([g,c,r,p,k,b]) => mergeContext(g,c,r,p,k,b)), json('choice'),
  ]).catch((e) => { staticData = undefined; throw e; });
}
function shard(id: string) {
  let promise = shards.get(id);
  if (!promise) {
    promise = json(`m/${id}`).catch((e) => { shards.delete(id); throw e; });
    shards.set(id, promise);
  }
  return promise;
}
self.onmessage = async (event: MessageEvent<{ id: number; query: Query; kind: 'result' | 'details' }>) => {
  const { id, query, kind } = event.data;
  try {
    const [[g, choice], s] = await Promise.all([load(), shard(query.market)]);
    const payload = kind === 'result' ? { result: compute(s,g,query,choice) } : {
      loosen: whatIfs(s,g,query,choice),
      sensitivity: sensitivities(s,g,query,choice),
      timeline: { sliding: overTime(s,g,query,choice,true), fixed: overTime(s,g,query,choice,false) },
    };
    self.postMessage({ id, kind, ...payload });
  } catch {
    self.postMessage({ id, kind, error: 'Calculation failed. Data may be unavailable or incompatible; retry.' });
  }
};
