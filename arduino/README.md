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
| R1, G1, B1 | 4, 5, 6 |
| R2, G2, B2 | 7, 8, 9 |
| A, B, C, D, E | 10, 11, 12, 13, 14 |
| LAT, OE, CLK | 15, 16, 17 |

Keep the panel on its own 5 V power adapter. Never power the panel from the ESP32's USB port. Begin at brightness `80` (in `MatrixConfig.h`); raise it only after stable operation.

If the panel does not display cleanly, confirm the HUB75 header pinout and add a 74AHCT125/74AHCT245 3.3 V → 5 V level shifter. Do not connect 5 V from the panel to any ESP32 GPIO.

## Panel symptoms

The switches for these are at the top of `LED_Art/MatrixConfig.h`. Change one at a time.

| Symptom | Setting | What to do |
| --- | --- | --- |
| The rightmost column stays bright, or ghosting trails appear | `LATCH_BLANKING` | Raise it. Library default is 2, maximum 4. Each step blanks OE for longer around the latch, at a slight cost in brightness. |
| Ghosting remains after raising the blanking | `I2S_CLOCK` | Lower it. `HZ_8M` is the library default; a faster clock buys refresh rate but is harder on long wiring. |
| The whole panel flickers | `MIN_REFRESH_RATE` | Raise it. The refresh rate is set by colour depth and clock alone, and no amount of drawing faster will change it. `Diagnostics.h` reports the rate the library actually reached. |
| Nothing lights up at all | `PANEL_TUNING` | Set it to 0 to fall back to library defaults for clock and refresh. A failure in `matrix->begin()` is reported on the serial monitor. |

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
