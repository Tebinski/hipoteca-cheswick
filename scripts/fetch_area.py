"""
Historial de compraventa de viviendas por barrio, para la pestaña "Barrios" de la app.

Descarga datos públicos de HM Land Registry Price Paid Data (transacciones inmobiliarias,
sin nombres de comprador/vendedor) para cada barrio definido en scripts/areas_config.py,
los ubica en el mapa con OpenStreetMap (o, si no hay punto de dirección, con el centro del
código postal vía postcodes.io) y escribe src/areas/data/<id>.json.

Las estadísticas (CAGR, precio medio por año…) se calculan en la app a partir de las
propiedades, para que respondan a los filtros de la interfaz.

Fuentes (Open Government Licence / ODbL): https://landregistry.data.gov.uk/app/ppd/,
https://postcodes.io, https://www.openstreetmap.org. No contiene datos personales: solo
dirección, tipo de vivienda, fecha y precio de venta.

Uso (solo librería estándar):
    uv run --no-project python scripts/fetch_area.py            # todos los barrios
    uv run --no-project python scripts/fetch_area.py st-pauls-bs2-8pd
"""
import argparse
import csv
import io
import json
import math
import os
import sys
import time
import urllib.parse
import urllib.request
from collections import defaultdict
from datetime import date, datetime, timezone

from areas_config import AREAS

# Windows consoles default to cp1252 y fallan con tildes/eñes en los mensajes.
try:
    sys.stdout.reconfigure(encoding="utf-8")
except (AttributeError, ValueError):
    pass

PPD_URL = "https://landregistry.data.gov.uk/app/ppd/ppd_data.csv"
# El servidor principal de Overpass se satura a menudo (504): se prueban espejos en orden.
OVERPASS_URLS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.private.coffee/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
]
POSTCODES_URL = "https://api.postcodes.io"
USER_AGENT = "hipoteca-cheswick/1.0 (personal finance dashboard)"
OUT_DIR = os.path.join(os.path.dirname(__file__), "..", "src", "areas", "data")

PROPERTY_TYPES = {"D": "detached", "S": "semi-detached", "T": "terraced", "F": "flat"}


def http_get(url, timeout=60):
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return resp.read().decode("utf-8")


def http_post_json(url, payload, timeout=90, form=False):
    if form:
        data = urllib.parse.urlencode(payload).encode("utf-8")
        headers = {"User-Agent": USER_AGENT}
    else:
        data = json.dumps(payload).encode("utf-8")
        headers = {"User-Agent": USER_AGENT, "Content-Type": "application/json"}
    req = urllib.request.Request(url, data=data, headers=headers)
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode("utf-8"))


def normalize(s):
    return "".join(ch for ch in (s or "").lower() if ch.isalnum())


def title(s):
    return " ".join(w.capitalize() for w in (s or "").split())


# ---------------------------------------------------------------- Land Registry

def fetch_ppd(params, accept):
    """Transacciones de Price Paid Data que cumplen `accept(row)`."""
    url = f"{PPD_URL}?{urllib.parse.urlencode({'limit': 'all', 'search': 'Search', **params})}"
    raw = http_get(url, timeout=60)
    out = []
    for r in csv.reader(io.StringIO(raw)):
        if len(r) < 15:
            continue
        (txid, price, tdate, postcode, ptype, old_new, _duration,
         saon, paon, street, *_rest) = r
        if not accept(postcode, ptype):
            continue
        out.append({
            "id": txid,
            "price": int(price),
            "date": tdate[:10],
            "postcode": postcode,
            "type": PROPERTY_TYPES[ptype],
            "newBuild": old_new == "Y",
            "saon": saon,
            "paon": paon,
            "street": title(street),
        })
    return out


def collect(queries, accept):
    seen, tx = set(), []
    for label, params in queries:
        try:
            rows = fetch_ppd(params, accept)
        except Exception as exc:  # una calle/código caído no debe tumbar todo el barrio
            print(f"  ! error descargando {label}: {exc}", file=sys.stderr)
            continue
        added = 0
        for r in rows:
            if r["id"] not in seen:
                seen.add(r["id"])
                tx.append(r)
                added += 1
        if added:
            print(f"  {label}: {added} transacciones")
        time.sleep(0.2)
    return tx


# ---------------------------------------------------------------- Geografía

