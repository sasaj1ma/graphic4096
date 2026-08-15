#pragma once
#include "MatrixConfig.h"

// 列の対応がずれる、1 本のはずの列が増えるといった症状を切り分ける固定パターン。
// LED_Art.ino の ACTIVE_SKETCH を 7 にすると出る。
//
// 4 秒ごとに 5 つの画面を順に出し、いま何を出しているかをシリアルに書く。
// 画面とシリアルを見比べて、指示した列が実際にどこへ出ているかを読む。
//
//   1. 全黒          何も描かない。ここで光れば消灯(OE)の問題
//   2. 単独 32 列    真ん中に 1 本。2 本に見えるなら症状は端に限らない
//   3. 単独 62 列    右から 2 番目に 1 本
//   4. 単独 63 列    右端に 1 本。パネルの最後の列
//   5. 4 列おき      0, 4, 8 ... 60。間隔が保たれているかを見る
//
// 単独の 1 本が 2 本に増えるなら、クロックが余分に数えられている。
// I2S_CLOCK を下げるか CLK_PHASE を反転して変化を見る。

namespace testpattern {

constexpr uint32_t kPhaseMs = 4000;
constexpr int kPhaseCount = 5;
static int lastPhase = -1;

inline void fillBlack() {
  for (int y = 0; y < kMatrixHeight; y++) {
    for (int x = 0; x < kMatrixWidth; x++) pixel(x, y, rgb(0, 0, 0));
  }
}

inline void drawColumn(int x, Rgb color) {
  for (int y = 0; y < kMatrixHeight; y++) pixel(x, y, color);
}

}  // namespace testpattern

inline void drawTestPattern(float time) {
  using namespace testpattern;

  const int phase =
    (static_cast<uint32_t>(time * 1000) / kPhaseMs) % kPhaseCount;

  if (phase != lastPhase) {
    switch (phase) {
      case 0: Serial.println(F("[1] 全黒        期待: 何も光らない")); break;
      case 1: Serial.println(F("[2] 単独 32 列  期待: 中央に 1 本だけ")); break;
      case 2: Serial.println(F("[3] 単独 62 列  期待: 右から 2 番目に 1 本だけ")); break;
      case 3: Serial.println(F("[4] 単独 63 列  期待: 右端に 1 本だけ")); break;
      case 4: Serial.println(F("[5] 4 列おき    期待: 等間隔に 16 本、右端は暗い")); break;
    }
    lastPhase = phase;
  }

  fillBlack();

  const Rgb white = rgb(200, 200, 200);
  switch (phase) {
    case 1: drawColumn(32, white); break;
    case 2: drawColumn(kMatrixWidth - 2, white); break;
    case 3: drawColumn(kMatrixWidth - 1, white); break;
    case 4:
      for (int x = 0; x < kMatrixWidth; x += 4) drawColumn(x, white);
      break;
    default: break;  // 全黒
  }
}
