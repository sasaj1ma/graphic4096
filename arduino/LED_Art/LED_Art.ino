// 64 x 64 HUB75 LED Art for Freenove ESP32-S3 Board Lite.
// Change ACTIVE_SKETCH, then upload this one file from Arduino IDE.
// 1 = plasma, 2 = rain, 3 = portrait, 4 = approach, 5 = eye of sauron,
// 6 = lissajous grid, 7 = test pattern (右端の症状の切り分け用)
#define ACTIVE_SKETCH 1

// 1 にすると、シリアルモニタ(115200)に fps とパネルの走査回数を出す。
// 原因の切り分けが済んだら 0 に戻す。
#define DIAGNOSTICS 1

#include "MatrixConfig.h"
#include "Diagnostics.h"
#include "Plasma.h"
#include "Rain.h"
#include "Portrait.h"
#include "Approach.h"
#include "EyeOfSauron.h"
#include "LissajousGrid.h"
#include "TestPattern.h"

void setup() {
  Serial.begin(115200);
  beginMatrix();
#if DIAGNOSTICS
  diagnostics::begin();
#endif
}

void loop() {
  constexpr uint32_t kFrameMs = 16; // approximately 60 fps
  const uint32_t frameStart = millis();
  const float time = frameStart / 1000.0f;
  const uint32_t drawStartUs = micros();

#if ACTIVE_SKETCH == 1
  drawPlasma(time);
#elif ACTIVE_SKETCH == 2
  drawRain(time);
#elif ACTIVE_SKETCH == 3
  drawPortrait();
#elif ACTIVE_SKETCH == 4
  drawApproach(time);
#elif ACTIVE_SKETCH == 5
  drawEyeOfSauron(time);
#elif ACTIVE_SKETCH == 6
  drawLissajousGrid(time);
#elif ACTIVE_SKETCH == 7
  drawTestPattern(time);
#else
  #error "ACTIVE_SKETCH must be a number from 1 to 7."
#endif

  const uint32_t drawUs = micros() - drawStartUs;
  const uint32_t flipStartUs = micros();
  flipFrame(); // 描き上がった裏面を表に出す
  const uint32_t flipUs = micros() - flipStartUs;

#if DIAGNOSTICS
  diagnostics::record(drawUs, flipUs);
#else
  (void)drawUs; (void)flipUs;
#endif

  // delay(16) を固定で入れると、実際のフレーム間隔は 16 ms + 描画時間になり、
  // 描画が重いスケッチほど遅く、かつ間隔が不揃いになる。
  // 描画にかかった分を差し引いて、上限を 60 fps に保つ。
  const uint32_t elapsed = millis() - frameStart;
  if (elapsed < kFrameMs) delay(kFrameMs - elapsed);
}
