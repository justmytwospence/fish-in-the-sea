"""Validate the complete snapshot before writing its release manifest."""
import hashlib
import json
import math
import subprocess
from pathlib import Path

ROOT = Path(__file__).parent
DATA = ROOT.parent / 'web/public/data'


def finite(value, where='root'):
    if isinstance(value, dict):
        for k,v in value.items(): finite(v, f'{where}.{k}')
    elif isinstance(value, list):
        for i,v in enumerate(value): finite(v, f'{where}[{i}]')
    elif isinstance(value, float) and not math.isfinite(value):
        raise ValueError(f'Nonfinite value: {where}')


def probability(p):
    if not p or any(not math.isfinite(x) or x < 0 or x > 1 for x in p) or abs(sum(p)-1) > .002:
        raise ValueError(f'Invalid probability distribution: {p}')


def sha(path):
    h=hashlib.sha256()
    with path.open('rb') as f:
        for chunk in iter(lambda:f.read(1024*1024),b''): h.update(chunk)
    return h.hexdigest()


def validate(check_manifest=True):
    idx=json.loads((DATA/'markets.json').read_text())
    ids=[m['id'] for m in idx['markets']]
    assert len(set(ids)) == len(ids)
    for p in idx['places']: assert p[2] in ids
    for id in ids:
        s=json.loads((DATA/'m'/f'{id}.json').read_text())
        finite(s,id)
        assert s['pop'] == sum(s['sexPop'].values())
        for sx in ('1','2'):
            for mg in ('nm','sep','wid','div'):
                assert len(s['attrs'][sx][mg]) == 13
                for p in s['attrs'][sx][mg]: assert len(p)==97; probability(p)
                for p in s['race'][sx][mg]: probability(p)
            for v in s['counts'][sx].values(): assert len(v)==13 and min(v)>=0
    for file in DATA.glob('*.json'):
        if file.name != 'manifest.json': finite(json.loads(file.read_text()),file.name)
    kids=json.loads((DATA/'kids.json').read_text())
    assert kids['schemaVersion']==2
    for bands in kids['rates'].values():
        for by_edu in bands:
            for by_race in by_edu:
                for p in by_race: probability(p)
    choice=json.loads((DATA/'choice.json').read_text())
    assert choice['schemaVersion']==2
    for d in choice['dirs'].values():
        assert d['validation']['status'] in ('validated','unsupported')
        if d['validation']['status']=='validated': assert d['validation']['converged']
    beliefs=json.loads((DATA/'beliefs.json').read_text())
    for sx in beliefs['joint'].values():
        for band in sx:
            for edu in band:
                for p in edu: probability(p)
    if check_manifest:
        m=json.loads((DATA/'manifest.json').read_text())
        assert m['schemaVersion']==2 and m['buildId']
        actual={str(p.relative_to(DATA)) for p in DATA.rglob('*.json') if p.name!='manifest.json'}
        assert actual==set(m['artifacts']), 'Manifest coverage mismatch'
        for name,digest in m['artifacts'].items():
            p=DATA/name
            assert sha(p)==digest, f'Checksum mismatch: {name}'
            value=json.loads(p.read_text())
            assert value['buildId']==m['buildId'] and value['schemaVersion']==2, f'Mixed snapshot: {name}'
    print(f'Validated {len(ids)} markets and all singleton artifacts')
    return idx


def manifest():
    idx=validate(False)
    sources=[]
    for file in sorted((ROOT/'raw').iterdir()):
        if file.is_file() and file.suffix in ('.csv','.txt','.parquet','.xlsx','.xpt','.dta','.pdf','.dat','.json'):
            sources.append({'file':file.name,'bytes':file.stat().st_size,'sha256':sha(file)})
    artifacts=[p for p in sorted(DATA.rglob('*.json')) if p.name!='manifest.json']
    objects={p:json.loads(p.read_text()) for p in artifacts}
    # Ignore prior stamps so rebuilding identical content gives the same id.
    content={str(p.relative_to(DATA)):{k:v for k,v in obj.items() if k not in ('buildId','schemaVersion')} for p,obj in objects.items()}
    build_id=hashlib.sha256(json.dumps(content,sort_keys=True,allow_nan=False).encode()).hexdigest()[:16]
    for p,obj in objects.items():
        obj.update(schemaVersion=2,buildId=build_id)
        p.write_text(json.dumps(obj,separators=(',',':'),allow_nan=False))
    files={str(p.relative_to(DATA)):sha(p) for p in artifacts}
    context=json.loads((DATA/'context.json').read_text())
    fallback={src:sum(v['src']==src for v in context['markets'].values()) for src in ('metro','state','us')}
    out={'schemaVersion':2,'fallbackProvenance':{'healthAdjustmentCounts':fallback,'healthSourceYears':sorted({v.get('sourceYear') for v in context['markets'].values()}),
         'marketsWithoutElectionData':sum(v.get('dem') is None for v in context['markets'].values()),'religion':'Pew metro where available, otherwise state; local CES shrinkage'},
'buildId':build_id,'revision':subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT,text=True).strip(),
         'sourceYear':idx['year'],'seeds':{'choice':20240928},'sources':sources,'artifacts':files,
         'codeChecksums':{p.name:sha(p) for p in sorted(ROOT.glob('*.py'))},
         'sourceDocumentation':['https://www2.census.gov/programs-surveys/acs/tech_docs/pums/2020_2024ACS_PUMS_User_Guide.pdf',
                                'https://www.census.gov/programs-surveys/acs/microdata.html',
                                'https://doi.org/10.7910/DVN/X11EP6','https://www.cdc.gov/nchs/nsfg/nsfg-2022-2023-puf.htm',
                                'https://data.cdc.gov/resource/j32a-sa6u.json','https://data.cdc.gov/resource/dttw-5yxu.json'],
         'support':{'kidsSomeday':[18,49],'competition':[18,85],'competitionMinimumPopulation':50,'upperDemographicAge':'90 aggregates 90+'},
         'limitations':['ACS-only sampling uncertainty excludes synthetic model error','PUMA allocation is population-based, not observed exact residence',
                        'Competition validation measures observed pairing, not dating success','Local survey adjustments are ecological approximations']}
    (DATA/'manifest.json').write_text(json.dumps(out,separators=(',',':'),allow_nan=False))
    print(f'Wrote manifest {build_id}')

if __name__=='__main__': manifest()
