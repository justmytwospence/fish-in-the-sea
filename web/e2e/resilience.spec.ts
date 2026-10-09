import { test, expect } from '@playwright/test';

test('failed worker data can retry and rapid edits commit only the latest query',async({page})=>{
 let fail=true;
 await page.route('**/data/m/**',async route=>{if(fail){fail=false;await route.fulfill({status:503,body:'Unavailable'});}else await route.continue();});
 await page.goto('/');
 await expect(page.getByRole('status').filter({hasText:'Calculation failed'})).toBeVisible();
 await page.getByRole('button',{name:'Retry',exact:true}).click();
 await expect(page.getByRole('status').filter({hasText:'failed'})).toHaveCount(0);
 await page.getByLabel('Oldest', {exact:true}).selectOption('45');
 await page.getByLabel('Oldest', {exact:true}).selectOption('32');
 await expect(page.getByRole('region',{name:'Search summary'})).toContainText('ages 30–32');
 await expect(page.getByRole('status').filter({hasText:'Previous results'})).toHaveCount(0);
 await expect(page).toHaveURL('http://127.0.0.1:3100/');
});

test('ranking is bounded, private, complete and retryable',async({page})=>{
 let failing=true, pending=0, maximum=0;
 const requests=new Set<object>();
 page.on('request',req=>{if(new URL(req.url()).pathname==='/api/rank'){requests.add(req);maximum=Math.max(maximum,++pending);}});
 const finish=(req:object)=>{if(requests.delete(req))pending--;};
 page.on('requestfinished',finish);page.on('requestfailed',finish);
 await page.route('**/api/rank',async route=>{
  const req=route.request();expect(req.method()).toBe('POST');expect(new URL(req.url()).search).toBe('');
  const {part}=req.postDataJSON();
  await new Promise(resolve=>setTimeout(resolve,80));
  try {
   if(failing && part===3) return await route.fulfill({status:503,body:'Unavailable'});
   await route.fulfill({status:200,contentType:'application/json',headers:{'Cache-Control':'private, no-store'},body:JSON.stringify({artifactVersion:2,buildId:'fixture',totalMarkets:8,part,all:[{id:`area-${part}`,name:`Area ${part}`,pool:100+part,scenarioPool:100+part,adjusted:90+part,multiplier:.9,competitors:1+part*.01,shape:'C06001',population:10000,tags:[],effectiveSupport:50,status:'supported'}]})});
  } catch { /* An obsolete browser request may have been aborted. */ }
 });
 await page.goto('/');
 await page.getByRole('heading',{name:'Compare places'}).scrollIntoViewIfNeeded();
 await expect(page.getByRole('status').filter({hasText:'No partial ranks'})).toBeVisible();
 await expect(page.getByRole('table',{name:'Comparison by Competition index'})).toHaveCount(0);
 failing=false;
 await page.getByRole('button',{name:'Retry comparison'}).click();
 await expect(page.getByRole('table',{name:'Comparison by Competition index'})).toBeVisible();
 await expect(page.getByRole('table',{name:'Comparison by Competition index'}).getByRole('row')).toHaveCount(9);
 expect(maximum).toBeLessThanOrEqual(2);
});
