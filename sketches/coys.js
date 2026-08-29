import { GLYPH_H, textBit } from '../src/font5x7.js';

// 64×64 で COYS（Come On You Spurs）を掲げる応援用のスケッチ。
// source: 濃紺の地に紫でチャントを敷き詰め、その上に白いイタリック・セリフのワードマーク。
// rule: 背景は流れ続け、前景は動かない。奥は騒ぎ、手前の看板は動かない。
// exception: 一定の拍で1行だけが明るく灯り、その行が拍ごとに下へ送られる（手拍子の波）。
// 紋章はスパーズの雄鶏に着想を得た自作のシルエット。実際の紋章の複製ではない。

const NAVY = [12, 16, 62];        // 地
const PURPLE = [86, 46, 180];     // チャントの紫
const PURPLE_DIM = [56, 30, 132]; // 1行おきに落とす紫。奥行きが出る。
const PURPLE_HOT = [140, 92, 240]; // 拍で灯る行の紫
const WHITE = [255, 255, 255];

const BEAT = 0.55;      // 秒。手拍子の間隔。
const PITCH = 11;       // チャント1行の送り（px）
const TOP = -4;         // 1行目の上端。負にして、上下を切り落とす。
const SLANT = 0.5;      // チャントの斜体。1行あたり右へずらす量。
const MARK_SLANT = 0.3; // ワードマークの斜体。SPURS のロゴに合わせて深めに倒す。

// 流す言葉と速さ（px/秒）。符号が向き。行ごとに変えると層が分かれて見える。
// ここに足すか消すかで行数が変わる。1行 11px なので6〜7行が収まる。
const CHANTS = [
  { text: 'COME ON YOU SPURS - ', speed: 7 },
  { text: 'WHITE HART LANE - ', speed: -5 },
  { text: 'AUDERE EST FACERE - ', speed: 9 },
  { text: 'TO DARE IS TO DO - ', speed: -6 },
  { text: 'GLORY GLORY - ', speed: 8 },
  { text: 'PREMIER LEAGUE - ', speed: -4 },
  { text: 'N17 - SPURS - ', speed: 6 }
];

// COYS の4文字。12×16 のドット絵で、縦を太く横を細くしたセリフ体。
// 置くときに下から上へ向けて右へずらし、イタリックにする。
const WORDMARK = [
  [
    '....####....',
    '..##....##..',
    '.##......##.',
    '###.......#.',
    '###.........',
    '###.........',
    '###.........',
    '###.........',
    '###.........',
    '###.........',
    '###.........',
    '###.........',
    '.##.......#.',
    '.##......##.',
    '..##....##..',
    '....####....'
  ],
  [
    '....####....',
    '..##....##..',
    '.##......##.',
    '###......###',
    '###......###',
    '###......###',
    '###......###',
    '###......###',
    '###......###',
    '###......###',
    '###......###',
    '###......###',
    '.##......##.',
    '.##......##.',
    '..##....##..',
    '....####....'
  ],
  [
    '###......##.',
    '.###.....##.',
    '.###....##..',
    '..###...##..',
    '..###..##...',
    '...###.##...',
    '...######...',
    '....####....',
    '.....###....',
    '.....###....',
    '.....###....',
    '.....###....',
    '.....###....',
    '.....###....',
    '.....###....',
    '...#######..'
  ],
  [
    '...######...',
    '..##....##..',
    '.##......#..',
    '.##.........',
    '.##.........',
    '..##........',
    '...###......',
    '....####....',
    '......###...',
    '........##..',
    '.........##.',
    '.........##.',
    '..#......##.',
    '.##......##.',
    '..##....##..',
    '...######...'
  ]
];

// 球に乗る雄鶏。17×22。
// 尾は左上へ、頭は右上へ、胴はその下。この三角の配置だけが鳥に見える鍵で、
// 尾を下げたり胴を中央に置いたりすると、たちまち駒のシルエットになる。
const CREST = [
  '..#.......#.#....',
  '.##.......####...',
  '.###......#####..',
  '.###......######.',
  '.####.....#####..',
  '.####......###...',
  '..####....####...',
  '..#####..#####...',
  '..#############..',
  '..#############..',
  '...############..',
  '...###########...',
  '....##########...',
  '....#########....',
  '.....#######.....',
  '......#...#......',
  '....#########....',
  '...###########...',
  '..#############..',
  '..#############..',
  '...###########...',
  '....#########....'
];

