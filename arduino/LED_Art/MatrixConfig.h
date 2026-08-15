#pragma once

#include <Arduino.h>
#include <ESP32-HUB75-MatrixPanel-I2S-DMA.h>

constexpr int kMatrixWidth = 64;
constexpr int kMatrixHeight = 64;

// 1 で表裏 2 枚のバッファを使う。カクつきの切り分けで 0 にして比較する。
#define USE_DOUBLE_BUFFER 1

// 右端の列が明るくなる、残像が残るといった症状は、ラッチ信号の前後で
// OE(消灯)が足りていないために起きる。その期間を伸ばして消す。
// ライブラリ既定は 2、上限は 4。上げるほど消えるが、わずかに暗くなる。
#define LATCH_BLANKING 3

// I2S クロック。ライブラリ既定は HZ_8M。
// 上げるとパネルの走査回数が増えるが、上げすぎると配線長やパネルの個体差で
// 滲みやゴーストが出る。右端が明るい症状はこれを上げすぎたときにも起きる。
// 選べる値: HZ_8M / HZ_10M / HZ_15M / HZ_16M / HZ_20M
#define I2S_CLOCK HUB75_I2S_CFG::HZ_10M

// パネル走査回数の目標。既定 85。
// 届かない分はライブラリが下位ビットの精度を削って合わせる。
#define MIN_REFRESH_RATE 120

// 1 で上の I2S_CLOCK と MIN_REFRESH_RATE を適用する。
// 表示が出ないときは 0 にしてライブラリ既定へ戻す。
// LATCH_BLANKING は症状への対処なので、こちらとは無関係に常に適用する。
#define PANEL_TUNING 1

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

  // --- ちらつき対策 ---
  // パネルの走査回数(リフレッシュレート)は、スケッチのフレームレートとは
  // 別物で、描画をいくら速くしても上がらない。決まるのはこの2つ。
  //
  // 64x64 を既定の 8 bit 色深度で回すと 20〜40 Hz 程度にしかならず、
  // これが「かくかく」「ちらちら」の正体になっていることが多い。
  // ライブラリは min_refresh_rate に届くよう下位ビットの精度を削って調整する。
  //
  // 実際に出た値は Diagnostics.h が calculated_refresh_rate として表示する。
  // 100 Hz 以上あれば、ちらつきの原因はここではない。
  //
  // クロックを上げすぎるとパネルや配線によっては表示が滲む、または出なくなる。
  // 表示が出ないときは PANEL_TUNING を 0 にしてライブラリ既定へ戻す。
#if PANEL_TUNING
  config.i2sspeed = I2S_CLOCK;
  config.min_refresh_rate = MIN_REFRESH_RATE;
#endif

  // 右端の列が明るくなる症状への対処。切り分け用の設定とは独立に効かせる。
  config.latch_blanking = LATCH_BLANKING;

  // 表と裏の 2 枚を持ち、描き終わってから表に出す。
  // 1 枚だけだと DMA が走査している最中のバッファに書き込むことになり、
  // 描きかけの状態がそのまま見えてカクつきやちらつきの原因になる。
  // メモリ不足で matrix->begin() が失敗する場合は 0 に戻す。
  // 切り分けのため、0 と 1 を比べられるようにしてある。
  config.double_buff = USE_DOUBLE_BUFFER;
  matrix = new MatrixPanel_I2S_DMA(config);
  // 確保に失敗すると以後どう描いても何も出ない。真っ暗なときの一次切り分け。
  if (!matrix->begin()) {
    Serial.println(F("matrix->begin() に失敗。DMA バッファを確保できていない。"));
    Serial.println(F("USE_DOUBLE_BUFFER か PANEL_TUNING を 0 にして試す。"));
  }
  matrix->setBrightness8(80); // Start conservatively with a 5 V / 4 A adapter.
  matrix->clearScreen();
}

// 1 フレーム描き終わるたびに呼ぶ。裏で組み立てた絵を表に出す。
// どのスケッチも毎フレーム全ピクセルを書くので、裏面の消し込みは要らない。
//
// ダブルバッファを使わない設定のときに flipDMABuffer() を呼んではいけない。
// 裏面が存在しないまま表示先を切り替えることになり、画面が真っ暗になる。
inline void flipFrame() {
#if USE_DOUBLE_BUFFER
  matrix->flipDMABuffer();
#endif
}
