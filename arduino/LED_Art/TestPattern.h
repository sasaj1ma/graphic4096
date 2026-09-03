#pragma once
#include "MatrixConfig.h"

// 上半分と下半分で列がずれる症状を読むための固定パターン。
// LED_Art.ino の ACTIVE_SKETCH を 7 にすると出る。
//
// 64x64 の HUB75 は 1/32 スキャンで、上半分を R1/G1/B1、下半分を R2/G2/B2 と、
// 別々のデータ線で同時に駆動する。つまり上下は独立にずれうる。
// そこで上半分を赤、下半分を青で描き分ける。境目(y=32)で色が横にずれていれば、
// その2系統のタイミングが揃っていない。
//
//   1. 全黒            何も光らない
//   2. 4 列おき        赤と青が縦一直線なら正常。段差があればそこがずれ。
//                      左から見て何列目で段差が始まるかを読む
//   3. 単独 62 列      赤と青が同じ列に来るか
//   4. 単独 63 列      パネルの最後の列
//
// 段差が右側だけに出るなら、クロックを送るほど誤差が溜まっている。
// CLK_PHASE の反転、I2S_CLOCK の引き下げ、配線の見直しの順に試す。

namespace testpattern {

constexpr uint32_t kPhaseMs = 4000;
constexpr int kPhaseCount = 4;
static int lastPhase = -1;

inline void fillBlack() {
  for (int y = 0; y < kMatrixHeight; y++) {
    for (int x = 0; x < kMatrixWidth; x++) pixel(x, y, rgb(0, 0, 0));
  }
}

// 上半分は赤、下半分は青。駆動している線が違うので、色で系統を見分けられる。
inline void drawSplitColumn(int x) {
  const int half = kMatrixHeight / 2;
  for (int y = 0; y < half; y++) pixel(x, y, rgb(220, 0, 0));
  for (int y = half; y < kMatrixHeight; y++) pixel(x, y, rgb(0, 0, 220));
}

}  // namespace testpattern

inline void drawTestPattern(float time) {
  using namespace testpattern;

  const int phase =
    (static_cast<uint32_t>(time * 1000) / kPhaseMs) % kPhaseCount;

  if (phase != lastPhase) {
    switch (phase) {
      case 0: Serial.println(F("[1] 全黒       期待: 何も光らない")); break;
      case 1: Serial.println(F("[2] 4 列おき   期待: 赤と青が縦一直線。段差はどの列から?")); break;
      case 2: Serial.println(F("[3] 単独 62 列 期待: 赤と青が同じ列")); break;
      case 3: Serial.println(F("[4] 単独 63 列 期待: 赤と青が同じ列(右端)")); break;
    }
    lastPhase = phase;
  }

  fillBlack();

  switch (phase) {
    case 1:
      for (int x = 0; x < kMatrixWidth; x += 4) drawSplitColumn(x);
      break;
    case 2: drawSplitColumn(kMatrixWidth - 2); break;
    case 3: drawSplitColumn(kMatrixWidth - 1); break;
    default: break;  // 全黒
  }
}
