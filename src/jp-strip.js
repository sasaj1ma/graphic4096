// 日本語の1行を、横に流すための細長いビットマップへ焼く。
// ブラウザのフォントで1度だけラスタライズし、列ごとに「濃さ」と「文字種」を持つ帯にする。
//
// sketches/message-board.js（プレビュー）と work/bake-message-board.html（実機用データ）が
// どちらもこの関数を通る。実機とプレビューが同じ絵になるのは、焼く場所が1つだからである。
//
// 濃さは0〜15の16段に丸めてある。実機のヘッダが1バイトに2画素詰める形なので、
// プレビュー側も同じ16段で見ておかないと、焼いた瞬間に絵が変わる。

export const KIND_KANA = 0;   // ひらがな・カタカナ・英数
export const KIND_KANJI = 1;  // 漢字
export const KIND_MARK = 2;   // 読点や記号
export const KIND_NAMES = ['kana', 'kanji', 'mark'];

export const LEVELS = 16;     // 濃さの段数。実機の4bitに合わせている

// 文字種で色を分けるための判定。
export function kindOf(character) {
  const code = character.codePointAt(0);
  if (code >= 0x3041 && code <= 0x30ff) return KIND_KANA;   // ひらがな・カタカナ
  if (code === 0x3005 || (code >= 0x3400 && code <= 0x9fff)) return KIND_KANJI;
  if (code >= 0xf900 && code <= 0xfaff) return KIND_KANJI;  // 互換漢字
  if ((code >= 0x30 && code <= 0x39) || (code >= 0x41 && code <= 0x5a) || (code >= 0x61 && code <= 0x7a)) return KIND_KANA;
  return KIND_MARK;
}

// ことばの列を1本の帯に焼く。返り値は列優先（column * height + row）の並び。
// 流すときは1列ずつ読むので、この向きだと隣り合う値が連続して並ぶ。
export function buildStrip({ messages, size, weight, tracking, gap, font }) {
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d', { willReadFrequently: true });
  const fontSpec = `${weight} ${size}px ${font}`;

  // まず各文字の幅を測り、帯の全長を決める。
  context.font = fontSpec;
  const glyphs = [];
  let width = 0;
  for (const message of messages) {
    for (const character of message) {
      const advance = Math.max(1, Math.round(context.measureText(character).width) + tracking);
      glyphs.push({ character, left: width, advance });
      width += advance;
    }
    width += gap;
  }

  const cellHeight = Math.ceil(size * 1.32);
  canvas.width = width;
  canvas.height = cellHeight;
  context.font = fontSpec;          // canvasのサイズ変更で状態が戻るので、もう1度指定する
  context.textBaseline = 'middle';
  context.textAlign = 'left';
  context.fillStyle = '#fff';
  context.clearRect(0, 0, width, cellHeight);

  const kind = new Uint8Array(width);
  for (const glyph of glyphs) {
    context.fillText(glyph.character, glyph.left, cellHeight / 2);
    kind.fill(kindOf(glyph.character), glyph.left, glyph.left + glyph.advance);
  }

  // アルファだけ取り出して16段に丸める。以降canvasには触らない。
  const alpha = context.getImageData(0, 0, width, cellHeight).data;
  const cell = new Uint8Array(width * cellHeight);
  for (let y = 0; y < cellHeight; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const value = alpha[(y * width + x) * 4 + 3];
      cell[x * cellHeight + y] = Math.round((value / 255) * (LEVELS - 1));
    }
  }

  // 上下の空行を落とす。実機の容量がそのぶん減り、行の位置合わせも1か所で済む。
  let top = 0;
  let bottom = cellHeight - 1;
  const rowIsEmpty = (y) => {
    for (let x = 0; x < width; x += 1) if (cell[x * cellHeight + y] !== 0) return false;
    return true;
  };
  while (top < cellHeight && rowIsEmpty(top)) top += 1;
  while (bottom > top && rowIsEmpty(bottom)) bottom -= 1;

  const height = bottom - top + 1;
  const ink = new Uint8Array(width * height);
  for (let x = 0; x < width; x += 1) {
    for (let y = 0; y < height; y += 1) ink[x * height + y] = cell[x * cellHeight + (top + y)];
  }

  return { width, height, cellHeight, top, ink, kind };
}

// 帯を盤面のどの行から描くか。字を欠かさず、上下の余りを均す。
export function topOnPanel(strip, panelHeight) {
  return Math.round((panelHeight - strip.cellHeight) / 2) + strip.top;
}
