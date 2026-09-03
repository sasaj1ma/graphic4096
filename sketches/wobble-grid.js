// 64×64 を 32×32 のセル 2×2 に分割し、各セルの中で楕円と正円をぐにゃぐにゃと変形させる。
// source: リソグラフの4分割ポスター。平らな色面、面を横切る黒い実線の楕円。
// rule: 図形は1つずつ「塗り」と「線」を持つ。大きい順に奥から重ね、奥の線は手前の塗りに隠れる。
//       線は図形の輪郭そのものなので、色面と線が同じ1つの図形として動く。
// exception: 手前の数枚だけ塗りを持たない（塗りなし・線あり）。色面を横切る実線はこれ。

const GRID = 2;           // 1辺のセル数。2→32px、4→16px、8→8px。64 を割り切る値なら差し替えられる。
const CELL = 64 / GRID;   // 1セルの辺。以降の寸法はすべて CELL 比で書く（拡張してもレイアウトが崩れない）。
const SIZE = CELL * GRID; // 盤面の辺。64。
const PERIOD = 14;        // 秒。全セル共通の変形周期。
const TAU = Math.PI * 2;

const EDGE = 0.7;         // 塗りのエッジと線のぼかし幅（px）。0 に近づけるとジャギーになる。
const LINE = 0.25;        // 線の半幅（px）。LED では 0.2〜0.4 がちょうど1px の線に見える。
const SEAM = 0.14;        // セルの内側の境界に落とす影。0 にすると境界は色の変わり目だけになる。
const INK = [10, 10, 14]; // 線の色。LED では消灯に近い黒。全図形が共通の線色を持つ。
const BARE = 2;           // 手前の何枚を「塗りなし・線あり」にするか。0 にすると全図形が塗られる。

// リソグラフの平網に近い、彩度の高い不透明色。
// 紙の原色より一段明るくしている。LED では暗い色面に落とした黒い実線が見えなくなるため。
const GREEN = [26, 148, 84];
const BLUE = [58, 128, 232];
const SAGE = [168, 196, 190];
const PINK = [244, 158, 202];
const ORANGE = [238, 82, 34];
const YELLOW = [248, 190, 26];
const PAPER = [230, 226, 216];

// [地, 塗り] の組。セル番号で順に使い、足りなくなったら先頭へ戻る。
// 先頭4組が GRID = 2 のときの並び。組を足すだけで大きいグリッドへ広げられる。
const PAIRS = [
  [SAGE, GREEN],
  [PINK, BLUE],
  [GREEN, SAGE],
  [BLUE, PINK],
  [YELLOW, ORANGE],
  [ORANGE, YELLOW],
  [PAPER, BLUE],
  [SAGE, PINK],
  [PINK, ORANGE],
  [BLUE, YELLOW],
  [GREEN, YELLOW],
  [PAPER, ORANGE]
];

// 束ねる楕円の本数。セルが小さいほど減らし、図形が潰れないようにする。
const STROKES = Math.max(2, Math.round(CELL / 6));

const clampUnit = (value) => (value < 0 ? 0 : value > 1 ? 1 : value);
const mix = (a, b, t) => a + (b - a) * t;

// 図形は「正規化空間の半径 1 の円」を rx/ry で潰し、rot で傾け、
// harmonics で輪郭を角度方向にゆがめたもの。ぐにゃぐにゃはこの harmonics が作る。
// harmonics: { freq: 輪郭を何山にするか, amp: ゆがみの深さ, k: φ に対する回り方, phase: 初期位相 }
function shape(x, y, rx, ry, rot, harmonics, phi) {
  const cos = Math.cos(rot);
  const sin = Math.sin(rot);
  // ゆがみで膨らむ分を足した、傾いた楕円を囲む矩形の半径。距離計算を省く判定に使う。
  let bulge = 1;
  for (const h of harmonics) bulge += Math.abs(h.amp);
  const margin = LINE + EDGE;

  return {
    x,
    y,
    rx,
    ry,
    cos,
    sin,
    boundX: bulge * (Math.abs(rx * cos) + Math.abs(ry * sin)) + margin,
    boundY: bulge * (Math.abs(rx * sin) + Math.abs(ry * cos)) + margin,
    // 山の位置は毎フレーム同じ式で決まるので、ピクセルループの外で1度だけ畳んでおく。
    waves: harmonics.map((h) => ({ freq: h.freq, amp: h.amp, offset: (h.k ?? 0) * phi + (h.phase ?? 0) }))
  };
}

