#pragma once
#include "MatrixConfig.h"
#include "NoiseVeil.h"

// sketches/coys.js の移植。64×64 で COYS（Come On You Spurs）を掲げる応援用。
// source: クラブの紋章とワードマーク。黒地に白い図形だけを置く。
// rule: ノイズは必ず図形の濃さに掛ける。足すと図形のない場所まで光って地が汚れるが、
//       掛けるかぎり 0 に何を掛けても 0 なので、地は黒いまま残る。
// exception: 紋章とワードマークを 32×32 に組み直し、それを4枚並べる。区画ごとに違う
//            ノイズをかけるので、同じ旗が4通りの汚れ方で同時に翻る。
//
//   左上 明滅   ノイズが図形を削り、拍で持ち直す
//   右上 ぼやけ 焦点が外れて戻る。縁は粒に散って吹き付けたようになる
//   左下 グリッチ 帯ごとに横へ飛び、RGB が離れる
//   右下 すりガラス 大きくにじませ、縁に色収差を出して全体に粒を乗せる

namespace coys {

constexpr int kTile = 32;         // 1枚の旗の一辺。これを2×2 に並べて盤面を埋める

constexpr float kBeat = 0.6f;     // 秒。手拍子の間隔。明滅の区画だけがこれで持ち直す
constexpr float kBase = 0.7f;     // 拍と拍の間の見え方。下げるほどノイズに食われる
constexpr float kSurge = 0.3f;    // 拍で持ち直す量。0 にすると拍が消えてノイズだけになる
constexpr float kGrainFps = 24.0f; // 粒を引き直す速さ。低いほどフィルムらしくざらつく

constexpr int kBlur = 2;          // ぼやけとすりガラスのにじみ半径。旗が小さいので 64 版の半分
constexpr float kSprayFocus = 0.85f; // ぼやけの焦点が動く速さ（周/秒に比例）
constexpr float kGlitchFps = 12.0f;  // グリッチが跳ぶ速さ
constexpr float kGlitchRate = 0.7f;  // これを超えた帯だけが飛ぶ。1 に近づけるほど静かになる
constexpr int kGlitchBand = 2;    // 飛ぶ帯の高さ。旗が小さいので薄く刻む
constexpr int kGlitchJump = 7;    // 飛ぶ幅。旗の幅の2割ほど。これ以上だと字が枠の外へ抜ける

constexpr float kMarkSlant = 0.28f; // ワードマークの斜体。SPURS のロゴに合わせて深めに倒す

constexpr int kMarkW = 6;
constexpr int kMarkH = 9;
constexpr int kMarkGap = 1;       // COYS の字間
constexpr int kStackGap = 2;      // 紋章とワードマークの間
constexpr int kCrestW = 11;
constexpr int kCrestH = 18;

// COYS の4文字。6×9 のドット絵。32 の幅に4文字を収めるための寸法で、
// 縦画は2px、横画は1px。この差が字を締める。置くときに下から上へ右へずらして倒す。
const char* const kWordmark[4][kMarkH] = {
  {
    ".####.",
    "##..##",
    "##....",
    "##....",
    "##....",
    "##....",
    "##....",
    "##..##",
    ".####."
  },
  {
    ".####.",
    "##..##",
    "##..##",
    "##..##",
    "##..##",
    "##..##",
    "##..##",
    "##..##",
    ".####."
  },
  {
    "##..##",
    "##..##",
    ".####.",
    "..##..",
    "..##..",
    "..##..",
    "..##..",
    "..##..",
    ".####."
  },
  {
    ".####.",
    "##..##",
    "##....",
    ".##...",
    "..##..",
    "...##.",
    "....##",
    "##..##",
    ".####."
  }
};

// 球に乗る雄鶏。11×18。64 版の 15×36 を半分に詰め直したもの。
// 頭は左上、首は縦に4行。尾は右へ刃のように張り出し、上の縁を斜めに切り上げる。
// この斜めが消えると胴と尾がひと塊になり、脚と球と合わせて聖杯の形に見えてしまう。
// 首の白抜きとボールの縫い目は落とした。この大きさでは1pxの隙間になり、形が割れて読めなくなる。
const char* const kCrest[kCrestH] = {
  ".##........",
  ".###.......",
  ".###.......",
  ".###.....#.",
  ".###....###",
  "####...####",
  "###########",
  ".#########.",
  "..######...",
  "...####....",
  "....##.....",
  "....##.....",
  "..######...",
  ".########..",
  "##########.",
  "##########.",
  ".########..",
  "..######..."
};

// 図形は動かないので、置き場所と場は起動時に一度だけ焼く。どれも旗1枚分の 32×32 で、
// 4区画がこの同じ場を読む。sharp は輪郭の立った写し、mid はその少し先、soft は大きくにじませた写し。
// 区画ごとに使い分ける。色収差は sharp から読むと虹色に割れるので mid を使う。
static uint8_t mask[kTile * kTile];
static float sharp[kTile * kTile];
static float mid[kTile * kTile];
static float soft[kTile * kTile];
static Veil veil;
static bool markReady = false;

inline void plot(int x, int y) {
  if (x >= 0 && x < kTile && y >= 0 && y < kTile) mask[y * kTile + x] = 1;
}

// ドット絵を1枚置く。slant が 0 でなければ、下の行ほど左へ寄せて斜体にする。
inline void stamp(const char* const* rows, int height, int left, int top, float slant) {
  for (int row = 0; row < height; row++) {
    const int shift = static_cast<int>(roundf((height - 1 - row) * slant));
    for (int column = 0; rows[row][column] != '\0'; column++) {
      if (rows[row][column] == '#') plot(left + column + shift, top + row);
    }
  }
}

inline void buildMark() {
  constexpr int kMarkCount = 4;
  const int markWidth = kMarkCount * kMarkW + (kMarkCount - 1) * kMarkGap;
  const int lean = static_cast<int>(roundf((kMarkH - 1) * kMarkSlant)); // 斜体で右へはみ出す分
  const int total = kCrestH + kStackGap + kMarkH;
  const int top = static_cast<int>(roundf((kTile - total) / 2.0f));

  memset(mask, 0, sizeof(mask));
  stamp(kCrest, kCrestH, static_cast<int>(roundf((kTile - kCrestW) / 2.0f)), top, 0);

  const int left = static_cast<int>(roundf((kTile - markWidth - lean) / 2.0f));
  for (int i = 0; i < kMarkCount; i++) {
    stamp(kWordmark[i], kMarkH, left + i * (kMarkW + kMarkGap), top + kCrestH + kStackGap, kMarkSlant);
  }

  for (int i = 0; i < kTile * kTile; i++) sharp[i] = mid[i] = soft[i] = mask[i] ? 1.0f : 0.0f;
  soften(sharp, 1, kTile);
  normalizeField(sharp, kTile * kTile);
  soften(mid, 1, kTile);
  soften(mid, 1, kTile);
  normalizeField(mid, kTile * kTile);
  soften(soft, kBlur, kTile);
  soften(soft, kBlur, kTile);
  normalizeField(soft, kTile * kTile);

  veil.size = kTile;
  veil.dust = 0.0f;  // 地に粒を散らさない
  veil.setMask(mask, kBlur);
  markReady = true;
}

inline Rgb mono(float value) {
  const uint8_t level = byteClamp(value * 255.0f);
  return {level, level, level};
}

// 左上。ノイズが図形を削り、拍で持ち直す。
inline Rgb flicker(int x, int y) {
  return mono(veil.sample(x, y));
}

// 右上。焦点がゆっくり外れて戻る。粒は場に比例するので、縁だけが吹き付けたように散る。
inline Rgb spray(int x, int y, float time, int frame) {
  const int index = y * kTile + x;
  const float focus = 0.5f + 0.5f * sinf(time * kSprayFocus);
  const float field = soft[index] + (sharp[index] - soft[index]) * focus;
  if (field <= 0.002f) return mono(0);
  const float speck = grainAt(x, y, frame);
  return mono(unitClamp(field * 1.7f - 0.12f + (speck - 0.5f) * 0.9f * field));
}

// 左下。帯ごとに横へ飛ばし、RGB を離す。飛ぶのは一部の帯だけにする。
// 全部動かすと砂嵐になって、何が書いてあるか分からなくなる。
inline Rgb glitch(int x, int y, float time) {
  const int tick = static_cast<int>(time * kGlitchFps);
  const int band = y / kGlitchBand;
  const float roll = grainAt(band, tick, 5);
  const bool still = roll < kGlitchRate;
  const int jump = still ? 0 : static_cast<int>(roundf((grainAt(band, tick, 9) - 0.5f) * 2.0f * kGlitchJump));
  const int split = still ? 0 : 1 + static_cast<int>(roundf(grainAt(band, tick, 11)));
  const float boost = roll > 0.96f ? 1.7f : 1.0f; // たまに帯が白く飛ぶ
  return rgb(
    unitClamp(sampleField(sharp, x + jump + split, y, kTile) * boost) * 255.0f,
    unitClamp(sampleField(sharp, x + jump, y, kTile) * boost) * 255.0f,
    unitClamp(sampleField(sharp, x + jump - split, y, kTile) * boost) * 255.0f
  );
}

// 右下。芯はそのまま、まわりへ光を広げ、色収差で縁に暖色と寒色を出す。
// 芯までぼかすと字が溶けて読めなくなる。にじむのは光だけで、形は残す。
// 赤を右下から、青を左上から読むので、左上の縁が暖かく、右下の縁が冷たくなる。
// ずれ幅は旗の大きさではなく画素で決める。1px を切ると収差が見えなくなる。
inline Rgb glass(int x, int y, float time, int frame) {
  const float drift = 0.6f + 0.35f * sinf(time * 0.5f);
  const float r = sampleField(mid, x + drift, y + drift, kTile);
  const float g = sampleField(mid, x, y, kTile);
  const float b = sampleField(mid, x - drift, y - drift, kTile);
  const float halo = soft[y * kTile + x];
  if (r <= 0.002f && g <= 0.002f && b <= 0.002f && halo <= 0.002f) return mono(0);

  // 32 の旗は字画が2pxしかない。64 版の 2.4 まで上げると芯が溶けて白い塊になる。
  const float gain = 1.7f; // 芯を白く飛ばす。低いと収差だけが目立って虹色になる
  const float core = unitClamp(g * gain);
  // 粒は芯では効かず、裾でざらつく。ここも場に掛けるので地は黒いまま。
  const float rough = 1.0f - 0.6f * (1.0f - grainAt(x, y, frame)) * (1.0f - core);
  // 光の裾は青に寄せる。実物の発光も外へ行くほど冷たい。
  return rgb(
    unitClamp(r * gain + halo * 0.2f) * rough * 255.0f,
    unitClamp(g * gain + halo * 0.18f) * rough * 255.0f,
    unitClamp(b * gain + halo * 0.3f) * rough * 255.0f
  );
}

}  // namespace coys

inline void drawCoys(float time) {
  using namespace coys;

  if (!markReady) buildMark();

  // 拍。叩いた瞬間が 1 で、すぐ減衰する。
  const float kick = expf(-(fmodf(time, kBeat) / kBeat) * 4.0f);
  veil.update(time, kBase + kSurge * kick);
  const int frame = static_cast<int>(time * kGrainFps);

  // 4区画とも同じ 32×32 の旗を読む。違うのはかけるノイズだけ。
  for (int y = 0; y < kMatrixHeight; y++) {
    const bool lower = y >= kTile;
    const int ly = y - (lower ? kTile : 0);
    for (int x = 0; x < kMatrixWidth; x++) {
      const bool right = x >= kTile;
      const int lx = x - (right ? kTile : 0);
      const Rgb color = lower
        ? (right ? glass(lx, ly, time, frame) : glitch(lx, ly, time))
        : (right ? spray(lx, ly, time, frame) : flicker(lx, ly));
      pixel(x, y, color);
    }
  }
}
