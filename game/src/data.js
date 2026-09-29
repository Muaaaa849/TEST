// Gesture = weapon. Right hand shape decides fire mode.
export const GESTURES = {
  fingergun: { id: 'fingergun', emoji: '👉', jp: 'フィンガーガン', en: 'FINGER GUN', mode: 'セミオート', twoHand: false,
    dmg: 22, hsMul: 2, rate: 0.28, auto: false, mag: 8, reload: 1.3, speed: 110, spread: 0.004, pellets: 1, color: 0x7fd8ff, onoma: ['BANG!', 'PEW!'] },
  doubletap: { id: 'doubletap', emoji: '✌️', jp: 'ダブルタップ', en: 'DOUBLE TAP', mode: '散弾', twoHand: false,
    dmg: 9, hsMul: 1.5, rate: 0.75, auto: false, mag: 4, reload: 1.6, speed: 90, spread: 0.07, pellets: 8, color: 0xffe066, onoma: ['BA-BANG!', 'KA-POW!'] },
  scope: { id: 'scope', emoji: '👌', jp: 'スコープサイン', en: 'SCOPE SIGN', mode: 'セミオート', twoHand: true,
    dmg: 70, hsMul: 2, rate: 1.1, auto: false, mag: 3, reload: 2.0, speed: 260, spread: 0.0, pellets: 1, color: 0xff7ad9, onoma: ['ZAP!', 'SNAP!'] },
  horns: { id: 'horns', emoji: '🤘', jp: 'ホーンズライフル', en: 'HORNS RIFLE', mode: 'フルオート', twoHand: false,
    dmg: 11, hsMul: 1.8, rate: 0.1, auto: true, mag: 26, reload: 1.8, speed: 120, spread: 0.018, pellets: 1, color: 0x7dffb2, onoma: ['RATATA', 'T-TAT-TAT'] },
  trinity: { id: 'trinity', emoji: '🤟', jp: 'トリニティバースト', en: 'TRINITY BURST', mode: '3点バースト', twoHand: false,
    dmg: 15, hsMul: 1.8, rate: 0.55, auto: false, burst: 3, mag: 18, reload: 1.6, speed: 130, spread: 0.008, pellets: 1, color: 0x9fffe0, onoma: ['TAT-TAT-TAT'] },
  seal: { id: 'seal', emoji: '🙏', jp: 'シールバラージ', en: 'SEAL BARRAGE', mode: 'フルオート', twoHand: true,
    dmg: 13, hsMul: 1.5, rate: 0.085, auto: true, mag: 40, reload: 2.4, speed: 105, spread: 0.03, pellets: 1, color: 0xffb35c, onoma: ['DORORORO', 'ZUDON!'] },
};

export const SPELLS = {
  phase:   { id: 'phase', key: 'Q', emoji: '🌀', jp: 'フェイズステップ', desc: '壁・床・天井をすり抜けて照準先へ瞬間移動。', cost: 35, cd: 5, cast: 'aim' },
  veil:    { id: 'veil', key: 'E', emoji: '👻', jp: 'ヴェール', desc: '6秒間半透明になり、遠くの敵から見えなくなる。', cost: 40, cd: 12, cast: 'instant' },
  fireball:{ id: 'fireball', key: 'F', emoji: '🔥', jp: 'ファイアボール', desc: '弧を描く火球。', cost: 45, cd: 6, cast: 'instant' },
  mirror:  { id: 'mirror', key: 'Q', emoji: '🛡️', jp: 'ミラーウォード', desc: '前方に魔法障壁。魔弾を跳ね返す。', cost: 40, cd: 10, cast: 'instant' },
  hexmine: { id: 'hexmine', key: 'E', emoji: '💥', jp: 'ヘックスマイン', desc: '床にルーンの罠を設置。', cost: 30, cd: 8, cast: 'aim' },
  ember:   { id: 'ember', key: 'F', emoji: '🔺', jp: 'エンバーウェイブ', desc: '前方扇状に炎の波。', cost: 50, cd: 9, cast: 'instant' },
  spring:  { id: 'spring', key: 'Q', emoji: '⛲', jp: '癒しの泉', desc: '照準先に癒しの泉を召喚。', cost: 50, cd: 12, cast: 'aim' },
  snare:   { id: 'snare', key: 'E', emoji: '🕸️', jp: 'スネアルーン', desc: '踏んだ敵をその場に縛り付け、位置を暴く罠。', cost: 30, cd: 9, cast: 'aim' },
  purify:  { id: 'purify', key: 'F', emoji: '✨', jp: 'ピュリファイウェイブ', desc: '周囲に浄化の衝撃波。', cost: 45, cd: 8, cast: 'instant' },
};

export const HEROES = [
  { id: 'trigger', name: 'TRIGGER', jp: 'トリガー', role: 'アタッカー', roleEn: 'ATTACKER', emoji: '👉', color: '#6b3fd6',
    title: '魔弾の早撃ち', titleEn: 'Hexslinger', desc: '体力は低いが魔力が高く、壁抜けと透明化で戦場を撹乱する狙撃手。',
    hp: 100, mp: 150, speed: 7.4, gestures: ['fingergun', 'doubletap', 'scope'], spells: ['phase', 'veil', 'fireball'], body: 0x6b4fe0, hat: 'cone' },
  { id: 'gauntlet', name: 'GAUNTLET', jp: 'ガントレット', role: 'タンク', roleEn: 'TANK', emoji: '✊', color: '#b8862e',
    title: '鉄壁の拳術師', titleEn: 'Bulwark Magus', desc: '圧倒的な体力。障壁で魔弾を跳ね返し、印を結んだ両手から弾幕を張る。',
    hp: 220, mp: 80, speed: 6.4, gestures: ['fingergun', 'doubletap', 'seal'], spells: ['mirror', 'hexmine', 'ember'], body: 0x8a5a2a, hat: 'kasa' },
  { id: 'mudra', name: 'MUDRA', jp: 'ムドラ', role: 'ヒーラー', roleEn: 'HEALER', emoji: '🪷', color: '#2aa872',
    title: '印を結ぶ癒し手', titleEn: 'Sign Healer', desc: '味方を撃つと回復する魔弾と、癒しの泉で前線を支える。罠で奇襲を防ぐ。',
    hp: 140, mp: 110, speed: 7.0, gestures: ['horns', 'trinity'], spells: ['spring', 'snare', 'purify'], body: 0x2f9a6a, hat: 'bowl' },
];

export const BOT_NAMES = {
  azure: ['グーチョキ子', 'ネオン忍', 'ゆびきりゲンマ'],
  blaze: ['チョキ丸', 'ピースメーカー', 'Knuckle Sandwich', 'Pinky Promise'],
};

export const DIFFICULTY = [
  { name: 'かんたん', aimErr: 0.11, react: 0.9, fireMul: 0.55, dmgMul: 0.6 },
  { name: 'ふつう',   aimErr: 0.06, react: 0.55, fireMul: 0.8, dmgMul: 0.8 },
  { name: 'むずかしい', aimErr: 0.03, react: 0.3, fireMul: 1.0, dmgMul: 1.0 },
];

export const MATCH = { killsToWin: 25, time: 360, respawn: 4 };
