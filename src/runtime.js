export const WIDTH = 64;
export const HEIGHT = 64;

const clampByte = (value) => Math.max(0, Math.min(255, Math.round(value)));
const clampUnit = (value) => Math.max(0, Math.min(1, value));

function mulberry32(seed) {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

// Compact, deterministic value noise. Its API maps cleanly to a future C++ port.
function hash(x, y, z) {
  const value = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453123;
  return value - Math.floor(value);
}

const smooth = (value) => value * value * (3 - 2 * value);
const mix = (a, b, t) => a + (b - a) * t;

function noise3(x, y = 0, z = 0) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const zi = Math.floor(z);
  const tx = smooth(x - xi);
  const ty = smooth(y - yi);
  const tz = smooth(z - zi);
  const a = mix(hash(xi, yi, zi), hash(xi + 1, yi, zi), tx);
  const b = mix(hash(xi, yi + 1, zi), hash(xi + 1, yi + 1, zi), tx);
  const c = mix(hash(xi, yi, zi + 1), hash(xi + 1, yi, zi + 1), tx);
  const d = mix(hash(xi, yi + 1, zi + 1), hash(xi + 1, yi + 1, zi + 1), tx);
  return mix(mix(a, b, ty), mix(c, d, ty), tz);
}

const palettes = {
  fire: [[8, 4, 18], [91, 11, 70], [226, 60, 35], [255, 205, 70], [255, 249, 212]],
  ocean: [[3, 10, 40], [7, 60, 115], [14, 135, 180], [87, 220, 211], [232, 255, 233]],
  neon: [[9, 6, 25], [75, 23, 135], [205, 38, 147], [50, 225, 186], [241, 252, 83]]
};

export function createRuntime() {
  const pixels = new Uint8ClampedArray(WIDTH * HEIGHT * 3);
  let startedAt = performance.now();
  let random = mulberry32(1);

  const api = {
    width: WIDTH,
    height: HEIGHT,
    clear(color = { r: 0, g: 0, b: 0 }) {
      const r = clampByte(color.r ?? 0);
      const g = clampByte(color.g ?? 0);
      const b = clampByte(color.b ?? 0);
      for (let index = 0; index < pixels.length; index += 3) pixels.set([r, g, b], index);
    },
    pixel(x, y, color) {
      x = Math.floor(x); y = Math.floor(y);
      if (x < 0 || x >= WIDTH || y < 0 || y >= HEIGHT) return;
      const index = (y * WIDTH + x) * 3;
      pixels[index] = clampByte(color.r ?? 0);
      pixels[index + 1] = clampByte(color.g ?? 0);
      pixels[index + 2] = clampByte(color.b ?? 0);
    },
    rgb(r, g, b) { return { r: clampByte(r), g: clampByte(g), b: clampByte(b) }; },
    hsv(h, s = 1, v = 1) {
      const hue = ((h % 360) + 360) % 360 / 60;
      const chroma = clampUnit(v) * clampUnit(s);
      const second = chroma * (1 - Math.abs((hue % 2) - 1));
      const [r, g, b] = [[chroma, second, 0], [second, chroma, 0], [0, chroma, second], [0, second, chroma], [second, 0, chroma], [chroma, 0, second]][Math.floor(hue)];
      const offset = clampUnit(v) - chroma;
      return this.rgb((r + offset) * 255, (g + offset) * 255, (b + offset) * 255);
    },
    palette(name, t) {
      const colors = palettes[name] ?? palettes.fire;
      const position = clampUnit(t) * (colors.length - 1);
      const left = Math.floor(position);
      const right = Math.min(left + 1, colors.length - 1);
      const amount = position - left;
      return this.rgb(...colors[left].map((channel, i) => mix(channel, colors[right][i], amount)));
    },
    noise: noise3,
    random(min = 0, max = 1) { return min + random() * (max - min); },
    randomSeed(seed) { random = mulberry32(seed); },
    time() { return (performance.now() - startedAt) / 1000; },
    resetTime() { startedAt = performance.now(); }
  };
  return { api, pixels };
}
