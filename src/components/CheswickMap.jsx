import React, { useMemo, useState } from "react";
import { MapContainer, TileLayer, CircleMarker, Popup, Tooltip } from "react-leaflet";
import "leaflet/dist/leaflet.css";

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

export default function CheswickMap({ properties }) {
  const [mode, setMode] = useState("cagr");
  const [showLabels, setShowLabels] = useState(true);

  const geocoded = useMemo(() => properties.filter((p) => p.lat != null && p.lon != null), [properties]);
  const center = useMemo(() => {
    if (!geocoded.length) return [51.497, -2.557];
    const lat = geocoded.reduce((s, p) => s + p.lat, 0) / geocoded.length;
    const lon = geocoded.reduce((s, p) => s + p.lon, 0) / geocoded.length;
    return [lat, lon];
  }, [geocoded]);

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
        center={center}
        zoom={16}
        scrollWheelZoom={true}
        style={{ height: 560, width: "100%", borderRadius: 10, background: "#0d1117" }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          className="cheswick-dark-tiles"
        />
        {geocoded.map((p) => (
          <CircleMarker
            key={`${p.postcode}-${p.paon}-${p.saon}`}
            center={[p.lat, p.lon]}
            radius={p.numSales > 1 ? 8 : 6}
            pathOptions={{
              color: "#0d1117",
              weight: 1,
              fillColor: colorFor(p),
              fillOpacity: 0.9,
            }}
          >
            {showLabels && (
              <Tooltip permanent direction="top" offset={[0, -6]} opacity={1} className="cheswick-marker-label">
                <span className="cheswick-label-text">{p.paon}</span>
              </Tooltip>
            )}
            <Popup>
              <div style={{ fontFamily: "'DM Mono','Fira Code','Courier New',monospace", fontSize: 12, minWidth: 200 }}>
                <div style={{ fontWeight: 700, marginBottom: 4 }}>{p.label}</div>
                <div style={{ color: "#666", marginBottom: 6 }}>{p.type} · {p.postcode}</div>
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
      </div>

      {properties.length - geocoded.length > 0 && (
        <div style={{ position: "absolute", top: 10, right: 10, zIndex: 1000, background: "#161b27ee", border: "1px solid #2a3045", borderRadius: 8, padding: "6px 10px", fontSize: 10, color: "#4a6580", maxWidth: 200 }}>
          {properties.length - geocoded.length} casas sin coordenadas en OpenStreetMap (no aparecen en el mapa, pero sí en la tabla de abajo).
        </div>
      )}
      </div>
    </div>
  );
}
