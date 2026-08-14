#pragma once
#include "MatrixConfig.h"

inline void drawRain(float time) {
  // The browser sketch clears to a dark blue, not to black.
  matrix->fillScreenRGB888(1, 4, 13);
  for (int x = 0; x < kMatrixWidth; x++) {
    // 64 noise calls per frame, so the exact variant is affordable here and the
    // columns start at the same heights the browser preview showed.
    const float offset = noise3Exact(x * 0.19, 4) * kMatrixHeight;
    const int y = static_cast<int>(fmodf(time * 18.0f + offset, kMatrixHeight));
    pixel(x, y, rgb(110, 230, 255));
    pixel(x, (y + 1) % kMatrixHeight, rgb(23, 113, 178));
  }
}
