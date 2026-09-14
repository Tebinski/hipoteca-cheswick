u
Cheswick Village (Bristol) — historial de compraventa de casas.

Descarga datos públicos de HM Land Registry Price Paid Data (transacciones
inmobiliarias, sin nombres de comprador/vendedor) para las calles conocidas
de la urbanización Cheswick Village, y genera `src/cheswick_data.js` para
la pestaña "Cheswick Village" de la app.

Fuente: https://landregistry.data.gov.uk/app/ppd/ (Open Government Licence).
No contiene datos personales: solo dirección, tipo de propiedad, fecha y
precio de venta.

Uso:
    python src/process_cheswick.py --out src/cheswick_data.js
"""
import argparse
import csv
import io
import json
import sys
import urllib.parse
import urllib.request
from datetime import date
from collections import defaultdict

# Windows consoles default to cp1252 and choke on tildes/eñes en los mensajes.
try:
    sys.stdout.reconfigure(encoding="utf-8")
except (AttributeError, ValueError):
    pass

# Calles confirmadas como parte de Cheswick Village (Redrow, ex-Wallscourt Farm)
# por las páginas de Rightmove/Zoopla dedicadas a esta urbanización, más un
# grupo contiguo (Lowry Grove/Cook Court/Stubbs Way, <600m de Long Down Avenue,
# mismo sector postal) que la propia app mostraba en el plano pero no tenía
# datos — confirmado a mano tras verificar distancia real vía OpenStreetMap.
# El código postal se restringe además al sector BS16 1 para evitar calles
# homónimas en otras partes del Reino Unido.
STREETS = [
    "LONG WOOD MEADOWS", "BARTON WALK", "GREAT CLOVER LEAZE", "LONG WOOD ROAD",
    "HERMITAGE WOOD ROAD", "PLATTS WOOD", "SHUBB LEAZE", "LONG DOWN AVENUE",
    "HONEY PENS CRESCENT", "HOME LEAS CLOSE", "LEADER STREET", "DANBY STREET",
    "LAWN CLOSE", "EAST FIELDS ROAD",
    "LOWRY GROVE", "COOK COURT", "STUBBS WAY",
]
POSTCODE_PREFIX = "BS16 1"

# Solo casas: se excluyen pisos/apartamentos (F) y "otros" (O, p.ej. locales).
HOUSE_TYPES = {"D": "detached", "S": "semi-detached", "T": "terraced"}

PPD_URL = "https://landregistry.data.gov.uk/app/ppd/ppd_data.csv"

# Caja delimitadora que cubre Cheswick Village y alrededores inmediatos; se usa
# solo para acotar la consulta a OpenStreetMap (Overpass), luego se filtra por
# nombre de calle exacto.
OSM_BBOX = (51.4930, -2.5640, 51.5010, -2.5480)
OVERPASS_URL = "https://overpass-api.de/api/interpreter"


def normalize_street(s):
    return "".join(ch for ch in s.lower() if ch.isalnum())


def fetch_osm_addresses():
    """Puntos de dirección (housenumber+street) de OpenStreetMap dentro del área,
    para ubicar cada vivienda en el mapa. No requiere geocodificar una a una:
    una sola consulta a Overpass trae todos los puntos de la zona."""
    street_pattern = "|".join(s.title().replace(" ", " ?") for s in STREETS)
    query = f"""
