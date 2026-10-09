import { test, expect } from '@playwright/test';

test('explicit zero spark remains a zero scenario, not unavailable or NaN',async({page})=>{
 await page.route('**/api/rank',route=>route.fulfill({status:503,body:'Unavailable'}));
 await page.goto('/?v=2&me=m36&seek=f30-39&spark=0');
 const summary=page.getByRole('region',{name:'Search summary'});
 await expect(summary).toContainText('Optional spark scenario pool: 0');
 await expect(summary).toContainText('Competition-adjusted index: 0');
 await page.getByRole('button',{name:'Explore filter and age scenarios'}).click();
 await expect(page.getByRole('heading',{name:'Age scenarios today (not a forecast)'})).toBeVisible({timeout:60000});
 await expect(page.getByText('Relative change is unavailable from a zero baseline.')).toBeVisible();
 await page.getByText('Age scenario values as a table',{exact:true}).click();
 await expect(page.getByRole('table',{name:'Cross-sectional ages today, not forecasts'})).toBeVisible();
 expect(await page.locator('svg').evaluateAll(nodes=>nodes.some(n=>/NaN|Infinity/.test(n.innerHTML)))).toBe(false);
});
