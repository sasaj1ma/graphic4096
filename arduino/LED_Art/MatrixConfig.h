#pragma once

#include <Arduino.h>
#include <ESP32-HUB75-MatrixPanel-I2S-DMA.h>

constexpr int kMatrixWidth = 64;
constexpr int kMatrixHeight = 64;

// Match these GPIO numbers to the wires you connect to the HUB75 header.
// GPIO 19/20 are deliberately unused: this keeps the ESP32-S3 native USB free.
#define R1_PIN   4
#define G1_PIN   5
#define B1_PIN   6

#define R2_PIN   7
#define G2_PIN   8
#define B2_PIN   9

#define A_PIN    10
#define B_PIN    11
#define C_PIN    12
#define D_PIN    13
#define E_PIN    14

#define LAT_PIN  15
#define OE_PIN   16
#define CLK_PIN  17

#define PANEL_WIDTH  64
#define PANEL_HEIGHT 64
#define PANEL_CHAIN 1

// ---- パネル個体差の調整ダイヤル ----------------------------------------
// kClockPhase: データをクロックのどちらのエッジで取り込むか。右端(または左端)の
//   1列だけ明るい・ゴーストが出る場合はここを反転させる。まずこれを試す。
constexpr bool kClockPhase = false;

// kLatchBlanking: LAT を切り替える前後で OE を何クロック分止めるか。1〜4。
//   値を上げると列のにじみが消えるが、全体はわずかに暗くなる。
//   kClockPhase の反転で直らないときに 3 → 4 と上げる。
constexpr uint8_t kLatchBlanking = 2;

// kDoubleBuffer: 表示中のバッファに直接描くと、描画途中の絵がそのまま出る。
//   64x64 を毎フレーム全消し・全書き換えするこのスケッチ群では、これが
//   ちらつきの正体。裏バッファに描いて完成後に入れ替える。
constexpr bool kDoubleBuffer = true;

// kBusSpeed: パネルのリフレッシュレート。ちらつきが残るなら HZ_16M。
//   配線が長い・レベルシフタなしの場合は上げるとノイズが出ることがある。
constexpr HUB75_I2S_CFG::clk_speed kBusSpeed = HUB75_I2S_CFG::HZ_10M;

constexpr uint8_t kBrightness = 80;
// -----------------------------------------------------------------------

MatrixPanel_I2S_DMA* matrix = nullptr;

struct Rgb {
  uint8_t r;
  uint8_t g;
  uint8_t b;
};

inline uint8_t byteClamp(float value) {
  return static_cast<uint8_t>(constrain(static_cast<int>(value + 0.5f), 0, 255));
}

inline float unitClamp(float value) {
  return constrain(value, 0.0f, 1.0f);
}

inline void pixel(int x, int y, Rgb color) {
  if (x >= 0 && x < kMatrixWidth && y >= 0 && y < kMatrixHeight) {
    matrix->drawPixelRGB888(x, y, color.r, color.g, color.b);
  }
}

inline Rgb rgb(float r, float g, float b) {
  return {byteClamp(r), byteClamp(g), byteClamp(b)};
}

// Deterministic smooth value noise. It mirrors the browser sketch's role,
// rather than attempting to match its exact values pixel-for-pixel.
inline float hashNoise(int x, int y, int z) {
  const float value = sinf(x * 127.1f + y * 311.7f + z * 74.7f) * 43758.5453f;
  return value - floorf(value);
}

inline float smooth(float value) { return value * value * (3.0f - 2.0f * value); }
inline float mixf(float a, float b, float t) { return a + (b - a) * t; }
inline double smoothd(double value) { return value * value * (3.0 - 2.0 * value); }
inline double mixd(double a, double b, double t) { return a + (b - a) * t; }

