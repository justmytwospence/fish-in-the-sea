"""Allocation/precision comparison with the locally preserved pre-fix shards."""
import json
from pathlib import Path
import numpy as np
ROOT=Path(__file__).parent
DATA=ROOT.parent/'web/public/data'
rows=[]
for file in sorted((ROOT/'audit-baseline').glob('*.json')):
    old=json.loads(file.read_text());new=json.loads((DATA/'m'/file.name).read_text())
    tv=[];before=0;after=0;den=0
    for sx in ('1','2'):
        for marg in ('nm','sep','wid','div'):
            for i,C in enumerate(new['counts'][sx][marg]):
                a=np.array(old['attrs'][sx][marg][i]);b=np.array(new['attrs'][sx][marg][i])
                tv.append((C,float(np.abs(a-b).sum()/2)))
                # Unpartnered, college degree, no children at home.
                cells=[(((edu*2)*2+par)*4+inc) for edu in (1,2) for par in (0,1) for inc in range(4)]
                before+=C*a[cells].sum();after+=C*b[cells].sum();den+=C
    rows.append({'id':new['id'],'name':new['name'],'populationUnchanged':new['pop']==old['pop'],
      'weightedAttributeTotalVariation':sum(w*d for w,d in tv)/max(1,sum(w for w,_ in tv)),
      'collegeNoKidsShareBefore':before/max(1,den),'collegeNoKidsShareAfter':after/max(1,den),
      'scope':'Allocation and serialization-precision comparison, holding corrected counts fixed. Not a full before/after dating-model comparison.'})
(DATA/'geography-impact.json').write_text(json.dumps({'schemaVersion':2,'markets':rows},allow_nan=False))
for r in rows: print(r)
