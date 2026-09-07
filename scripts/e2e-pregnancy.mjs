import assert from 'node:assert/strict';
import {mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

const {chromium} = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const artifacts = await mkdtemp(join(tmpdir(), 'female-atlas-pregnancy-'));
const browser = await chromium.launch({headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader']});
const page = await browser.newPage({viewport: {width: 1440, height: 1000}, reducedMotion: 'reduce'});
page.setDefaultTimeout(30000);
const errors = [], failedAssets = [];
page.on('pageerror', error => errors.push(error.message));
page.on('response', response => {if (response.status() >= 400) failedAssets.push(response.url());});
const pregnancy = page.getByRole('switch', {name: 'Show pregnancy reference', exact: true});
const surface = page.getByRole('switch', {name: 'Show body surface', exact: true});
const frame = () => page.evaluate(() => new Promise(resolve => globalThis.requestAnimationFrame(() => globalThis.requestAnimationFrame(resolve))));
async function shape(value) {
  await page.locator(`.scene[data-skin-shape="${value}"]`).waitFor();
  assert.equal(await page.locator('.scene').getAttribute('data-pregnancy'), value === 'pregnant' ? 'active' : 'inactive');
  await frame();
}
async function view(name) {
  await page.getByRole('button', {name: `${name} view`, exact: true}).click();
  await page.locator(`button[aria-label="${name} view"][aria-pressed="true"]`).waitFor();
  await frame();
}
const snapshot = name => page.screenshot({path: join(artifacts, `${name}.png`)});
const bodyImage = () => page.locator('canvas').screenshot({style: '.identity,.layers-panel,.top-actions,.view-controls,.studio-footer,.scene-caption,.bottom-dock {visibility:hidden!important}'});
async function choose(query) {
  await page.getByRole('button', {name: 'Search anatomy', exact: true}).click();
  await page.getByRole('combobox').fill(query);
  await page.getByRole('option').filter({hasText: query}).first().click();
  await page.locator('.detail-sheet[data-open]:not([data-starting-style])').waitFor();
}
try {
  await page.goto(process.env.PREGNANCY_TEST_URL || 'http://localhost:3016/');
  await page.locator('.studio[aria-busy="false"]').waitFor({timeout: 90000});
  // Preserve upstream's existing default: pregnancy is already visible.
  await shape('pregnant');
  assert.ok(await pregnancy.isChecked());
  assert.ok(await surface.isChecked());
  assert.ok(await surface.isDisabled());
  await pregnancy.click();
  await shape('neutral');
  await view('side');
  const original = await bodyImage();
  const canvas = await page.locator('canvas').elementHandle();
  await snapshot('neutral-side');
  await pregnancy.click();
  await shape('pregnant');
  await snapshot('pregnant-side');
  await view('front');
  await snapshot('pregnant-front');
  await pregnancy.click();
  await shape('neutral');
  await view('side');
  assert.ok((await bodyImage()).equals(original), 'hiding pregnancy must restore the original rendered surface');
  assert.ok(await canvas.evaluate(element => element.isConnected), 'toggling must not reload the renderer');
  console.log('Default layers, pregnancy toggle and exact neutral restoration passed.');

  await page.locator('button[title="Show only pregnancy reference"]').click();
  await shape('pregnant');
  assert.match(await page.locator('.panel-foot').innerText(), /9 pieces visible/);
  await snapshot('pregnancy-only');
  await page.getByRole('button', {name: 'Hide all', exact: true}).click();
  await shape('neutral');
  await choose('placenta');
  await shape('pregnant');
  await page.getByRole('button', {name: 'Isolate structure', exact: true}).click();
  await shape('pregnant');
  await snapshot('isolated-placenta');
  await page.getByRole('button', {name: 'Clear selection', exact: true}).click();
  await shape('neutral');
  await page.getByRole('button', {name: 'Reset view and layers', exact: true}).click();
  await shape('pregnant');
  await choose('heart');
  await page.getByRole('button', {name: 'Isolate structure', exact: true}).click();
  await shape('neutral');
  await page.getByRole('button', {name: 'Show surrounding anatomy', exact: true}).click();
  await shape('pregnant');
  await page.getByRole('button', {name: 'Clear selection', exact: true}).click();

  const beforeZoom = await bodyImage();
  await page.locator('canvas').hover({position: {x: 720, y: 500}});
  await page.mouse.wheel(0, -120);
  await frame();
  assert.ok(!(await bodyImage()).equals(beforeZoom), 'cursor-centered zoom must still change the view');
  await page.getByRole('button', {name: 'Reset view and layers', exact: true}).click();
  await page.setViewportSize({width: 390, height: 844});
  await choose('placenta');
  await shape('pregnant');
  await snapshot('mobile-placenta');
  assert.ok(await page.evaluate(() => globalThis.document.documentElement.scrollWidth <= globalThis.innerWidth));
  assert.deepEqual(errors, []);
  assert.deepEqual(failedAssets, []);
  console.log(`PASS: layers, placenta selection/isolation, clearing, reset, other-organ isolation, zoom and mobile. Screenshots: ${artifacts}`);
} catch (error) {
  await snapshot('failure').catch(() => {});
  console.error({artifacts, errors, failedAssets});
  throw error;
} finally {
  await browser.close();
}