inline float noise3(float x, float y = 0, float z = 0) {
  const int xi = floorf(x);
  const int yi = floorf(y);
  const int zi = floorf(z);
  const float tx = smooth(x - xi);
  const float ty = smooth(y - yi);
  const float tz = smooth(z - zi);
  const float a = mixf(hashNoise(xi, yi, zi), hashNoise(xi + 1, yi, zi), tx);
  const float b = mixf(hashNoise(xi, yi + 1, zi), hashNoise(xi + 1, yi + 1, zi), tx);
  const float c = mixf(hashNoise(xi, yi, zi + 1), hashNoise(xi + 1, yi, zi + 1), tx);
  const float d = mixf(hashNoise(xi, yi + 1, zi + 1), hashNoise(xi + 1, yi + 1, zi + 1), tx);
  return mixf(mixf(a, b, ty), mixf(c, d, ty), tz);
}

// Exact-match version of the noise above. The fractional part of a large product
// is thrown off by float rounding, so a sketch built on noise lands on different
// pixels than the browser preview showed. Running the same arithmetic in double
// reproduces the preview. This chip emulates double in software, so call it only
// where the call count is small; per-pixel use would collapse the frame rate.
inline double hashNoiseExact(int x, int y, int z) {
  const double value = sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453123;
  return value - floor(value);
}

inline float noise3Exact(double x, double y = 0, double z = 0) {
  const int xi = static_cast<int>(floor(x));
  const int yi = static_cast<int>(floor(y));
  const int zi = static_cast<int>(floor(z));
  const double tx = smoothd(x - xi);
  const double ty = smoothd(y - yi);
  const double tz = smoothd(z - zi);
  const double a = mixd(hashNoiseExact(xi, yi, zi), hashNoiseExact(xi + 1, yi, zi), tx);
  const double b = mixd(hashNoiseExact(xi, yi + 1, zi), hashNoiseExact(xi + 1, yi + 1, zi), tx);
  const double c = mixd(hashNoiseExact(xi, yi, zi + 1), hashNoiseExact(xi + 1, yi, zi + 1), tx);
  const double d = mixd(hashNoiseExact(xi, yi + 1, zi + 1), hashNoiseExact(xi + 1, yi + 1, zi + 1), tx);
  return static_cast<float>(mixd(mixd(a, b, ty), mixd(c, d, ty), tz));
}

inline Rgb paletteNeon(float value) {
  const Rgb colors[] = {{9, 6, 25}, {75, 23, 135}, {205, 38, 147}, {50, 225, 186}, {241, 252, 83}};
  value = unitClamp(value) * 4.0f;
  const int left = min(3, static_cast<int>(floorf(value)));
  const float amount = value - left;
  return rgb(
    mixf(colors[left].r, colors[left + 1].r, amount),
    mixf(colors[left].g, colors[left + 1].g, amount),
    mixf(colors[left].b, colors[left + 1].b, amount)
  );
}

inline bool beginMatrix() {
  HUB75_I2S_CFG::i2s_pins pins = {R1_PIN, G1_PIN, B1_PIN, R2_PIN, G2_PIN, B2_PIN, A_PIN, B_PIN, C_PIN, D_PIN, E_PIN, LAT_PIN, OE_PIN, CLK_PIN};
  HUB75_I2S_CFG config(kMatrixWidth, kMatrixHeight, PANEL_CHAIN, pins);
  config.clkphase = kClockPhase;
  config.latch_blanking = kLatchBlanking;
  config.double_buff = kDoubleBuffer;
  config.i2sspeed = kBusSpeed;

  matrix = new MatrixPanel_I2S_DMA(config);
  if (!matrix->begin()) {
    // 戻り値を捨てると、DMA 確保に失敗しても黒画面のまま原因が分からない。
    Serial.println("beginMatrix: begin() failed (DMA memory or pin config)");
    return false;
  }
  matrix->setBrightness8(kBrightness); // Start conservatively with a 5 V / 4 A adapter.
  matrix->clearScreen();
  return true;
}

// 1 フレーム描き終えたら呼ぶ。裏バッファを表に出す。
// kDoubleBuffer が false のときは何もしない。
inline void endFrame() {
  matrix->flipDMABuffer();
}
