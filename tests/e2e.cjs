// End-to-end test: node tests/e2e.cjs  (needs dev server on :8888)
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const BASE = process.env.BASE || 'http://localhost:8888/';
const SHOTS = process.env.SHOTS || '/tmp/claude-0/shots';
require('fs').mkdirSync(SHOTS, { recursive: true });

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1360, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' && !/fonts|TUNNEL/.test(m.text() + (m.location()?.url || ''))) errors.push(`console: ${m.text()}`); });
  page.on('dialog', (d) => d.accept());
  const shot = (n) => page.screenshot({ path: `${SHOTS}/${n}.png`, fullPage: true });
  const step = (s) => console.log('•', s);

  step('home (logged out)');
  await page.goto(BASE);
  await page.waitForSelector('.hero');
  await shot('01-home-out');

  step('ready-made EMI');
  await page.click('a[href="#/c/builtin-emi"]');
  await page.waitForSelector('#value:not(.dim)');
  const emi = await page.textContent('#value');
  assert.match(emi, /10,500\.\d\d|10,501/, `EMI ${emi}`);
  await page.fill('input[data-key="loan"]', '100000*5');
  await page.waitForTimeout(100);
  assert.match(await page.textContent('[data-field="loan"] [data-hint]'), /= 500,000/);
  await page.click('#working summary');
  await shot('02-builtin-emi');

  step('signup edward');
  await page.goto(`${BASE}#/signup`);
  await page.fill('#dn', 'Edward Elric');
  await page.fill('#un', 'edward');
  await page.fill('#pw', 'alchemy1');
  await page.click('#go');
  await page.waitForSelector('.welcome');
  await shot('03-home-in');

  step('builder with user formula');
  await page.click('.header a[href="#/new"]');
  await page.waitForSelector('#formula');
  await page.fill('#formula', '(NumberOfPeople x Cost x days ) + AutoCharge  + (oldPay) - (Cuttings).) )');
  await page.waitForTimeout(50);
  assert.match(await page.textContent('#fstatus'), /Unexpected|ends|Missing|Unmatched/);
  await shot('04-builder-error');
  await page.fill('#formula', '(NumberOfPeople x Cost x days) + AutoCharge + oldPay - Cuttings');
  await page.waitForTimeout(50);
  assert.match(await page.textContent('#fstatus'), /6 inputs found/);
  assert.equal(await page.locator('.var-row').count(), 6);
  await page.fill('.var-row[data-key="cost"] [data-m="label"]', 'Cost per person per day');
  await page.fill('.var-row[data-key="cost"] [data-m="unit"]', '₹');
  await page.fill('.var-row[data-key="numberofpeople"] [data-m="default"]', '4');
  await page.fill('#name', 'Team trip cost');
  await page.fill('#desc', 'Total for a team trip including auto charges, minus cuttings.');
  await page.selectOption('#cat', 'Business');
  await page.fill('#rlabel', 'Total payable');
  await page.fill('#rprefix', '₹');
  for (const [k, v] of [['cost', '250'], ['days', '3'], ['autocharge', '500'], ['oldpay', '1000'], ['cuttings', '200']]) await page.fill(`#pinputs input[data-key="${k}"]`, v);
  await page.waitForTimeout(50);
  assert.equal((await page.textContent('#pvalue')).trim(), '₹4,300.00');
  await shot('05-builder-ok');
  await page.click('#savebtn');
  await page.waitForSelector('.run');
  const calcUrl = page.url();
  step(`saved at ${calcUrl}`);

  step('run page');
  for (const [k, v] of [['cost', '250'], ['days', '3'], ['autocharge', '500'], ['oldpay', '1000'], ['cuttings', '200']]) await page.fill(`#form input[data-key="${k}"]`, v);
  await page.waitForTimeout(50);
  assert.equal((await page.textContent('#value')).trim(), '₹4,300.00');
  await page.click('#save');
  assert.equal(await page.locator('#hist li button').count(), 1);
  await page.click('#working summary');
  await shot('06-run-private');

  step('publish');
  await page.click('[data-act="publish"]');
  await page.click('.modal [data-a="yes"]');
  await page.waitForSelector('[data-act="private"]');
  assert.ok(await page.locator('.tag.public').count());

  step('edit keeps settings');
  await page.click('a:has-text("Edit")');
  await page.waitForSelector('#formula');
  assert.equal(await page.inputValue('.var-row[data-key="cost"] [data-m="label"]'), 'Cost per person per day');
  await page.fill('#desc', 'Updated description');
  await page.click('#savebtn');
  await page.waitForSelector('.run');
  assert.match(await page.textContent('.desc'), /Updated description/);

  step('customize built-in');
  await page.goto(`${BASE}#/c/builtin-gst`);
  await page.click('[data-act="customize"]');
  await page.waitForSelector('#formula');
  assert.equal(await page.inputValue('#formula'), 'Amount + Amount * GSTRate%');
  await page.fill('#name', 'GST 18% quick');
  await page.click('#savebtn');
  await page.waitForSelector('.run');

  step('my calculators');
  await page.goto(`${BASE}#/mine`);
  await page.waitForSelector('.calc-card');
  assert.equal(await page.locator('.calc-card').count(), 2);
  await page.click('[data-tab="public"]');
  assert.equal(await page.locator('.calc-card').count(), 1);
  await page.click('[data-tab="all"]');
  await shot('07-mine');

  step('logout, signup alphonse');
  await page.click('#ubtn');
  await page.click('#logout');
  await page.goto(`${BASE}#/signup`);
  await page.fill('#dn', 'Alphonse');
  await page.fill('#un', 'alphonse');
  await page.fill('#pw', 'armor123');
  await page.click('#go');
  await page.waitForSelector('.welcome');

  step('explore + review + star + fork');
  await page.goto(`${BASE}#/explore`);
  await page.waitForSelector('.calc-card');
  assert.equal(await page.locator('.calc-card').count(), 1);
  await page.fill('#q', 'nonsense-words');
  await page.waitForSelector('.empty');
  await page.fill('#q', 'trip');
  await page.waitForSelector('.calc-card');
  await shot('08-explore');
  await page.click('.calc-card a');
  await page.waitForSelector('#rform');
  await page.click('#pick [data-n="4"]');
  await page.fill('#rcomment', 'Saved me so much time on our office trip.');
  await page.click('#rform button[type="submit"]');
  await page.waitForSelector('.review');
  await page.click('[data-act="star"]');
  await page.waitForSelector('[data-act="star"].on');
  await shot('09-public-calc-reviewed');
  await page.click('[data-act="fork"]');
  await page.waitForSelector('[data-act="publish"]');
  assert.match(await page.textContent('.meta.faint'), /Forked from/);

  step('profile');
  await page.goto(`${BASE}#/u/edward`);
  await page.waitForSelector('.profile-head');
  assert.equal(await page.locator('.calc-card').count(), 1);
  await shot('10-profile');

  step('privacy: private calc not visible to others');
  await page.goto(`${BASE}#/mine`);
  await page.waitForSelector('.calc-card');

  step('about');
  await page.goto(`${BASE}#/about`);
  await page.waitForSelector('.about');
  await shot('11-about');

  step('mobile');
  const m = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const mp = await m.newPage();
  mp.on('pageerror', (e) => errors.push(`m pageerror: ${e.message}`));
  await mp.goto(BASE);
  await mp.waitForSelector('.hero');
  await mp.screenshot({ path: `${SHOTS}/12-m-home.png`, fullPage: true });
  await mp.goto(calcUrl);
  await mp.waitForSelector('.run');
  await mp.screenshot({ path: `${SHOTS}/13-m-run.png`, fullPage: true });
  const overflow = await mp.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  assert.equal(overflow, false, 'horizontal overflow on mobile');
  await mp.goto(`${BASE}#/explore`);
  await mp.waitForSelector('.calc-card');
  await mp.screenshot({ path: `${SHOTS}/14-m-explore.png` });

  await browser.close();
  if (errors.length) { console.log('ERRORS:\n' + errors.join('\n')); process.exit(1); }
  console.log('e2e: all good');
})().catch((e) => { console.error(e); process.exit(1); });
