#pragma once
#include "MatrixConfig.h"

const Rgb kApproachColors[] = {{244, 71, 172}, {255, 123, 95}, {196, 244, 54}, {72, 142, 232}, {151, 101, 222}, {87, 215, 161}};

inline float fractf(float value) { return value - floorf(value); }

inline bool approachContains(float x, float y, float centerX, float centerY, float size, float rotation, float seed, int type, float time) {
  const float dx = x - centerX;
  const float dy = y - centerY;
  const float localX = (dx * cosf(rotation) + dy * sinf(rotation)) / size;
  const float localY = (-dx * sinf(rotation) + dy * cosf(rotation)) / size;
  const float radius = hypotf(localX, localY);
  const float angle = atan2f(localY, localX);

  if (type == 0) {
    const float edge = 0.72f + sinf(angle * 3 + seed + time * 0.7f) * 0.12f + cosf(angle * 5 - seed) * 0.06f;
    return radius < edge;
  }
  if (type == 1) {
    const float width = 0.68f + sinf(localY * 3 + seed) * 0.13f;
    const float height = 0.56f + cosf(localX * 2 + time + seed) * 0.08f;
    return max(fabsf(localX) - width, fabsf(localY) - height) < 0;
  }
  const float curve = fabsf(localY - sinf(localX * 2.8f + seed) * 0.22f);
  return fabsf(localX) < 0.9f && curve < 0.22f + cosf(localX * 3) * 0.08f;
}

inline void drawApproach(float time) {
  matrix->fillScreen(matrix->color565(27, 18, 57));
  constexpr int count = 11;
  for (int index = 0; index < count; index++) {
    const float phase = fractf(time * 0.085f + index / static_cast<float>(count));
    const float size = 0.05f + powf(phase, 1.85f) * 0.4f;
    const float direction = index * 2.41f + sinf(index * 1.7f) * 0.45f;
    const float orbit = phase * 1.16f;
    const float centerX = 0.5f + cosf(direction) * orbit;
    const float centerY = 0.5f + sinf(direction) * orbit;
    const float rotation = direction + phase * 2.7f + sinf(time * 0.5f + index) * 0.2f;
    const Rgb base = kApproachColors[index % 6];
    const float light = 0.58f + phase * 0.42f;

    for (int y = 0; y < kMatrixHeight; y++) {
      for (int x = 0; x < kMatrixWidth; x++) {
        if (approachContains(x / 63.0f, y / 63.0f, centerX, centerY, size, rotation, index * 1.91f, index % 3, time)) {
          pixel(x, y, rgb(base.r * light, base.g * light, base.b * light));
        }
      }
    }
  }
}
