#pragma once
#include "MatrixConfig.h"

// 右端の列が明るい症状を切り分けるための固定パターン。
// LED_Art.ino の ACTIVE_SKETCH を 7 にすると出る。
//
// 3 秒ごとに 2 つの画面を交互に出す。どちらで症状が出るかで原因が分かれる。
//
//   [全黒] 何も描かない。ここで右端が光るなら、データではなく
//          消灯(OE)の問題。LATCH_BLANKING か driver を疑う。
//
//   [目印] 左端(0 列)が赤、右から 2 番目(62 列)が緑、右端(63 列)は黒。
//          緑が右端に出ているなら 1 px ずれており、clkphase を疑う。
//          緑が 62 列にあり右端だけ光るなら、やはり消灯の問題。

namespace testpattern {

constexpr uint32_t kPhaseMs = 3000;
static bool lastWasBlank = false;
static bool firstRun = true;

}  // namespace testpattern

inline void drawTestPattern(float time) {
  using namespace testpattern;

  const bool blank = (static_cast<uint32_t>(time * 1000) / kPhaseMs) % 2 == 0;

  if (blank != lastWasBlank || firstRun) {
    Serial.println(blank
      ? F("[全黒] 右端が光る → 消灯(OE)の問題。LATCH_BLANKING を上げるか driver を変える")
      : F("[目印] 緑が右端に出る → 1 px ずれ。clkphase を反転する"));
    lastWasBlank = blank;
    firstRun = false;
  }

  for (int y = 0; y < kMatrixHeight; y++) {
    for (int x = 0; x < kMatrixWidth; x++) {
      pixel(x, y, rgb(0, 0, 0));
    }
  }
  if (blank) return;

  for (int y = 0; y < kMatrixHeight; y++) {
    pixel(0, y, rgb(255, 0, 0));                    // 左端の基準
    pixel(kMatrixWidth - 2, y, rgb(0, 255, 0));     // 右から 2 番目
    // 右端(kMatrixWidth - 1)は黒のまま。ここが光れば異常。
  }
}
