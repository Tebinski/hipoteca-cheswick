"""Registro de barrios para la pestaña "Barrios" de la app.

Cada entrada genera src/areas/data/<id>.json con:
    uv run --no-project python scripts/fetch_area.py <id>     (sin argumentos: todos)

La app carga automáticamente todos los JSON de src/areas/data/, así que añadir un barrio
es añadir una entrada aquí y ejecutar el script — sin tocar la interfaz.

Dos formas de delimitar un barrio:
  - mode "streets": lista de calles + prefijo de código postal (evita calles homónimas en
    otras ciudades). `osm_bbox` acota la búsqueda de coordenadas en OpenStreetMap.
  - mode "radius": todos los códigos postales activos a menos de `radius_m` metros de
    `center_postcode` (vía postcodes.io).

types: tipos de vivienda de HM Land Registry a incluir — D detached, S semi-detached,
T terraced, F flat/maisonette. (O = "otros", p.ej. locales, nunca se incluye.)
"""

AREAS = [
    {
        "id": "cheswick-village",
        "name": "Cheswick Village",
        "place": "Bristol BS16",
        "description": (
            "Urbanización de Redrow (ex-Wallscourt Farm): las 14 calles que Rightmove/Zoopla asignan a "
            "Cheswick Village más Lowry Grove, Cook Court y Stubbs Way (contiguas, mismo sector postal). Solo casas."
        ),
        "mode": "streets",
        "streets": [
            "LONG WOOD MEADOWS", "BARTON WALK", "GREAT CLOVER LEAZE", "LONG WOOD ROAD",
            "HERMITAGE WOOD ROAD", "PLATTS WOOD", "SHUBB LEAZE", "LONG DOWN AVENUE",
            "HONEY PENS CRESCENT", "HOME LEAS CLOSE", "LEADER STREET", "DANBY STREET",
            "LAWN CLOSE", "EAST FIELDS ROAD",
            "LOWRY GROVE", "COOK COURT", "STUBBS WAY",
        ],
        "postcode_prefix": "BS16 1",
        "osm_bbox": (51.4930, -2.5640, 51.5010, -2.5480),
        "types": ["D", "S", "T"],
    },
    {
        "id": "st-pauls-bs2-8pd",
        "name": "St Pauls (BS2 8PD)",
        "place": "Bristol BS2 / BS1",
        "description": (
            "Todos los códigos postales a menos de 250 m de BS2 8PD (Kenham House, Wilder Street), junto a "
            "Cabot Circus. Mezcla pisos y casas."
        ),
        "mode": "radius",
        "center_postcode": "BS2 8PD",
        "radius_m": 250,
        "types": ["D", "S", "T", "F"],
    },
]
