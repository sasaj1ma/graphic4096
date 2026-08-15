#pragma once
#include "MatrixConfig.h"

// Port of sketches/plasma.js.
//
// 素直に 1 ピクセルずつ書くと、1 フレームに sinf() が約 41,000 回入る。
// 内訳は波が 2 回 x 4096 px、noise3() の中の hashNoise() が 8 回 x 4096 px。
// このチップでは 1 フレームに 30 ms 前後かかり、60 fps には届かない。
//
// ただし、実際に必要な値の種類はごく少ない。
//   波   : sinf(x * 0.17 + t) は x が 64 通りしかない（y 方向も同じ）
//   ノイズ: 格子点は x, y とも 0 .. 63 * 0.09 = 5.67 に収まるので 7 x 7、
//           z 方向は zi と zi+1 の 2 枚だけ
// そこでフレームの先頭で表を作り、各ピクセルでは補間だけを行う。
// sinf() は約 41,000 回から 256 回に減る。出力は元の実装と同じ。
// LissajousGrid.h が expf() をテーブル化しているのと同じ考え方。

namespace plasma {

constexpr float kNoiseFreq = 0.09f;
// 63 * 0.09 = 5.67 なので格子点は 0 .. 6 の 7 個。切り上げて 8 個確保する。
constexpr int kLattice = 8;

static float waveX[kMatrixWidth];         // sinf(x * 0.17 + t)
static float waveY[kMatrixHeight];        // sinf(y * 0.14 - t * 1.3)
static int   cellX[kMatrixWidth];         // ノイズ格子の左端
static float fracX[kMatrixWidth];         // 補間係数（smooth 済み）
static int   cellY[kMatrixHeight];
static float fracY[kMatrixHeight];
static float slice0[kLattice][kLattice];  // z = zi   の格子面
static float slice1[kLattice][kLattice];  // z = zi+1 の格子面
static float column[kLattice];            // y と z を畳んだ、行ごとの一時値

// paletteNeon() は 1 フレームに 4096 回呼ばれ、そのたびに色表の補間と
// float から uint8 への丸めを 3 チャンネル分やり直している。
// 出力はどのみち 8 bit なので、512 段に量子化して引くだけにする。
// 誤差は 1/255 未満で目には出ない。LissajousGrid.h の expf 対策と同じ。
constexpr int kPaletteSteps = 512;
static Rgb paletteLut[kPaletteSteps];
static bool paletteReady = false;

inline void buildPalette() {
  for (int i = 0; i < kPaletteSteps; i++) {
    paletteLut[i] = paletteNeon(i / static_cast<float>(kPaletteSteps - 1));
  }
  paletteReady = true;
}

}  // namespace plasma

inline void drawPlasma(float time) {
  using namespace plasma;

  if (!paletteReady) buildPalette();

  // ---- フレームに 1 度だけ計算する ----

  for (int x = 0; x < kMatrixWidth; x++) {
    waveX[x] = sinf(x * 0.17f + time);
    const float position = x * kNoiseFreq;
    const int cell = static_cast<int>(floorf(position));
    cellX[x] = cell;
    fracX[x] = smooth(position - cell);
  }

  for (int y = 0; y < kMatrixHeight; y++) {
    waveY[y] = sinf(y * 0.14f - time * 1.3f);
    const float position = y * kNoiseFreq;
    const int cell = static_cast<int>(floorf(position));
    cellY[y] = cell;
    fracY[y] = smooth(position - cell);
  }

  const float z = time * 0.25f;
  const int zi = static_cast<int>(floorf(z));
  const float tz = smooth(z - zi);
  for (int j = 0; j < kLattice; j++) {
    for (int i = 0; i < kLattice; i++) {
      slice0[j][i] = hashNoise(i, j, zi);
      slice1[j][i] = hashNoise(i, j, zi + 1);
    }
  }

  // ---- ピクセル単位 ----

  for (int y = 0; y < kMatrixHeight; y++) {
    // 3 次元補間のうち y と z は行の中で一定なので、先に畳んでおく。
    // ピクセルごとに残るのは x 方向の補間 1 回だけになる。
    // 3 重線形補間は軸の順序を入れ替えても同じ値になるため、結果は変わらない。
    const int   j  = cellY[y];
    const float ty = fracY[y];
    for (int i = 0; i < kLattice - 1; i++) {
      const float near = mixf(slice0[j][i], slice0[j + 1][i], ty);
      const float far  = mixf(slice1[j][i], slice1[j + 1][i], ty);
      column[i] = mixf(near, far, tz);
    }

    const float waveOfRow = waveY[y];
    for (int x = 0; x < kMatrixWidth; x++) {
      const float cloud = mixf(column[cellX[x]], column[cellX[x] + 1], fracX[x]);
      const float wave = waveX[x] + waveOfRow;
      const float value = unitClamp(0.5f + wave * 0.15f + (cloud - 0.5f) * 0.9f);
      // value は unitClamp 済みなので 0 .. kPaletteSteps-1 に必ず収まる。
      const Rgb& color = paletteLut[static_cast<int>(value * (kPaletteSteps - 1) + 0.5f)];
      // x, y はループの範囲内。pixel() の境界判定は毎回同じ結果になるので通さない。
      matrix->drawPixelRGB888(x, y, color.r, color.g, color.b);
    }
  }
}
