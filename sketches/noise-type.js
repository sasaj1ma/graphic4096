import { GLYPHS, GLYPH_W, GLYPH_H } from '../src/font5x7.js';
import { createVeil } from '../src/noise-veil.js';

// 64×64 に文字を置き、ノイズで侵食して見えたり見えなくなったりさせる。
// source: 黒地に白く発光する文字と、全面に乗った粗いフィルムグレイン。
// rule: 語は1つずつ現れて沈む。しきい値を1本動かすだけで、削り残った芯から順に出入りする。
// exception: 語の入れ替わりは見せない。両端で完全に沈めてから次の語に差し替える。
//
// 侵食そのものは src/noise-veil.js が持つ。ここは語を組んで渡すだけ。

// 語は好きなだけ足せる。1語ずつ順に現れて沈む。
// 収まるのは10文字まで。字数に応じて倍率と字間が自動で決まる。
const WORDS = ['NOISE', 'GRAIN', 'FADE', 'SIGNAL'];
const HOLD = 7;           // 秒。1語が現れて沈むまで。
const TINT = [255, 255, 255];
const MARGIN = 2;         // 盤面の左右に残す余白（px）

const clampUnit = (value) => (value < 0 ? 0 : value > 1 ? 1 : value);
const smoothstep = (edge0, edge1, value) => {
  const t = clampUnit((value - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
};

const veil = createVeil();
const mask = new Uint8Array(64 * 64);
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

function buildWord(word) {
  mask.fill(0);
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
            if (x >= 0 && x < 64 && y >= 0 && y < 64) mask[y * 64 + x] = 1;
          }
        }
      }
    }
  }

  // 倍率が上がるほど字画も太いので、にじみも合わせて大きくする。
  veil.setMask(mask, scale + 1);
}

export function draw(api) {
  const time = api.time();

  // 語の切り替え。現れて沈むまでを1語ぶんの周期とする。
  const cycle = (time % (WORDS.length * HOLD)) / HOLD;
  const word = WORDS[Math.floor(cycle)];
  const progress = cycle - Math.floor(cycle);
  if (word !== builtWord) {
    buildWord(word);
    builtWord = word;
  }

  // 現れて、留まって、沈む。両端は 0 なので、語の入れ替わりは見えない。
  const reveal = smoothstep(0.05, 0.3, progress) * (1 - smoothstep(0.72, 0.97, progress));
  veil.update(api, time, reveal);

  for (let y = 0; y < 64; y += 1) {
    for (let x = 0; x < 64; x += 1) {
      const value = veil.sample(x, y);
      api.pixel(x, y, api.rgb(TINT[0] * value, TINT[1] * value, TINT[2] * value));
    }
  }
}
