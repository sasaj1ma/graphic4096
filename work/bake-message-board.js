// message board を実機用のヘッダに焼く。
//
// 文字は src/jp-strip.js がブラウザのフォントから焼く。ESP32にフォントは載らないので、
// 焼いた帯をそのままC++の配列にして持っていく。ここはその書き出しだけを受け持つ。
//
// 設定は sketches/message-board.js の SETTINGS が唯一の出どころ。ことばや色を直したら
// このページを開き直して焼き、arduino/LED_Art/MessageBoardData.h を置き換える。

import { LEVELS } from '../src/jp-strip.js';

// 濃さは0〜15。1バイトに2画素、上位ニブルが先。列優先で上から下へ並ぶ。
function packInk(ink) {
  const packed = new Uint8Array(Math.ceil(ink.length / 2));
  for (let index = 0; index < ink.length; index += 1) {
    if (index % 2 === 0) packed[index >> 1] = ink[index] << 4;
    else packed[index >> 1] |= ink[index];
  }
  return packed;
}

function rows(values, perLine, format) {
  const lines = [];
  for (let start = 0; start < values.length; start += perLine) {
    const chunk = Array.from(values.slice(start, start + perLine), format);
    lines.push(`  ${chunk.join(', ')}${start + perLine < values.length ? ',' : ''}`);
  }
  return lines.join('\n');
}

const hex = (value) => `0x${value.toString(16).toUpperCase().padStart(2, '0')}`;

export function emitHeader(strip, settings, panelHeight = 64) {
  const packed = packInk(strip.ink);
  const top = Math.round((panelHeight - strip.cellHeight) / 2) + strip.top;
  const tints = settings.tints.map((tint) => `  {${tint.map((c) => String(c).padStart(3)).join(', ')}}`).join(',\n');

  return `#pragma once
#include <Arduino.h>

// 生成物。手で直さない。work/bake-message-board.html をブラウザで開いて焼き直す。
// 出どころは sketches/message-board.js の SETTINGS。
//
// ことば: ${settings.messages.map((message) => `「${message}」`).join(' ')}
// 文字の高さ ${settings.size}px / 太さ ${settings.weight} / 字間 ${settings.tracking}px / ことばの間 ${settings.gap}px
// 帯 ${strip.width} x ${strip.height} px、濃さ${LEVELS}段。1バイトに2画素で ${packed.length} バイト。

constexpr int kMessageWidth = ${strip.width};   // 帯の全長。ここを一周して繰り返す
constexpr int kMessageHeight = ${strip.height};    // 空の行を落としたあとの高さ
constexpr int kMessageTop = ${top};        // 盤面のこの行から描く
constexpr int kMessageLevels = ${LEVELS};    // 濃さの段数

constexpr float kMessageSpeed = ${settings.speed.toFixed(1)}f;      // 流れる速さ（px/秒）
constexpr float kMessageThreshold = ${settings.threshold}f;  // この濃さ以下は消す
constexpr float kMessageSoftness = ${settings.softness}f;   // 縁の暗さ。0でくっきり1bit

// 文字種ごとの色。0=かな, 1=漢字, 2=記号。
const uint8_t kMessageTints[3][3] PROGMEM = {
${tints}
};

// 列ごとの文字種。
const uint8_t kMessageKind[${strip.kind.length}] PROGMEM = {
${rows(strip.kind, 32, String)}
};

// 濃さ。1バイトに2画素、上位ニブルが先。列優先で、1列ぶん上から下へ並ぶ。
const uint8_t kMessageInk[${packed.length}] PROGMEM = {
${rows(packed, 24, hex)}
};
`;
}
