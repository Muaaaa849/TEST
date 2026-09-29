// Plays a full bot-vs-bot 4v4 match (player on autopilot) in accelerated time and reports the outcome.
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
const port = 5198, hero = process.env.HERO || '0', diff = process.env.DIFF || '1';
const server = spawn('npx', ['vite', '--port', String(port), '--strictPort'], { stdio: 'ignore' });
for (let i = 0; i < 100; i++) { try { if ((await fetch(`http://localhost:${port}/`)).ok) break; } catch {} await new Promise(r => setTimeout(r, 200)); }
const browser = await chromium.launch({ executablePath: process.env.CHROME, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 480, height: 217 } });
const errors = []; page.on('pageerror', e => errors.push(e.message));
try {
  await page.goto(`http://localhost:${port}/?auto&sim=${process.env.SIM || 150}&noshadow&lowres&hero=${hero}&diff=${diff}`, { waitUntil: 'domcontentloaded' });
  const t0 = Date.now();
  await page.waitForFunction(() => window.__result, null, { timeout: 600000, polling: 1000 });
  const r = await page.evaluate(() => ({ res: window.__result, gameTime: 360 - window.__game.timeLeft, actors: window.__game.actors.map(a => `${a.team[0]} ${a.hero.id.padEnd(8)} ${a.name.padEnd(16)} K${a.stats.k} D${a.stats.d} A${a.stats.a} dmg${Math.round(a.stats.dmg)} heal${Math.round(a.stats.heal)} hs${a.stats.hs} acc${a.stats.shots ? Math.round(a.stats.hits / a.stats.shots * 100) : 0}%`) }));
  console.log('wall', (Date.now() - t0) / 1000, 's  game', r.gameTime.toFixed(0), 's');
  console.log(JSON.stringify(r.res.score), 'win', r.res.win, 'mvp', r.res.mvp);
  console.log(r.actors.join('\n'));
} finally { console.log('PAGE ERRORS:', errors.length ? errors : 'none'); await browser.close(); server.kill(); }
