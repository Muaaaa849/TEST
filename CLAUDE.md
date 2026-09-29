# TEST — Opus 5.5 魔法FPS 再現リポジトリ

- `docs/METHOD.md`: 元ポストの検証結果と再現手順
- `prompts/master_prompt.md`: 開発セッションに渡す /goal 用のプロンプト
- `.claude/audio-session.md`: 音担当セッション（音楽生成）のシステムプロンプト
- `game/`: 再現したゲーム（Vite + Three.js、外部アセットなし）

## 開発ルール（game/）
- `cd game && npm install && npm run dev` で起動する。自動の URL パラメータは `?auto`（プレイヤーも自動操作）、`&sim=N`（1描画あたりのロジック更新回数）、`&noshadow&lowres`（軽量化）、`&screen=howto|select`。
- 変更したら必ず自分で確認する:
  - `CHROME=/opt/pw-browsers/chromium-1194/chrome-linux/chrome node tools/simmatch.mjs` … フルマッチが決着し、ページエラーが0であること
  - `SIM=12 CHROME=... node tools/screenshots.mjs shots` … 出力された画像を実際に見る
- 音は `tools/audio/cues.json` と `public/audio/manifest.json` で音担当セッションとやり取りする。音ファイルを自分で作らない。
