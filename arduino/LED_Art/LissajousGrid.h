#pragma once
#include "MatrixConfig.h"

// Port of sketches/lissajous-grid.js.
// 64 x 64 is split into a 4 x 4 arrangement of 16 px cells, each holding one
// Lissajous figure. Every cell shares one phase, so all 16 deform together.
// Only line overlap makes the shading; the colour never changes.

namespace lissajous {

constexpr int kCell = 16;             // Side of one cell.
constexpr int kGrid = 4;              // Cells per row and column.
constexpr float kRadius = 6.5f;       // Drawing radius inside a cell; 1 px of margin remains.
constexpr float kPeriod = 12.0f;      // Seconds. Shared deformation cycle.
constexpr float kTau = 6.283185307f;

constexpr float kInk = 1.7f;          // Ink per pixel of line. Overlap becomes brightness.
constexpr float kStep = 0.4f;         // Curve step in pixels. Smaller is smoother and slower.
constexpr int kMaxSamples = 5200;     // Per-cell ceiling, for high frequency ratios.
constexpr float kGridDim = 0.14f;     // Cell border brightness. 0 removes the rules.
constexpr float kHueR = 64.0f;        // One colour only.
constexpr float kHueG = 104.0f;
constexpr float kHueB = 255.0f;

// a and b are the frequency ratio, detune is the precession per turn,
// turns is how many revolutions to draw, decay pulls the curve inward as it is
// drawn, rot tilts the figure (1.0 = one full turn), ax and ay squash it.
struct Figure {
  float a;
  float b;
  float detune;
  float turns;
  float decay;
  float rot;
  float ax;
  float ay;
  float phase;
};

// Fields in the order declared above: a, b, detune, turns, decay, rot, ax, ay, phase.
// Only a few lines fit in a 13 px drawing area, so most cells are a single
// closed curve; the denser ones nest inward with decay. Precession is unused
// because the strands blur together at this size.
constexpr Figure kFigures[kGrid * kGrid] = {
  {1, 1, 0, 1, 0.00f, 0.0f, 1.00f, 1.00f, 0},  // circle to line; the basic form here
  {1, 2, 0, 1, 0.00f, 0.0f, 1.00f, 1.00f, 0},  // figure eight
  {1, 1, 0, 3, 0.95f, 0.0f, 1.00f, 1.00f, 0},  // nested rings
  {3, 4, 0, 1, 0.00f, 0.0f, 1.00f, 1.00f, 0},  // woven lattice

  {1, 3, 0, 1, 0.00f, 0.0f, 1.00f, 0.90f, 0},  // three crested wave
  {2, 3, 0, 1, 0.00f, 0.0f, 1.00f, 1.00f, 0},  // braid
  {1, 2, 0, 1, 0.00f, 0.0f, 1.00f, 0.60f, 0},  // flattened figure eight
  {2, 1, 0, 1, 0.00f, 0.2f, 1.00f, 1.00f, 0},  // tilted figure eight

  {1, 1, 0, 1, 0.00f, 0.0f, 1.00f, 0.55f, 0},  // flattened ellipse
  {3, 2, 0, 1, 0.50f, 0.0f, 1.00f, 1.00f, 0},  // sinking trefoil
  {1, 4, 0, 1, 0.00f, 0.0f, 1.00f, 1.00f, 0},  // four crested wave
  {5, 4, 0, 1, 0.00f, 0.0f, 1.00f, 1.00f, 0},  // fine weave

  {1, 5, 0, 1, 0.00f, 0.0f, 0.85f, 1.00f, 0},  // fine vertical wave
  {3, 1, 0, 1, 0.00f, 0.0f, 0.70f, 1.00f, 0},  // three fold squashed vertically
  {2, 5, 0, 1, 0.00f, 0.0f, 1.00f, 1.00f, 0},  // twisted basket
  {1, 1, 0, 3, 1.30f, 0.4f, 1.00f, 1.00f, 0}   // vortex falling inward
};

// Where brightness accumulates. Lines add into it; it is converted to colour once.
static float canvas[kMatrixWidth * kMatrixHeight];

// 1 - exp(-value) is needed for all 4096 pixels every frame, which is far too
// much expf() for this chip. Tabulate it instead, over value 0 to 8; above that
// the curve is saturated to within 1/3000.
constexpr int kToneSteps = 1024;
constexpr float kToneMax = 8.0f;
static uint8_t toneR[kToneSteps + 1];
static uint8_t toneG[kToneSteps + 1];
static uint8_t toneB[kToneSteps + 1];
static bool toneReady = false;

inline void buildTone() {
  for (int i = 0; i <= kToneSteps; i++) {
    const float level = 1.0f - expf(-(i * kToneMax) / kToneSteps);
    toneR[i] = byteClamp(kHueR * level);
    toneG[i] = byteClamp(kHueG * level);
    toneB[i] = byteClamp(kHueB * level);
  }
  toneReady = true;
}

// Spread one point over the surrounding four pixels, so line angles survive in a 16 px cell.
inline void splat(float x, float y, float amount) {
  const int left = static_cast<int>(floorf(x));
  const int top = static_cast<int>(floorf(y));
  const float fx = x - left;
  const float fy = y - top;
  for (int dy = 0; dy < 2; dy++) {
    const int py = top + dy;
    if (py < 0 || py >= kMatrixHeight) continue;
    const float wy = dy == 0 ? 1.0f - fy : fy;
    for (int dx = 0; dx < 2; dx++) {
      const int px = left + dx;
      if (px < 0 || px >= kMatrixWidth) continue;
      const float wx = dx == 0 ? 1.0f - fx : fx;
      canvas[py * kMatrixWidth + px] += amount * wx * wy;
    }
  }
}

inline void trace(const Figure& fig, int originX, int originY, float phi) {
  const float span = fig.turns * kTau;
  // The step count follows the speed of the curve: a higher ratio is a longer path.
  const float speed = kRadius * hypotf(fig.a * fig.ax, fig.b * fig.ay);
  const int samples = min(static_cast<int>(ceilf((span * speed) / kStep)), kMaxSamples);
  const float angle = fig.rot * kTau;
  const float cosine = cosf(angle);
  const float sine = sinf(angle);
  const float centerX = originX + kCell / 2.0f - 0.5f;
  const float centerY = originY + kCell / 2.0f - 0.5f;
  const float offset = phi + fig.phase * kTau;
  float previousX = 0;
  float previousY = 0;

  for (int i = 0; i <= samples; i++) {
    const float progress = static_cast<float>(i) / samples;
    const float u = progress * span;
    // Precession accumulates with u, so a bundle opens up as it is drawn.
    const float amplitude = fig.decay == 0.0f ? kRadius : kRadius * expf(-fig.decay * progress);
    const float localX = sinf((fig.a + fig.detune) * u + offset) * amplitude * fig.ax;
    const float localY = sinf(fig.b * u) * amplitude * fig.ay;
    const float x = centerX + localX * cosine - localY * sine;
    const float y = centerY + localX * sine + localY * cosine;

    // Ink follows the distance travelled, so turning points do not over-darken.
    if (i > 0) {
      splat((x + previousX) * 0.5f, (y + previousY) * 0.5f,
            hypotf(x - previousX, y - previousY) * kInk);
    }
    previousX = x;
    previousY = y;
  }
}

}  // namespace lissajous

