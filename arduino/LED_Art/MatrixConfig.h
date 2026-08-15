#pragma once

#include <Arduino.h>
#include <ESP32-HUB75-MatrixPanel-I2S-DMA.h>

#define PANEL_WIDTH  64
#define PANEL_HEIGHT 64
#define PANEL_CHAIN  1

// スケッチ側はこちらを使う。寸法の出どころを 1 箇所にまとめ、
// 片方だけ変えて食い違うのを防ぐ。
constexpr int kMatrixWidth = PANEL_WIDTH;
constexpr int kMatrixHeight = PANEL_HEIGHT;

// --- パネルの設定 ---
//
// 既定ではここで何も指定しない。ライブラリの既定値のまま動かす。
// もともとこのスケッチはパネル設定を一切していなかったので、それが
// 実績のある状態にあたる。上下の半分が横にずれる症状は、下の値を
// 既定から動かしたときに出たもので、0 のままなら再現しない。
//
// 触るときは PANEL_TUNING を 1 にして、値は一度に 1 つだけ変える。
// 2 つ以上同時に変えると、どれが効いたのか分からなくなる。
#define PANEL_TUNING 0

#if PANEL_TUNING
// I2S クロック。ライブラリ既定は HZ_8M。
// 上げるとパネルの走査回数が増えるが、配線長やパネルの個体差によっては
// タイミングが間に合わず、絵が横にずれる。
// 選べる値: HZ_8M / HZ_10M / HZ_15M / HZ_16M / HZ_20M
#define I2S_CLOCK HUB75_I2S_CFG::HZ_8M

// パネル走査回数の目標。ライブラリ既定は 85。
// 届かない分はライブラリが下位ビットの精度を削って合わせる。
#define MIN_REFRESH_RATE 85

// ラッチ信号の前後で OE(消灯)を保つクロック数。ライブラリ既定は 2、上限 4。
// 消えるべき列が光る、残像が残るときに上げる。わずかに暗くなる。
#define LATCH_BLANKING 2

// データを送るクロックの向き。ライブラリ既定は true。
// 合っていないと絵が横に 1 px ずれる。
#define CLK_PHASE true

// パネルのシフトレジスタ(ドライバ IC)の種類。ライブラリ既定は SHIFTREG。
// 端の列がどうしても消えないパネルは FM6126A のことがある。
// 選べる値: SHIFTREG / FM6124 / FM6126A / ICN2038S / MBI5124 / DP3246
#define PANEL_DRIVER HUB75_I2S_CFG::SHIFTREG
#endif

// 1 で表裏 2 枚のバッファを使い、描き終わってから表に出す。
// 0 がライブラリ既定。
#define USE_DOUBLE_BUFFER 0

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
  HUB75_I2S_CFG config(PANEL_WIDTH, PANEL_HEIGHT, PANEL_CHAIN, pins);

  // PANEL_TUNING が 0 のときは config に一切触らない。
  // ライブラリ既定のまま動き、パネルの挙動は元のスケッチと同じになる。
#if PANEL_TUNING
  config.i2sspeed = I2S_CLOCK;
  config.min_refresh_rate = MIN_REFRESH_RATE;
  config.latch_blanking = LATCH_BLANKING;
  config.clkphase = CLK_PHASE;
  config.driver = PANEL_DRIVER;
#endif

#if USE_DOUBLE_BUFFER
  // 表と裏の 2 枚を持ち、描き終わってから表に出す。
  config.double_buff = true;
#endif
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
