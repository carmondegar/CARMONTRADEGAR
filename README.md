# Carmon Tradegar

Panel de decisión de capital sobre Bitcoin, **autocontenido y con actualización automática gratuita**.

La web que ven los visitantes es un único archivo: **`index.html`** (se sirve en GitHub Pages).
Ese archivo se **reconstruye solo** a partir de las piezas del repo.

## Estructura

```
index.html          ← la web (GENERADA, no se edita a mano)
build.mjs           ← reconstruye index.html desde src/ + vendor/
vendor/             ← React y Babel incrustados (versiones fijas)
src/                ← código de la app (JS + JSX + CSS)
   app/  pro/  sbambu/
automatizacion/     ← el "robot" de datos
   fetch-datos.mjs    baja precio (Binance) + calcula técnicos + on-chain (BRK)  → datos-hoy.json
   build-datos.mjs    añade la fila de hoy a src/app/*_real.js y fija la fecha
   compute-tech.mjs   indicadores técnicos desde el precio (validados)
.github/workflows/carmon-diario.yml   ← corre el robot cada día (gratis)
```

## Cómo se actualiza (automático, gratis)

Cada día, GitHub Actions ejecuta por su cuenta:

1. `node automatizacion/fetch-datos.mjs` → datos frescos del día
2. `node automatizacion/build-datos.mjs` → añade la fila de hoy
3. `node build.mjs` → reconstruye `index.html`
4. commit → GitHub Pages republica solo

**No necesitas dejar el PC encendido ni pagar nada.**

## Reconstruir a mano (opcional)

```bash
node build.mjs
```

## Fuentes de datos (todas gratis)

- **Precio** (BTC/ETH): Binance, API pública sin clave.
- **Indicadores técnicos** (RSI, EMA, Bollinger, Mayer, Pi Cycle…): calculados desde el precio.
- **On-chain** (SOPR, NUPL, MVRV, realized price, Puell, CDD): [BRK — Bitcoin Research Kit](https://bitview.space), gratis y sin clave. Solo Bitcoin.
- ETH mantiene precio + indicadores técnicos (su on-chain profundo no tiene fuente gratis).

## Notas

- La primera ejecución del robot imprime un resumen de qué métricas on-chain trajeron dato fresco;
  si alguna sale en "forward-fill", se ajusta su ID en `fetch-datos.mjs` (`BRK_MAP`).
- Los mapas de liquidación no se automatizan (no hay fuente gratis con API); se consultan a mano en Radar DeFi.
