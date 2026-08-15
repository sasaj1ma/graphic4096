#pragma once
#include "MatrixConfig.h"

// カクつきの原因を切り分けるための計測。LED_Art.ino の DIAGNOSTICS で切る。
//
// 見るべき数字は2つあり、混同すると原因を取り違える。
//
//   フレームレート   : スケッチが 1 秒に何枚絵を作れているか
//   リフレッシュレート: パネルが 1 秒に何回走査しているか
//
// 前者が 60 でも後者が 30 なら、絵はちらついて見える。
// 後者は描画速度と無関係で、色深度とクロックだけで決まる。

namespace diagnostics {

static uint32_t drawTotalUs = 0;
static uint32_t flipTotalUs = 0;
static uint32_t frameCount = 0;
static uint32_t reportAt = 0;

// drawPixelRGB888() 自体の速度を測る。ライブラリは 1 ピクセルごとに
// 色深度のビットプレーン全てを書き換えるため、ここが重いことがある。
inline void benchmarkPixelWrites() {
  const uint32_t start = micros();
  const int passes = 10;
  for (int pass = 0; pass < passes; pass++) {
    for (int y = 0; y < kMatrixHeight; y++) {
      for (int x = 0; x < kMatrixWidth; x++) {
        matrix->drawPixelRGB888(x, y, 128, 64, 200);
      }
    }
  }
  const uint32_t elapsed = micros() - start;
  const float perFrame = elapsed / static_cast<float>(passes) / 1000.0f;

  Serial.println();
  Serial.println(F("--- パネル書き込み速度 ---"));
  Serial.printf("4096 px の書き込み: %.2f ms\n", perFrame);
  Serial.printf("これだけで上限     : %.0f fps\n", 1000.0f / perFrame);
  Serial.println(F("ここが 16 ms を超えていれば、原因は描画ではなくライブラリ側。"));
}

inline void begin() {
  Serial.println();
  Serial.println(F("=== 診断 ==="));
  // ライブラリが実際に達成しているパネル走査回数。
  // このメンバが無いバージョンなら、次の 2 行をコメントアウトする。
  Serial.printf("リフレッシュレート: %d Hz\n", matrix->calculated_refresh_rate);
  Serial.println(F("60 Hz を下回っていれば、ちらつきの原因はここ。色深度を下げる。"));
  benchmarkPixelWrites();
  Serial.println();
  Serial.println(F("--- 毎秒の内訳 ---"));
  reportAt = millis() + 1000;
}

inline void record(uint32_t drawUs, uint32_t flipUs) {
  drawTotalUs += drawUs;
  flipTotalUs += flipUs;
  frameCount++;

  const uint32_t now = millis();
  if (static_cast<int32_t>(now - reportAt) < 0) return;

  if (frameCount > 0) {
    Serial.printf("%3lu fps   描画 %5.2f ms   フリップ %5.2f ms\n",
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