def postcodes_in_radius(postcode, radius_m):
    info = json.loads(http_get(f"{POSTCODES_URL}/postcodes/{urllib.parse.quote(postcode)}"))["result"]
    lat, lon = info["latitude"], info["longitude"]
    url = f"{POSTCODES_URL}/postcodes?{urllib.parse.urlencode({'lat': lat, 'lon': lon, 'radius': radius_m, 'limit': 100})}"
    result = json.loads(http_get(url))["result"] or []
    if len(result) >= 100:
        print("  ! postcodes.io devuelve como máximo 100 códigos: reduce el radio para no perder alguno", file=sys.stderr)
    return (lat, lon), [r["postcode"] for r in result]


def postcode_centroids(postcodes):
    out = {}
    pcs = sorted(set(postcodes))
    for i in range(0, len(pcs), 100):
        res = http_post_json(f"{POSTCODES_URL}/postcodes", {"postcodes": pcs[i:i + 100]})
        for item in res.get("result", []):
            r = item.get("result")
            if r and r.get("latitude") is not None:
                out[item["query"]] = (r["latitude"], r["longitude"])
    return out


def osm_addresses(filters):
    """Puntos de dirección de OpenStreetMap: {(calle, número)} y {nombre de edificio}."""
    union = "\n".join(f"  {kind}{f};" for f in filters for kind in ("node", "way"))
    query = f"[out:json][timeout:90];\n(\n{union}\n);\nout center tags;"
    payload, errors = None, []
    for attempt in range(2):
        for url in OVERPASS_URLS:
            try:
                payload = http_post_json(url, {"data": query}, form=True, timeout=120)
                break
            except Exception as exc:
                errors.append(f"{urllib.parse.urlparse(url).netloc}: {exc}")
        if payload is not None:
            break
        time.sleep(5)
    if payload is None:
        raise RuntimeError("; ".join(errors))
    by_number, by_name = {}, {}
    for el in payload.get("elements", []):
        tags = el.get("tags", {})
        lat = el.get("lat") or el.get("center", {}).get("lat")
        lon = el.get("lon") or el.get("center", {}).get("lon")
        if lat is None or lon is None:
            continue
        street = tags.get("addr:street")
        if street and tags.get("addr:housenumber"):
            by_number.setdefault((normalize(street), normalize(tags["addr:housenumber"])), (lat, lon))
        for name in (tags.get("addr:housename"), tags.get("name")):
            if name:
                by_name.setdefault(normalize(name), (lat, lon))
    return by_number, by_name


# ---------------------------------------------------------------- Propiedades

def years_between(d1, d2):
    return (date.fromisoformat(d2) - date.fromisoformat(d1)).days / 365.25


def spread(points):
    """Separa en espiral las viviendas que caen en el mismo punto (pisos de un mismo edificio,
    o centro de código postal) para que se puedan clicar en el mapa."""
    groups = defaultdict(list)
    for p in points:
        groups[(round(p["lat"], 6), round(p["lon"], 6))].append(p)
    for (lat, lon), group in groups.items():
        if len(group) < 2:
            continue
        for i, p in enumerate(group):
            angle = i * 2.399963  # ángulo áureo
            dist = 0.000045 * math.sqrt(i + 1)  # ~5 m por anillo
            p["lat"] = round(lat + dist * math.cos(angle), 7)
            p["lon"] = round(lon + dist * math.sin(angle) / math.cos(math.radians(lat)), 7)


def build_properties(tx, osm_by_number, osm_by_name, centroids):
    by_addr = defaultdict(list)
    for r in tx:
        by_addr[(r["postcode"], r["paon"], r["saon"])].append(r)

    exact = approx = 0
    properties = []
    for (postcode, paon, saon), sales in by_addr.items():
        sales.sort(key=lambda r: r["date"])
        first, last = sales[0], sales[-1]
        years = years_between(first["date"], last["date"]) if len(sales) > 1 else None
        cagr = (last["price"] / first["price"]) ** (1 / years) - 1 if years and first["price"] > 0 else None

        street = first["street"]
        latlon = osm_by_number.get((normalize(street), normalize(paon))) or osm_by_name.get(normalize(paon))
        is_approx = False
        if latlon:
            exact += 1
        elif postcode in centroids:
            latlon, is_approx = centroids[postcode], True
            approx += 1

        label = ", ".join(x for x in (title(saon), f"{title(paon)} {street}".strip()) if x)
        properties.append({
            "postcode": postcode,
            "paon": paon,
            "saon": saon,
            "label": label,
            "street": street,
            "type": first["type"],
            "sales": [{"date": s["date"], "price": s["price"], "newBuild": s["newBuild"]} for s in sales],
            "numSales": len(sales),
            "yearsSpan": round(years, 1) if years else None,
            "cagr": cagr,
            "lat": latlon[0] if latlon else None,
            "lon": latlon[1] if latlon else None,
            "approxLocation": is_approx,
        })
    spread([p for p in properties if p["lat"] is not None])
    properties.sort(key=lambda p: (p["postcode"], p["street"], p["paon"], p["saon"]))
    print(f"  Ubicadas: {exact} con dirección exacta (OSM), {approx} aprox. por código postal, "
          f"{len(properties) - exact - approx} sin coordenadas")
    return properties


