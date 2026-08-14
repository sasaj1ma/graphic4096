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

## スケッチ例

- `approach` — 消失点から抽象物が前景へ迫る、鮮やかな色面のスケッチ
- `eye of sauron` — 炎に包まれた黄橙の目と、縦長の瞳孔
- `lissajous grid` — 16×16のセル16個に並べた青1色のリサージュ図形。12秒周期で全セルが同時に変形する

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
