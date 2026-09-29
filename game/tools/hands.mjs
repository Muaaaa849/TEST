import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
const port = 5197;
const server = spawn('npx', ['vite', '--port', String(port), '--strictPort'], { stdio: 'ignore' });
for (let i = 0; i < 100; i++) { try { if ((await fetch(`http://localhost:${port}/`)).ok) break; } catch {} await new Promise(r => setTimeout(r, 200)); }
const browser = await chromium.launch({ executablePath: process.env.CHROME, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 960, height: 434 } });
page.on('pageerror', e => console.log('ERR', e.message));
await page.goto(`http://localhost:${port}/?shots&lowres&noshadow`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(1500);
for (const [hero, n] of [[0, 3], [1, 3], [2, 2]]) {
  await page.evaluate(h => { const g = window.__game; g.heroIdx = h; return g.startMatch(); }, hero);
  for (let i = 0; i < n; i++) {
    await page.evaluate(i => { const g = window.__game; const p = g.player; p.pitch = -0.05; if (p.setGesture(i)) g.onSwap(p); }, i);
    await page.waitForTimeout(2500);
    await page.screenshot({ path: `shots/hand_${hero}_${i}.png` });
  }
}
await browser.close(); server.kill();