[out:json][timeout:60];
(
  node["addr:street"~"^({street_pattern})$",i]{OSM_BBOX};
  way["addr:street"~"^({street_pattern})$",i]{OSM_BBOX};
);
out center tags;
""".strip()
    req = urllib.request.Request(
        OVERPASS_URL,
        data=urllib.parse.urlencode({"data": query}).encode("utf-8"),
        headers={"User-Agent": "expenses-helper/1.0 (personal finance dashboard)"},
    )
    with urllib.request.urlopen(req, timeout=90) as resp:
        payload = json.loads(resp.read().decode("utf-8"))

    coords = {}
    for el in payload.get("elements", []):
        tags = el.get("tags", {})
        housenumber = tags.get("addr:housenumber")
        street = tags.get("addr:street")
        if not housenumber or not street:
            continue
        lat = el.get("lat") or el.get("center", {}).get("lat")
        lon = el.get("lon") or el.get("center", {}).get("lon")
        if lat is None or lon is None:
            continue
        key = (normalize_street(street), normalize_street(housenumber))
        coords.setdefault(key, (lat, lon))
    return coords


def fetch_street(street):
    params = {"limit": "all", "search": "Search", "street": street}
    url = f"{PPD_URL}?{urllib.parse.urlencode(params)}"
    req = urllib.request.Request(url, headers={"User-Agent": "expenses-helper/1.0"})
    with urllib.request.urlopen(req, timeout=30) as resp:
        raw = resp.read().decode("utf-8")
    rows = list(csv.reader(io.StringIO(raw)))
    out = []
    for r in rows:
        if len(r) < 15:
            continue
        (txid, price, tdate, postcode, ptype, old_new, duration,
         saon, paon, rstreet, locality, town, district, county, category, *_rest) = r
        if not postcode.startswith(POSTCODE_PREFIX):
            continue
        if ptype not in HOUSE_TYPES:
            continue
        out.append({
            "id": txid,
            "price": int(price),
            "date": tdate,
            "postcode": postcode,
            "type": HOUSE_TYPES[ptype],
            "newBuild": old_new == "Y",
            "saon": saon,
            "paon": paon,
            "street": rstreet.title(),
        })
    return out


def fetch_all():
    seen_ids = set()
    tx = []
    for street in STREETS:
        try:
            rows = fetch_street(street)
        except Exception as exc:
            print(f"  ! error descargando {street}: {exc}", file=sys.stderr)
            continue
        added = 0
        for r in rows:
            if r["id"] in seen_ids:
                continue
            seen_ids.add(r["id"])
            tx.append(r)
            added += 1
        print(f"  {street.title()}: {added} transacciones (casas, {POSTCODE_PREFIX}*)")
    return tx


def address_key(r):
    return (r["postcode"], r["paon"], r["saon"])


def years_between(d1, d2):
    a = date.fromisoformat(d1)
    b = date.fromisoformat(d2)
    return (b - a).days / 365.25


def build_properties(tx, osm_coords):
    by_addr = defaultdict(list)
    for r in tx:
        by_addr[address_key(r)].append(r)

    geocoded = 0
    properties = []
    for key, sales in by_addr.items():
        sales.sort(key=lambda r: r["date"])
        first, last = sales[0], sales[-1]
        cagr = None
        years = years_between(first["date"], last["date"]) if len(sales) > 1 else None
        if years and years > 0 and first["price"] > 0:
            cagr = (last["price"] / first["price"]) ** (1 / years) - 1
        label = f"{first['saon'] + ', ' if first['saon'] else ''}{first['paon']} {first['street']}"
        coord_key = (normalize_street(first["street"]), normalize_street(first["paon"]))
        latlon = osm_coords.get(coord_key)
        if latlon:
            geocoded += 1
        properties.append({
            "postcode": key[0],
            "paon": key[1],
            "saon": key[2],
            "label": label,
            "type": first["type"],
            "sales": [{"date": s["date"], "price": s["price"], "newBuild": s["newBuild"]} for s in sales],
            "numSales": len(sales),
            "yearsSpan": round(years, 1) if years else None,
            "cagr": cagr,
            "lat": latlon[0] if latlon else None,
            "lon": latlon[1] if latlon else None,
        })
    properties.sort(key=lambda p: (p["postcode"], p["paon"]))
    print(f"  Geolocalizadas (OpenStreetMap): {geocoded}/{len(properties)} propiedades")
    return properties


def build_yearly(tx):
    by_year = defaultdict(list)
    for r in tx:
        year = int(r["date"][:4])
        by_year[year].append(r["price"])

    years = sorted(by_year)
    yearly = []
    prev_avg = None
    for y in years:
        prices = by_year[y]
        avg = sum(prices) / len(prices)
        yoy = (avg / prev_avg - 1) if prev_avg else None
        yearly.append({"year": y, "avgPrice": round(avg), "count": len(prices), "yoyPct": yoy})
        prev_avg = avg
    return yearly


def build_summary(properties, tx):
    resold = [p for p in properties if p["numSales"] > 1]
    with_cagr = [p for p in properties if p["cagr"] is not None]
    newbuilds = [p for p in properties if p["sales"][0]["newBuild"]]

    # CAGR global "desde construcción hasta hoy": precio medio de primera venta
    # (idealmente nueva construcción) vs precio medio de la venta más reciente
    # de cada propiedad, ponderado por años transcurridos medios.
    overall_cagr = None
    if with_cagr:
        avg_first = sum(p["sales"][0]["price"] for p in with_cagr) / len(with_cagr)
        avg_last = sum(p["sales"][-1]["price"] for p in with_cagr) / len(with_cagr)
        avg_years = sum(p["yearsSpan"] for p in with_cagr) / len(with_cagr)
        if avg_years > 0:
            overall_cagr = (avg_last / avg_first) ** (1 / avg_years) - 1

    dates = [s["date"] for p in properties for s in p["sales"]]
    return {
        "totalProperties": len(properties),
        "totalTransactions": len(tx),
        "resoldCount": len(resold),
        "newBuildCount": len(newbuilds),
        "avgCagr": (sum(p["cagr"] for p in with_cagr) / len(with_cagr)) if with_cagr else None,
        "overallCagr": overall_cagr,
        "firstSaleDate": min(dates) if dates else None,
        "lastSaleDate": max(dates) if dates else None,
    }


def to_js(properties, yearly, summary):
    lines = [
        "// Generado por src/process_cheswick.py — datos públicos de HM Land Registry",
        "// Price Paid Data (Open Government Licence). No contiene datos personales.",
        f"export const CHESWICK_PROPERTIES = {json.dumps(properties, ensure_ascii=False, indent=2)};",
        "",
        f"export const CHESWICK_YEARLY = {json.dumps(yearly, ensure_ascii=False, indent=2)};",
        "",
        f"export const CHESWICK_SUMMARY = {json.dumps(summary, ensure_ascii=False, indent=2)};",
        "",
    ]
    return "\n".join(lines)


def main():
    parser = argparse.ArgumentParser(description="Genera datos de Cheswick Village desde Land Registry")
    parser.add_argument("--out", default="src/cheswick_data.js")
    args = parser.parse_args()

    print("Descargando Price Paid Data (HM Land Registry) por calle...")
    tx = fetch_all()
    print(f"\nTotal transacciones únicas (casas, {POSTCODE_PREFIX}*): {len(tx)}")

    print("\nDescargando puntos de dirección (OpenStreetMap / Overpass) para el mapa...")
    try:
        osm_coords = fetch_osm_addresses()
    except Exception as exc:
        print(f"  ! error consultando Overpass: {exc}", file=sys.stderr)
        osm_coords = {}

    properties = build_properties(tx, osm_coords)
    yearly = build_yearly(tx)
    summary = build_summary(properties, tx)

    with open(args.out, "w", encoding="utf-8") as f:
        f.write(to_js(properties, yearly, summary))

    print(f"\n{len(properties)} propiedades únicas, {summary['resoldCount']} revendidas al menos una vez.")
    if summary["overallCagr"] is not None:
        print(f"CAGR medio desde construcción hasta hoy: {summary['overallCagr']*100:.2f}%/año")
    print(f"Escrito en {args.out}")


if __name__ == "__main__":
    main()
