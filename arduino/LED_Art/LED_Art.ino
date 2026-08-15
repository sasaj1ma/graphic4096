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

// 計算を一切せず、定数色を 4096 px 書くだけにかかる時間。
// drawPlasma の時間からこれを引いた分が、スケッチ側の計算にあたる。
// どちらが支配的なのかは、この 1 つの数字で決まる。
static void reportPanelWriteCost() {
  const int passes = 5;
  const uint32_t start = micros();
  for (int pass = 0; pass < passes; pass++) {
    for (int y = 0; y < kMatrixHeight; y++) {
      for (int x = 0; x < kMatrixWidth; x++) {
        matrix->drawPixelRGB888(x, y, 128, 64, 200);
      }
    }
  }
  const float ms = (micros() - start) / static_cast<float>(passes) / 1000.0f;
  Serial.printf("CPU %lu MHz / 色深度 %d bit / リフレッシュ %d Hz\n",
                (unsigned long)getCpuFrequencyMhz(), PIXEL_COLOR_DEPTH_BITS,
                matrix->calculated_refresh_rate);
  Serial.printf("パネル書き込みのみ: %.1f ms (4096 px, 計算なし)\n", ms);
}

void setup() {
  Serial.begin(115200);
  matrixReady = beginMatrix();
#if REPORT_FPS
  if (matrixReady) reportPanelWriteCost();
#endif
}

void loop() {
  if (!matrixReady) {
    Serial.println("matrix not initialised");
    delay(2000);
    return;
  }

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
#else
  #error "ACTIVE_SKETCH must be a number from 1 to 6."
#endif

  // 描画とフリップを分けて測る。flipDMABuffer() は表示中のバッファが
  // 空くまで待つので、パネルの走査が遅いとここで時間を食う。
  const uint32_t drawUs = micros() - drawStartUs;
  const uint32_t flipStartUs = micros();
  endFrame(); // 完成したフレームを表バッファへ入れ替える。
  const uint32_t flipUs = micros() - flipStartUs;

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
  static uint32_t drawTotalUs = 0;
  static uint32_t flipTotalUs = 0;
  frames++;
  drawTotalUs += drawUs;
  flipTotalUs += flipUs;
  if (millis() >= reportAt) {
    if (reportAt != 0 && frames > 0) {
      Serial.printf("sketch %d: %lu frames/s, draw %.1f ms, flip %.1f ms\n",
                    ACTIVE_SKETCH, (unsigned long)frames,
                    drawTotalUs / frames / 1000.0f,
                    flipTotalUs / frames / 1000.0f);
    }
    frames = 0;
    drawTotalUs = 0;
    flipTotalUs = 0;
    reportAt = millis() + 1000;
  }
#endif
}
