// ノイズで図形を汚すための道具箱。複数のスケッチが使う。
//
// この盤面での共通の掟がひとつある。ノイズは必ず図形の濃さに掛けること。
// 足してしまうと図形のない場所まで一斉に光り、地が汚れる。掛けるかぎり、
// 0 に何を掛けても 0 なので、地は黒いまま残る。
//
// createVeil はそのうちの1つ「削って明滅させる薄膜」をまとめたもの:
//   setMask(mask, bloom) — 0/1 の size×size。図形が変わったときだけ呼ぶ（重い）
//   update(api, time, reveal) — 毎フレーム1回。reveal 1 で最もよく見える
//   sample(x, y) — その画素の明るさ 0〜1

const SIZE = 64;              // 盤面の既定の一辺。32 などの小さな区画にも使える。
const CELL = 4;               // 粗いノイズの格子の間隔（画素）。斑の大きさを決める。

const scratch = new Float32Array(SIZE * SIZE);

export const clampUnit = (value) => (value < 0 ? 0 : value > 1 ? 1 : value);
export const smoothstep = (edge0, edge1, value) => {
  const t = clampUnit((value - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
};

// 画素ごとの粒。整数ハッシュなので三角関数を通らず、毎コマ全画素引いても軽い。
// 3つの引数はどれも単なる種で、画素以外の用途（帯番号など）にも使える。
export function grainAt(x, y, frame) {
  let hash = Math.imul(x + 1, 374761393) ^ Math.imul(y + 1, 668265263) ^ Math.imul(frame + 1, 1274126177);
  hash = Math.imul(hash ^ (hash >>> 13), 1274126177);
  return ((hash ^ (hash >>> 16)) >>> 0) / 4294967296;
}

// 平均化を縦横に1回ずつ。これを2度かけると、にじみがガウスに近い形になる。
export function soften(buffer, radius, size = SIZE) {
  if (radius < 1) return;
  const span = radius * 2 + 1;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let sum = 0;
      for (let d = -radius; d <= radius; d += 1) {
        const sx = x + d;
        if (sx >= 0 && sx < size) sum += buffer[y * size + sx];
      }
      scratch[y * size + x] = sum / span;
    }
  }
  for (let x = 0; x < size; x += 1) {
    for (let y = 0; y < size; y += 1) {
      let sum = 0;
      for (let d = -radius; d <= radius; d += 1) {
        const sy = y + d;
        if (sy >= 0 && sy < size) sum += scratch[sy * size + x];
      }
      buffer[y * size + x] = sum / span;
    }
  }
}

// 最大値を 1 に戻す。にじみで下がった山を戻し、図形の大きさが変わっても濃さが揃う。
export function normalize(buffer) {
  let peak = 0;
  for (let i = 0; i < buffer.length; i += 1) if (buffer[i] > peak) peak = buffer[i];
  if (peak > 0) for (let i = 0; i < buffer.length; i += 1) buffer[i] /= peak;
}

// 場を実数座標で読む。盤面の外は 0 なので、ずらして読んでも地は暗いまま。
export function sampleField(field, x, y, size = SIZE) {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const tx = x - x0;
  const ty = y - y0;
  const at = (px, py) => (px < 0 || px >= size || py < 0 || py >= size ? 0 : field[py * size + px]);
  const top = at(x0, y0) + (at(x0 + 1, y0) - at(x0, y0)) * tx;
  const bottom = at(x0, y0 + 1) + (at(x0 + 1, y0 + 1) - at(x0, y0 + 1)) * tx;
  return top + (bottom - top) * ty;
}

