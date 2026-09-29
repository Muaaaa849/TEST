// Drives the real game in headless Chromium and captures screenshots comparable to the reference video.
// Usage: node tools/screenshots.mjs [outDir]
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';

const log0 = (...a) => console.log('[drv]', ...a);
const out = process.argv[2] || 'shots';
mkdirSync(out, { recursive: true });
const port = 5199;
const server = spawn('npx', ['vite', '--port', String(port), '--strictPort'], { stdio: 'pipe' });
server.stdout.on('data', () => {}); server.stderr.on('data', d => process.stderr.write(d));
for (let i = 0; i < 100; i++) { try { if ((await fetch(`http://localhost:${port}/`)).ok) break; } catch {} await new Promise(r => setTimeout(r, 200)); }
log0('server up');
const base = `http://localhost:${port}/`;
const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 1920, height: 868 } });
const errors = [];
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
const wait = ms => page.waitForTimeout(ms);
const log = (...a) => console.log(new Date().toISOString().slice(11,19), ...a);
try {
  log('goto title'); await page.goto(base + '?shots&lowres', { waitUntil: 'domcontentloaded' }); await wait(2500);
  { log('shot 01_title'); await page.screenshot({ path: `${out}/01_title.png` }); }
  await page.goto(base + '?shots&lowres&screen=howto'); await wait(2000);
  { log('shot 02_howto'); await page.screenshot({ path: `${out}/02_howto.png` }); }
  await page.goto(base + '?shots&lowres&screen=select'); await wait(2000);
  { log('shot 03_select'); await page.screenshot({ path: `${out}/03_select.png` }); }
  const hero = process.env.HERO || '0';
  await page.goto(base + `?shots&lowres&auto&noshadow&sim=${process.env.SIM || 1}&hero=${hero}`); await wait(1500);
  { log('shot 04_countdown'); await page.screenshot({ path: `${out}/04_countdown.png` }); }
  const t0 = Date.now();
  for (let i = 0; i < 8; i++) {
    await wait(5000);
    { log('shot 1${i}_play'); await page.screenshot({ path: `${out}/1${i}_play.png` }); }
  }
  await page.keyboard.down('Tab'); await wait(300);
  { log('shot 20_board'); await page.screenshot({ path: `${out}/20_board.png` }); }
  await page.keyboard.up('Tab');
  const st = await page.evaluate(() => { const g = window.__game; return { score: g.score, time: g.timeLeft, alive: g.actors.map(a => [a.name, a.team, a.alive, a.stats.k, a.stats.d, Math.round(a.pos.x), Math.round(a.pos.y*10)/10, Math.round(a.pos.z)]) }; });
  console.log('state after', (Date.now() - t0) / 1000, 's:', JSON.stringify(st));
  if (process.env.FULL) {
    await page.waitForFunction(() => window.__result, null, { timeout: 900000, polling: 2000 });
  } else await page.evaluate(() => window.__game.endMatch());
  await wait(800);
  { log('shot 30_result'); await page.screenshot({ path: `${out}/30_result.png` }); }
  console.log('result', JSON.stringify(await page.evaluate(() => window.__result)));
} finally {
  console.log('ERRORS', errors.length ? errors.join('\n') : 'none');
  await browser.close(); server.kill();
}
