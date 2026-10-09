import { test, expect } from '@playwright/test';

test('legacy saved searches require explicit load and sharing defaults to basic settings',async({page})=>{
 await page.addInitScript(()=>localStorage.setItem('the-denominator:search','me=f45&seek=m35-49&you=h64&spark=0'));
 await page.goto('/');
 await expect(page.getByLabel('Your age (optional)')).toHaveValue('36');
 await page.getByRole('button',{name:'Load saved search',exact:true}).click();
 await expect(page.getByLabel('Your age (optional)')).toHaveValue('45');
 await page.getByRole('button',{name:'Share',exact:true}).click();
 const basic=await page.getByLabel('Share link preview').inputValue();
 expect(new URL(basic).searchParams.has('you')).toBe(false);
 expect(new URL(basic).searchParams.has('f')).toBe(false);
 await page.getByLabel('Include all preferences and personal profile').check();
 const full=await page.getByLabel('Share link preview').inputValue();
 expect(new URL(full).searchParams.get('you')).toContain('h64');
 expect(new URL(full).searchParams.get('f')).toContain('h64-84');
 await expect(page).toHaveURL('http://127.0.0.1:3100/');
 await page.getByRole('button',{name:'Forget saved search'}).click();
 expect(await page.evaluate(()=>localStorage.getItem('the-denominator:search'))).toBeNull();
});

test('unknown share versions are actionable and metadata remains generic',async({page,request})=>{
 await page.goto('/?v=3&me=f45&seek=m35-49');
 await expect(page.getByRole('heading',{name:'Unsupported share-link format'})).toBeVisible();
 await expect(page).toHaveTitle('Fish in the Sea · Explore your dating market');
 await page.getByRole('link',{name:'Start a new search'}).click();
 await expect(page.getByRole('heading',{name:'Explore your dating market.'})).toBeVisible();
 const response=await request.post('/api/rank',{data:{query:'v=3',part:0}});
 expect(response.status()).toBe(400);
 expect(response.headers()['cache-control']).toBe('private, no-store');
 expect((await request.get('/api/rank')).status()).toBe(405);
});
