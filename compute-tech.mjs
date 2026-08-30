// ============================================================
// Carmon Tradegar · compute-tech.mjs
// Indicadores técnicos calculados desde el precio (GRATIS, sin fuente externa).
// Validado contra los datos existentes: los diarios salen EXACTOS.
//   rsi1d = RSI(14) · ema1d = %dist a EMA(21) · bb1d = posición Bollinger(20,2)
//   mayer = precio/SMA(200) · ma2y = precio/SMA(730) · picycle = SMA(111)/(2·SMA(350))
//   *1w = versión semanal (RSI14/EMA21/BB20 sobre cierres semanales)
// Uso: import { technicalsFor } from './compute-tech.mjs'
//   technicalsFor(prices)  -> {rsi1d,ema1d,bb1d,mayer,ma2y,picycle,rsi1w,ema1w,bb1w}
//   `prices` = array de cierres diarios ascendente, el último = hoy.
// ============================================================
"use strict";

export function sma(arr, i, p) {
  if (i + 1 < p) return null;
  let s = 0;
  for (let k = i - p + 1; k <= i; k++) s += arr[k];
  return s / p;
}

export function emaSeries(arr, p) {
  const k = 2 / (p + 1);
  const out = new Array(arr.length);
  let e = arr[0];
  out[0] = e;
  for (let i = 1; i < arr.length; i++) { e = arr[i] * k + e * (1 - k); out[i] = e; }
  return out;
}

// RSI de Wilder
export function rsiLast(arr, p) {
  if (arr.length <= p) return null;
  let g = 0, l = 0;
  for (let i = 1; i <= p; i++) { const d = arr[i] - arr[i - 1]; if (d >= 0) g += d; else l -= d; }
  let ag = g / p, al = l / p;
  for (let i = p + 1; i < arr.length; i++) {
    const d = arr[i] - arr[i - 1];
    ag = (ag * (p - 1) + (d > 0 ? d : 0)) / p;
    al = (al * (p - 1) + (d < 0 ? -d : 0)) / p;
  }
  return 100 - 100 / (1 + (al === 0 ? 100 : ag / al));
}

// Posición dentro de las Bandas de Bollinger (0=banda baja, 1=banda alta)
export function bbPosLast(arr, p, mult) {
  const i = arr.length - 1;
  if (i + 1 < p) return null;
  const m = sma(arr, i, p);
  let v = 0;
  for (let k = i - p + 1; k <= i; k++) v += (arr[k] - m) ** 2;
  const sd = Math.sqrt(v / p);
  const up = m + mult * sd, lo = m - mult * sd;
  return up === lo ? 0.5 : (arr[i] - lo) / (up - lo);
}

// Reagrupa cierres diarios en cierres semanales (semana ISO, inicio lunes).
// La última semana (parcial) se cierra con el precio de hoy.
export function toWeekly(prices, dates) {
  const closes = [];
  let curKey = null, curClose = null;
  for (let i = 0; i < prices.length; i++) {
    const dt = new Date(dates[i] + "T00:00:00Z");
    const days = Math.floor(dt / 86400000);
    const key = Math.floor((days - ((dt.getUTCDay() - 1 + 7) % 7)) / 7);
    if (key !== curKey) { if (curClose !== null) closes.push(curClose); curKey = key; }
    curClose = prices[i];
  }
  if (curClose !== null) closes.push(curClose);
  return closes;
}

const round = (x, d) => x == null ? null : +x.toFixed(d);

// Calcula todos los indicadores técnicos para el ÚLTIMO día.
export function technicalsFor(prices, dates) {
  const i = prices.length - 1;
  const px = prices[i];
  const emaD = emaSeries(prices, 21);
  const w = toWeekly(prices, dates);
  const emaW = emaSeries(w, 21);
  const sMayer = sma(prices, i, 200);
  const s2y = sma(prices, i, 730);
  const s111 = sma(prices, i, 111);
  const s350 = sma(prices, i, 350);
  return {
    rsi1d: round(rsiLast(prices, 14), 2),
    ema1d: round((px / emaD[i] - 1) * 100, 2),
    bb1d: round(bbPosLast(prices, 20, 2), 2),
    mayer: sMayer ? round(px / sMayer, 3) : null,
    ma2y: s2y ? round(px / s2y, 2) : null,
    picycle: (s111 && s350) ? round(s111 / (2 * s350), 4) : null,
    rsi1w: round(rsiLast(w, 14), 2),
    ema1w: round((w[w.length - 1] / emaW[w.length - 1] - 1) * 100, 2),
    bb1w: round(bbPosLast(w, 20, 2), 2),
  };
}
