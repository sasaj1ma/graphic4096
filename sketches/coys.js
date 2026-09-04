import { createVeil, soften, normalize, sampleField, grainAt, clampUnit } from '../src/noise-veil.js';

// 64×64 で COYS（Come On You Spurs）を掲げる応援用のスケッチ。
// source: クラブの紋章とワードマーク。黒地に白い図形だけを置く。
// rule: ノイズは必ず図形の濃さに掛ける。足すと図形のない場所まで光って地が汚れるが、
//       掛けるかぎり 0 に何を掛けても 0 なので、地は黒いまま残る。
// exception: 紋章とワードマークを 32×32 に組み直し、それを4枚並べる。区画ごとに違う
//            ノイズをかけるので、同じ旗が4通りの汚れ方で同時に翻る。
//
//   左上 明滅   ノイズが図形を削り、拍で持ち直す
//   右上 ぼやけ 焦点が外れて戻る。縁は粒に散って吹き付けたようになる
//   左下 グリッチ 帯ごとに横へ飛び、RGB が離れる
//   右下 すりガラス 大きくにじませ、縁に色収差を出して全体に粒を乗せる

const TILE = 32;       // 1枚の旗の一辺。これを2×2 に並べて盤面を埋める。

const BEAT = 0.6;      // 秒。手拍子の間隔。明滅の区画だけがこれで持ち直す。
const BASE = 0.7;      // 拍と拍の間の見え方。下げるほどノイズに食われる。
const SURGE = 0.3;     // 拍で持ち直す量。0 にすると拍が消えてノイズだけになる。
const GRAIN_FPS = 24;  // 粒を引き直す速さ。低いほどフィルムらしくざらつく。

const BLUR = 2;        // ぼやけとすりガラスのにじみ半径。旗が小さいので 64 版の半分。
const SPRAY_FOCUS = 0.85; // ぼやけの焦点が動く速さ（周/秒に比例）。
const GLITCH_FPS = 12; // グリッチが跳ぶ速さ。
const GLITCH_RATE = 0.7; // これを超えた帯だけが飛ぶ。1 に近づけるほど静かになる。
const GLITCH_BAND = 2; // 飛ぶ帯の高さ。旗が小さいので薄く刻む。
const GLITCH_JUMP = 7; // 飛ぶ幅。旗の幅の2割ほど。これ以上だと字が枠の外へ抜ける。

const MARK_SLANT = 0.28; // ワードマークの斜体。SPURS のロゴに合わせて深めに倒す。

// COYS の4文字。6×9 のドット絵。32 の幅に4文字を収めるための寸法で、
// 縦画は2px、横画は1px。この差が字を締める。置くときに下から上へ右へずらして倒す。
const WORDMARK = [
  [
    '.####.',
    '##..##',
    '##....',
    '##....',
    '##....',
    '##....',
    '##....',
    '##..##',
    '.####.'
  ],
  [
    '.####.',
    '##..##',
    '##..##',
    '##..##',
    '##..##',
    '##..##',
    '##..##',
    '##..##',
    '.####.'
  ],
  [
    '##..##',
    '##..##',
    '.####.',
    '..##..',
    '..##..',
    '..##..',
    '..##..',
    '..##..',
    '.####.'
  ],
  [
    '.####.',
    '##..##',
    '##....',
    '.##...',
    '..##..',
    '...##.',
    '....##',
    '##..##',
    '.####.'
  ]
];

// 球に乗る雄鶏。11×18。64 版の 15×36 を半分に詰め直したもの。
// 頭は左上、首は縦に4行。尾は右へ刃のように張り出し、上の縁を斜めに切り上げる。
// この斜めが消えると胴と尾がひと塊になり、脚と球と合わせて聖杯の形に見えてしまう。
// 首の白抜きとボールの縫い目は落とした。この大きさでは1pxの隙間になり、形が割れて読めなくなる。
const CREST = [
  '.##........',
  '.###.......',
  '.###.......',
  '.###.....#.',
  '.###....###',
  '####...####',
  '###########',
  '.#########.',
  '..######...',
  '...####....',
  '....##.....',
  '....##.....',
  '..######...',
  '.########..',
  '##########.',
  '##########.',
  '.########..',
  '..######...'
];

