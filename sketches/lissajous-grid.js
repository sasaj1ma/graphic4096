// 64×64 を 16×16 のセル 4×4 に分割し、各セルにリサージュ図形を1つ描く。
// source: プロッタで一筆書きされた青1色のポスター。線の重なりだけが濃淡を作る。
// rule: 全16セルが同じ位相 φ を共有する。φ が 0→2π を回る間に全図形が同時に変形し、同時に元へ戻る。
// exception: セルごとに周波数比・歳差・減衰・回転が違うため、同じ位相でも現れる形は重ならない。

const CELL = 16;          // 1セルの辺
const GRID = 4;           // セルの並び
const RADIUS = 6.5;       // セル内の描画半径。両端に1pxの余白が残る。
const PERIOD = 12;        // 秒。全セル共通の変形周期。
const TAU = Math.PI * 2;

const INK = 1.7;          // 線1pxあたりのインク量。線の重なりがそのまま輝度になる。
const STEP = 0.4;         // 曲線を刻む歩幅（px）。小さいほど滑らかで重い。
const MAX_SAMPLES = 5200; // 1セルあたりの上限。周波数比が高い図形の保険。
const GRID_DIM = 0.14;    // セル境界の明るさ。0 にすると罫線が消える。
const HUE = [64, 104, 255]; // 単色。色は変えず、輝度だけで濃淡を作る。

// a:b は周波数比、detune は 1 回転ごとの歳差（束のふくらみ）、
// turns は描く回転数、decay は描き進むほど内へ落ちる量、
// rot は図形の傾き（1.0 = 一周）、ax/ay は縦横のつぶし。
const figure = (a, b, options = {}) => ({
  a, b, detune: 0, turns: 8, decay: 0, rot: 0, ax: 1, ay: 1, phase: 0, ...options
});

// 13px の描画域に置ける線は数本しかない。ほとんどのセルは1周＝1本の閉じた曲線にし、
// 密度が欲しいセルだけ decay で内側へ入れ子にする。歳差（detune）は線が混ざって潰れるので使わない。
const FIGURES = [
  figure(1, 1, { turns: 1 }),                                    // 円⇄線。この作品の基本形
  figure(1, 2, { turns: 1 }),                                    // 8の字
  figure(1, 1, { decay: 0.95, turns: 3 }),                       // 入れ子の輪
  figure(3, 4, { turns: 1 }),                                    // 織られた格子

  figure(1, 3, { turns: 1, ay: 0.9 }),                           // 三つ山の波
  figure(2, 3, { turns: 1 }),                                    // 三つ編み
  figure(1, 2, { turns: 1, ay: 0.6 }),                           // 平たい8の字
  figure(2, 1, { turns: 1, rot: 0.2 }),                          // 傾いた8の字

  figure(1, 1, { turns: 1, ay: 0.55 }),                          // 平たい楕円
  figure(3, 2, { decay: 0.5, turns: 1 }),                        // 沈む三葉
  figure(1, 4, { turns: 1 }),                                    // 四つ山の波
  figure(5, 4, { turns: 1 }),                                    // 目の細かい織り

  figure(1, 5, { turns: 1, ax: 0.85 }),                          // 細かい縦波
  figure(3, 1, { turns: 1, ax: 0.7 }),                           // 縦につぶした三つ折り
  figure(2, 5, { turns: 1 }),                                    // ねじれた籠
  figure(1, 1, { decay: 1.3, turns: 3, rot: 0.4 })               // 内へ落ちる渦
];

// 輝度を貯める場所。線が通るたびに足し込み、最後に一度だけ色へ変換する。
const canvas = new Float32Array(64 * 64);

// 1点を周囲4画素へ分配する。16pxのセルでも線の傾きが保たれる。
function splat(x, y, amount) {
  const left = Math.floor(x);
  const top = Math.floor(y);
  const fx = x - left;
  const fy = y - top;
  for (let dy = 0; dy < 2; dy += 1) {
    const py = top + dy;
    if (py < 0 || py >= 64) continue;
    const wy = dy === 0 ? 1 - fy : fy;
    for (let dx = 0; dx < 2; dx += 1) {
      const px = left + dx;
      if (px < 0 || px >= 64) continue;
      const wx = dx === 0 ? 1 - fx : fx;
      canvas[py * 64 + px] += amount * wx * wy;
    }
  }
}

function trace(fig, originX, originY, phi) {
  const span = fig.turns * TAU;
  // 曲線の速さから刻み数を決める。周波数比が高いほど道のりが長い。
  const speed = RADIUS * Math.hypot(fig.a * fig.ax, fig.b * fig.ay);
  const samples = Math.min(Math.ceil((span * speed) / STEP), MAX_SAMPLES);
  const angle = fig.rot * TAU;
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  const centerX = originX + CELL / 2 - 0.5;
  const centerY = originY + CELL / 2 - 0.5;
  const offset = phi + fig.phase * TAU;
  let previousX = 0;
  let previousY = 0;

  for (let i = 0; i <= samples; i += 1) {
    const progress = i / samples;
    const u = progress * span;
    // 歳差は u に比例して積み上がるので、束は描き進むほど開く。
    const amplitude = RADIUS * Math.exp(-fig.decay * progress);
    const localX = Math.sin((fig.a + fig.detune) * u + offset) * amplitude * fig.ax;
    const localY = Math.sin(fig.b * u) * amplitude * fig.ay;
    const x = centerX + localX * cosine - localY * sine;
    const y = centerY + localX * sine + localY * cosine;

    // インクは進んだ距離に比例させる。折り返しで速度が落ちても濃くなりすぎない。
    if (i > 0) splat((x + previousX) / 2, (y + previousY) / 2, Math.hypot(x - previousX, y - previousY) * INK);
    previousX = x;
    previousY = y;
  }
}

export function draw(api) {
  canvas.fill(0);

  // 全セル共通の位相。これ1つで16個の図形が同時に変形する。
  const phi = (api.time() / PERIOD) * TAU;

  for (let index = 0; index < FIGURES.length; index += 1) {
    // セルごとに 1/16 周ずつ位相をずらす。周期は共通のまま、
    // 盤面には同じ変形の16の段階が同時に並ぶ。
    const offset = (index / FIGURES.length) * TAU;
    trace(FIGURES[index], (index % GRID) * CELL, Math.floor(index / GRID) * CELL, phi + offset);
  }

  // セルの境目。図形の余白（各セルの端1px）にだけ乗る。
  if (GRID_DIM > 0) {
    for (let i = 0; i < 64; i += 1) {
      for (let g = 1; g < GRID; g += 1) {
        canvas[i * 64 + (g * CELL - 1)] += GRID_DIM;
        canvas[(g * CELL - 1) * 64 + i] += GRID_DIM;
      }
    }
  }

  for (let y = 0; y < 64; y += 1) {
    for (let x = 0; x < 64; x += 1) {
      // 線が重なるほど明るく、しかし飽和して白飛びしない。
      const level = 1 - Math.exp(-canvas[y * 64 + x]);
      api.pixel(x, y, api.rgb(HUE[0] * level, HUE[1] * level, HUE[2] * level));
    }
  }
}