# ---------------------------------------------------------------- Barrio

def fetch_area(area):
    types = set(area["types"])
    print(f"\n== {area['name']} ({area['id']}) ==")

    if area["mode"] == "streets":
        prefix = area["postcode_prefix"]
        accept = lambda pc, t: pc.startswith(prefix) and t in types
        queries = [(title(s), {"street": s}) for s in area["streets"]]
        s, w, n, e = area["osm_bbox"]
        pattern = "|".join(title(s).replace(" ", " ?") for s in area["streets"])
        osm_filters = [f'["addr:street"~"^({pattern})$",i]({s},{w},{n},{e})']
        center = ((s + n) / 2, (w + e) / 2)
        extent = {"bbox": [s, w, n, e]}
    elif area["mode"] == "radius":
        center, postcodes = postcodes_in_radius(area["center_postcode"], area["radius_m"])
        print(f"  {len(postcodes)} códigos postales a menos de {area['radius_m']} m de {area['center_postcode']}")
        wanted = set(postcodes)
        accept = lambda pc, t: pc in wanted and t in types
        queries = [(pc, {"postcode": pc}) for pc in postcodes]
        # Caja que envuelve el círculo (+50 m): mucho más rápida en Overpass que (around:...).
        dlat = (area["radius_m"] + 50) / 111_320
        dlon = dlat / math.cos(math.radians(center[0]))
        bbox = f"({center[0] - dlat},{center[1] - dlon},{center[0] + dlat},{center[1] + dlon})"
        osm_filters = [f'["addr:housenumber"]{bbox}', f'["addr:housename"]{bbox}']
        extent = {"radiusM": area["radius_m"]}
    else:
        raise ValueError(f"modo desconocido: {area['mode']}")

    print("Descargando Price Paid Data (HM Land Registry)...")
    tx = collect(queries, accept)
    print(f"  Total: {len(tx)} transacciones únicas")

    print("Ubicando viviendas (OpenStreetMap + postcodes.io)...")
    try:
        by_number, by_name = osm_addresses(osm_filters)
    except Exception as exc:
        print(f"  ! error consultando Overpass: {exc}", file=sys.stderr)
        by_number, by_name = {}, {}
    try:
        centroids = postcode_centroids(r["postcode"] for r in tx)
    except Exception as exc:
        print(f"  ! error consultando postcodes.io: {exc}", file=sys.stderr)
        centroids = {}

    properties = build_properties(tx, by_number, by_name, centroids)
    return {
        "id": area["id"],
        "name": area["name"],
        "place": area["place"],
        "description": area["description"],
        "mode": area["mode"],
        "center": [round(center[0], 6), round(center[1], 6)],
        **extent,
        "types": [PROPERTY_TYPES[t] for t in area["types"]],
        "generatedAt": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
        "source": "HM Land Registry Price Paid Data (OGL) · OpenStreetMap (ODbL) · postcodes.io",
        "properties": properties,
    }


def main():
    parser = argparse.ArgumentParser(description="Genera src/areas/data/<id>.json desde Land Registry")
    parser.add_argument("ids", nargs="*", help="ids de scripts/areas_config.py (por defecto, todos)")
    args = parser.parse_args()

    known = {a["id"]: a for a in AREAS}
    unknown = [i for i in args.ids if i not in known]
    if unknown:
        sys.exit(f"Barrio desconocido: {', '.join(unknown)}. Disponibles: {', '.join(known)}")

    os.makedirs(OUT_DIR, exist_ok=True)
    for area in [known[i] for i in args.ids] or AREAS:
        data = fetch_area(area)
        path = os.path.normpath(os.path.join(OUT_DIR, f"{area['id']}.json"))
        with open(path, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=1)
        resold = sum(1 for p in data["properties"] if p["numSales"] > 1)
        print(f"  {len(data['properties'])} viviendas, {resold} revendidas → {path}")


if __name__ == "__main__":
    main()
