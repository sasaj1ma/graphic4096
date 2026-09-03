// 添付画像を64×64のRGB値に縮小して、LEDプレビューで表示します。
// 画像は public/images/images-1.jpeg を差し替えるだけで更新できます。
// 写真そのままではLED上で暗部が沈むため、読み込み時に一度だけ明るさを補正します。

// 補正のつまみ。値を変えて保存すると、そのまま見え方が変わります。
const kBlackPoint = 0.02;  // この割合ぶんの暗い画素を黒に切り詰める
const kWhitePoint = 0.99; // この割合より明るい画素を白に飛ばす。下げすぎると顔が白く潰れる
const kGamma = 0.4;       // 1未満で中間調を持ち上げる。暗さへの効き目が一番大きい
const kSaturation = 1.25;  // 1で元のまま。持ち上げて浅くなった色を締め直す

const source = new Image();
const sample = document.createElement('canvas');
sample.width = 64;
sample.height = 64;
const sampleContext = sample.getContext('2d', { willReadFrequently: true });
let imageData = null;
let loadError = null;

// ITU-R BT.601の重みを256倍した整数版。C++へ移すときも同じ式で足ります。
const luma = (r, g, b) => (r * 77 + g * 151 + b * 28) / 256;

// 輝度のヒストグラムから、実際に使われている明暗の幅を求めます。
function levelsFrom(data) {
  const histogram = new Uint16Array(256);
  for (let index = 0; index < data.length; index += 4) {
    histogram[Math.round(luma(data[index], data[index + 1], data[index + 2]))] += 1;
  }

  const total = data.length / 4;
  let count = 0;
  let low = 0;
  let high = 255;
  for (let value = 0; value < 256; value += 1) {
    const before = count;
    count += histogram[value];
    if (before < total * kBlackPoint && count >= total * kBlackPoint) low = value;
    if (before < total * kWhitePoint && count >= total * kWhitePoint) high = value;
  }
  return { low, high: Math.max(high, low + 1) };
}

// レベル補正とガンマを1本の変換表にまとめます。
function toneCurve(low, high) {
  const table = new Uint8ClampedArray(256);
  const span = high - low;
  for (let value = 0; value < 256; value += 1) {
    const normalized = Math.min(1, Math.max(0, (value - low) / span));
    table[value] = normalized ** kGamma * 255;
  }
  return table;
}

source.onload = () => {
  // 今回の画像は正方形。縦横比の異なる画像も中央を正方形に切り取ります。
  const side = Math.min(source.naturalWidth, source.naturalHeight);
  const left = (source.naturalWidth - side) / 2;
  const top = (source.naturalHeight - side) / 2;
  sampleContext.clearRect(0, 0, 64, 64);
  sampleContext.drawImage(source, left, top, side, side, 0, 0, 64, 64);

  const pixels = sampleContext.getImageData(0, 0, 64, 64).data;
  const { low, high } = levelsFrom(pixels);
  const tone = toneCurve(low, high);
  for (let index = 0; index < pixels.length; index += 4) {
    const r = tone[pixels[index]];
    const g = tone[pixels[index + 1]];
    const b = tone[pixels[index + 2]];
    const gray = luma(r, g, b);
    pixels[index] = gray + (r - gray) * kSaturation;
    pixels[index + 1] = gray + (g - gray) * kSaturation;
    pixels[index + 2] = gray + (b - gray) * kSaturation;
  }
  imageData = pixels;
};

source.onerror = () => { loadError = '画像を読み込めませんでした'; };
source.src = '/images/images-1.jpeg';

export function draw(api) {
  api.clear();
  if (!imageData) {
    if (loadError) throw new Error(loadError);
    return;
  }

  for (let y = 0; y < api.height; y += 1) {
    for (let x = 0; x < api.width; x += 1) {
      const index = (y * api.width + x) * 4;
      api.pixel(x, y, api.rgb(imageData[index], imageData[index + 1], imageData[index + 2]));
    }
  }
}
