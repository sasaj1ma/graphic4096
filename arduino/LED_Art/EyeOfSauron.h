#pragma once
#include "MatrixConfig.h"

inline void drawEyeOfSauron(float time) {
  for (int y = 0; y < kMatrixHeight; y++) {
    for (int x = 0; x < kMatrixWidth; x++) {
      const float px = x / 63.0f - 0.5f;
      const float py = y / 63.0f - 0.5f;
      const float flicker = noise3(x * 0.16f, y * 0.1f, time * 0.62f);
      const float turbulence = noise3(x * 0.06f + 4, y * 0.21f, time * 0.31f);
      Rgb color = rgb(11, 5, 20 + turbulence * 13);

      const float angle = atan2f(py / 0.12f, px / 0.3f);
      const float eyeDistance = hypotf(px / 0.3f, py / 0.12f);
      const float flameNoise = noise3(cosf(angle) * 2.9f + 3, sinf(angle) * 2.9f + 3, time * 0.48f);
      const float flameTongues = fabsf(sinf(angle * 7 + time * 1.1f)) * 0.38f;
      const float flameReach = 1.03f + flameNoise * 0.78f + flameTongues;
      const float flameStrength = unitClamp((flameReach - eyeDistance) * 1.5f);
      if (flameStrength > 0) {
        const float heat = unitClamp(flameStrength * 0.75f + turbulence * 0.25f);
        color = rgb(65 + heat * 190, 7 + heat * 155, 4 + heat * 23);
      }

      const float eyeWidth = 0.31f;
      const float eyeHalfHeight = 0.012f + 0.115f * powf(max(0.0f, 1 - fabsf(px) / eyeWidth), 0.62f);
      if (fabsf(px) < eyeWidth && fabsf(py) < eyeHalfHeight) {
        const float fromCenter = fabsf(py) / eyeHalfHeight;
        const float glow = unitClamp(1 - fromCenter * fromCenter);
        color = rgb(255, 116 + glow * 132, 9 + noise3(x * 0.3f, y * 0.3f, time * 0.12f) * 23);
        const float pupilWidth = 0.017f + sinf(py * 42 + time * 1.8f) * 0.003f;
        if ((px / pupilWidth) * (px / pupilWidth) + (py / 0.13f) * (py / 0.13f) < 1) color = rgb(13, 3, 9);
      }
      pixel(x, y, color);
    }
  }
}
