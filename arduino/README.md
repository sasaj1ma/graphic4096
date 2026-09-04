# ESP32-S3 HUB75 LED Art

This is the Arduino version of the browser sketches. Open `LED_Art/LED_Art.ino` in Arduino IDE, set `ACTIVE_SKETCH` to a number from 1 to 9, and upload.

| Number | Work |
| --- | --- |
| 1 | Plasma |
| 2 | Rain |
| 3 | 64×64 portrait preview |
| 4 | Approach |
| 5 | Eye of Sauron |
| 6 | Lissajous grid |
| 7 | Test pattern (see Panel symptoms below) |
| 8 | Message board |
| 9 | COYS |

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

`MatrixConfig.h` ships with `PANEL_TUNING 0` and `USE_DOUBLE_BUFFER 0`, which
leaves every panel setting at the library default. That is the configuration the
sketch has always run on, so start there and change one thing at a time. Setting
several at once makes it impossible to tell which one mattered — and a wrong
clock or blanking value produces its own artefacts, so a bad guess adds a second
fault on top of the one being chased.

Set `ACTIVE_SKETCH` to `7` to get the test pattern. It cycles every 4 seconds
through an all-black screen, a every-fourth-column screen, and single columns at
62 and 63. The top half of the panel is drawn red and the bottom half blue,
because a 64x64 panel drives those halves over separate data lines (R1/G1/B1 and
R2/G2/B2) and they can go out of step independently. Straight vertical lines with
red directly above blue mean the two halves agree.

| Symptom | Setting | What to do |
| --- | --- | --- |
| Red and blue are offset horizontally, so a column splits at the middle | `PANEL_TUNING` | Set it to 0. A clock above the `HZ_8M` default is the usual cause: the data lines stop meeting setup time, and the two halves drift apart at the end of the row before they do anywhere else. |
| A column that should be dark stays lit, or ghosting trails appear | `LATCH_BLANKING` | Raise it. Library default is 2, maximum 4. Each step blanks OE for longer around the latch, at a slight cost in brightness. |
| An edge column will not go dark whatever the blanking | `PANEL_DRIVER` | Set it to the shift register printed on the back of the panel. `FM6126A` needs an init sequence the default `SHIFTREG` never sends. |
| The image sits one pixel to the side across the whole panel | `CLK_PHASE` | Flip it to `false`. |
| The whole panel flickers | `MIN_REFRESH_RATE` | Raise it. Refresh rate is set by colour depth and clock alone; drawing faster will not change it. `Diagnostics.h` reports the rate the library actually reached. |
| Nothing lights up at all | `PANEL_TUNING` | Set it to 0. A failure in `matrix->begin()` is reported on the serial monitor. |

If the defaults are in place and an artefact remains, it is wiring rather than
configuration. Add a 74AHCT125/74AHCT245 level shifter, shorten the leads, and
keep the R1/G1/B1 and R2/G2/B2 groups the same length as each other.

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

## Message board

A line of Japanese scrolls right to left, like the sign above the door of a
Shinkansen carriage. Kanji glow purple, kana off-white.

No font lives on the chip. `MessageBoardData.h` holds the line already
rasterised: a 464 x 23 px strip, four bits of coverage per pixel, two pixels to
a byte, 5.3 KB of flash. Alongside it are the scroll speed, the ink threshold
and the three tints, so everything that decides the picture arrives from the
same file.

To change the words, edit `SETTINGS` in `sketches/message-board.js`, run
`npm run dev`, open `work/bake-message-board.html`, save the file it offers, and
replace `LED_Art/MessageBoardData.h` with it. Do not edit the header by hand.

The browser preview and the panel are the same picture because both read a strip
built by `src/jp-strip.js` — the browser calls it every time it loads the
sketch, and the bake page calls it once to write the header. Coverage is rounded
to 16 steps inside that function rather than at bake time, so the preview shows
what the panel will show.

## COYS

The crest and the wordmark are rebuilt at 32 x 32 and tiled four times, each
quarter carrying a different noise: flicker top left, spray top right, glitch
bottom left, frosted glass bottom right. Ink is dot art in `Coys.h`, so it is
edited in place — no bake step, unlike the message board.

`NoiseVeil.h` is the port of `src/noise-veil.js`. Its buffers are the reason
global RAM jumps to 49 KB: three 32 x 32 float fields for the sharp, mid and
soft copies of the flag, two more inside the veil, and one scratch buffer for
`soften()`. `kVeilMax` sets the largest side a veil can cover; raising it to 64
for a full-panel veil doubles those buffers.

Three of the four quarters land on exactly the pixels the browser preview shows.
They are driven by `grainAt()`, whose integer hash gives the same values in both
languages, so spray, glitch and glass were checked byte for byte against the
preview at two different times. Flicker is the exception: its blotches come from
`noise3()` in float, so it has the same character with different pixels — over
60 samples the two run to the same range and the same average brightness within
a tenth, but never to the same frame. Making it match exactly would need
`noise3Exact()`, and at 245 calls per frame this chip cannot afford it.

## Portrait

`PortraitImageData.h` contains a 16-color, 64×64 version of the supplied portrait. It uses 2 KB of flash. To change it, regenerate this header from a new image; the browser source image is `public/images/images-1.jpeg`.
