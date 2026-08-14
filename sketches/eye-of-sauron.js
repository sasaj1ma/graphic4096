// Eye of Sauron — 64×64のための、火と瞳孔だけに還元した表現。
// 明るい外炎 → 黄橙の眼球 → 黒い縦長の瞳孔、の順に重ねる。

const clamp = (value) => Math.max(0, Math.min(1, value));

export function draw(api) {
  const time = api.time();

  for (let y = 0; y < api.height; y += 1) {
    for (let x = 0; x < api.width; x += 1) {
      const px = x / (api.width - 1) - 0.5;
      const py = y / (api.height - 1) - 0.5;
      const flicker = api.noise(x * 0.16, y * 0.1, time * 0.62);
      const turbulence = api.noise(x * 0.06 + 4, y * 0.21, time * 0.31);

      // 煤けた紫黒。炎の外側にだけ赤い残光を置く。
      let red = 11;
      let green = 5;
      let blue = 20 + turbulence * 13;

      // 横長の目を基準にした極座標。境界から外向きに炎が伸びる。
      const angle = Math.atan2(py / 0.12, px / 0.3);
      const eyeDistance = Math.hypot(px / 0.3, py / 0.12);
      const flameNoise = api.noise(
        Math.cos(angle) * 2.9 + 3,
        Math.sin(angle) * 2.9 + 3,
        time * 0.48
      );
      const flameTongues = Math.abs(Math.sin(angle * 7 + time * 1.1)) * 0.38;
      const flameReach = 1.03 + flameNoise * 0.78 + flameTongues;
      const flameStrength = clamp((flameReach - eyeDistance) * 1.5);
      if (flameStrength > 0) {
        const heat = clamp(flameStrength * 0.75 + turbulence * 0.25);
        red = 65 + heat * 190;
        green = 7 + heat * 155;
        blue = 4 + heat * 23;
      }

      // 少し引いた、横長のアーモンド形。中心から端へ行くほど薄く閉じる。
      const eyeWidth = 0.31;
      const eyeHalfHeight = 0.012 + 0.115 * Math.pow(Math.max(0, 1 - Math.abs(px) / eyeWidth), 0.62);
      const inEye = Math.abs(px) < eyeWidth && Math.abs(py) < eyeHalfHeight;
      if (inEye) {
        const fromCenter = Math.abs(py) / eyeHalfHeight;
        const glow = clamp(1 - fromCenter * fromCenter);
        const grain = api.noise(x * 0.3, y * 0.3, time * 0.12);
        red = 255;
        green = 116 + glow * 132;
        blue = 9 + grain * 23;

        // 炎の目らしい不規則な縦長の瞳孔。
        const pupilWidth = 0.017 + Math.sin(py * 42 + time * 1.8) * 0.003;
        const pupil = (px / pupilWidth) ** 2 + (py / 0.13) ** 2 < 1;
        if (pupil) {
          red = 13;
          green = 3;
          blue = 9;
        }
      }

      api.pixel(x, y, api.rgb(red, green, blue));
    }
  }
}
