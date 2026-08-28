# Bambu Cima — tu copia

Copia completa del sitio "Bambu Cima · Decisión de capital" (herramienta de
decisión de capital sobre Bitcoin/cripto). Es un sitio **estático**: solo
HTML, CSS y JavaScript/JSX, sin servidor propio.

## Cómo verla en tu ordenador

Como usa módulos `.jsx` que se compilan en el navegador con Babel, necesitas
abrirla desde un pequeño servidor local (no vale hacer doble clic en el
archivo). En la carpeta del proyecto:

    python3 -m http.server 8000

Luego abre en el navegador: http://localhost:8000

## Cómo publicarla (gratis)

Al ser estática, puedes subirla tal cual a **GitHub Pages**, Netlify, Cloudflare
Pages o cualquier hosting estático. Sube todo el contenido de esta carpeta.
(El archivo `.nojekyll` ya viene incluido para GitHub Pages.)

## Qué he cambiado respecto al original

La pantalla de entrada ("Acceso piloto" · Nombre · Correo) enviaba esos datos a
un **Google Form del proyecto original**. La he **eliminado por completo**: ya
no hay puerta ni registro, la app se abre directamente al cargar. Ningún dato
de tus visitantes sale hacia terceros.

## Datos en vivo

Los precios y el índice Fear & Greed vienen de dos APIs públicas y gratuitas
(CoinGecko y Alternative.me), sin clave. Seguirán funcionando cuando la alojes
tú. Si abres la web y no cargan, suele ser por límite de peticiones de esas
APIs: espera un momento y recarga.

## Nota

Este proyecto procede de un repositorio público de la comunidad
"adoptaelbitcoin". No incluía archivo de licencia; si vas a publicarlo o
modificarlo de forma seria, conviene revisar con los autores en qué términos
puedes reutilizarlo.