// 囲み矩形の外なら、輪郭からは線幅より遠い。距離を解かずに捨てられる。
function outside(form, x, y) {
  return Math.abs(x - form.x) > form.boundX || Math.abs(y - form.y) > form.boundY;
}

// 短軸の端を点 (anchorX, anchorY) に固定した楕円。
// 束の全員がこの1点を通るので、傾きを散らすと1点から扇が開く。ポスターの「ピンチ」がこれ。
function anchored(anchorX, anchorY, rx, ry, rot, side, harmonics, phi) {
  const up = -side; // side = 1 なら固定点は図形の下側、-1 なら上側
  return shape(
    anchorX - Math.sin(rot) * ry * up,
    anchorY + Math.cos(rot) * ry * up,
    rx,
    ry,
    rot,
    harmonics,
    phi
  );
}

// 図形までの符号付き距離（px、内側が負）。
// 正規化空間での差分を勾配で割り、px の距離へ戻す。潰れた楕円の端でも線幅が保たれる。
function distance(form, x, y) {
  const dx = x - form.x;
  const dy = y - form.y;
  const localX = dx * form.cos + dy * form.sin;
  const localY = -dx * form.sin + dy * form.cos;
  const nx = localX / form.rx;
  const ny = localY / form.ry;
  // Math.hypot は毎画素だと重いので、ここだけは sqrt で書く。
  const norm = Math.sqrt(nx * nx + ny * ny);
  if (norm < 1e-5) return -Math.min(form.rx, form.ry); // 中心。輪郭からは十分内側。

  const angle = Math.atan2(ny, nx);
  let radius = 1;
  for (let i = 0; i < form.waves.length; i += 1) {
    const wave = form.waves[i];
    radius += wave.amp * Math.sin(wave.freq * angle + wave.offset);
  }
  const gx = localX / (form.rx * form.rx);
  const gy = localY / (form.ry * form.ry);
  const gradient = Math.sqrt(gx * gx + gy * gy) / norm;
  return (norm - radius) / gradient;
}

// セル1つ分の図形と色を作る。すべて cellX/cellY から決まるので、GRID を変えるだけで増える。
function buildCell(cellX, cellY, phi) {
  const index = cellY * GRID + cellX;
  const flip = cellY % 2 === 0 ? 1 : -1;         // 縦に隣り合うセルは上下反転する
  const spin = index % 2 === 0 ? 1 : -1;         // 傾きの向き
  const seed = (index * 0.61803398875) % 1;      // 黄金比で位相をばらす。何セルでも重ならない。
  const offset = seed * TAU;
  const round = (cellX + cellY) % 2 === 0;       // 市松に正円のセルと楕円のセルを置く

  // 図形全体がセルの中をゆっくり漂う。振幅は端が切れすぎない範囲。
  const wander = CELL * 0.035;
  const x = cellX * CELL + CELL / 2 - 0.5 + Math.sin(phi + offset) * wander;
  const y = cellY * CELL + CELL / 2 - 0.5 + Math.sin(2 * phi + offset) * wander * flip * 0.7;

  // セルの主役。面積を保ちながら縦横に伸び縮みする。round のセルはほぼ正円のまま脈打つ。
  const breathe = 1 + 0.09 * Math.sin(phi + offset);
  const base = shape(
    x,
    y,
    CELL * (round ? 0.44 : 0.47) * breathe,
    CELL * (round ? 0.44 : 0.37) * (2 - breathe),
    round ? 0 : flip * 0.06 * TAU * Math.sin(phi + offset),
    round
      ? [{ freq: 3, amp: 0.035, k: 1, phase: offset }, { freq: 5, amp: 0.02, k: -2 }]
      : [{ freq: 2, amp: 0.05, k: 1, phase: offset }, { freq: 3, amp: 0.025, k: 2 }],
    phi
  );

  // 楕円の束。短軸の端を継ぎ目の1点で束ね、傾きを散らして扇に開く。
  // ピンチは行ごとに上下入れ替わるので、縦に隣り合うセルは継ぎ目を挟んで鏡像になる。
  const side = flip;
  const pinchX = cellX * CELL + CELL / 2 - 0.5 + Math.sin(phi * 2 + offset) * CELL * 0.09;
  const pinchY = cellY * CELL + (side === 1 ? CELL - 0.5 : -0.5);
  const spread = (0.035 + 0.03 * Math.sin(phi + offset)) * TAU; // 扇の開き。φ で開いて閉じる。

  // 束の全員が同じ swell と同じ harmonics を共有する。同じ形にゆがむので、
  // ぐにゃぐにゃ動いても入れ子の順序が崩れず、線が団子にならない。
  const swell = 1 + 0.14 * Math.sin(phi + offset);
  const ripple = [{ freq: 2, amp: 0.05, k: 1, phase: offset }, { freq: 3, amp: 0.025, k: -1 }];

  // 束を大きい順に並べる。細い側の数枚は塗りを持たない（色面を横切る実線になる）。
  const bare = Math.min(BARE, STROKES - 1);
  const fan = [];
  for (let i = STROKES - 1; i >= 0; i -= 1) {
    const t = i / (STROKES - 1); // 0 が内側の平たい楕円、1 がセルをまたぐ大きな楕円
    fan.push({
      form: anchored(
        pinchX,
        pinchY,
        CELL * (0.22 + 0.24 * t),
        CELL * (0.3 + 0.55 * t) * swell,
        spin * spread * (t - 0.5) * 2,
        side,
        ripple,
        phi
      ),
      bare: i < bare
    });
  }

  // ゆがまない正円。ぐにゃぐにゃした楕円の中で、これだけが基準の形として残る。
  const radius = CELL * (0.36 + 0.05 * Math.sin(2 * phi + offset));
  const circle = { form: shape(x, y, radius, radius, 0, [], phi), bare: false };

  // 奥から手前への並びは固定する。大きさで並べ替えると、伸び縮みの途中で層が入れ替わって跳ねる。
  // 主役は奥から3枚目、正円は塗られる図形の最前列。
  const seat = Math.min(2, Math.max(0, fan.length - 1)); // 束が短いときも主役を最前面にしない
  const stack = [...fan.slice(0, seat), { form: base, bare: false }, ...fan.slice(seat)];
  stack.splice(Math.max(0, stack.length - bare), 0, circle);

  // 塗りは2色を交互に。隣り合う面が違う色になり、境目に自分の線が残る。
  const [background, accent] = PAIRS[index % PAIRS.length];
  const forms = stack.map((entry, depth) => ({
    form: entry.form,
    fill: entry.bare ? null : depth % 2 === 0 ? accent : background
  }));

  return { background, forms };
}

