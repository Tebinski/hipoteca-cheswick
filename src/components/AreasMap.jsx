import React, { useEffect, useMemo, useState } from "react";
import { MapContainer, TileLayer, CircleMarker, Circle, Popup, Tooltip, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";

const AREA_COLOR = "#7ecfe0";

// Distancia aproximada en metros entre dos puntos (suficiente a escala de barrio).
function metersBetween([lat1, lon1], [lat2, lon2]) {
  const dy = (lat2 - lat1) * 111320;
  const dx = (lon2 - lon1) * 111320 * Math.cos((lat1 * Math.PI) / 180);
  return Math.hypot(dx, dy);
}

// Círculo que representa cada barrio en el mapa: el radio configurado, o el que envuelve sus viviendas.
function areaOutline(area) {
  const pts = area.properties.filter((p) => p.lat != null).map((p) => [p.lat, p.lon]);
  if (area.radiusM) return { center: area.center, radius: area.radiusM };
  if (!pts.length) return { center: area.center, radius: 200 };
  const center = [pts.reduce((s, p) => s + p[0], 0) / pts.length, pts.reduce((s, p) => s + p[1], 0) / pts.length];
  return { center, radius: Math.max(...pts.map((p) => metersBetween(center, p))) + 30 };
}

// Encuadra el mapa en el barrio seleccionado cada vez que cambia.
function FitToArea({ outline }) {
  const map = useMap();
  useEffect(() => {
    const { center, radius } = outline;
    const dLat = radius / 111320;
    const dLon = dLat / Math.cos((center[0] * Math.PI) / 180);
    map.flyToBounds([[center[0] - dLat, center[1] - dLon], [center[0] + dLat, center[1] + dLon]], { duration: 0.8, padding: [20, 20] });
  }, [map, outline]);
  return null;
}

const NEVER_RESOLD_COLOR = "#4a6580";

function gbp(n) {
  return `£${Math.round(n).toLocaleString("en-GB")}`;
}
function pct(n, digits = 1) {
  return `${n >= 0 ? "+" : ""}${(n * 100).toFixed(digits)}%`;
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}
function mixColor(c1, c2, t) {
  return [0, 1, 2].map((i) => Math.round(lerp(c1[i], c2[i], t)));
}

// Escala roja→ámbar→verde para el CAGR, recortada a un rango razonable para
// que un par de outliers no aplasten el resto de la escala.
const CAGR_MIN = -0.03;
const CAGR_MID = 0.05;
const CAGR_MAX = 0.13;
const RED = [248, 113, 113];
const AMBER = [251, 191, 36];
const GREEN = [52, 211, 153];

export function cagrColor(cagr) {
  if (cagr == null) return NEVER_RESOLD_COLOR;
  if (cagr <= CAGR_MID) {
    const t = Math.max(0, Math.min(1, (cagr - CAGR_MIN) / (CAGR_MID - CAGR_MIN)));
    return `rgb(${mixColor(RED, AMBER, t).join(",")})`;
  }
  const t = Math.max(0, Math.min(1, (cagr - CAGR_MID) / (CAGR_MAX - CAGR_MID)));
  return `rgb(${mixColor(AMBER, GREEN, t).join(",")})`;
}

// Escala morado→azul→amarillo para "última venta": morado = hace más tiempo,
// amarillo = más reciente. Paleta distinta a la de CAGR para no confundirlas.
const OLD = [124, 58, 237];
const MID_RECENCY = [126, 207, 224];
const RECENT = [251, 191, 36];

function recencyColor(ts, minTs, maxTs) {
  if (minTs === maxTs) return `rgb(${MID_RECENCY.join(",")})`;
  const t = Math.max(0, Math.min(1, (ts - minTs) / (maxTs - minTs)));
  if (t <= 0.5) return `rgb(${mixColor(OLD, MID_RECENCY, t / 0.5).join(",")})`;
  return `rgb(${mixColor(MID_RECENCY, RECENT, (t - 0.5) / 0.5).join(",")})`;
}

const MODES = [
  { id: "cagr", label: "Color: CAGR" },
  { id: "recency", label: "Color: última venta" },
];

// areas: todos los barrios (círculos clicables) · selectedId/onSelect: barrio activo ·
// properties: viviendas del barrio activo ya filtradas (las que se pintan como puntos).
export default function AreasMap({ areas, selectedId, onSelect, properties }) {
  const [mode, setMode] = useState("cagr");
  const [showLabels, setShowLabels] = useState(true);

  const outlines = useMemo(() => Object.fromEntries(areas.map((a) => [a.id, areaOutline(a)])), [areas]);
  const geocoded = useMemo(() => properties.filter((p) => p.lat != null && p.lon != null), [properties]);
  const approxCount = useMemo(() => geocoded.filter((p) => p.approxLocation).length, [geocoded]);
  const initialCenter = outlines[selectedId]?.center ?? [51.4545, -2.5879];

  const recencyRange = useMemo(() => {
    const timestamps = geocoded.map((p) => new Date(p.sales[p.sales.length - 1].date).getTime());
    return { min: Math.min(...timestamps), max: Math.max(...timestamps) };
  }, [geocoded]);

  const colorFor = (p) => {
    if (mode === "recency") {
      const ts = new Date(p.sales[p.sales.length - 1].date).getTime();
      return recencyColor(ts, recencyRange.min, recencyRange.max);
    }
    return cagrColor(p.cagr);
  };

  return (
    <div style={{ position: "relative" }}>
      <style>{`
        .cheswick-dark-tiles { filter: invert(1) hue-rotate(180deg) brightness(0.95) contrast(0.9) saturate(0.6); }
        .leaflet-container { background: #0d1117; }
        .leaflet-popup-content-wrapper, .leaflet-popup-tip { background: #161b27; color: #e2e8f0; }
        .leaflet-popup-content-wrapper a { color: #7ecfe0; }
        .leaflet-control-zoom a { background: #161b27; color: #e2e8f0; border-color: #2a3045 !important; }
        .leaflet-control-attribution { background: #161b27cc; color: #4a6580; }
        .leaflet-control-attribution a { color: #7ecfe0; }
        .cheswick-marker-label { background: transparent; border: none; box-shadow: none; padding: 0; }
        .cheswick-marker-label::before { display: none; }
        .cheswick-marker-label .cheswick-label-text {
          color: #f8fafc; font-size: 9px; font-weight: 700; font-family: 'DM Mono','Fira Code','Courier New',monospace;
          text-shadow: -1px -1px 2px #0d1117, 1px -1px 2px #0d1117, -1px 1px 2px #0d1117, 1px 1px 2px #0d1117, 0 0 4px #0d1117;
        }
      `}</style>

      <div style={{ display: "flex", gap: 6, marginBottom: 8, flexWrap: "wrap" }}>
        {MODES.map((m) => (
          <button
            key={m.id}
            onClick={() => setMode(m.id)}
            style={{
              fontSize: 10, padding: "4px 10px", borderRadius: 6, cursor: "pointer",
              background: mode === m.id ? "#1e2537" : "transparent",
              border: `1px solid ${mode === m.id ? "#4a6580" : "#1e2537"}`,
              color: mode === m.id ? "#e2e8f0" : "#4a6580",
            }}
          >
            {m.label}
          </button>
        ))}
        <button
          onClick={() => setShowLabels((v) => !v)}
          style={{
            fontSize: 10, padding: "4px 10px", borderRadius: 6, cursor: "pointer",
            background: showLabels ? "#1e2537" : "transparent",
            border: `1px solid ${showLabels ? "#4a6580" : "#1e2537"}`,
            color: showLabels ? "#e2e8f0" : "#4a6580",
          }}
        >
          {showLabels ? "Ocultar números" : "Mostrar números"}
        </button>
      </div>

      <div style={{ position: "relative" }}>
      <MapContainer
        center={initialCenter}
        zoom={16}
        scrollWheelZoom={true}
        style={{ height: 560, width: "100%", borderRadius: 10, background: "#0d1117" }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          className="cheswick-dark-tiles"
        />
        {outlines[selectedId] && <FitToArea outline={outlines[selectedId]} />}
        {areas.map((a) => {
          const active = a.id === selectedId;
          return (
            <Circle
              key={a.id}
              center={outlines[a.id].center}
              radius={outlines[a.id].radius}
              pathOptions={{
                color: AREA_COLOR,
                weight: active ? 1.5 : 2,
                dashArray: active ? "4 6" : undefined,
                fillColor: AREA_COLOR,
                fillOpacity: active ? 0.03 : 0.15,
              }}
              eventHandlers={{ click: () => onSelect(a.id) }}
            >
              <Tooltip permanent={!active} direction="top" opacity={1} className="cheswick-marker-label">
                <span className="cheswick-label-text" style={{ fontSize: 11 }}>
                  {a.name}{active ? "" : " · clic para ver"}
                </span>
              </Tooltip>
            </Circle>
          );
        })}
        {geocoded.map((p) => (
          <CircleMarker
            key={`${p.postcode}-${p.paon}-${p.saon}`}
            center={[p.lat, p.lon]}
            radius={p.numSales > 1 ? 8 : 6}
            pathOptions={{
              color: p.approxLocation ? "#94a3b8" : "#0d1117",
              weight: 1,
              dashArray: p.approxLocation ? "2 2" : undefined,
              fillColor: colorFor(p),
              fillOpacity: p.approxLocation ? 0.6 : 0.9,
            }}
          >
            {showLabels && p.paon.length <= 5 && !p.saon && (
              <Tooltip permanent direction="top" offset={[0, -6]} opacity={1} className="cheswick-marker-label">
                <span className="cheswick-label-text">{p.paon}</span>
              </Tooltip>
            )}
            <Popup>
              <div style={{ fontFamily: "'DM Mono','Fira Code','Courier New',monospace", fontSize: 12, minWidth: 200 }}>
                <div style={{ fontWeight: 700, marginBottom: 4 }}>{p.label}</div>
                <div style={{ color: "#666", marginBottom: 6 }}>
                  {p.type} · {p.postcode}
                  {p.approxLocation && " · ubicación aproximada (centro del código postal)"}
                </div>
                {p.sales.map((s, i) => (
                  <div key={i}>
                    {s.date}: {gbp(s.price)}{s.newBuild ? " (obra nueva)" : ""}
                  </div>
                ))}
                {p.cagr != null ? (
                  <div style={{ marginTop: 6, fontWeight: 700 }}>CAGR: {pct(p.cagr)} en {p.yearsSpan} años</div>
                ) : (
                  <div style={{ marginTop: 6, color: "#666" }}>Sin reventa registrada</div>
                )}
              </div>
            </Popup>
          </CircleMarker>
        ))}
      </MapContainer>

      <div
        style={{
          position: "absolute", bottom: 10, left: 10, zIndex: 1000,
          background: "#161b27ee", border: "1px solid #2a3045", borderRadius: 8,
          padding: "8px 12px", fontSize: 10, color: "#94a3b8", lineHeight: 1.6,
        }}
      >
        {mode === "cagr" ? (
          <>
            <div style={{ marginBottom: 4, color: "#4a6580", letterSpacing: "0.08em", textTransform: "uppercase" }}>CAGR</div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ width: 60, height: 8, borderRadius: 4, background: "linear-gradient(90deg, rgb(248,113,113), rgb(251,191,36), rgb(52,211,153))", display: "inline-block" }} />
              <span>{pct(CAGR_MIN, 0)} → {pct(CAGR_MAX, 0)}</span>
            </div>
            <div style={{ marginTop: 6 }}>
              <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: NEVER_RESOLD_COLOR, marginRight: 6 }} />
              Sin reventa (solo 1ª venta)
            </div>
          </>
        ) : (
          <>
            <div style={{ marginBottom: 4, color: "#4a6580", letterSpacing: "0.08em", textTransform: "uppercase" }}>Última venta</div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ width: 60, height: 8, borderRadius: 4, background: "linear-gradient(90deg, rgb(124,58,237), rgb(126,207,224), rgb(251,191,36))", display: "inline-block" }} />
              <span>
                {Number.isFinite(recencyRange.min) ? new Date(recencyRange.min).getFullYear() : "—"} → {Number.isFinite(recencyRange.max) ? new Date(recencyRange.max).getFullYear() : "—"}
              </span>
            </div>
          </>
        )}
        <div style={{ marginTop: 2 }}>● grande = revendida · ● pequeño = nunca revendida</div>
        {approxCount > 0 && <div>◌ borde discontinuo = ubicación aproximada ({approxCount})</div>}
      </div>

      {properties.length - geocoded.length > 0 && (
        <div style={{ position: "absolute", top: 10, right: 10, zIndex: 1000, background: "#161b27ee", border: "1px solid #2a3045", borderRadius: 8, padding: "6px 10px", fontSize: 10, color: "#4a6580", maxWidth: 200 }}>
          {properties.length - geocoded.length} viviendas sin coordenadas (no aparecen en el mapa, pero sí en la tabla de abajo).
        </div>
      )}
      </div>
    </div>
  );
}
