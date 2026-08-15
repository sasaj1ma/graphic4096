#pragma once

#include <Arduino.h>
#include <ESP32-HUB75-MatrixPanel-I2S-DMA.h>

constexpr int kMatrixWidth = 64;
constexpr int kMatrixHeight = 64;

// Match these GPIO numbers to the wires you connect to the HUB75 header.
// GPIO 19/20 are deliberately unused: this keeps the ESP32-S3 native USB free.
#define R1_PIN 1
#define G1_PIN 2
#define B1_PIN 3
#define R2_PIN 4
#define G2_PIN 5
#define B2_PIN 6
#define A_PIN 7
#define B_PIN 8
#define C_PIN 9
#define D_PIN 10
#define E_PIN 11
#define LAT_PIN 12
#define OE_PIN 13
#define CLK_PIN 14

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
  // static がないと、1 フレームに 4096 回この表をスタックに作り直すことになる。
  static const Rgb colors[] = {{9, 6, 25}, {75, 23, 135}, {205, 38, 147}, {50, 225, 186}, {241, 252, 83}};
  value = unitClamp(value) * 4.0f;
  const int left = min(3, static_cast<int>(floorf(value)));
  const float amount = value - left;
  return rgb(
    mixf(colors[left].r, colors[left + 1].r, amount),
    mixf(colors[left].g, colors[left + 1].g, amount),
    mixf(colors[left].b, colors[left + 1].b, amount)
  );
}

inline void beginMatrix() {
  HUB75_I2S_CFG::i2s_pins pins = {R1_PIN, G1_PIN, B1_PIN, R2_PIN, G2_PIN, B2_PIN, A_PIN, B_PIN, C_PIN, D_PIN, E_PIN, LAT_PIN, OE_PIN, CLK_PIN};
  HUB75_I2S_CFG config(kMatrixWidth, kMatrixHeight, 1, pins);
  // 表と裏の 2 枚を持ち、描き終わってから表に出す。
  // 1 枚だけだと DMA が走査している最中のバッファに書き込むことになり、
  // 描きかけの状態がそのまま見えてカクつきやちらつきの原因になる。
  // メモリ不足で matrix->begin() が失敗する場合は false に戻す。
  config.double_buff = true;
  matrix = new MatrixPanel_I2S_DMA(config);
  matrix->begin();
  matrix->setBrightness8(80); // Start conservatively with a 5 V / 4 A adapter.
  matrix->clearScreen();
}

// 1 フレーム描き終わるたびに呼ぶ。裏で組み立てた絵を表に出す。
// どのスケッチも毎フレーム全ピクセルを書くので、裏面の消し込みは要らない。
inline void flipFrame() {
  matrix->flipDMABuffer();
}
