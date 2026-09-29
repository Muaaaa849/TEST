// Audio session renderer: turns cues.json into files under public/audio and writes manifest.json.
//   GEMINI_API_KEY      -> music via Lyria 3.5   (POST .../models/lyria-3.5:generateContent)
//   ELEVENLABS_API_KEY  -> SFX via ElevenLabs    (POST https://api.elevenlabs.io/v1/sound-generation)
// Usage: node tools/audio/generate.mjs [--only music|sfx] [--force] [key ...]
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, '../../public/audio');
mkdirSync(outDir, { recursive: true });
const cues = JSON.parse(readFileSync(join(here, 'cues.json'), 'utf8'));
const manifestPath = join(outDir, 'manifest.json');
const manifest = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, 'utf8')) : { music: {}, sfx: {} };
const args = process.argv.slice(2);
const only = args.includes('--only') ? args[args.indexOf('--only') + 1] : null;
const force = args.includes('--force');
const keys = args.filter((a, i) => !a.startsWith('--') && args[i - 1] !== '--only');
const want = (kind, k) => (!only || only === kind) && (!keys.length || keys.includes(k)) && (force || !manifest[kind][k]);

async function lyria(prompt) {
  const r = await fetch('https://generativelanguage.googleapis.com/v1beta/models/lyria-3.5:generateContent', {
    method: 'POST', headers: { 'x-goog-api-key': process.env.GEMINI_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
  });
  if (!r.ok) throw new Error(`Lyria ${r.status}: ${await r.text()}`);
  const j = await r.json();
  const part = j.candidates?.[0]?.content?.parts?.find(p => p.inlineData?.data);
  if (!part) throw new Error('Lyria: no audio part in response');
  return Buffer.from(part.inlineData.data, 'base64');
}

async function eleven(text, duration) {
  const r = await fetch('https://api.elevenlabs.io/v1/sound-generation', {
    method: 'POST', headers: { 'xi-api-key': process.env.ELEVENLABS_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, duration_seconds: Math.max(0.5, duration), prompt_influence: 0.55, output_format: 'mp3_44100_128' }),
  });
  if (!r.ok) throw new Error(`ElevenLabs ${r.status}: ${await r.text()}`);
  return Buffer.from(await r.arrayBuffer());
}

const jobs = [];
if (!only || only === 'music') {
  if (!process.env.GEMINI_API_KEY) console.warn('GEMINI_API_KEY not set: music stays synthesized');
  else for (const [k, c] of Object.entries(cues.music)) if (want('music', k)) jobs.push(['music', k, () => lyria(c.prompt), `bgm_${k}.mp3`]);
}
if (!only || only === 'sfx') {
  if (!process.env.ELEVENLABS_API_KEY) console.warn('ELEVENLABS_API_KEY not set: SFX stay synthesized');
  else for (const [k, c] of Object.entries(cues.sfx)) if (want('sfx', k)) jobs.push(['sfx', k, () => eleven(c.text, c.duration), `sfx_${k}.mp3`]);
}

for (const [kind, k, run, file] of jobs) {
  try { writeFileSync(join(outDir, file), await run()); manifest[kind][k] = file; console.log('ok', kind, k, '->', file); }
  catch (e) { console.error('FAIL', kind, k, e.message); }
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
}
console.log(`done: ${jobs.length} job(s); manifest has ${Object.keys(manifest.music).length} music / ${Object.keys(manifest.sfx).length} sfx`);
