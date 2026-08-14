// 奥の消失点から、幾何学と有機性の中間にある物体が手前へ迫る。
// source: 鮮やかな演劇ポスターの色面と、奥行きを持つグリッド
// rule: 各物体は中心から始まり、同じ軌道を保ったまま拡大する。
// exception: 輪郭に周期的なゆがみを加え、完全な幾何学から外す。

const colors = [
  [244, 71, 172],  // vivid pink
  [255, 123, 95],  // coral
  [196, 244, 54],  // lime
  [72, 142, 232],  // blue
  [151, 101, 222], // violet
  [87, 215, 161]   // green
];

const fract = (value) => value - Math.floor(value);

function rotate(x, y, angle) {
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  return [x * cosine - y * sine, x * sine + y * cosine];
}

function objectContains(x, y, object, time) {
  const [localX, localY] = rotate(x - object.x, y - object.y, -object.rotation);
  const horizontal = localX / object.size;
  const vertical = localY / object.size;
  const radius = Math.hypot(horizontal, vertical);
  const angle = Math.atan2(vertical, horizontal);

  if (object.type === 0) {
    // 歪んだ円：花弁にも、膨らんだ多角形にも見える。
    const edge = 0.72 + Math.sin(angle * 3 + object.seed + time * 0.7) * 0.12
      + Math.cos(angle * 5 - object.seed) * 0.06;
    return radius < edge;
  }

  if (object.type === 1) {
    // 角の丸い台形。時間で片側だけ呼吸させる。
    const width = 0.68 + Math.sin(vertical * 3 + object.seed) * 0.13;
    const height = 0.56 + Math.cos(horizontal * 2 + time + object.seed) * 0.08;
    const rounded = Math.max(Math.abs(horizontal) - width, Math.abs(vertical) - height);
    return rounded < 0;
  }

  // レンズ形のリボン。グリッド的な斜線と有機的な曲線の中間。
  const curve = Math.abs(vertical - Math.sin(horizontal * 2.8 + object.seed) * 0.22);
  return Math.abs(horizontal) < 0.9 && curve < 0.22 + Math.cos(horizontal * 3) * 0.08;
}

export function draw(api) {
  const time = api.time();
  const background = api.rgb(27, 18, 57);
  api.clear(background);

  const count = 11;
  for (let index = 0; index < count; index += 1) {
    // 0 は最も奥、1 は画面端の外。画面外へ抜け切ってから循環する。
    const phase = fract(time * 0.085 + index / count);
    const size = 0.05 + Math.pow(phase, 1.85) * 0.4;
    const direction = index * 2.41 + Math.sin(index * 1.7) * 0.45;
    // 最終地点を画面の外に置くため、切り替わり時に物体は見えていない。
    const orbit = phase * 1.16;
    const object = {
      x: 0.5 + Math.cos(direction) * orbit,
      y: 0.5 + Math.sin(direction) * orbit,
      size,
      rotation: direction + phase * 2.7 + Math.sin(time * 0.5 + index) * 0.2,
      seed: index * 1.91,
      type: index % 3,
      color: colors[index % colors.length]
    };

    for (let y = 0; y < api.height; y += 1) {
      for (let x = 0; x < api.width; x += 1) {
        const normalizedX = x / (api.width - 1);
        const normalizedY = y / (api.height - 1);
        if (!objectContains(normalizedX, normalizedY, object, time)) continue;

        // 奥の物体ほどやや暗く、手前に迫るほど鮮やかにする。
        const light = 0.58 + phase * 0.42;
        api.pixel(x, y, api.rgb(
          object.color[0] * light,
          object.color[1] * light,
          object.color[2] * light
        ));
      }
    }
  }
}
