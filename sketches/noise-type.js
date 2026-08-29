import { GLYPHS, GLYPH_W, GLYPH_H } from '../src/font5x7.js';

// 64×64 に文字を置き、ノイズで侵食して見えたり見えなくなったりさせる。
// source: 黒地に白く発光する文字と、全面に乗った粗いフィルムグレイン。
// rule: 文字は「濃さの地形」として持ち、ノイズはその地形を削る（掛け算する）。
//       しきい値を1つ動かすだけで、文字は削り残った高いところから順に現れて沈む。
// exception: 粒子（グレイン）だけは地形と無関係に、毎コマ画素ごとに引き直す。

// 語は好きなだけ足せる。1語ずつ順に現れて沈む。
// 収まるのは10文字まで。字数に応じて倍率と字間が自動で決まる。
const WORDS = ['NOISE', 'GRAIN', 'FADE', 'SIGNAL'];
const HOLD = 7;           // 秒。1語が現れて沈むまで。
const TINT = [255, 255, 255];

const TURB = 0.85;        // ノイズが文字を削る深さ。0 にすると輪郭のまま出入りする。
const CONTRAST = 1.6;     // ノイズの濃淡の開き。1 で素のまま、大きいほど斑がはっきり抜ける。
const SOFT = 0.2;         // しきい値のまたぎ幅。大きいほど滲んだ発光になる。
const HALO = 0.35;        // 文字のまわりへ広がる光の強さ。0 にすると発光が消える。
const FLICKER = 0.3;      // 語全体が明滅する深さ。見えたり見えなかったりの揺れ。
const GRAIN = 0.3;        // 文字に乗る粒の強さ。
const DUST = 0.18;        // 地に散る粒の強さ。0 にすると背景は真っ黒になる。
const GRAIN_FPS = 24;     // 粒を引き直す速さ。低いほどフィルムらしくざらつく。
const FLOOR = 0.2;        // しきい値の下限。これ以上下げると地のノイズまで光り出す。

const MARGIN = 2; // 盤面の左右に残す余白（px）

