#pragma once
#include "MatrixConfig.h"

inline void drawPlasma(float time) {
  for (int y = 0; y < kMatrixHeight; y++) {
    for (int x = 0; x < kMatrixWidth; x++) {
      const float wave = sinf(x * 0.17f + time) + sinf(y * 0.14f - time * 1.3f);
      const float cloud = noise3(x * 0.09f, y * 0.09f, time * 0.25f);
      const float value = unitClamp(0.5f + wave * 0.15f + (cloud - 0.5f) * 0.9f);
      pixel(x, y, paletteNeon(value));
    }
  }
}
