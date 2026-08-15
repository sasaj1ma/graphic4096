// 64 x 64 HUB75 LED Art for Freenove ESP32-S3 Board Lite.
// Change ACTIVE_SKETCH, then upload this one file from Arduino IDE.
// 1 = plasma, 2 = rain, 3 = portrait, 4 = approach, 5 = eye of sauron,
// 6 = lissajous grid
#define ACTIVE_SKETCH 1

#include "MatrixConfig.h"
#include "Plasma.h"
#include "Rain.h"
#include "Portrait.h"
#include "Approach.h"
#include "EyeOfSauron.h"
#include "LissajousGrid.h"

// 実測フレームレートを1秒ごとにシリアルへ出す。ブラウザとの体感差は
// ほとんどここに出るので、まずこの数字を見る。
#define REPORT_FPS 1

static bool matrixReady = false;

void setup() {
  Serial.begin(115200);
  matrixReady = beginMatrix();
}

void loop() {
  if (!matrixReady) {
    Serial.println("matrix not initialised");
    delay(2000);
    return;
  }

  const uint32_t frameStart = millis();
  const float time = frameStart / 1000.0f;

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
#else
  #error "ACTIVE_SKETCH must be a number from 1 to 6."
#endif

  endFrame(); // 完成したフレームを表バッファへ入れ替える。

  // 旧コードは描画時間に 16 ms を「足して」いたので、描画に 150 ms かかる
  // スケッチでは周期が 166 ms になっていた。目標周期から実描画時間を引く。
  constexpr uint32_t kFramePeriodMs = 16; // 約 60 fps
  const uint32_t elapsed = millis() - frameStart;
  if (elapsed < kFramePeriodMs) {
    delay(kFramePeriodMs - elapsed);
  }

#if REPORT_FPS
  static uint32_t frames = 0;
  static uint32_t reportAt = 0;
  static uint32_t busyMs = 0;
  frames++;
  busyMs += elapsed;
  if (millis() >= reportAt) {
    if (reportAt != 0) {
      Serial.printf("sketch %d: %lu fps, draw %lu ms/frame\n",
                    ACTIVE_SKETCH, (unsigned long)frames,
                    (unsigned long)(frames ? busyMs / frames : 0));
    }
    frames = 0;
    busyMs = 0;
    reportAt = millis() + 1000;
  }
#endif
}
