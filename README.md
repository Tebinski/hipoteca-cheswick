# Hipoteca & Barrios

Dashboard offline (Vite + React + recharts) con dos calculadoras/vistas:

- **Hipoteca** — simulador de cuota, amortización anticipada e interés vs. capital.
- **Barrios** — evolución de precios y CAGR por vivienda de varios barrios (Cheswick Village, St Pauls…) a partir de datos públicos de HM Land Registry, con mapa (react-leaflet) para elegir el barrio.

Sin backend: todo se calcula en el cliente. `src/areas/data/*.json` son datos públicos de compraventas (no hay datos personales/bancarios en este repo).

## Desarrollo local

```bash
npm install
npm run dev
```

## Desplegar gratis (Vercel o Cloudflare Pages)

No hace falta configuración especial: es un build estático de Vite.

1. Sube este repo a GitHub (puede ser público o privado):
   ```bash
   gh repo create hipoteca-cheswick --source=. --private --push
   ```
   o crea el repo manualmente en github.com y:
   ```bash
   git remote add origin <url-del-repo>
   git push -u origin master
   ```
2. Conecta el repo en uno de estos servicios (ambos con plan gratuito y URL pública HTTPS):
   - **Vercel** ([vercel.com/new](https://vercel.com/new)): "Import Project" → selecciona el repo. Detecta Vite automáticamente (Build command: `npm run build`, Output: `dist`).
   - **Cloudflare Pages** ([pages.cloudflare.com](https://pages.cloudflare.com)): "Create a project" → conecta el repo. Framework preset: `Vite`. Build command: `npm run build`, Build output directory: `dist`.
3. Cada `git push` a `master` vuelve a desplegar automáticamente. Comparte la URL que te den (tipo `*.vercel.app` o `*.pages.dev`) con quien quieras.

## Añadir o actualizar barrios

1. Añade una entrada en `scripts/areas_config.py`: por lista de calles (`mode: "streets"`) o por código postal + radio (`mode: "radius"`), y los tipos de vivienda a incluir.
2. Descarga los datos (solo librería estándar de Python):
   ```bash
   uv run --no-project python scripts/fetch_area.py            # todos los barrios
   uv run --no-project python scripts/fetch_area.py <id>       # uno concreto
   ```
3. Se escribe `src/areas/data/<id>.json` y la pestaña **Barrios** lo muestra automáticamente — no hay que tocar la interfaz.
