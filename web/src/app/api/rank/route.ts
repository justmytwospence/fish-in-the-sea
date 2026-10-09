import { setImmediate as yieldLoop } from 'node:timers/promises';
import { compute } from '@/lib/model';
import { parseQuery, serializeQuery } from '@/lib/query';
import { ARTIFACT_VERSION, PARTS, type RankResponse, type RankRow } from '@/lib/rank';
import { loadChoice, loadGlobal, loadMarkets, loadShard, loadManifest } from '@/lib/server-data';
const HEADERS = { 'Cache-Control':'private, no-store' };
export async function POST(req: Request) {
  // Only the canonical bounded query encoding is accepted. Bodies are never logged.
  let body;
  try {
    if (!req.headers.get('content-type')?.startsWith('application/json')) throw new Error();
    const reader=req.body?.getReader(); if(!reader) throw new Error();
    let size=0; const chunks:Uint8Array[]=[];
    while(true) { const {done,value}=await reader.read(); if(done) break; size+=value.byteLength; if(size>4096) { await reader.cancel(); throw new Error(); } chunks.push(value); }
    const bytes=new Uint8Array(size); let offset=0; for(const chunk of chunks) { bytes.set(chunk,offset);offset+=chunk.length; }
    body=JSON.parse(new TextDecoder().decode(bytes));
  }
  catch { return Response.json({error:'Invalid request'}, {status:400,headers:HEADERS}); }
  if (!body || typeof body!=='object' || Array.isArray(body) || !Number.isInteger(body.part) || body.part < 0 || body.part >= PARTS || typeof body.query !== 'string' || body.query.length > 2048)
    return Response.json({error:'Invalid query or partition'}, {status:400,headers:HEADERS});
  let query:ReturnType<typeof parseQuery>;
  try { query=parseQuery(new URLSearchParams(body.query)); }
  catch { return Response.json({error:'Unsupported query version'}, {status:400,headers:HEADERS}); }
  if (serializeQuery(query)!==body.query) return Response.json({error:'Unsupported query encoding'}, {status:400,headers:HEADERS});
  if (query.filters.wantKids.length && query.seek.hi > 49)
    return Response.json({error:'Kids-someday estimates support ages 18–49 only'}, {status:422,headers:HEADERS});
  try {
    const [g,choice,idx,manifest] = await Promise.all([loadGlobal(),loadChoice(),loadMarkets(),loadManifest()]);
    const all: RankRow[] = [];
    let scanned=0;
    for(const m of idx.markets.filter((_,i) => i % PARTS === body.part)) {
      if(scanned++%8===0) await yieldLoop();
      if(req.signal.aborted) return Response.json({error:'Cancelled'},{status:499,headers:HEADERS});
      const shard = await loadShard(m.id);
      if(!shard) throw new Error('Missing shard');
      const r = compute(shard,g,{ ...query,market:m.id },choice,false);
      const supported = r.demographicPool >= 50 && r.competition !== null && !r.issues.length;
      all.push({ id:m.id,name:m.name,pool:r.demographicPool,scenarioPool:r.scenarioPool,
        adjusted:supported ? r.competition!.adjusted : null,
        multiplier:supported ? r.competition!.multiplier : null,
        competitors:supported ? r.competition!.ratio : null,
        shape:m.cbsa ?? `C${m.county}`,population:m.pop,tags:m.tags ?? [],
        effectiveSupport:r.effectiveSupport,
        status: supported ? (r.effectiveSupport < 30 ? 'thin':'supported'):'unavailable',
        reason: supported ? undefined : 'Pool below 50, unsupported ages, or competition validation unavailable' });
    }
    const response: RankResponse = { artifactVersion:ARTIFACT_VERSION,buildId:manifest.buildId,totalMarkets:idx.markets.length,part:body.part,all };
    return Response.json(response,{headers:HEADERS});
  } catch { return Response.json({error:'Ranking data unavailable; retry'}, {status:503,headers:HEADERS}); }
}
