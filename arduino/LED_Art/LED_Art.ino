// 64 x 64 HUB75 LED Art for Freenove ESP32-S3 Board Lite.
// Change ACTIVE_SKETCH, then upload this one file from Arduino IDE.
// 1 = plasma, 2 = rain, 3 = portrait, 4 = approach, 5 = eye of sauron,
// 6 = lissajous grid
#define ACTIVE_SKETCH 1

#include "MatrixConfig.h"
#include "Plasma.h"
#include "Rain.h"
#include "Portrait.h"
#include "Approach.h"
#include "EyeOfSauron.h"
#include "LissajousGrid.h"

void setup() {
  Serial.begin(115200);
  beginMatrix();
}

void loop() {
  const float time = millis() / 1000.0f;

#if ACTIVE_SKETCH == 1
  drawPlasma(time);
#elif ACTIVE_SKETCH == 2
  drawRain(time);
#elif ACTIVE_SKETCH == 3
  drawPortrait();
#elif ACTIVE_SKETCH == 4
  drawApproach(time);
#elif ACTIVE_SKETCH == 5
  drawEyeOfSauron(time);
#elif ACTIVE_SKETCH == 6
  drawLissajousGrid(time);
#else
  #error "ACTIVE_SKETCH must be a number from 1 to 6."
#endif

  delay(16); // approximately 60 fps; the portrait remains still.
}
