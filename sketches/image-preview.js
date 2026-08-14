// 添付画像を64×64のRGB値に縮小して、LEDプレビューで表示します。
// 画像は public/images/images-1.jpeg を差し替えるだけで更新できます。
const source = new Image();
const sample = document.createElement('canvas');
sample.width = 64;
sample.height = 64;
const sampleContext = sample.getContext('2d', { willReadFrequently: true });
let imageData = null;
let loadError = null;

source.onload = () => {
  // 今回の画像は正方形。縦横比の異なる画像も中央を正方形に切り取ります。
  const side = Math.min(source.naturalWidth, source.naturalHeight);
  const left = (source.naturalWidth - side) / 2;
  const top = (source.naturalHeight - side) / 2;
  sampleContext.clearRect(0, 0, 64, 64);
  sampleContext.drawImage(source, left, top, side, side, 0, 0, 64, 64);
  imageData = sampleContext.getImageData(0, 0, 64, 64).data;
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