function renderCell(api, cell, originX, originY) {
  const forms = cell.forms;

  for (let y = originY; y < originY + CELL; y += 1) {
    for (let x = originX; x < originX + CELL; x += 1) {
      let r = cell.background[0];
      let g = cell.background[1];
      let b = cell.background[2];

      // 奥から手前へ、1図形ずつ「塗り→線」の順に置く。距離は1回だけ解いて両方に使う。
      // 手前の図形の塗りが奥の図形の線を覆うので、線は図形の輪郭として振る舞う。
      for (let i = 0; i < forms.length; i += 1) {
        const { form, fill } = forms[i];
        if (outside(form, x, y)) continue;
        const signed = distance(form, x, y);

        if (fill !== null) {
          // 内側ほど距離が負になるので、そのまま被覆率へ変える。
          const covered = clampUnit(0.5 - signed / EDGE);
          if (covered > 0) {
            r = mix(r, fill[0], covered);
            g = mix(g, fill[1], covered);
            b = mix(b, fill[2], covered);
          }
        }

        // 線は自分の塗りの上に乗る。距離の絶対値が線幅の内側にある画素だけ黒くなる。
        const ink = clampUnit(0.5 + (LINE - Math.abs(signed)) / EDGE);
        if (ink > 0) {
          r = mix(r, INK[0], ink);
          g = mix(g, INK[1], ink);
          b = mix(b, INK[2], ink);
        }
      }

      // セルの継ぎ目。隣り合う色が近いときでも分割の構造が読めるように暗く落とす。
      // 盤面の外周は落とさない。囲みの枠が出るとグリッドではなく額縁に見えてしまう。
      if (SEAM > 0 && ((x % CELL === CELL - 1 && x !== SIZE - 1) || (y % CELL === CELL - 1 && y !== SIZE - 1))) {
        r *= 1 - SEAM;
        g *= 1 - SEAM;
        b *= 1 - SEAM;
      }

      api.pixel(x, y, api.rgb(r, g, b));
    }
  }
}

export function draw(api) {
  // 全セル共通の位相。これ1つで盤面のすべての図形が同時に変形し、同時に元へ戻る。
  const phi = (api.time() / PERIOD) * TAU;

  for (let cellY = 0; cellY < GRID; cellY += 1) {
    for (let cellX = 0; cellX < GRID; cellX += 1) {
      renderCell(api, buildCell(cellX, cellY, phi), cellX * CELL, cellY * CELL);
    }
  }
}