inline void drawLissajousGrid(float time) {
  using namespace lissajous;

  if (!toneReady) buildTone();
  memset(canvas, 0, sizeof(canvas));

  // One phase shared by every cell; this alone deforms all 16 figures together.
  // Wrapping before scaling keeps float precision after hours of running.
  const float phi = fmodf(time / kPeriod, 1.0f) * kTau;

  for (int index = 0; index < kGrid * kGrid; index++) {
    // Offset each cell by 1/16 of a turn. The period stays shared, so the panel
    // shows 16 stages of the same deformation at once.
    const float offset = (static_cast<float>(index) / (kGrid * kGrid)) * kTau;
    trace(kFigures[index], (index % kGrid) * kCell, (index / kGrid) * kCell, phi + offset);
  }

  // Cell borders. They land only on the 1 px margin at each cell edge.
  if (kGridDim > 0) {
    for (int i = 0; i < kMatrixWidth; i++) {
      for (int g = 1; g < kGrid; g++) {
        canvas[i * kMatrixWidth + (g * kCell - 1)] += kGridDim;
        canvas[(g * kCell - 1) * kMatrixWidth + i] += kGridDim;
      }
    }
  }

  for (int y = 0; y < kMatrixHeight; y++) {
    for (int x = 0; x < kMatrixWidth; x++) {
      // The more the lines overlap the brighter it gets, without clipping to white.
      const float value = canvas[y * kMatrixWidth + x];
      const int slot = value <= 0.0f
        ? 0
        : min(kToneSteps, static_cast<int>((value / kToneMax) * kToneSteps));
      matrix->drawPixelRGB888(x, y, toneR[slot], toneG[slot], toneB[slot]);
    }
  }
}
