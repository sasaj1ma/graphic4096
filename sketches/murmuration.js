// ムクドリの大群（murmuration）と、1日の空。
// source: 夕暮れに群れる椋鳥。個々の鳥は単純な3つの規則しか持たない。
// rule: 分離・整列・結合＋ねぐらへの引力。密度が濃いところほど空が翳る。
// exception: ハヤブサ役の点が群れを横切り、割れる・ねじれる瞬間を作る。
//
// 空は kDayLength 秒で1日をひと回りする。夜明け・南中・日没・夜が順に来て、
// 太陽と月が弧を描き、夜には星が出る。
// 天気は kLocation で選んだ地点の実況を Open-Meteo から取得し、
// 雲量・降水・風速・その日の昼の長さを空と群れの飛び方に反映する。
//
// LEDでは「光る鳥」より「明るい空を背にした黒い影」のほうが群れの形が出る。
// ただし夜だけは逆で、月明かりを受けた淡い点として描く。

// -----------------------------
// 調整用の定数
// -----------------------------
const kDayLength = 60;      // 1日ぶんの秒数。60なら1分で朝から夜まで巡る
const kStartHour = 4;       // 起動時の時刻。4なら夜明け前から始まる

const kLocation = '京都府';  // 下の表から選ぶ
const kUseLiveWeather = true; // false にすると kFallbackWeather の空になる
const kForceWeather = null;   // 'sunny' | 'cloudy' | 'rainy' を入れると実況より優先（確認用）
const kFallbackWeather = 'sunny'; // 取得に失敗したときの天気

const kBirdCount = 175;     // 鳥の数。増やすほど群れが濃くなる
const kMaxSpeed = 18;       // 最高速度（ピクセル/秒）
const kMinSpeed = 9;        // 最低速度。止まらせないための下限
const kMaxForce = 110;      // 1秒あたりの舵の強さ（加速度の上限）
const kSeparation = 2.4;    // この距離まで近づくと離れようとする
const kAlignment = 6.0;     // この距離までの仲間と向きを揃える
const kCohesion = 13.0;     // この距離までの仲間の重心へ寄る
const kRoostPull = 0.62;    // ねぐらへ戻る力。大きいほど群れが小さくまとまる
const kSwirl = 26;          // ねぐらのまわりを回り込む力。渦と帯を作る
const kHawkRadius = 12.0;   // ハヤブサから逃げ始める距離
const kInk = 1.9;           // 鳥1羽が空を翳らせる強さ
const kMargin = 7;          // 画面端に近づくと内側へ押し戻す幅
const kStarCount = 44;      // 夜空の星の数

// -----------------------------
// 地点
// -----------------------------
//
// 緯度・経度は各都道府県の県庁所在地。地点を増やすときはここに足す。
const locations = {
  '北海道': { latitude: 43.0642, longitude: 141.3469 },
  '東京都': { latitude: 35.6895, longitude: 139.6917 },
  '京都府': { latitude: 35.0116, longitude: 135.7681 },
  '大阪府': { latitude: 34.6937, longitude: 135.5023 },
  '沖縄県': { latitude: 26.2124, longitude: 127.6809 }
};

// -----------------------------
// 天気
// -----------------------------
//
// cloud / rain / wind は 0〜1 に正規化して持つ。
// daylight は1日のうち昼が占める割合（京都の8月なら0.57前後、冬は0.4台）。
const weatherPresets = {
  sunny: { cloud: 0.08, rain: 0, wind: 0.2 },
  cloudy: { cloud: 0.85, rain: 0, wind: 0.45 },
  rainy: { cloud: 0.97, rain: 0.75, wind: 0.7 }
};

const weather = {
  ...weatherPresets[kFallbackWeather],
  daylight: 0.52,
  label: `${kLocation} / ${kFallbackWeather}`
};

