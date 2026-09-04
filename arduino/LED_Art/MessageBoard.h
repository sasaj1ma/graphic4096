#pragma once
#include "MatrixConfig.h"
#include "MessageBoardData.h"

// 新幹線の車内案内のような、横に流れる電光掲示板。
// source: 黒地を右から左へ流れる1行。漢字は紫、かな・記号は白っぽく光る。
// rule: 文字は焼いた帯を1列ずつ読むだけ。実機にフォントは載せない。
// exception: 送りは整数px。なめらかに動かすとLEDらしさが消えるので、1pxずつ跳ねさせる。
//
// 帯は MessageBoardData.h にある。ブラウザのプレビューと同じ関数で焼いたものなので、
// ことばを変えるときは sketches/message-board.js を直し、
// work/bake-message-board.html で焼き直してヘッダを差し替える。

// 濃さ0〜15を、その画素の明るさに変える。
// しきい値以下は消し、残った縁だけ暗く落とす。字の芯は満光のまま残るので、
// にじまずに細い画が生きる。プレビューと同じ式。
inline float messageBrightness(uint8_t level) {
  const float coverage = level / static_cast<float>(kMessageLevels - 1);
  if (coverage <= kMessageThreshold) return 0.0f;
  return 1.0f - kMessageSoftness * (1.0f - coverage);
}

inline void drawMessageBoard(float time) {
  // 帯の全長で一周する。時刻から直に出すので、フレームが飛んでも位置は狂わない。
  const int offset = static_cast<int32_t>(time * kMessageSpeed) % kMessageWidth;

  for (int x = 0; x < kMatrixWidth; x++) {
    // offset は帯の中にあり、x は 64 未満。1回引けば必ず範囲に戻る。
    int column = offset + x;
    if (column >= kMessageWidth) column -= kMessageWidth;

    const uint8_t kind = pgm_read_byte(&kMessageKind[column]);
    const float r = pgm_read_byte(&kMessageTints[kind][0]);
    const float g = pgm_read_byte(&kMessageTints[kind][1]);
    const float b = pgm_read_byte(&kMessageTints[kind][2]);

    for (int y = 0; y < kMatrixHeight; y++) {
      const int row = y - kMessageTop;
      if (row < 0 || row >= kMessageHeight) {
        pixel(x, y, rgb(0, 0, 0)); // 行の外は消す。裏バッファに前の絵が残るため。
        continue;
      }

      // 1バイトに2画素。上位ニブルが先。列優先で1列ぶん上から下へ並ぶ。
      const int index = column * kMessageHeight + row;
      const uint8_t packed = pgm_read_byte(&kMessageInk[index >> 1]);
      const uint8_t level = (index & 1) ? (packed & 0x0F) : (packed >> 4);

      const float brightness = messageBrightness(level);
      pixel(x, y, rgb(r * brightness, g * brightness, b * brightness));
    }
  }
}
