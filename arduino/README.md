# ESP32-S3 HUB75 LED Art

This is the Arduino version of the browser sketches. Open `LED_Art/LED_Art.ino` in Arduino IDE, set `ACTIVE_SKETCH` to a number from 1 to 6, and upload.

| Number | Work |
| --- | --- |
| 1 | Plasma |
| 2 | Rain |
| 3 | 64×64 portrait preview |
| 4 | Approach |
| 5 | Eye of Sauron |
| 6 | Lissajous grid |

## Required Arduino libraries

Install these with **Tools → Manage Libraries**:

- `ESP32-HUB75-MatrixPanel-DMA`
- `Adafruit GFX Library`

## Wire mapping

The values in `LED_Art/MatrixConfig.h` are a proposed direct-wiring map for the Freenove ESP32-S3 Board Lite. Wire each named HUB75 signal to the matching GPIO. Also connect **one HUB75 GND pin to ESP32 GND**. The 64×64 panel requires the `E` address line; do not omit it.

| HUB75 signal | ESP32-S3 GPIO |
| --- | ---: |
| R1, G1, B1 | 1, 2, 3 |
| R2, G2, B2 | 4, 5, 6 |
| A, B, C, D, E | 7, 8, 9, 10, 11 |
| LAT, OE, CLK | 12, 13, 14 |

Keep the panel on its own 5 V power adapter. Never power the panel from the ESP32's USB port. Begin at brightness `80` (in `MatrixConfig.h`); raise it only after stable operation.

If the panel does not display cleanly, confirm the HUB75 header pinout and add a 74AHCT125/74AHCT245 3.3 V → 5 V level shifter. Do not connect 5 V from the panel to any ESP32 GPIO.

## Lissajous grid

This is the heaviest sketch here: it traces about 5,700 curve points per frame into a
16 KB float buffer before anything reaches the panel. If the frame rate is too low,
raise `kStep` in `LissajousGrid.h` (0.4 → 0.6 roughly halves the work and slightly
roughens the lines). `kGridDim` set to 0 removes the cell borders.

## Matching the browser preview

`noise3()` in `MatrixConfig.h` runs its hash in float. That is fast enough for the
per-pixel sketches, but float rounding changes the values, so those sketches have the
same character as the browser preview without landing on the same pixels. Rain calls
noise only 64 times per frame, so it uses `noise3Exact()` and reproduces the preview
exactly. Use the exact variant only where the call count is small — this chip emulates
double in software.

## Portrait

`PortraitImageData.h` contains a 16-color, 64×64 version of the supplied portrait. It uses 2 KB of flash. To change it, regenerate this header from a new image; the browser source image is `public/images/images-1.jpeg`.
