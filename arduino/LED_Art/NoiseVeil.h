#pragma once
#include "MatrixConfig.h"

// src/noise-veil.js の移植。ノイズで図形を汚すための道具箱。
//
// 掟はブラウザ版と同じ。ノイズは必ず図形の濃さに掛ける。足してしまうと図形のない場所まで
// 一斉に光って地が汚れるが、掛けるかぎり 0 に何を掛けても 0 なので、地は黒いまま残る。
//
// ブラウザとの一致はここで2つに分かれる。粒（grainAt）は整数ハッシュなので、値まで
// そのまま一致する。斑（update の中）は noise3 を float で回すので、同じ性格の斑になるが
// 同じ画素には落ちない。1コマに 245 回呼ぶため noise3Exact は使えない（double はこの
// チップではソフトウェア演算）。斑の位置が揃わなくても絵の性格は変わらないので、ここは float でよい。

constexpr int kVeilMax = 32;                            // 薄膜を張れる一辺の上限。coys の区画が32
constexpr int kVeilCell = 4;                            // 粗いノイズの格子の間隔（画素）。斑の大きさ
constexpr int kVeilLow = kVeilMax / kVeilCell + 1;      // 斑の格子の一辺の上限

// soften の途中結果。縦横に1回ずつかけるので、1枚だけ場所を借りる。
static float veilScratch[kVeilMax * kVeilMax];

inline float smoothstep(float edge0, float edge1, float value) {
  const float t = unitClamp((value - edge0) / (edge1 - edge0));
  return t * t * (3.0f - 2.0f * t);
}

// 画素ごとの粒。JS の Math.imul と同じ 32bit の巻き戻し乗算なので、値までブラウザと一致する。
// 3つの引数はどれも単なる種で、画素以外の用途（帯番号など）にも使える。
inline float grainAt(int x, int y, int frame) {
  uint32_t hash = static_cast<uint32_t>(x + 1) * 374761393u
                ^ static_cast<uint32_t>(y + 1) * 668265263u
                ^ static_cast<uint32_t>(frame + 1) * 1274126177u;
  hash = (hash ^ (hash >> 13)) * 1274126177u;
  return (hash ^ (hash >> 16)) / 4294967296.0f;
}

// 平均化を縦横に1回ずつ。これを2度かけると、にじみがガウスに近い形になる。
inline void soften(float* buffer, int radius, int size) {
  if (radius < 1) return;
  const float span = radius * 2 + 1;
  for (int y = 0; y < size; y++) {
    for (int x = 0; x < size; x++) {
      float sum = 0;
      for (int d = -radius; d <= radius; d++) {
        const int sx = x + d;
        if (sx >= 0 && sx < size) sum += buffer[y * size + sx];
      }
      veilScratch[y * size + x] = sum / span;
    }
  }
  for (int x = 0; x < size; x++) {
    for (int y = 0; y < size; y++) {
      float sum = 0;
      for (int d = -radius; d <= radius; d++) {
        const int sy = y + d;
        if (sy >= 0 && sy < size) sum += veilScratch[sy * size + x];
      }
      buffer[y * size + x] = sum / span;
    }
  }
}

// 最大値を 1 に戻す。にじみで下がった山を戻し、図形の大きさが変わっても濃さが揃う。
inline void normalizeField(float* buffer, int count) {
  float peak = 0;
  for (int i = 0; i < count; i++) if (buffer[i] > peak) peak = buffer[i];
  if (peak > 0) for (int i = 0; i < count; i++) buffer[i] /= peak;
}

// 場を実数座標で読む。盤面の外は 0 なので、ずらして読んでも地は暗いまま。
inline float sampleField(const float* field, float x, float y, int size) {
  const int x0 = static_cast<int>(floorf(x));
  const int y0 = static_cast<int>(floorf(y));
  const float tx = x - x0;
  const float ty = y - y0;
  const auto at = [field, size](int px, int py) -> float {
    return (px < 0 || px >= size || py < 0 || py >= size) ? 0.0f : field[py * size + px];
  };
  const float top = at(x0, y0) + (at(x0 + 1, y0) - at(x0, y0)) * tx;
  const float bottom = at(x0, y0 + 1) + (at(x0 + 1, y0 + 1) - at(x0, y0 + 1)) * tx;
  return top + (bottom - top) * ty;
}

// 削って明滅させる薄膜。createVeil の移植。
//   setMask(mask, bloom) — 0/1 の size×size。図形が変わったときだけ呼ぶ（重い）
//   update(time, reveal) — 毎フレーム1回。reveal 1 で最もよく見える
//   sample(x, y) — その画素の明るさ 0〜1
struct Veil {
  // createVeil の options と同じ。既定値はこの宣言に書いてある。
  int size = kVeilMax;      // 区画ごとに張るときは 32 などを入れる
  float turbulence = 0.85f; // ノイズが図形を削る深さ。0 で輪郭のまま出入りする
  float contrast = 1.6f;    // 斑の濃淡の開き
  float edge = 0.2f;        // しきい値のまたぎ幅。大きいほど滲んだ発光になる
  float halo = 0.35f;       // 図形のまわりへ広がる光の強さ
  float flicker = 0.3f;     // 全体が明滅する深さ
  float grain = 0.3f;       // 図形に乗る粒の強さ
  float dust = 0.18f;       // 地に散る粒の強さ。0 で背景は真っ黒になる
  float grainFps = 24.0f;   // 粒を引き直す速さ
  float floorLevel = 0.2f;  // しきい値の下限。JS の floor。C の floor() と名がぶつかるので改名した