const clampUnit = (value) => Math.max(0, Math.min(1, value));
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const mix = (a, b, t) => a + (b - a) * t;
// 0〜1へなめらかに立ち上げる。空の状態を混ぜるときに使う。
const smoothstep = (edge0, edge1, value) => {
  const t = clampUnit((value - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
};

function applyForcedWeather() {
  if (!kForceWeather || !weatherPresets[kForceWeather]) return;
  Object.assign(weather, weatherPresets[kForceWeather]);
  weather.label = `${kLocation} / ${kForceWeather}（固定）`;
}
applyForcedWeather();

// 実況の取得。ブラウザでだけ動かす。
// 実機（ESP32）へ移すときは、同じURLをHTTPクライアントで叩いて
// cloud / rain / wind / daylight の4つを更新すればよい。
async function loadWeather() {
  const place = locations[kLocation];
  if (!place) {
    console.warn(`[murmuration] 地点「${kLocation}」が locations にありません`);
    return;
  }
  const url = 'https://api.open-meteo.com/v1/forecast'
    + `?latitude=${place.latitude}&longitude=${place.longitude}`
    + '&current=cloud_cover,precipitation,wind_speed_10m'
    + '&daily=sunrise,sunset&timezone=auto&forecast_days=1';
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();

    weather.cloud = clampUnit(data.current.cloud_cover / 100);
    weather.rain = clampUnit(data.current.precipitation / 4);   // 4mm/hで最大
    weather.wind = clampUnit(data.current.wind_speed_10m / 40); // 40km/hで最大

    // 日の出・日の入りから、その日の昼の長さを割合で出す。
    const sunrise = new Date(data.daily.sunrise[0]).getTime();
    const sunset = new Date(data.daily.sunset[0]).getTime();
    weather.daylight = clamp((sunset - sunrise) / 86400000, 0.3, 0.75);

    const sky = weather.rain > 0.05 ? '雨' : weather.cloud > 0.6 ? 'くもり' : weather.cloud > 0.25 ? '晴れ時々くもり' : '晴れ';
    weather.label = `${kLocation} / ${sky}`;
    console.log(`[murmuration] ${weather.label}　雲${Math.round(weather.cloud * 100)}% `
      + `雨${data.current.precipitation}mm 風${data.current.wind_speed_10m}km/h `
      + `昼${(weather.daylight * 24).toFixed(1)}時間`);
  } catch (error) {
    console.warn(`[murmuration] 天気の取得に失敗。${kFallbackWeather} の空で描きます`, error);
  }
}

if (kUseLiveWeather && !kForceWeather && typeof window !== 'undefined') {
  loadWeather();
  setInterval(loadWeather, 10 * 60 * 1000);  // 10分ごとに更新
}

// -----------------------------
// 空の色
// -----------------------------
//
// 上（0）から下（1）へ4点で補間する。時刻に応じてこの3組を混ぜる。
const skyPresets = {
  night: [[10, 14, 44], [20, 24, 62], [32, 32, 74], [52, 44, 88]],
  twilight: [[74, 66, 168], [168, 84, 148], [238, 118, 72], [255, 190, 108]],
  day: [[34, 92, 198], [64, 130, 222], [104, 170, 236], [150, 198, 240]]
};

function stopColor(stops, position) {
  const scaled = clampUnit(position) * (stops.length - 1);
  const left = Math.floor(scaled);
  const right = Math.min(left + 1, stops.length - 1);
  const t = scaled - left;
  return [
    mix(stops[left][0], stops[right][0], t),
    mix(stops[left][1], stops[right][1], t),
    mix(stops[left][2], stops[right][2], t)
  ];
}

// -----------------------------
// 状態
// -----------------------------
//
// 位置と速度は配列で持つ。C++へ移すときもそのまま float 配列にできる。
let birdX = null;
let birdY = null;
let velocityX = null;
let velocityY = null;
let density = null;
let starLight = null;   // 星の明るさ（画素ごと。ほとんど0）
let starPhase = null;   // 星の瞬きの位相
let previousTime = 0;

function reset(api) {
  birdX = new Float32Array(kBirdCount);
  birdY = new Float32Array(kBirdCount);
  velocityX = new Float32Array(kBirdCount);
  velocityY = new Float32Array(kBirdCount);
  density = new Float32Array(api.width * api.height);
  starLight = new Float32Array(api.width * api.height);
  starPhase = new Float32Array(api.width * api.height);

  // 画面中央あたりに、ばらけた向きで配置する。
  for (let i = 0; i < kBirdCount; i += 1) {
    const angle = api.random(0, Math.PI * 2);
    const radius = api.random(0, 12);
    birdX[i] = api.width / 2 + Math.cos(angle) * radius;
    birdY[i] = api.height / 2 + Math.sin(angle) * radius;
    const heading = api.random(0, Math.PI * 2);
    velocityX[i] = Math.cos(heading) * kMaxSpeed * 0.6;
    velocityY[i] = Math.sin(heading) * kMaxSpeed * 0.6;
  }

  // 星は動かないので、位置と明るさを最初に焼き込む。
  // 低い空ほど星は少ない。
  for (let i = 0; i < kStarCount; i += 1) {
    const x = Math.floor(api.random(0, api.width));
    const y = Math.floor(api.random(0, api.height * 0.62));
    const index = y * api.width + x;
    starLight[index] = api.random(0.35, 1);
    starPhase[index] = api.random(0, Math.PI * 2);
  }
}

// 長さを上限で切りそろえる。舵が効きすぎて群れが弾けるのを防ぐ。
function limit(x, y, max) {
  const length = Math.hypot(x, y);
  if (length <= max || length === 0) return [x, y];
  const scale = max / length;
  return [x * scale, y * scale];
}

// 鳥は1ピクセルにぴったり乗らないので、周囲4画素へ重みを分けて置く。
// これで群れの輪郭が階段状にならず、密度の濃淡が滑らかに出る。
function splat(api, x, y, amount) {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  for (let dy = 0; dy <= 1; dy += 1) {
    for (let dx = 0; dx <= 1; dx += 1) {
      const px = x0 + dx;
      const py = y0 + dy;
      if (px < 0 || px >= api.width || py < 0 || py >= api.height) continue;
      const weight = (dx ? fx : 1 - fx) * (dy ? fy : 1 - fy);
      density[py * api.width + px] += amount * weight;
    }
  }
}

export function draw(api) {
  const time = api.time();

  // スケッチを選び直すと time が巻き戻る。そのときは群れを作り直す。
  if (birdX === null || time < previousTime) {
    reset(api);
    previousTime = time;
  }

  // 前フレームからの経過時間で進める。フレームレートが落ちても
  // 群れの速さは変わらない。長く止まったあとの飛び跳ねを防ぐため上限を置く。
  const dt = Math.min(Math.max(time - previousTime, 0), 1 / 30);

  // -----------------------------
  // いまが1日のどこか
  // -----------------------------
  //
  // dayPhase は 0=真夜中、0.5=正午。
  // 昼の長さは地点と季節で変わるので、日の出・日の入りの割合で分ける。
  const dayPhase = ((time / kDayLength) + kStartHour / 24) % 1;
  const sunriseAt = 0.5 - weather.daylight / 2;
  const sunsetAt = 0.5 + weather.daylight / 2;

  let sun;              // 太陽の高さ。-1（真夜中）〜+1（南中）
  let sunProgress = 0;  // 日の出から日の入りまでの進み
  let moonProgress = 0; // 日の入りから日の出までの進み
  const isDaytime = dayPhase > sunriseAt && dayPhase < sunsetAt;
  if (isDaytime) {
    sunProgress = (dayPhase - sunriseAt) / (sunsetAt - sunriseAt);
    sun = Math.sin(sunProgress * Math.PI);
  } else {
    const nightLength = 1 - weather.daylight;
    moonProgress = dayPhase >= sunsetAt
      ? (dayPhase - sunsetAt) / nightLength
      : (dayPhase + 1 - sunsetAt) / nightLength;
    sun = -Math.sin(moonProgress * Math.PI);
  }

  // 夜→昼はなだらかに渡す。
  const dayWeight = smoothstep(-0.32, 0.30, sun);
  const nightWeight = 1 - dayWeight;
  // 朝焼け・夕焼けは太陽が地平線の近くにいる間だけ出る。釣り鐘状にすると
  // 日の出前から日没後まで自然に尾を引く。裾を広く取らないと、
  // 1分で1日を巡るこのスケッチでは焼けが一瞬で終わってしまう。
  const glowWeight = Math.exp(-((sun / 0.34) ** 2)) * 0.9;
  // 午後は大気が霞む。これがないと朝8時と夕方16時が同じ色になる。
  const haze = isDaytime ? sunProgress : 0;

  // 太陽と月の位置。東（左）から西（右）へ弧を描く。
  const horizonY = api.height * 0.92;
  const bodyX = 3 + (isDaytime ? sunProgress : moonProgress) * (api.width - 6);
  const bodyY = horizonY - Math.sin((isDaytime ? sunProgress : moonProgress) * Math.PI)
    * api.height * (isDaytime ? 0.62 : 0.52);

  // -----------------------------
  // 天気を数値にする
  // -----------------------------
  const cloudiness = weather.cloud;
  const rainfall = weather.rain;
  const windiness = weather.wind;
  // 雲は風に流される。風が強い日ほど速い。
  const cloudDrift = time * (0.06 + windiness * 0.5);

  // -----------------------------
  // ねぐらと旋回
  // -----------------------------
  //
  // 昼は高く、夜は低く飛ぶ。8の字の軌道は中央を離れすぎない。
  const roostX = api.width * 0.5 + Math.sin(time * 0.19) * 12
    + Math.sin(time * 0.07 + 0.6) * 4;
  const roostY = api.height * (0.55 - sun * 0.13) + Math.sin(time * 0.27 + 1.3) * 8
    + Math.cos(time * 0.11) * 4;

  // 群れが最も荒れるのは朝夕。真昼と真夜中は落ち着く。
  // 実際の椋鳥も、ねぐら入り前の薄暮にいちばん大きな群れを作る。
  const activity = 0.72 + (1 - Math.abs(sun)) * 0.5;
  const gust = 1 + windiness * 0.55 + rainfall * 0.35;
  const maxSpeed = kMaxSpeed * activity * gust;
  const minSpeed = kMinSpeed * activity;

  const swirl = Math.sin(time * 0.23) * 0.7 + Math.sin(time * 0.09 + 2.1) * 0.4;

  // ハヤブサ。周期の違う2つの sin で画面を横切る。
  const hawkX = api.width * (0.5 + Math.sin(time * 0.41) * 0.55);
  const hawkY = api.height * (0.5 + Math.sin(time * 0.29 + 1.7) * 0.5);

  const separationSquared = kSeparation * kSeparation;
  const alignmentSquared = kAlignment * kAlignment;
  const cohesionSquared = kCohesion * kCohesion;

  for (let i = 0; i < kBirdCount; i += 1) {
    let separationX = 0;
    let separationY = 0;
    let alignX = 0;
    let alignY = 0;
    let alignCount = 0;
    let centerX = 0;
    let centerY = 0;
    let centerCount = 0;

    // -----------------------------
    // 近傍を数える
    // -----------------------------
    //
    // 総当たり（N×N）。175羽なら1フレーム1ms以下で済む。
    // ESP32で羽数を増やすときは、画面を格子に切って近傍だけ見る形にする。
    for (let j = 0; j < kBirdCount; j += 1) {
      if (j === i) continue;
      const dx = birdX[j] - birdX[i];
      const dy = birdY[j] - birdY[i];
      const distanceSquared = dx * dx + dy * dy;
      if (distanceSquared > cohesionSquared) continue;

      // 近すぎる相手からは離れる。距離が近いほど強く効く。
      if (distanceSquared < separationSquared) {
        const inverse = 1 / (distanceSquared + 0.2);
        separationX -= dx * inverse;
        separationY -= dy * inverse;
      }
      // 中距離の相手とは向きを揃える。
      if (distanceSquared < alignmentSquared) {
        alignX += velocityX[j];
        alignY += velocityY[j];
        alignCount += 1;
      }
      // 見えている範囲の重心へ寄る。
      centerX += birdX[j];
      centerY += birdY[j];
      centerCount += 1;
    }

    let accelX = 0;
    let accelY = 0;

    // 分離
    const [sepX, sepY] = limit(separationX * 26, separationY * 26, kMaxForce);
    accelX += sepX * 1.45;
    accelY += sepY * 1.45;

    // 整列：仲間の平均速度へ舵を切る
    if (alignCount > 0) {
      const length = Math.hypot(alignX, alignY) || 1;
      const targetX = (alignX / length) * maxSpeed;
      const targetY = (alignY / length) * maxSpeed;
      const [steerX, steerY] = limit(targetX - velocityX[i], targetY - velocityY[i], kMaxForce);
      accelX += steerX * 1.1;
      accelY += steerY * 1.1;
    }

    // 結合：重心の方向へ
    if (centerCount > 0) {
      const toX = centerX / centerCount - birdX[i];
      const toY = centerY / centerCount - birdY[i];
      const [steerX, steerY] = limit(toX * 3.2, toY * 3.2, kMaxForce);
      accelX += steerX * 1.4;
      accelY += steerY * 1.4;
    }

    // ねぐらへの引力。遠いほど強い。群れが散り切るのを防ぐ。
    const toRoostX = roostX - birdX[i];
    const toRoostY = roostY - birdY[i];
    accelX += toRoostX * kRoostPull;
    accelY += toRoostY * kRoostPull;

    // ねぐら方向に対して直角の力。引力と合わさって螺旋を描く。
    const roostDistance = Math.hypot(toRoostX, toRoostY) + 0.001;
    accelX += (-toRoostY / roostDistance) * kSwirl * swirl;
    accelY += (toRoostX / roostDistance) * kSwirl * swirl;

    // ハヤブサから逃げる。距離が縮むほど急激に強くなるので、
    // 群れの一部だけが弾かれ、残りが後から追う波ができる。
    const hawkDX = birdX[i] - hawkX;
    const hawkDY = birdY[i] - hawkY;
    const hawkDistance = Math.hypot(hawkDX, hawkDY);
    if (hawkDistance < kHawkRadius) {
      const strength = (1 - hawkDistance / kHawkRadius) ** 2 * 420;
      accelX += (hawkDX / (hawkDistance + 0.001)) * strength;
      accelY += (hawkDY / (hawkDistance + 0.001)) * strength;
    }

    // 画面端の手前でやわらかく内側へ押し戻す。
    if (birdX[i] < kMargin) accelX += (kMargin - birdX[i]) * 18;
    if (birdX[i] > api.width - kMargin) accelX -= (birdX[i] - (api.width - kMargin)) * 18;
    if (birdY[i] < kMargin) accelY += (kMargin - birdY[i]) * 18;
    if (birdY[i] > api.height - kMargin) accelY -= (birdY[i] - (api.height - kMargin)) * 18;

    // ゆらぎ。全員が同じ判断をして結晶化するのを崩す。
    // 荒天ほど大きく揺れる。
    const wander = api.noise(birdX[i] * 0.08, birdY[i] * 0.08, time * 0.6 + i * 0.01) - 0.5;
    const turbulence = 14 * (1 + cloudiness * 0.5 + rainfall * 1.4 + windiness * 0.6);
    accelX += Math.cos(wander * 9) * turbulence;
    accelY += Math.sin(wander * 9) * turbulence;

    velocityX[i] += accelX * dt;
    velocityY[i] += accelY * dt;

    // 速度を上下の範囲に収める。上限だけだと群れが止まり、
    // 下限だけだと発散する。
    const speed = Math.hypot(velocityX[i], velocityY[i]) || 0.001;
    const clamped = Math.max(minSpeed, Math.min(maxSpeed, speed));
    velocityX[i] *= clamped / speed;
    velocityY[i] *= clamped / speed;

    birdX[i] += velocityX[i] * dt;
    birdY[i] += velocityY[i] * dt;
  }

  // -----------------------------
  // 密度を作る
  // -----------------------------
  density.fill(0);
  for (let i = 0; i < kBirdCount; i += 1) splat(api, birdX[i], birdY[i], 1);

  // -----------------------------
  // 雨粒の位置
  // -----------------------------
  //
  // 列ごとに1粒。どの列に降らせるかは固定なので、
  // 毎フレームの計算は列数ぶんで済む。
  const rainY = new Float32Array(api.width);
  const rainOn = new Uint8Array(api.width);
  if (rainfall > 0.02) {
    for (let x = 0; x < api.width; x += 1) {
      const seed = api.noise(x * 0.37, 17);
      rainOn[x] = seed < rainfall * 0.75 ? 1 : 0;
      const speed = 55 + seed * 40;
      rainY[x] = (time * speed + seed * 300) % api.height;
    }
  }

  // 星は日が沈むほど強く見え、雲がかかると隠れる。
  const starVisible = smoothstep(0.02, -0.18, sun) * (1 - glowWeight * 0.8);

  // -----------------------------
  // 空を描き、最後に群れを重ねる
  // -----------------------------
  for (let y = 0; y < api.height; y += 1) {
    const position = y / (api.height - 1);
    const nightRow = stopColor(skyPresets.night, position);
    const twilightRow = stopColor(skyPresets.twilight, position);
    const dayRow = stopColor(skyPresets.day, position);

    for (let channel = 0; channel < 3; channel += 1) {
      // 午後の霞。青を白へ寄せる。
      const hazed = mix(dayRow[channel], mix(dayRow[channel], 198, 0.42), haze);
      const base = mix(nightRow[channel], hazed, dayWeight);
      nightRow[channel] = mix(base, twilightRow[channel], glowWeight);
    }

    for (let x = 0; x < api.width; x += 1) {
      let r = nightRow[0];
      let g = nightRow[1];
      let b = nightRow[2];

      // 雲。ノイズの高いところだけを雲にするので、
      // 雲量が増えるほど帯が広がって最後は空を覆う。
      const cloudNoise = api.noise(x * 0.055 + cloudDrift, y * 0.13, time * 0.03);
      const cloudMask = clampUnit((cloudNoise - (1 - cloudiness * 0.95)) * 3.2);
      if (cloudMask > 0) {
        // 雲そのものの明るさ。雨雲ほど暗く、日が高いほど白い。
        const tone = mix(238, 88, rainfall);
        const lit = 0.45 + Math.max(sun, 0) * 0.55;
        // 低い太陽のときは雲の底が焼ける。
        const cloudR = tone * lit + glowWeight * 46;
        const cloudG = tone * lit * 0.98 + glowWeight * 20;
        const cloudB = tone * lit * 1.02;
        const amount = cloudMask * 0.85;
        r = mix(r, cloudR, amount);
        g = mix(g, cloudG, amount);
        b = mix(b, cloudB, amount);
      }

      // 太陽・月。中心の円と、外へ広がる光。
      const bodyDistance = Math.hypot(x - bodyX, y - bodyY);
      if (bodyDistance < 18) {
        const glow = Math.exp(-bodyDistance / (isDaytime ? 2.5 : 1.9)) * (isDaytime ? 0.5 : 0.45);
        const disc = clampUnit((isDaytime ? 2.2 : 1.7) - bodyDistance);
        // 雲に隠れる。厚い雲の日は太陽がぼんやりとしか見えない。
        const veil = 1 - cloudMask * 0.75;
        const strength = (glow + disc * 0.9) * veil;
        if (isDaytime) {
          // 低い太陽は赤く、高い太陽は白い。
          const warmth = 1 - Math.max(sun, 0);
          r += strength * 255;
          g += strength * mix(255, 150, warmth);
          b += strength * mix(240, 70, warmth);
        } else {
          r += strength * 150;
          g += strength * 165;
          b += strength * 200;
        }
      }

      // 星。雲の下では見えない。
      const skyIndex = y * api.width + x;
      if (starVisible > 0 && starLight[skyIndex] > 0) {
        const twinkle = 0.65 + Math.sin(time * 2.4 + starPhase[skyIndex]) * 0.35;
        const shine = starLight[skyIndex] * twinkle * starVisible * (1 - cloudMask) * 150;
        r += shine;
        g += shine;
        b += shine * 1.1;
      }

      // 雨。線ではなく短い縦の光として置く。
      if (rainOn[x]) {
        const drop = Math.abs(y - rainY[x]);
        if (drop < 2.5) {
          const wet = (1 - drop / 2.5) * rainfall * 0.95;
          r = mix(r, 180, wet);
          g = mix(g, 195, wet);
          b = mix(b, 215, wet);
        }
      }

      // -----------------------------
      // 群れを重ねる
      // -----------------------------
      //
      // 密度を0〜1の遮蔽率へ。重なるほど濃くなるが1を超えない。
      const shade = 1 - Math.exp(-density[skyIndex] * kInk);
      if (shade > 0) {
        // 昼は影。夜は逆に、月明かりを受けた淡い点として浮かせる。
        // 暗い空に黒い影を置いても、LEDでは何も見えないため。
        const silhouette = 1 - shade * 0.94;
        // nightWeight だけでなく焼けの残りも見て、夕空では影のままにする。
        const moonlit = clampUnit(nightWeight - glowWeight);
        r = mix(r * silhouette, mix(r, 112, shade), moonlit);
        g = mix(g * silhouette, mix(g, 126, shade), moonlit);
        b = mix(b * silhouette, mix(b, 166, shade), moonlit);
      }

      api.pixel(x, y, api.rgb(r, g, b));
    }
  }
}