const MARK_GAP = 1;  // COYS の字間
const STACK_GAP = 3; // 紋章とワードマークの間

// 前景は動かないので、置き場所は一度だけ焼いておく。
// 2 = 白い字画、1 = そのまわり1pxの縁。縁は地の色で抜き、紫の上でも字が立つ。
const INK = 2;
const EDGE = 1;
const mark = new Uint8Array(64 * 64);

function plot(x, y) {
  if (x >= 0 && x < 64 && y >= 0 && y < 64) mark[y * 64 + x] = INK;
}

// ドット絵を1枚置く。slant が 0 でなければ、下の行ほど左へ寄せて斜体にする。
function stamp(rows, left, top, slant) {
  const height = rows.length;
  for (let row = 0; row < height; row += 1) {
    const shift = Math.round((height - 1 - row) * slant);
    for (let column = 0; column < rows[row].length; column += 1) {
      if (rows[row][column] === '#') plot(left + column + shift, top + row);
    }
  }
}

function buildMark() {
  const markWidth = WORDMARK.length * 12 + (WORDMARK.length - 1) * MARK_GAP;
  const lean = Math.round((16 - 1) * MARK_SLANT); // 斜体で右へはみ出す分
  const crestHeight = CREST.length;
  const total = crestHeight + STACK_GAP + 16;
  const top = Math.round((64 - total) / 2);

  stamp(CREST, Math.round((64 - CREST[0].length) / 2), top, 0);

  const left = Math.round((64 - markWidth - lean) / 2);
  for (let i = 0; i < WORDMARK.length; i += 1) {
    stamp(WORDMARK[i], left + i * (12 + MARK_GAP), top + crestHeight + STACK_GAP, MARK_SLANT);
  }

  // 字画のまわり1pxを縁に立てる。字画そのものは塗り替えない。
  const solid = mark.slice();
  for (let y = 0; y < 64; y += 1) {
    for (let x = 0; x < 64; x += 1) {
      if (solid[y * 64 + x] === INK) continue;
      let touching = false;
      for (let dy = -1; dy <= 1 && !touching; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          const sx = x + dx;
          const sy = y + dy;
          if (sx < 0 || sx >= 64 || sy < 0 || sy >= 64) continue;
          if (solid[sy * 64 + sx] === INK) { touching = true; break; }
        }
      }
      if (touching) mark[y * 64 + x] = EDGE;
    }
  }
}

buildMark();

export function draw(api) {
  const time = api.time();

  // 拍。叩いた瞬間が 1 で、すぐ減衰する。
  const beat = (time % BEAT) / BEAT;
  const pulse = Math.exp(-beat * 5);
  // 灯る行は拍ごとに1つ下へ送る。手拍子が波になって降りていく。
  const hot = Math.floor(time / BEAT) % CHANTS.length;

  for (let y = 0; y < 64; y += 1) {
    // この画素がどのチャント行の何行目にあたるか。
    const band = Math.floor((y - TOP) / PITCH);
    const inner = y - TOP - band * PITCH;
    const chant = band >= 0 && band < CHANTS.length && inner < GLYPH_H ? CHANTS[band] : null;

    // 斜体。上の行ほど右へ出るので、読み取り位置は左へ戻す。
    const lean = chant ? Math.round((GLYPH_H - 1 - inner) * SLANT) : 0;
    const scroll = chant ? Math.round(chant.speed * time) : 0;

    // 1行おきに紫を落とす。灯る行だけ拍で明るくなる。
    let tone = band % 2 === 0 ? PURPLE : PURPLE_DIM;
    if (chant && band === hot) {
      tone = [
        tone[0] + (PURPLE_HOT[0] - tone[0]) * pulse,
        tone[1] + (PURPLE_HOT[1] - tone[1]) * pulse,
        tone[2] + (PURPLE_HOT[2] - tone[2]) * pulse
      ];
    }

    for (let x = 0; x < 64; x += 1) {
      let color = NAVY;

      if (chant && textBit(chant.text, x - lean + scroll, inner)) color = tone;

      // 前景は最後に置く。縁で地の色に戻してから、字画を白で抜く。
      const stencil = mark[y * 64 + x];
      if (stencil === EDGE) color = NAVY;
      else if (stencil === INK) color = WHITE;

      api.pixel(x, y, api.rgb(color[0], color[1], color[2]));
    }
  }
}
