import { buildStrip, topOnPanel, LEVELS } from '../src/jp-strip.js';

// 新幹線の車内案内のような、横に流れる電光掲示板。
// source: 黒地を右から左へ流れる1行。漢字は紫、かな・記号は白っぽく光る。
// rule: 文字は日本語フォントを1度だけ細長いビットマップに焼き、あとはその帯をずらして読むだけ。
// exception: 送りは整数px。なめらかに動かすとLEDらしさが消えるので、1pxずつ跳ねさせる。
//
// 焼く処理は src/jp-strip.js にある。実機（arduino/LED_Art/MessageBoard.h）も同じ関数を通った
// データを読むので、この SETTINGS を直して焼き直せば、プレビューと実機は同じ絵になる。
// 焼き直しは work/bake-message-board.html をブラウザで開く。

export const SETTINGS = {
  // 流したいことば。足すと、間を置いて順に流れる。
  messages: [
    'おかえり、手を洗って宿題してね〜'
  ],

  size: 24,        // 文字の高さ（px）。上げるほど読みやすく、1画面に入る字数は減る
  weight: 500,     // 字の太さ。600以上にすると画数の多い漢字がつぶれる
  tracking: 1,     // 字間（px）
  gap: 64,         // ことばとことばの間（px）。盤面1枚ぶん空ける
  speed: 20,       // 流れる速さ（px/秒）
  threshold: 0.34, // この濃さ以下の画素は消す。上げるとくっきり、下げると細い画が残る
  softness: 0.45,  // 縁の暗さ。0でくっきり1bit、上げるとアンチエイリアスが階調として残る

  // 文字種ごとの色。かな＝白っぽく、漢字＝紫、読点や記号＝控えめに。
  tints: [
    [235, 236, 248], // かな。白より少し青紫がかった白
    [175, 105, 255], // 漢字。紫。白いかなと並べても沈まない明るさ
    [150, 140, 176]  // 読点や記号
  ],

  font: '"Hiragino Kaku Gothic ProN", "Hiragino Sans", "Yu Gothic", "Noto Sans JP", "Meiryo", sans-serif'
};

let strip = null;

// フォントが揃ってから焼き直すと、初回の1瞬だけ字形が違う事故を防げる。
if (document.fonts?.ready) document.fonts.ready.then(() => { strip = null; });

export function draw(api) {
  if (!strip) strip = buildStrip(SETTINGS);
  api.clear();

  const { speed, threshold, softness, tints } = SETTINGS;
  const offset = Math.floor(api.time() * speed) % strip.width;
  const top = topOnPanel(strip, api.height);

  for (let x = 0; x < api.width; x += 1) {
    const column = (x + offset) % strip.width;
    const tint = tints[strip.kind[column]];
    for (let y = 0; y < strip.height; y += 1) {
      const coverage = strip.ink[column * strip.height + y] / (LEVELS - 1);
      if (coverage <= threshold) continue;
      // 縁の画素だけ暗く落とす。字の芯は満光のまま残るので、にじまずに細い画が生きる。
      const level = 1 - softness * (1 - coverage);
      api.pixel(x, top + y, api.rgb(tint[0] * level, tint[1] * level, tint[2] * level));
    }
  }
}
