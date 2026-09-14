import React, { useMemo, useState } from "react";
import {
  ResponsiveContainer, ComposedChart, ScatterChart, Scatter, Bar, Line, Cell, CartesianGrid, XAxis, YAxis,
  Tooltip, Legend, ReferenceLine,
} from "recharts";
import { CHESWICK_PROPERTIES, CHESWICK_YEARLY, CHESWICK_SUMMARY } from "../cheswick_data";
import CheswickMap from "./CheswickMap";

const PRICE_COLOR = "#7ecfe0";
const YOY_COLOR = "#e88bba";
const TYPE_COLORS = { detached: "#e88bba", "semi-detached": "#7ecfe0", terraced: "#fbbf24" };
const AVG_COLOR = "#34d399";
const OVERALL_COLOR = "#f87171";

function gbp(n) {
  return `£${Math.round(n).toLocaleString("en-GB")}`;
}
function pct(n, digits = 1) {
  return `${n >= 0 ? "+" : ""}${(n * 100).toFixed(digits)}%`;
}

function StatCard({ label, value, sub, color = "#e2e8f0" }) {
  return (
    <div style={{ background: "#161b27", border: "1px solid #1e2537", borderRadius: 12, padding: "14px 16px" }}>
      <div style={{ fontSize: 10, color: "#4a6580", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 8 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 700, color }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: "#4a6580", marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

export default function TabCheswick() {
  const [sortBy, setSortBy] = useState("cagr");
  const [onlyUngeocoded, setOnlyUngeocoded] = useState(false);
  const [search, setSearch] = useState("");

  const ungeocodedCount = useMemo(() => CHESWICK_PROPERTIES.filter((p) => p.lat == null || p.lon == null).length, []);

  const cagrRanked = useMemo(() => {
    return CHESWICK_PROPERTIES
      .filter((p) => p.cagr != null)
      .sort((a, b) => b.cagr - a.cagr)
      .map((p, i) => ({ ...p, rank: i + 1, saleYear: new Date(p.sales[p.sales.length - 1].date).getFullYear() }));
  }, []);

  // Correlación (Pearson) entre el año de la última venta y el CAGR conseguido:
  // ¿las revalorizaciones más altas se concentran en ventas más recientes o más antiguas?
  const saleYearCorrelation = useMemo(() => {
    const n = cagrRanked.length;
    if (n < 2) return null;
    const xs = cagrRanked.map((d) => d.saleYear);
    const ys = cagrRanked.map((d) => d.cagr);
    const mx = xs.reduce((a, b) => a + b, 0) / n;
    const my = ys.reduce((a, b) => a + b, 0) / n;
    let num = 0, dx2 = 0, dy2 = 0;
    for (let i = 0; i < n; i++) {
      const dx = xs[i] - mx, dy = ys[i] - my;
      num += dx * dy; dx2 += dx * dx; dy2 += dy * dy;
    }
    const denom = Math.sqrt(dx2 * dy2);
    return denom > 0 ? num / denom : null;
  }, [cagrRanked]);

  const typeCounts = useMemo(() => {
    const out = { detached: 0, "semi-detached": 0, terraced: 0 };
    CHESWICK_PROPERTIES.forEach((p) => { out[p.type] = (out[p.type] ?? 0) + 1; });
    return out;
  }, []);

  const avgCagrByType = useMemo(() => {
    const sums = {};
    const counts = {};
    cagrRanked.forEach((d) => {
      sums[d.type] = (sums[d.type] ?? 0) + d.cagr;
      counts[d.type] = (counts[d.type] ?? 0) + 1;
    });
    const out = {};
    Object.keys(sums).forEach((type) => { out[type] = sums[type] / counts[type]; });
    return out;
  }, [cagrRanked]);

  const tableRows = useMemo(() => {
    let rows = onlyUngeocoded ? CHESWICK_PROPERTIES.filter((p) => p.lat == null || p.lon == null) : [...CHESWICK_PROPERTIES];
    const q = search.trim().toLowerCase();
    if (q) {
      rows = rows.filter((p) => p.label.toLowerCase().includes(q) || p.postcode.toLowerCase().includes(q));
    }
    if (sortBy === "cagr") {
      rows.sort((a, b) => (b.cagr ?? -Infinity) - (a.cagr ?? -Infinity));
    } else if (sortBy === "last") {
      rows.sort((a, b) => new Date(b.sales[b.sales.length - 1].date) - new Date(a.sales[a.sales.length - 1].date));
    } else if (sortBy === "price") {
      rows.sort((a, b) => b.sales[b.sales.length - 1].price - a.sales[a.sales.length - 1].price);
    }
    return rows;
  }, [sortBy, onlyUngeocoded, search]);

  const knownStreets = useMemo(() => [...new Set(CHESWICK_PROPERTIES.map((p) => p.label.replace(/^\S+\s/, "")))].sort(), []);

  const s = CHESWICK_SUMMARY;
  const resoldPct = s.totalProperties > 0 ? (s.resoldCount / s.totalProperties) * 100 : 0;

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 11, color: "#4a6580", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 6 }}>
          Cheswick Village, Bristol (BS16) — solo casas (detached / semi-detached / terraced)
        </div>
        <div style={{ fontSize: 11, color: "#334155" }}>
          Datos públicos de HM Land Registry Price Paid Data ({s.firstSaleDate} → {s.lastSaleDate}), sin nombres de
          comprador/vendedor. Cobertura: 17 calles de la urbanización. No incluye pisos/apartamentos.
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 12 }}>
        <StatCard label="Casas con registro de compraventa" value={s.totalProperties} sub={`${typeCounts.detached} detached · ${typeCounts["semi-detached"]} semi · ${typeCounts.terraced} terraced`} />
        <StatCard label="Transacciones totales" value={s.totalTransactions} sub={`${s.newBuildCount} primera venta (constructor)`} />
        <StatCard label="Revendidas al menos una vez" value={s.resoldCount} sub={`${resoldPct.toFixed(0)}% del total`} color={AVG_COLOR} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12, marginBottom: 20 }}>
        <StatCard
          label="CAGR medio por propiedad (revendidas)"
          value={s.avgCagr != null ? pct(s.avgCagr) : "—"}
          sub="Media de la apreciación anualizada individual de cada casa revendida"
          color={AVG_COLOR}
        />
        <StatCard
          label="CAGR global desde construcción hasta hoy"
          value={s.overallCagr != null ? pct(s.overallCagr) : "—"}
          sub="Precio medio de 1ª venta vs. precio medio de última venta, anualizado"
          color={OVERALL_COLOR}
        />
      </div>

      <div style={{ background: "#161b27", border: "1px solid #1e2537", borderRadius: 12, padding: "16px 16px 8px", marginBottom: 20 }}>
        <div style={{ fontSize: 11, color: "#4a6580", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 4 }}>
          Plano — cada punto es una casa
        </div>
        <div style={{ fontSize: 10, color: "#334155", marginBottom: 10 }}>
          Haz zoom y clica en una casa para ver su historial de compraventa. Color = CAGR (rojo bajo, verde alto);
          gris = sin reventa registrada (solo primera venta). Coordenadas de OpenStreetMap.
        </div>
        <CheswickMap properties={CHESWICK_PROPERTIES} />
      </div>

      <div style={{ background: "#161b27", border: "1px solid #1e2537", borderRadius: 12, padding: "16px 16px 8px", marginBottom: 20 }}>
        <div style={{ fontSize: 11, color: "#4a6580", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 4 }}>
          Precio medio de venta por año y variación interanual
        </div>
        <div style={{ fontSize: 10, color: "#334155", marginBottom: 10 }}>
          <span style={{ color: PRICE_COLOR }}>■ Precio medio</span> · <span style={{ color: YOY_COLOR }}>■ Variación interanual</span>.
          Muestra pequeña en algunos años (ver nº de ventas en el tooltip) — lecturas ruidosas, no es un índice de precios homogéneo.
        </div>
        <ResponsiveContainer width="100%" height={260}>
          <ComposedChart data={CHESWICK_YEARLY} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e2537" vertical={false} />
            <XAxis dataKey="year" tick={{ fill: "#4a6580", fontSize: 9 }} tickLine={false} axisLine={false} />
            <YAxis yAxisId="left" tickFormatter={(v) => `£${(v / 1000).toFixed(0)}k`} tick={{ fill: "#4a6580", fontSize: 9 }} tickLine={false} axisLine={false} />
            <YAxis yAxisId="right" orientation="right" tickFormatter={(v) => `${(v * 100).toFixed(0)}%`} tick={{ fill: YOY_COLOR, fontSize: 9 }} tickLine={false} axisLine={false} />
            <Tooltip
              content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null;
                const d = payload[0].payload;
                return (
                  <div style={{ background: "#161b27", border: "1px solid #2a3045", borderRadius: 8, padding: "10px 14px", fontSize: 11 }}>
                    <div style={{ color: "#94a3b8", marginBottom: 6, fontWeight: 700 }}>Año {label} · {d.count} ventas</div>
                    <div style={{ color: PRICE_COLOR }}>Precio medio: {gbp(d.avgPrice)}</div>
                    {d.yoyPct != null && <div style={{ color: YOY_COLOR }}>Variación interanual: {pct(d.yoyPct)}</div>}
                  </div>
                );
              }}
            />
            <Legend wrapperStyle={{ fontSize: 10, color: "#4a6580" }} />
            <Bar yAxisId="left" dataKey="avgPrice" name="Precio medio" fill={`${PRICE_COLOR}88`} stroke={PRICE_COLOR} radius={[3, 3, 0, 0]} />
            <Line yAxisId="right" type="monotone" dataKey="yoyPct" name="Variación interanual" stroke={YOY_COLOR} strokeWidth={2} dot={{ r: 2 }} />
            <ReferenceLine yAxisId="right" y={0} stroke="#334155" />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <div style={{ background: "#161b27", border: "1px solid #1e2537", borderRadius: 12, padding: "16px 16px 8px", marginBottom: 20 }}>
        <div style={{ fontSize: 11, color: "#4a6580", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 4 }}>
          CAGR por propiedad — solo casas revendidas al menos una vez ({cagrRanked.length})
        </div>
        <div style={{ fontSize: 10, color: "#334155", marginBottom: 10 }}>
          Cada barra es una casa, ordenada de mayor a menor apreciación anualizada entre su primera y su última venta
          registrada. <span style={{ color: TYPE_COLORS.detached }}>■ Detached</span> ·{" "}
          <span style={{ color: TYPE_COLORS["semi-detached"] }}>■ Semi-detached</span> ·{" "}
          <span style={{ color: TYPE_COLORS.terraced }}>■ Terraced</span>. Líneas: <span style={{ color: AVG_COLOR }}>media</span> y{" "}
          <span style={{ color: OVERALL_COLOR }}>CAGR global</span>.
        </div>
        <ResponsiveContainer width="100%" height={280}>
          <ComposedChart data={cagrRanked} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e2537" vertical={false} />
            <XAxis dataKey="rank" tick={false} axisLine={false} tickLine={false} label={{ value: "Casas revendidas, ordenadas por CAGR", position: "insideBottom", offset: -2, fill: "#4a6580", fontSize: 9 }} />
            <YAxis tickFormatter={(v) => `${(v * 100).toFixed(0)}%`} tick={{ fill: "#4a6580", fontSize: 9 }} tickLine={false} axisLine={false} />
            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const d = payload[0].payload;
                const first = d.sales[0];
                const last = d.sales[d.sales.length - 1];
                return (
                  <div style={{ background: "#161b27", border: "1px solid #2a3045", borderRadius: 8, padding: "10px 14px", fontSize: 11 }}>
                    <div style={{ color: "#94a3b8", marginBottom: 6, fontWeight: 700 }}>{d.label} ({d.type})</div>
                    <div style={{ color: "#94a3b8" }}>{first.date}: {gbp(first.price)}{first.newBuild ? " (obra nueva)" : ""}</div>
                    <div style={{ color: "#94a3b8" }}>{last.date}: {gbp(last.price)}</div>
                    <div style={{ color: TYPE_COLORS[d.type], marginTop: 4, fontWeight: 700 }}>CAGR: {pct(d.cagr)} en {d.yearsSpan} años</div>
                  </div>
                );
              }}
            />
            <ReferenceLine y={s.avgCagr} stroke={AVG_COLOR} strokeDasharray="4 4" label={{ value: `Media ${pct(s.avgCagr)}`, position: "right", fill: AVG_COLOR, fontSize: 10 }} />
            <ReferenceLine y={s.overallCagr} stroke={OVERALL_COLOR} strokeDasharray="2 3" label={{ value: `Global ${pct(s.overallCagr)}`, position: "right", fill: OVERALL_COLOR, fontSize: 10 }} />
            <ReferenceLine y={0} stroke="#334155" />
            <Bar dataKey="cagr" name="CAGR">
              {cagrRanked.map((d) => (
                <Cell key={d.label} fill={TYPE_COLORS[d.type]} />
              ))}
            </Bar>
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <div style={{ background: "#161b27", border: "1px solid #1e2537", borderRadius: 12, padding: "16px 16px 8px", marginBottom: 20 }}>
        <div style={{ fontSize: 11, color: "#4a6580", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 4 }}>
          CAGR vs. años que se mantuvo la propiedad
        </div>
        <div style={{ fontSize: 10, color: "#334155", marginBottom: 10 }}>
          Cada punto es una casa revendida: cuánto tiempo pasó entre su primera y su última venta (eje X) frente a la
          apreciación anualizada conseguida (eje Y).{" "}
          <span style={{ color: TYPE_COLORS.detached }}>■ Detached{avgCagrByType.detached != null ? ` (media ${pct(avgCagrByType.detached)})` : ""}</span> ·{" "}
          <span style={{ color: TYPE_COLORS["semi-detached"] }}>■ Semi-detached{avgCagrByType["semi-detached"] != null ? ` (media ${pct(avgCagrByType["semi-detached"])})` : ""}</span> ·{" "}
          <span style={{ color: TYPE_COLORS.terraced }}>■ Terraced{avgCagrByType.terraced != null ? ` (media ${pct(avgCagrByType.terraced)})` : ""}</span>.
        </div>
        <ResponsiveContainer width="100%" height={280}>
          <ScatterChart margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e2537" />
            <XAxis
              dataKey="yearsSpan"
              type="number"
              name="Años mantenida"
              unit=" años"
              tick={{ fill: "#4a6580", fontSize: 9 }}
              tickLine={false}
              axisLine={false}
              label={{ value: "Años entre 1ª y última venta", position: "insideBottom", offset: -4, fill: "#4a6580", fontSize: 9 }}
            />
            <YAxis
              dataKey="cagr"
              type="number"
              name="CAGR"
              tickFormatter={(v) => `${(v * 100).toFixed(0)}%`}
              tick={{ fill: "#4a6580", fontSize: 9 }}
              tickLine={false}
              axisLine={false}
            />
            <ReferenceLine y={0} stroke="#334155" />
            <ReferenceLine y={s.avgCagr} stroke={AVG_COLOR} strokeDasharray="4 4" label={{ value: `Media ${pct(s.avgCagr)}`, position: "right", fill: AVG_COLOR, fontSize: 10 }} />
            {Object.entries(avgCagrByType).map(([type, avg]) => (
              <ReferenceLine
                key={type}
                y={avg}
                stroke={TYPE_COLORS[type]}
                strokeDasharray="2 3"
                strokeOpacity={0.7}
                label={{ value: `${type} ${pct(avg)}`, position: "left", fill: TYPE_COLORS[type], fontSize: 9 }}
              />
            ))}
            <Tooltip
              cursor={{ strokeDasharray: "3 3" }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const d = payload[0].payload;
                return (
                  <div style={{ background: "#161b27", border: "1px solid #2a3045", borderRadius: 8, padding: "10px 14px", fontSize: 11 }}>
                    <div style={{ color: "#94a3b8", marginBottom: 6, fontWeight: 700 }}>{d.label} ({d.type})</div>
                    <div style={{ color: "#94a3b8" }}>{d.yearsSpan} años mantenida</div>
                    <div style={{ color: TYPE_COLORS[d.type], fontWeight: 700 }}>CAGR: {pct(d.cagr)}</div>
                  </div>
                );
              }}
            />
            <Scatter data={cagrRanked} fill={PRICE_COLOR}>
              {cagrRanked.map((d) => (
                <Cell key={d.label} fill={TYPE_COLORS[d.type]} fillOpacity={0.75} />
              ))}
            </Scatter>
          </ScatterChart>
        </ResponsiveContainer>
      </div>

      <div style={{ background: "#161b27", border: "1px solid #1e2537", borderRadius: 12, padding: "16px 16px 8px", marginBottom: 20 }}>
        <div style={{ fontSize: 11, color: "#4a6580", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 4 }}>
          CAGR vs. año de venta
        </div>
        <div style={{ fontSize: 10, color: "#334155", marginBottom: 10 }}>
          Cada punto es una casa revendida: en qué año se realizó su última venta (eje X) frente al CAGR conseguido
          (eje Y) — para ver si las revalorizaciones altas se concentran en algún periodo concreto.{" "}
          {saleYearCorrelation != null && (
            <span style={{ color: Math.abs(saleYearCorrelation) > 0.3 ? OVERALL_COLOR : "#4a6580", fontWeight: 700 }}>
              Correlación (Pearson r): {saleYearCorrelation.toFixed(2)}
              {Math.abs(saleYearCorrelation) < 0.15 ? " — prácticamente nula" : saleYearCorrelation > 0 ? " — leve tendencia a más CAGR en ventas más recientes" : " — leve tendencia a más CAGR en ventas más antiguas"}.
            </span>
          )}
        </div>
        <ResponsiveContainer width="100%" height={280}>
          <ScatterChart margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e2537" />
            <XAxis
              dataKey="saleYear"
              type="number"
              name="Año de venta"
              domain={["dataMin - 1", "dataMax + 1"]}
              allowDecimals={false}
              tick={{ fill: "#4a6580", fontSize: 9 }}
              tickLine={false}
              axisLine={false}
              label={{ value: "Año de la última venta", position: "insideBottom", offset: -4, fill: "#4a6580", fontSize: 9 }}
            />
            <YAxis
              dataKey="cagr"
              type="number"
              name="CAGR"
              tickFormatter={(v) => `${(v * 100).toFixed(0)}%`}
              tick={{ fill: "#4a6580", fontSize: 9 }}
              tickLine={false}
              axisLine={false}
            />
            <ReferenceLine y={0} stroke="#334155" />
            <ReferenceLine y={s.avgCagr} stroke={AVG_COLOR} strokeDasharray="4 4" label={{ value: `Media ${pct(s.avgCagr)}`, position: "right", fill: AVG_COLOR, fontSize: 10 }} />
            <Tooltip
              cursor={{ strokeDasharray: "3 3" }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const d = payload[0].payload;
                return (
                  <div style={{ background: "#161b27", border: "1px solid #2a3045", borderRadius: 8, padding: "10px 14px", fontSize: 11 }}>
                    <div style={{ color: "#94a3b8", marginBottom: 6, fontWeight: 700 }}>{d.label} ({d.type})</div>
                    <div style={{ color: "#94a3b8" }}>Vendida en {d.saleYear}</div>
                    <div style={{ color: TYPE_COLORS[d.type], fontWeight: 700 }}>CAGR: {pct(d.cagr)}</div>
                  </div>
                );
              }}
            />
            <Scatter data={cagrRanked} fill={PRICE_COLOR}>
              {cagrRanked.map((d) => (
                <Cell key={d.label} fill={TYPE_COLORS[d.type]} fillOpacity={0.75} />
              ))}
            </Scatter>
          </ScatterChart>
        </ResponsiveContainer>
      </div>

      <div style={{ background: "#161b27", border: "1px solid #1e2537", borderRadius: 12, overflow: "hidden", marginBottom: 20 }}>
        <div style={{ padding: "12px 18px", borderBottom: "1px solid #1e2537", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
          <div style={{ fontSize: 11, color: "#4a6580", letterSpacing: "0.1em", textTransform: "uppercase" }}>
            Detalle por propiedad ({tableRows.length}{(onlyUngeocoded || search.trim()) ? ` de ${CHESWICK_PROPERTIES.length}` : ""})
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar dirección (p.ej. 7 Long Down Avenue)"
              style={{
                fontSize: 11, padding: "5px 10px", borderRadius: 6, minWidth: 220,
                background: "#0d1117", border: "1px solid #1e2537", color: "#e2e8f0",
                fontFamily: "inherit", outline: "none",
              }}
            />
            {search.trim() && (
              <button
                onClick={() => setSearch("")}
                style={{ fontSize: 10, padding: "4px 8px", borderRadius: 6, cursor: "pointer", background: "transparent", border: "1px solid #1e2537", color: "#4a6580" }}
              >
                ✕
              </button>
            )}
            {[{ id: "cagr", label: "Ordenar: CAGR" }, { id: "last", label: "Ordenar: última venta" }, { id: "price", label: "Ordenar: precio" }].map((o) => (
              <button
                key={o.id}
                onClick={() => setSortBy(o.id)}
                style={{
                  fontSize: 10, padding: "4px 10px", borderRadius: 6, cursor: "pointer",
                  background: sortBy === o.id ? "#1e2537" : "transparent",
                  border: `1px solid ${sortBy === o.id ? "#4a6580" : "#1e2537"}`,
                  color: sortBy === o.id ? "#e2e8f0" : "#4a6580",
                }}
              >
                {o.label}
              </button>
            ))}
            {ungeocodedCount > 0 && (
              <button
                onClick={() => setOnlyUngeocoded((v) => !v)}
                style={{
                  fontSize: 10, padding: "4px 10px", borderRadius: 6, cursor: "pointer",
                  background: onlyUngeocoded ? "#1e2537" : "transparent",
                  border: `1px solid ${onlyUngeocoded ? OVERALL_COLOR : "#1e2537"}`,
                  color: onlyUngeocoded ? OVERALL_COLOR : "#4a6580",
                }}
              >
                ⚠ Solo sin coordenadas ({ungeocodedCount})
              </button>
            )}
          </div>
        </div>
        <div style={{ maxHeight: 420, overflowY: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead style={{ position: "sticky", top: 0, background: "#0d1117" }}>
              <tr>
                <th style={{ padding: "8px 16px", textAlign: "left", color: "#4a6580", fontWeight: 400 }}>Dirección</th>
                <th style={{ padding: "8px 12px", textAlign: "left", color: "#4a6580", fontWeight: 400 }}>Tipo</th>
                <th style={{ padding: "8px 12px", textAlign: "right", color: "#4a6580", fontWeight: 400 }}>Nº ventas</th>
                <th style={{ padding: "8px 12px", textAlign: "right", color: "#4a6580", fontWeight: 400 }}>Primera venta</th>
                <th style={{ padding: "8px 12px", textAlign: "right", color: "#4a6580", fontWeight: 400 }}>Última venta</th>
                <th style={{ padding: "8px 16px", textAlign: "right", color: "#4a6580", fontWeight: 400 }}>CAGR</th>
              </tr>
            </thead>
            <tbody>
              {tableRows.map((p, i) => {
                const first = p.sales[0];
                const last = p.sales[p.sales.length - 1];
                return (
                  <tr key={`${p.postcode}-${p.paon}-${p.saon}`} style={{ borderTop: "1px solid #1e253766", background: i % 2 === 0 ? "transparent" : "#0d111766" }}>
                    <td style={{ padding: "7px 16px", color: "#e2e8f0" }}>
                      {p.label}
                      {(p.lat == null || p.lon == null) && (
                        <span title="Sin coordenadas en OpenStreetMap" style={{ color: OVERALL_COLOR, marginLeft: 6 }}>⚠</span>
                      )}
                    </td>
                    <td style={{ padding: "7px 12px", color: TYPE_COLORS[p.type] }}>{p.type}</td>
                    <td style={{ padding: "7px 12px", textAlign: "right", color: "#94a3b8" }}>{p.numSales}</td>
                    <td style={{ padding: "7px 12px", textAlign: "right", color: "#94a3b8" }}>
                      {first.date}{first.newBuild ? " ✳" : ""} · {gbp(first.price)}
                    </td>
                    <td style={{ padding: "7px 12px", textAlign: "right", color: "#94a3b8" }}>
                      {p.numSales > 1 ? `${last.date} · ${gbp(last.price)}` : "—"}
                    </td>
                    <td style={{ padding: "7px 16px", textAlign: "right", color: p.cagr != null ? (p.cagr >= 0 ? AVG_COLOR : "#f87171") : "#334155", fontWeight: 600 }}>
                      {p.cagr != null ? pct(p.cagr) : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {tableRows.length === 0 && (
            <div style={{ padding: "24px 18px", fontSize: 12, color: "#4a6580", textAlign: "center" }}>
              Sin resultados para "{search}". Solo hay datos de estas calles de Cheswick Village: {knownStreets.join(", ")}.
            </div>
          )}
        </div>
        <div style={{ padding: "8px 18px", fontSize: 10, color: "#334155", borderTop: "1px solid #1e2537" }}>
          ✳ = primera venta como obra nueva (Redrow). Fuente: HM Land Registry Price Paid Data (Open Government Licence).
        </div>
      </div>
    </div>
  );
}