const MARK_GAP = 1;  // COYS の字間
const STACK_GAP = 2; // 紋章とワードマークの間
const MARK_W = WORDMARK[0][0].length;
const MARK_H = WORDMARK[0].length;

// 図形は動かないので、置き場所と場は起動時に一度だけ焼く。どれも旗1枚分の 32×32 で、
// 4区画がこの同じ場を読む。sharp は輪郭の立った写し、mid はその少し先、soft は大きくにじませた写し。
// 区画ごとに使い分ける。色収差は sharp から読むと虹色に割れるので mid を使う。
const mask = new Uint8Array(TILE * TILE);
const sharp = new Float32Array(TILE * TILE);
const mid = new Float32Array(TILE * TILE);
const soft = new Float32Array(TILE * TILE);
const veil = createVeil({ size: TILE, dust: 0 }); // 地に粒を散らさない
const rgb = [0, 0, 0];                            // 区画ごとの色を書き込む使い回しの入れ物

function plot(x, y) {
  if (x >= 0 && x < TILE && y >= 0 && y < TILE) mask[y * TILE + x] = 1;
}

// ドット絵を1枚置く。slant が 0 でなければ、下の行ほど左へ寄せて斜体にする。
function stamp(rows, left, top, slant) {
  const height = rows.length;
  for (let row = 0; row < height; row += 1) {
    const shift = Math.round((height - 1 - row) * slant);
    for (let column = 0; column < rows[row].length; column += 1) {
      if (rows[row][column] === '#') plot(left + column + shift, top + row);
    }
  }
}

function buildMark() {
  const markWidth = WORDMARK.length * MARK_W + (WORDMARK.length - 1) * MARK_GAP;
  const lean = Math.round((MARK_H - 1) * MARK_SLANT); // 斜体で右へはみ出す分
  const crestHeight = CREST.length;
  const total = crestHeight + STACK_GAP + MARK_H;
  const top = Math.round((TILE - total) / 2);

  stamp(CREST, Math.round((TILE - CREST[0].length) / 2), top, 0);

  const left = Math.round((TILE - markWidth - lean) / 2);
  for (let i = 0; i < WORDMARK.length; i += 1) {
    stamp(WORDMARK[i], left + i * (MARK_W + MARK_GAP), top + crestHeight + STACK_GAP, MARK_SLANT);
  }

  for (let i = 0; i < mask.length; i += 1) sharp[i] = mid[i] = soft[i] = mask[i] ? 1 : 0;
  soften(sharp, 1, TILE);
  normalize(sharp);
  soften(mid, 1, TILE);
  soften(mid, 1, TILE);
  normalize(mid);
  soften(soft, BLUR, TILE);
  soften(soft, BLUR, TILE);
  normalize(soft);

  veil.setMask(mask, BLUR);
}

buildMark();

const mono = (value) => {
  rgb[0] = rgb[1] = rgb[2] = value * 255;
  return rgb;
};

// 左上。ノイズが図形を削り、拍で持ち直す。
function flicker(x, y) {
  return mono(veil.sample(x, y));
}

// 右上。焦点がゆっくり外れて戻る。粒は場に比例するので、縁だけが吹き付けたように散る。
function spray(x, y, time, frame) {
  const index = y * TILE + x;
  const focus = 0.5 + 0.5 * Math.sin(time * SPRAY_FOCUS);
  const field = soft[index] + (sharp[index] - soft[index]) * focus;
  if (field <= 0.002) return mono(0);
  const speck = grainAt(x, y, frame);
  return mono(clampUnit(field * 1.7 - 0.12 + (speck - 0.5) * 0.9 * field));
}

