#pragma once
#include "MatrixConfig.h"
#include "PortraitImageData.h"

inline Rgb rgb565ToRgb(uint16_t color) {
  return {
    static_cast<uint8_t>(((color >> 11) & 0x1F) * 255 / 31),
    static_cast<uint8_t>(((color >> 5) & 0x3F) * 255 / 63),
    static_cast<uint8_t>((color & 0x1F) * 255 / 31)
  };
}

inline void drawPortrait() {
  for (int y = 0; y < kMatrixHeight; y++) {
    for (int x = 0; x < kMatrixWidth; x++) {
      const int index = y * kMatrixWidth + x;
      const uint8_t packed = pgm_read_byte(&kPortraitPixels[index >> 1]);
      const uint8_t paletteIndex = (index & 1) ? (packed & 0x0F) : (packed >> 4);
      pixel(x, y, rgb565ToRgb(pgm_read_word(&kPortraitPalette[paletteIndex])));
    }
  }
}