  // 削られるのは terrain。glow は同じ図形を大きくぼかしたもので、暗く足すだけなので
  // 字画を太らせずに光だけ広がる。
  float terrain[kVeilMax * kVeilMax];
  float glow[kVeilMax * kVeilMax];
  float blotch[kVeilLow * kVeilLow];

  int low = kVeilLow;
  float step = kVeilCell;
  float level = 1.4f;
  float reveal = 0;
  int frame = 0;

  // 図形を入れ替える。bloom は光がにじむ半径で、字画が太いほど大きく取る。
  void setMask(const uint8_t* mask, int bloom) {
    // 斑の大きさは盤面の割合ではなく画素で決める。区画を小さくしても粒立ちは変わらない。
    low = static_cast<int>(roundf(size / static_cast<float>(kVeilCell))) + 1;
    step = size / static_cast<float>(low - 1);

    const int count = size * size;
    for (int i = 0; i < count; i++) terrain[i] = mask[i] ? 1.0f : 0.0f;

    // 光は字画より先に広がる。だから大きくぼかした写しを先に取る。
    memcpy(glow, terrain, sizeof(float) * count);
    soften(glow, bloom, size);
    soften(glow, bloom, size);
    normalizeField(glow, count);

    // 地形のほうは軽くだけ。ここを強くぼかすと字間が埋まって語が1本の帯になる。
    soften(terrain, 1, size);
    normalizeField(terrain, count);
  }

  void update(float time, float amount) {
    reveal = unitClamp(amount);

    // 全体の明滅。遅い息と速いどもりを混ぜ、中央から開いて振れ幅を出す。
    // 素の値ノイズは 0.5 付近に寄っていて、そのままでは端まで振れない。
    const float slow = noise3(time * 0.55f, 3.5f, 0);
    const float fast = noise3(time * 2.2f, 9.2f, 0);
    const float swing = unitClamp((slow * 0.6f + fast * 0.4f - 0.5f) * 2.4f + 0.5f);
    const float waver = (swing - 0.5f) * 2.0f * flicker;
    // 谷では図形が読み切れる高さまで下がり、揺れが上へ振れたときだけノイズに食われる。
    level = max(floorLevel, 1.32f - reveal * 1.12f + waver);

    for (int gy = 0; gy < low; gy++) {
      for (int gx = 0; gx < low; gx++) {
        const float nx = gx * 0.28f;
        const float ny = gy * 0.28f;
        // 3段の重ね合わせ。大きな塊の上に細かい欠けが乗る。
        float value = noise3(nx, ny, time * 0.25f);
        value += 0.5f * noise3(nx * 2 + 11, ny * 2, time * 0.4f);
        value += 0.25f * noise3(nx * 4, ny * 4 + 7, time * 0.65f);
        // 中央から開いて濃淡を強める。素の値ノイズは 0.5 付近に寄っていて斑が出ない。
        blotch[gy * low + gx] = unitClamp((value / 1.75f - 0.5f) * contrast + 0.5f);
      }
    }

    frame = static_cast<int>(time * grainFps);
  }

  float sample(int x, int y) const {
    const int index = y * size + x;
    const float cloud = blotchAt(x, y);
    // 図形の輪郭ではなく、削り残った高さがしきい値をまたぐ。
    const float height = terrain[index] * (1.0f - turbulence * (1.0f - cloud));
    const float lit = smoothstep(level - edge, level + edge, height);

    // 光の裾。芯と同じノイズで濃淡がつくので、にじみも一緒に息をする。
    const float bloom = glow[index] * halo * reveal * (0.35f + 0.65f * cloud);

    const float speck = grainAt(x, y, frame);
    // 図形は粒でざらつき、地には暗い粒が散る。粒を2乗して、たまに強く光らせる。
    return unitClamp(
      lit * (1.0f - grain + grain * speck) + bloom * (1.0f - lit) + (1.0f - lit) * dust * speck * speck
    );
  }

 private:
  float blotchAt(int x, int y) const {
    const float fx = x / step;
    const float fy = y / step;
    const int gx = min(low - 2, static_cast<int>(fx));
    const int gy = min(low - 2, static_cast<int>(fy));
    const float tx = fx - gx;
    const float ty = fy - gy;
    const float* upper = &blotch[gy * low + gx];
    const float* lower = &blotch[(gy + 1) * low + gx];
    const float top = upper[0] + (upper[1] - upper[0]) * tx;
    const float bottom = lower[0] + (lower[1] - lower[0]) * tx;
    return top + (bottom - top) * ty;
  }
};