// 左下。帯ごとに横へ飛ばし、RGB を離す。飛ぶのは一部の帯だけにする。
// 全部動かすと砂嵐になって、何が書いてあるか分からなくなる。
function glitch(x, y, time) {
  const tick = Math.floor(time * GLITCH_FPS);
  const band = Math.floor(y / GLITCH_BAND);
  const roll = grainAt(band, tick, 5);
  const still = roll < GLITCH_RATE;
  const jump = still ? 0 : Math.round((grainAt(band, tick, 9) - 0.5) * 2 * GLITCH_JUMP);
  const split = still ? 0 : 1 + Math.round(grainAt(band, tick, 11));
  const boost = roll > 0.96 ? 1.7 : 1; // たまに帯が白く飛ぶ
  rgb[0] = clampUnit(sampleField(sharp, x + jump + split, y, TILE) * boost) * 255;
  rgb[1] = clampUnit(sampleField(sharp, x + jump, y, TILE) * boost) * 255;
  rgb[2] = clampUnit(sampleField(sharp, x + jump - split, y, TILE) * boost) * 255;
  return rgb;
}

// 右下。芯はそのまま、まわりへ光を広げ、色収差で縁に暖色と寒色を出す。
// 芯までぼかすと字が溶けて読めなくなる。にじむのは光だけで、形は残す。
// 赤を右下から、青を左上から読むので、左上の縁が暖かく、右下の縁が冷たくなる。
// ずれ幅は旗の大きさではなく画素で決める。1px を切ると収差が見えなくなる。
function glass(x, y, time, frame) {
  const drift = 0.6 + 0.35 * Math.sin(time * 0.5);
  const r = sampleField(mid, x + drift, y + drift, TILE);
  const g = sampleField(mid, x, y, TILE);
  const b = sampleField(mid, x - drift, y - drift, TILE);
  const halo = soft[y * TILE + x];
  if (r <= 0.002 && g <= 0.002 && b <= 0.002 && halo <= 0.002) return mono(0);

  // 32 の旗は字画が2pxしかない。64 版の 2.4 まで上げると芯が溶けて白い塊になる。
  const gain = 1.7; // 芯を白く飛ばす。低いと収差だけが目立って虹色になる。
  const core = clampUnit(g * gain);
  // 粒は芯では効かず、裾でざらつく。ここも場に掛けるので地は黒いまま。
  const rough = 1 - 0.6 * (1 - grainAt(x, y, frame)) * (1 - core);
  // 光の裾は青に寄せる。実物の発光も外へ行くほど冷たい。
  rgb[0] = clampUnit(r * gain + halo * 0.2) * rough * 255;
  rgb[1] = clampUnit(g * gain + halo * 0.18) * rough * 255;
  rgb[2] = clampUnit(b * gain + halo * 0.3) * rough * 255;
  return rgb;
}

export function draw(api) {
  const time = api.time();

  // 拍。叩いた瞬間が 1 で、すぐ減衰する。
  const kick = Math.exp(-((time % BEAT) / BEAT) * 4);
  veil.update(api, time, BASE + SURGE * kick);
  const frame = Math.floor(time * GRAIN_FPS);

  // 4区画とも同じ 32×32 の旗を読む。違うのはかけるノイズだけ。
  for (let y = 0; y < 64; y += 1) {
    const lower = y >= TILE;
    const ly = y - (lower ? TILE : 0);
    for (let x = 0; x < 64; x += 1) {
      const right = x >= TILE;
      const lx = x - (right ? TILE : 0);
      const color = lower
        ? (right ? glass(lx, ly, time, frame) : glitch(lx, ly, time))
        : (right ? spray(lx, ly, time, frame) : flicker(lx, ly));
      api.pixel(x, y, api.rgb(color[0], color[1], color[2]));
    }
  }
}