export function createVeil(options = {}) {
  const {
    size = SIZE,       // 盤面の一辺。区画ごとに薄膜を張るときは 32 などを渡す。
    turbulence = 0.85, // ノイズが図形を削る深さ。0 にすると輪郭のまま出入りする。
    contrast = 1.6,    // ノイズの濃淡の開き。1 で素のまま、大きいほど斑がはっきり抜ける。
    edge = 0.2,        // しきい値のまたぎ幅。大きいほど滲んだ発光になる。
    halo = 0.35,       // 図形のまわりへ広がる光の強さ。0 にすると発光が消える。
    flicker = 0.3,     // 全体が明滅する深さ。見えたり見えなかったりの揺れ。
    grain = 0.3,       // 図形に乗る粒の強さ。
    dust = 0.18,       // 地に散る粒の強さ。0 にすると背景は真っ黒になる。
    grainFps = 24,     // 粒を引き直す速さ。低いほどフィルムらしくざらつく。
    floor = 0.2        // しきい値の下限。これ以上下げると地のノイズまで光り出す。
  } = options;

  // 斑の大きさは盤面の割合ではなく画素で決める。区画を小さくしても粒立ちは変わらない。
  const low = Math.round(size / CELL) + 1;
  const step = size / (low - 1);

  // 削られるのは terrain。glow は同じ図形を大きくぼかしたもので、暗く足すだけなので
  // 字画を太らせずに光だけ広がる。
  const terrain = new Float32Array(size * size);
  const glow = new Float32Array(size * size);
  const blotch = new Float32Array(low * low);

  let level = 1.4;
  let reveal = 0;
  let frame = 0;

  function blotchAt(x, y) {
    const fx = x / step;
    const fy = y / step;
    const gx = Math.min(low - 2, Math.floor(fx));
    const gy = Math.min(low - 2, Math.floor(fy));
    const tx = fx - gx;
    const ty = fy - gy;
    const top = blotch[gy * low + gx] + (blotch[gy * low + gx + 1] - blotch[gy * low + gx]) * tx;
    const bottom = blotch[(gy + 1) * low + gx] + (blotch[(gy + 1) * low + gx + 1] - blotch[(gy + 1) * low + gx]) * tx;
    return top + (bottom - top) * ty;
  }

  return {
    // 図形を入れ替える。bloom は光がにじむ半径で、字画が太いほど大きく取る。
    setMask(mask, bloom = 3) {
      for (let i = 0; i < terrain.length; i += 1) terrain[i] = mask[i] ? 1 : 0;

      // 光は字画より先に広がる。だから大きくぼかした写しを先に取る。
      glow.set(terrain);
      soften(glow, bloom, size);
      soften(glow, bloom, size);
      normalize(glow);

      // 地形のほうは軽くだけ。ここを強くぼかすと字間が埋まって語が1本の帯になる。
      soften(terrain, 1, size);
      normalize(terrain);
    },

    update(api, time, amount) {
      reveal = clampUnit(amount);

      // 全体の明滅。遅い息と速いどもりを混ぜ、中央から開いて振れ幅を出す。
      // 素の値ノイズは 0.5 付近に寄っていて、そのままでは端まで振れない。
      const slow = api.noise(time * 0.55, 3.5, 0);
      const fast = api.noise(time * 2.2, 9.2, 0);
      const swing = clampUnit((slow * 0.6 + fast * 0.4 - 0.5) * 2.4 + 0.5);
      const waver = (swing - 0.5) * 2 * flicker;
      // 谷では図形が読み切れる高さまで下がり、揺れが上へ振れたときだけノイズに食われる。
      level = Math.max(floor, 1.32 - reveal * 1.12 + waver);

      for (let gy = 0; gy < low; gy += 1) {
        for (let gx = 0; gx < low; gx += 1) {
          const nx = gx * 0.28;
          const ny = gy * 0.28;
          // 3段の重ね合わせ。大きな塊の上に細かい欠けが乗る。
          let value = api.noise(nx, ny, time * 0.25);
          value += 0.5 * api.noise(nx * 2 + 11, ny * 2, time * 0.4);
          value += 0.25 * api.noise(nx * 4, ny * 4 + 7, time * 0.65);
          // 中央から開いて濃淡を強める。素の値ノイズは 0.5 付近に寄っていて斑が出ない。
          blotch[gy * low + gx] = clampUnit((value / 1.75 - 0.5) * contrast + 0.5);
        }
      }

      frame = Math.floor(time * grainFps);
    },

    sample(x, y) {
      const index = y * size + x;
      const cloud = blotchAt(x, y);
      // 図形の輪郭ではなく、削り残った高さがしきい値をまたぐ。
      const height = terrain[index] * (1 - turbulence * (1 - cloud));
      const lit = smoothstep(level - edge, level + edge, height);

      // 光の裾。芯と同じノイズで濃淡がつくので、にじみも一緒に息をする。
      const bloom = glow[index] * halo * reveal * (0.35 + 0.65 * cloud);

      const speck = grainAt(x, y, frame);
      // 図形は粒でざらつき、地には暗い粒が散る。粒を2乗して、たまに強く光らせる。
      return clampUnit(
        lit * (1 - grain + grain * speck) + bloom * (1 - lit) + (1 - lit) * dust * speck * speck
      );
    }
  };
}
