#pragma once
#include "MatrixConfig.h"
#include "Plasma.h"

// カクつきの原因を切り分けるための計測。LED_Art.ino の DIAGNOSTICS で切る。
//
// 見るべき数字は2種類あり、混同すると原因を取り違える。
//
//   フレームレート   : スケッチが 1 秒に何枚絵を作れているか（描画コード次第）
//   リフレッシュレート: パネルが 1 秒に何回走査しているか
//                      色深度と I2S クロックだけで決まり、描画を速くしても上がらない
//
// さらに 1 フレームの中身も2つに分かれる。
//
//   計算       : plasma の波とノイズ
//   書き込み   : drawPixelRGB888() を 4096 回
//
// 下の isolate() は書き込みだけを単独で測る。全体との差が計算のコストになるので、
// どちらが重いのかが 1 回の書き込みで確定する。

namespace diagnostics {

static uint32_t drawTotalUs = 0;
static uint32_t flipTotalUs = 0;
static uint32_t frameCount = 0;
static uint32_t reportAt = 0;

// 計算を一切せず、定数色を 4096 px 書くだけ。純粋なライブラリの書き込み速度。
inline float measurePixelWrites() {
  const int passes = 5;
  const uint32_t start = micros();
  for (int pass = 0; pass < passes; pass++) {
    for (int y = 0; y < kMatrixHeight; y++) {
      for (int x = 0; x < kMatrixWidth; x++) {
        matrix->drawPixelRGB888(x, y, 128, 64, 200);
      }
    }
  }
  return (micros() - start) / static_cast<float>(passes) / 1000.0f;
}

// 計算も書き込みも含む、実際の 1 フレーム。
inline float measureFullFrame() {
  const int passes = 5;
  const uint32_t start = micros();
  for (int pass = 0; pass < passes; pass++) drawPlasma(pass * 0.1f);
  return (micros() - start) / static_cast<float>(passes) / 1000.0f;
}

inline void begin() {
  Serial.println();
  Serial.println(F("================ 診断 ================"));

  // --- 環境 ---
  // CPU が 240 MHz でなければ、全てがその比率で遅くなる。
  Serial.printf("CPU         : %lu MHz\n", static_cast<unsigned long>(getCpuFrequencyMhz()));
  Serial.printf("色深度      : %d bit\n", PIXEL_COLOR_DEPTH_BITS);
  // 右端が明るい症状に効く設定。上げても消えないならクロックを下げる。
  Serial.printf("ラッチ消灯  : %d クロック (既定 2, 上限 4)\n", LATCH_BLANKING);
  Serial.printf("空きヒープ  : %lu バイト\n", static_cast<unsigned long>(ESP.getFreeHeap()));
  // ライブラリが実際に達成したパネル走査回数。
  Serial.printf("リフレッシュ: %d Hz\n", matrix->calculated_refresh_rate);
  Serial.println(F("  → 100 Hz 未満なら、ちらつきの原因はここ（色深度を下げる）"));

  // --- 1 フレームの内訳 ---
  const float writeMs = measurePixelWrites();
  const float fullMs = measureFullFrame();
  const float mathMs = fullMs - writeMs;

  Serial.println();
  Serial.println(F("---- 1 フレームの内訳 ----"));
  Serial.printf("書き込みのみ: %8.2f ms  (drawPixelRGB888 x 4096)\n", writeMs);
  Serial.printf("全体        : %8.2f ms  (drawPlasma)\n", fullMs);
  Serial.printf("差 = 計算   : %8.2f ms  (波とノイズ)\n", mathMs);
  Serial.println();
  Serial.printf("上限        : %8.1f fps\n", 1000.0f / fullMs);
  Serial.println();
  Serial.println(F("  書き込みが大半 → 原因はライブラリ側の書き込み方"));
  Serial.println(F("  計算が大半     → 原因は描画コード"));
  Serial.println(F("======================================"));
  Serial.println();

  reportAt = millis() + 1000;
}

inline void record(uint32_t drawUs, uint32_t flipUs) {
  drawTotalUs += drawUs;
  flipTotalUs += flipUs;
  frameCount++;

  const uint32_t now = millis();
  if (static_cast<int32_t>(now - reportAt) < 0) return;

  if (frameCount > 0) {
    Serial.printf("%3lu fps   描画 %7.2f ms   フリップ %7.2f ms\n",
                  static_cast<unsigned long>(frameCount),
                  drawTotalUs / static_cast<float>(frameCount) / 1000.0f,
                  flipTotalUs / static_cast<float>(frameCount) / 1000.0f);
  }
  drawTotalUs = 0;
  flipTotalUs = 0;
  frameCount = 0;
  reportAt = now + 1000;
}

}  // namespace diagnostics