const clampUnit = (value) => (value < 0 ? 0 : value > 1 ? 1 : value);
const smoothstep = (edge0, edge1, value) => {
  const t = clampUnit((value - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
};

// 文字の「濃さの地形」。中が 1、外へ向かってなだらかに 0 へ落ちる。削られるのはこちら。
// halo は同じ字を大きくぼかしたもの。暗く足すだけなので、字画を太らせずに光だけ広がる。
// どちらも語が変わったときだけ作り直す。毎フレームの計算はここに入れない。
const terrain = new Float32Array(64 * 64);
const halo = new Float32Array(64 * 64);
const scratch = new Float32Array(64 * 64);
let builtWord = null;

// 盤面に収まる最大の倍率と字間を選ぶ。字数が増えたら自動で小さくなる。
// 字間 0（字が触れる）は小さい倍率でだけ許す。大きい倍率で詰めると接触が目立つ。
function fit(word) {
  for (const scale of [4, 3, 2, 1]) {
    for (const gap of scale <= 2 ? [2, 1, 0] : [2, 1]) {
      const width = word.length * GLYPH_W * scale + (word.length - 1) * gap;
      if (width <= 64 - MARGIN * 2 && GLYPH_H * scale <= 64 - MARGIN * 2) return { scale, gap, width };
    }
  }
  return { scale: 1, gap: 1, width: word.length * (GLYPH_W + 1) };
}

// 平均化を縦横に1回ずつ。これを2度かけると、にじみがガウスに近い形になる。
function soften(buffer, radius) {
  if (radius < 1) return;
  const span = radius * 2 + 1;
  for (let y = 0; y < 64; y += 1) {
    for (let x = 0; x < 64; x += 1) {
      let sum = 0;
      for (let d = -radius; d <= radius; d += 1) {
        const sx = x + d;
        if (sx >= 0 && sx < 64) sum += buffer[y * 64 + sx];
      }
      scratch[y * 64 + x] = sum / span;
    }
  }
  for (let x = 0; x < 64; x += 1) {
    for (let y = 0; y < 64; y += 1) {
      let sum = 0;
      for (let d = -radius; d <= radius; d += 1) {
        const sy = y + d;
        if (sy >= 0 && sy < 64) sum += scratch[sy * 64 + x];
      }
      buffer[y * 64 + x] = sum / span;
    }
  }
}

// 最大値を 1 に戻す。にじみで下がった山を戻し、倍率が変わっても濃さが揃う。
function normalize(buffer) {
  let peak = 0;
  for (let i = 0; i < buffer.length; i += 1) if (buffer[i] > peak) peak = buffer[i];
  if (peak > 0) for (let i = 0; i < buffer.length; i += 1) buffer[i] /= peak;
}

function buildTerrain(word) {
  terrain.fill(0);
  const { scale, gap, width } = fit(word);
  const left = Math.round((64 - width) / 2);
  const top = Math.round((64 - GLYPH_H * scale) / 2);

  for (let i = 0; i < word.length; i += 1) {
    const rows = GLYPHS[word[i]] ?? GLYPHS[' '];
    const originX = left + i * (GLYPH_W * scale + gap);
    for (let row = 0; row < GLYPH_H; row += 1) {
      for (let column = 0; column < GLYPH_W; column += 1) {
        // 5bit の左端が column 0。立っていれば scale×scale の塊を置く。
        if ((rows[row] & (1 << (GLYPH_W - 1 - column))) === 0) continue;
        for (let dy = 0; dy < scale; dy += 1) {
          for (let dx = 0; dx < scale; dx += 1) {
            const x = originX + column * scale + dx;
            const y = top + row * scale + dy;
            if (x >= 0 && x < 64 && y >= 0 && y < 64) terrain[y * 64 + x] = 1;
          }
        }
      }
    }
  }

  // 光は字画より先に広がる。だから大きくぼかした写しを先に取る。
  halo.set(terrain);
  soften(halo, scale + 1);
  soften(halo, scale + 1);
  normalize(halo);

  // 地形のほうは軽くだけ。ここを強くぼかすと字間が埋まって語が1本の帯になる。
  soften(terrain, 1);
  normalize(terrain);
}

// 粗いノイズは 17×17 だけ作り、画素へは補間で伸ばす。
// 滑らかな模様なので、全画素で解いても同じ絵にしかならない。
const LOW = 17;
const STEP = 64 / (LOW - 1);
const blotch = new Float32Array(LOW * LOW);

function buildBlotch(api, time) {
  for (let gy = 0; gy < LOW; gy += 1) {
    for (let gx = 0; gx < LOW; gx += 1) {
      const nx = gx * 0.28;
      const ny = gy * 0.28;
      // 3段の重ね合わせ。大きな塊の上に細かい欠けが乗る。
      let value = api.noise(nx, ny, time * 0.25);
      value += 0.5 * api.noise(nx * 2 + 11, ny * 2, time * 0.4);
      value += 0.25 * api.noise(nx * 4, ny * 4 + 7, time * 0.65);
      // 中央から開いて濃淡を強める。素の値ノイズは 0.5 付近に寄っていて斑が出ない。
      blotch[gy * LOW + gx] = clampUnit((value / 1.75 - 0.5) * CONTRAST + 0.5);
    }
  }
}

function blotchAt(x, y) {
  const fx = x / STEP;
  const fy = y / STEP;
  const gx = Math.min(LOW - 2, Math.floor(fx));
  const gy = Math.min(LOW - 2, Math.floor(fy));
  const tx = fx - gx;
  const ty = fy - gy;
  const top = blotch[gy * LOW + gx] + (blotch[gy * LOW + gx + 1] - blotch[gy * LOW + gx]) * tx;
  const bottom = blotch[(gy + 1) * LOW + gx] + (blotch[(gy + 1) * LOW + gx + 1] - blotch[(gy + 1) * LOW + gx]) * tx;
  return top + (bottom - top) * ty;
}

// 画素ごとの粒。整数ハッシュなので三角関数を通らず、毎コマ全画素引いても軽い。
function grainAt(x, y, frame) {
  let hash = Math.imul(x + 1, 374761393) ^ Math.imul(y + 1, 668265263) ^ Math.imul(frame + 1, 1274126177);
  hash = Math.imul(hash ^ (hash >>> 13), 1274126177);
  return ((hash ^ (hash >>> 16)) >>> 0) / 4294967296;
}

export function draw(api) {
  const time = api.time();

  // 語の切り替え。現れて沈むまでを1語ぶんの周期とする。
  const cycle = (time % (WORDS.length * HOLD)) / HOLD;
  const word = WORDS[Math.floor(cycle)];
  const progress = cycle - Math.floor(cycle);
  if (word !== builtWord) {
    buildTerrain(word);
    builtWord = word;
  }

  // 現れて、留まって、沈む。両端は 0 なので、語の入れ替わりは見えない。
  const reveal = smoothstep(0.05, 0.3, progress) * (1 - smoothstep(0.72, 0.97, progress));
  // 語全体の明滅。遅い息と速いどもりを混ぜ、中央から開いて振れ幅を出す。
  // 素の値ノイズは 0.5 付近に寄っていて、そのままでは端まで振れない。
  // これがしきい値を上げ下げして、留まっている間も語が食われては戻る。
  const slow = api.noise(time * 0.55, 3.5, 0);
  const fast = api.noise(time * 2.2, 9.2, 0);
  const swing = clampUnit((slow * 0.6 + fast * 0.4 - 0.5) * 2.4 + 0.5);
  const waver = (swing - 0.5) * 2 * FLICKER;
  // 地形をこの高さで水平に切る。高いところ＝削られ残った芯から順に顔を出す。
  // 谷では語が読み切れる高さまで下がり、揺れが上へ振れたときだけノイズに食われる。
  const level = Math.max(FLOOR, 1.32 - reveal * 1.12 + waver);

  buildBlotch(api, time);
  const frame = Math.floor(time * GRAIN_FPS);

  for (let y = 0; y < 64; y += 1) {
    for (let x = 0; x < 64; x += 1) {
      const index = y * 64 + x;
      const cloud = blotchAt(x, y);
      // ノイズは地形を削る。掛け算なので、文字のない場所は削っても 0 のまま暗い。
      // 文字の輪郭ではなく、削り残った高さがしきい値をまたぐ。
      const height = terrain[index] * (1 - TURB * (1 - cloud));
      const lit = smoothstep(level - SOFT, level + SOFT, height);

      // 光の裾。芯と同じノイズで濃淡がつくので、にじみも一緒に息をする。
      const glow = halo[index] * HALO * reveal * (0.35 + 0.65 * cloud);

      const grain = grainAt(x, y, frame);
      // 文字は粒でざらつき、地には暗い粒が散る。粒を2乗して、たまに強く光らせる。
      const value = clampUnit(
        lit * (1 - GRAIN + GRAIN * grain) + glow * (1 - lit) + (1 - lit) * DUST * grain * grain
      );

      api.pixel(x, y, api.rgb(TINT[0] * value, TINT[1] * value, TINT[2] * value));
    }
  }
}
