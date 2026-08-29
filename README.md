# LED Sketch

64×64 HUB75 LED作品のための、ブラウザ上の小さなスケッチ環境です。作品はZedで編集し、ブラウザで動きを確認します。プレビューは、黒い基板上に丸い発光点が並ぶLEDパネル風の表示です。

## 起動

1. このフォルダをZedで開く。
2. ターミナルで `npm install` を一度だけ実行する。
3. `npm run dev` を実行し、表示されたURLをブラウザで開く。

`sketches/plasma.js` を編集して保存すると、ブラウザは自動更新されます。

`sketches/` に `draw(api)` をexportする `.js` ファイルを追加すると、開発サーバーの更新後に画面上部の **SKETCH** メニューから選べます。

## 画像を64×64で試す

メニューの `image preview` は `public/images/images-1.jpeg` を64×64へ縮小して表示します。別の画像を試すには、このファイルを同名で差し替えます。縦横比が異なる画像は中央を正方形にトリミングします。

写真はそのままだとLED上で暗く沈むため、読み込み時にレベル補正・ガンマ・彩度で明るさを整えています。効き具合は `sketches/image-preview.js` 冒頭の4つの定数（`kBlackPoint` / `kWhitePoint` / `kGamma` / `kSaturation`）で調整できます。暗さに一番効くのは `kGamma` で、値を下げるほど明るくなります。

## スケッチ例

- `approach` — 消失点から抽象物が前景へ迫る、鮮やかな色面のスケッチ
- `eye of sauron` — 炎に包まれた黄橙の目と、縦長の瞳孔
- `lissajous grid` — 16×16のセル16個に並べた青1色のリサージュ図形。12秒周期で全セルが同時に変形する
- `murmuration` — 遠くの空を舞うムクドリの大群と、1分で巡る1日。260羽が分離・整列・結合の3規則で飛ぶ

## murmuration の時間と天気

`murmuration` の空は `kDayLength` 秒（初期値60）で1日をひと回りします。夜明け前から始まり、朝焼け・南中・夕焼け・夜と移り、太陽と月が東から西へ弧を描きます。夜には星が出ます。群れは昼は影として、夜は月明かりを受けた淡い点として描かれます。

天気は `kLocation` で選んだ地点の実況を [Open-Meteo](https://open-meteo.com/)（APIキー不要）から取得し、10分ごとに更新します。雲量・降水量・風速に加え、その日の日の出・日の入りから昼の長さを取っているので、京都の8月なら昼が13.4時間、冬なら10時間台になります。天気は空の見え方だけでなく群れの飛び方にも効き、荒天ほど速く乱れて飛びます。

冒頭の定数で切り替えます。

| 定数 | 役割 |
| --- | --- |
| `kDayLength` | 1日ぶんの秒数。長くするとゆっくり巡る |
| `kStartHour` | 起動時の時刻 |
| `kLocation` | 地点。`locations` の表から選ぶ（増やすのは緯度経度を足すだけ） |
| `kUseLiveWeather` | `false` で通信しない。`kFallbackWeather` の空になる |
| `kForceWeather` | `'sunny'` `'cloudy'` `'rainy'` を入れると実況より優先。荒天の見え方を確認するとき用 |

通信を一切させたくないときは `kUseLiveWeather = false` にします。取得に失敗した場合も `kFallbackWeather` の空で描き続けます。

## 最小API

```js
export function draw(api) {
  api.clear();
  api.pixel(10, 10, api.rgb(255, 0, 0));
}
```

- `api.width`, `api.height` — どちらも64
- `api.pixel(x, y, color)` — 1ピクセルを描く
- `api.clear(color)` — 画面を塗る
- `api.rgb(r, g, b)`, `api.hsv(h, s, v)` — 色を作る
- `api.palette('fire' | 'ocean' | 'neon', t)` — 0〜1の値を色に変換
- `api.noise(x, y, z)` — 0〜1の滑らかなノイズ
- `api.time()` — 起動してからの秒数
- `api.random(min, max)` — ランダム値

スペースキーで一時停止・再開できます。

## 実機へ

この環境は「試作→C++へ手で移植」のためのものです。`for`ループ、`sin`、状態更新、ノイズ計算などのアルゴリズムは保ち、`api.pixel()` をESP32側のLED描画関数へ置き換えます。
