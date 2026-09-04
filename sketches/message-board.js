// 新幹線の車内案内のような、横に流れる電光掲示板。
// source: 黒地を右から左へ流れる1行。漢字は紫、かな・記号は白っぽく光る。
// rule: 文字は日本語フォントを1度だけ64px用の細長いビットマップへ焼き、あとはその帯をずらして読むだけ。
// exception: 送りは整数px。なめらかに動かすとLEDらしさが消えるので、1pxずつ跳ねさせる。
//
// ことばは MESSAGES に足せる。ことばの間はGAPぶん空くので、間を置いて繰り返し流れる。
// 実機へ移すときは、ここで作る帯（strip.ink / strip.kind）をそのまま PROGMEM の配列に焼く。

const MESSAGES = [
  'おかえり、手を洗って宿題してね〜'
];

const kSize = 24;         // 文字の高さ（px）。上げるほど読みやすく、流れる字数は減る
const kWeight = 500;      // 字の太さ。600以上にすると画数の多い漢字がつぶれる
const kTracking = 1;      // 字間（px）
const kSpeed = 20;        // 流れる速さ（px/秒）
const kGap = 64;          // ことばとことばの間（px）。盤面1枚ぶん空ける
const kThreshold = 0.34;  // この濃さ以下の画素は消す。上げるとくっきり、下げると細い画は残る
const kSoftness = 0.45;   // 縁の暗さ。0でくっきり1bit、上げるとアンチエイリアスが階調として残る

const FONT = '"Hiragino Kaku Gothic ProN", "Hiragino Sans", "Yu Gothic", "Noto Sans JP", "Meiryo", sans-serif';

const KANA = [235, 236, 248];  // かな。白より少し青紫がかった白
const KANJI = [175, 105, 255]; // 漢字。紫。白いかなと並べても沈まない明るさ
const MARK = [150, 140, 176];  // 読点や記号。かなより控えめに

const TINTS = [KANA, KANJI, MARK];
const KIND_KANA = 0;
const KIND_KANJI = 1;
const KIND_MARK = 2;

// 文字種で色を分ける。かな＝白っぽく、漢字＝紫、読点や記号＝控えめ。
function kindOf(character) {
  const code = character.codePointAt(0);
  if (code >= 0x3041 && code <= 0x30ff) return KIND_KANA;          // ひらがな・カタカナ
  if (code === 0x3005 || (code >= 0x3400 && code <= 0x9fff)) return KIND_KANJI;
  if (code >= 0xf900 && code <= 0xfaff) return KIND_KANJI;          // 互換漢字
  if ((code >= 0x30 && code <= 0x39) || (code >= 0x41 && code <= 0x5a) || (code >= 0x61 && code <= 0x7a)) return KIND_KANA;
  return KIND_MARK;
}

const cell = document.createElement('canvas');
const cellContext = cell.getContext('2d', { willReadFrequently: true });
let strip = null;
let builtFont = null;

// ことばを1本の帯に焼く。列ごとに濃さ（ink）と文字種（kind）を持たせる。
function buildStrip() {
  const font = `${kWeight} ${kSize}px ${FONT}`;
  cellContext.font = font;

  // まず各文字の幅を測り、帯の全長を決める。
  const glyphs = [];
  let total = 0;
  for (const message of MESSAGES) {
    for (const character of message) {
      const width = Math.max(1, Math.round(cellContext.measureText(character).width) + kTracking);
      glyphs.push({ character, left: total, width });
      total += width;
    }
    total += kGap;
  }

  const height = Math.ceil(kSize * 1.32);
  cell.width = total;
  cell.height = height;
  cellContext.font = font;              // canvasのサイズ変更で状態が戻るので、もう1度指定する
  cellContext.textBaseline = 'middle';
  cellContext.textAlign = 'left';
  cellContext.fillStyle = '#fff';
  cellContext.clearRect(0, 0, total, height);

  const kind = new Uint8Array(total);
  for (const glyph of glyphs) {
    cellContext.fillText(glyph.character, glyph.left, height / 2);
    kind.fill(kindOf(glyph.character), glyph.left, glyph.left + glyph.width);
  }

  // アルファだけ取り出す。以降はこの帯を読むだけで、canvasには触らない。
  const data = cellContext.getImageData(0, 0, total, height).data;
  const alpha = new Uint8Array(total * height);
  for (let index = 0; index < alpha.length; index += 1) alpha[index] = data[index * 4 + 3];

  // 字の乗っている行だけを残す。フォントの余白に左右されず、行が盤面の中央に来る。
  let first = height;
  let last = -1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < total; x += 1) {
      if (alpha[y * total + x] / 255 <= kThreshold) continue;
      if (y < first) first = y;
      if (y > last) last = y;
      break;
    }
  }
  if (last < first) { first = 0; last = height - 1; }

  const cropped = last - first + 1;
  const ink = alpha.subarray(first * total, (last + 1) * total);

  strip = { width: total, height: cropped, ink, kind };
  builtFont = font;
}

// フォントが揃ってから焼き直すと、初回の1瞬だけ字形が違う事故を防げる。
if (document.fonts?.ready) document.fonts.ready.then(() => { builtFont = null; });

export function draw(api) {
  if (!strip || builtFont !== `${kWeight} ${kSize}px ${FONT}`) buildStrip();
  api.clear();

  const offset = Math.floor(api.time() * kSpeed) % strip.width;
  const top = Math.round((api.height - strip.height) / 2);

  for (let x = 0; x < api.width; x += 1) {
    const column = (x + offset) % strip.width;
    const tint = TINTS[strip.kind[column]];
    for (let y = 0; y < strip.height; y += 1) {
      const alpha = strip.ink[y * strip.width + column] / 255;
      if (alpha <= kThreshold) continue;
      // 縁の画素だけ暗く落とす。字の芯は満光のまま残るので、にじまずに細い画が生きる。
      const level = 1 - kSoftness * (1 - alpha);
      api.pixel(x, top + y, api.rgb(tint[0] * level, tint[1] * level, tint[2] * level));
    }
  }
}
