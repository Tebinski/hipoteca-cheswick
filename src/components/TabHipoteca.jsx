import React, { useMemo, useState } from "react";
import { ResponsiveContainer, ComposedChart, Area, Line, CartesianGrid, XAxis, YAxis, Tooltip, Legend, ReferenceLine, ReferenceDot } from "recharts";

const ACCENT = "#7ecfe0";
const EXTRA_COLOR = "#34d399";
const EQUITY_COLOR = "#e88bba";
const MILESTONE_STEP = 5; // %
const OPT_COLOR = "#34d399";
const PES_COLOR = "#f87171";
const BREAKEVEN_COLOR = "#fbbf24";
const SP_COLOR = "#a78bfa";

function gbp(n) {
  return `£${Math.round(n).toLocaleString("en-GB")}`;
}

function SliderNumber({ label, value, min, max, step, unit, onChange, color = ACCENT }) {
  const clamp = (v) => Math.min(max, Math.max(min, v));
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ fontSize: 11, color: "#4a6580", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 8 }}>
        {label}
      </div>
      <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(clamp(+e.target.value))}
          style={{ flex: 1, accentColor: color }}
        />
        <div style={{ display: "flex", alignItems: "center", gap: 4, background: "#0d1117", border: "1px solid #1e2537", borderRadius: 6, padding: "4px 8px", flexShrink: 0 }}>
          <input
            type="number"
            min={min}
            max={max}
            step={step}
            value={value}
            onChange={(e) => onChange(e.target.value === "" ? 0 : clamp(+e.target.value))}
            style={{ width: 74, background: "transparent", border: "none", color: "#e2e8f0", fontSize: 13, fontFamily: "inherit", textAlign: "right", outline: "none" }}
          />
          <span style={{ fontSize: 11, color: "#4a6580" }}>{unit}</span>
        </div>
      </div>
    </div>
  );
}

// Penalización por amortización anticipada (ERC): % sobre lo amortizado de más según el año de la hipoteca.
function penaltyPctAt(month, penalties) {
  return penalties[Math.floor((month - 1) / 12)] ?? 0;
}

// lumps: { mes: importe } pagos extra puntuales. penalties: [% año 1, % año 2, ...] — la penalización se paga
// aparte (no reduce el capital) y se acumula en totalPenalty.
function amortize(principal, annualRatePct, years, monthlyExtra = 0, extraStartMonth = 1, { lumps = {}, penalties = [] } = {}) {
  const r = annualRatePct / 100 / 12;
  const n = Math.round(years * 12);
  if (n <= 0 || principal <= 0) return { payment: 0, totalInterest: 0, months: 0, schedule: [] };

  const payment = r === 0 ? principal / n : (principal * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);

  let balance = principal;
  let totalInterest = 0;
  let totalPenalty = 0;
  const schedule = [];
  let month = 0;
  const cap = n + 12; // safety margin in case of rounding
  while (balance > 0.5 && month < cap) {
    month++;
    const interest = balance * r;
    const extraNow = (month >= extraStartMonth ? monthlyExtra : 0) + (lumps[month] ?? 0);
    let principalPaid = payment - interest + extraNow;
    if (principalPaid > balance) principalPaid = balance;
    const extraApplied = Math.max(0, principalPaid - (payment - interest));
    const penalty = (extraApplied * penaltyPctAt(month, penalties)) / 100;
    balance -= principalPaid;
    totalInterest += interest;
    totalPenalty += penalty;
    schedule.push({ month, balance: Math.max(balance, 0), interest, principalPaid, penalty });
  }
  return { payment, totalInterest, totalPenalty, months: month, schedule };
}

// Reducción de deuda en el mes `horizon` al pagar `amount` de golpe en el mes `month`:
// saldo sin pago extra − (saldo con el pago + penalizaciones pagadas). Mayor es mejor.
function lumpReduction(principal, rate, years, amount, month, horizon, penalties, baseBalanceAtH) {
  const res = amortize(principal, rate, years, 0, 1, { lumps: { [month]: amount }, penalties });
  const balance = res.schedule[horizon - 1]?.balance ?? 0;
  const penalty = res.schedule.slice(0, horizon).reduce((s, x) => s + x.penalty, 0);
  return { reduction: baseBalanceAtH - balance - penalty, balance, penalty };
}

// Cartera con `initial` aportado en el mes 1 y `monthly` cada mes (1..month), vendida en el mes `month`.
// Devuelve el valor neto tras impuestos (solo sobre la ganancia) y lo aportado.
function portfolioValue(initial, monthly, annualReturnPct, month, taxPct) {
  const g = Math.pow(1 + annualReturnPct / 100, 1 / 12) - 1;
  let value = 0;
  for (let k = 1; k <= month; k++) value = value * (k > 1 ? 1 + g : 1) + (k === 1 ? initial : 0) + monthly;
  const contributed = initial + monthly * month;
  const gain = value - contributed;
  return { value: contributed + (gain > 0 ? gain * (1 - taxPct / 100) : gain), contributed };
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

function GroupTitle({ children, first }) {
  return (
    <div
      style={{
        fontSize: 11, color: "#94a3b8", letterSpacing: "0.12em", textTransform: "uppercase", fontWeight: 700,
        margin: first ? "0 0 14px" : "22px 0 14px", paddingTop: first ? 0 : 16, borderTop: first ? "none" : "1px solid #1e2537",
      }}
    >
      {children}
    </div>
  );
}

const VIEWS = [
  { id: "resumen", label: "Resumen", hint: "Saldo y composición de la cuota" },
  { id: "extra", label: "Pagos extra", hint: "Ahorro y coste de esperar" },
  { id: "sp", label: "Hipoteca vs S&P 500", hint: "¿Amortizar o invertir?" },
  { id: "equity", label: "Equity y renovación", hint: "LTV y escenarios al renovar" },
];

function ViewTabs({ value, onChange }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: `repeat(${VIEWS.length}, 1fr)`, gap: 8, marginBottom: 20 }}>
      {VIEWS.map((v) => {
        const active = v.id === value;
        return (
          <button
            key={v.id}
            onClick={() => onChange(v.id)}
            style={{
              textAlign: "left", cursor: "pointer", fontFamily: "inherit", borderRadius: 10, padding: "10px 12px",
              background: active ? `${ACCENT}14` : "#161b27", border: `1px solid ${active ? ACCENT : "#1e2537"}`,
            }}
          >
            <div style={{ fontSize: 12, fontWeight: 700, color: active ? ACCENT : "#e2e8f0" }}>{v.label}</div>
            <div style={{ fontSize: 10, color: "#4a6580", marginTop: 2 }}>{v.hint}</div>
          </button>
        );
      })}
    </div>
  );
}

export default function TabHipoteca() {
  const [propertyPrice, setPropertyPrice] = useState(450000);
  const [principal, setPrincipal] = useState(427500);
  const [rate, setRate] = useState(5);
  const [years, setYears] = useState(35);
  const [extra, setExtra] = useState(0);
  const [extraStartMonth, setExtraStartMonth] = useState(1);
  const [appreciation, setAppreciation] = useState(3);
  const [penalties, setPenalties] = useState([3, 2, 1]); // % ERC años 1, 2, 3
  const setPenaltyAt = (i) => (v) => setPenalties((p) => p.map((x, j) => (j === i ? v : x)));

  // Pagos extra a la hipoteca vs aportaciones al S&P 500 y amortizar al final del horizonte.
  const [lumpAmount, setLumpAmount] = useState(6000); // capital inicial
  const [lumpMonthly, setLumpMonthly] = useState(0); // aportación recurrente mensual
  const [spReturn, setSpReturn] = useState(10);
  const [spTax, setSpTax] = useState(0);

  // Años de tipo fijo: marca a la vez el año de renovación y el horizonte de la comparación con el S&P 500.
  const [fixedYears, setFixedYears] = useState(5);
  const [view, setView] = useState("resumen");

  // Renovación de hipoteca: escenarios a 5 años tras el fin del tipo fijo.
  const renewalYear = Math.min(fixedYears, Math.max(1, years - 1));
  const [optAppreciation, setOptAppreciation] = useState(5);
  const [optRate, setOptRate] = useState(3);
  const [optExtra, setOptExtra] = useState(0);
  const [pesAppreciation, setPesAppreciation] = useState(0);
  const [pesRate, setPesRate] = useState(6.5);
  const [pesExtra, setPesExtra] = useState(0);

  const maxStartMonth = Math.max(1, Math.round(years * 12));
  const effectiveStart = Math.min(extraStartMonth, maxStartMonth);

  // Marcas del eje X en años, fijas al plazo total (evita que el eje se "encoja" cuando la
  // hipoteca se liquida antes por los pagos extra). Cada año si el plazo es corto, cada 5 si es largo.
  const yearTicks = useMemo(() => {
    const totalYears = Math.ceil(maxStartMonth / 12);
    const step = totalYears > 20 ? 5 : totalYears > 10 ? 2 : 1;
    const ticks = [];
    for (let y = 0; y <= totalYears; y += step) ticks.push(y * 12);
    if (ticks[ticks.length - 1] !== maxStartMonth) ticks.push(maxStartMonth);
    return ticks;
  }, [maxStartMonth]);

  const base = useMemo(() => amortize(principal, rate, years, 0), [principal, rate, years]);
  const withExtra = useMemo(
    () => amortize(principal, rate, years, extra, effectiveStart, { penalties }),
    [principal, rate, years, extra, effectiveStart, penalties]
  );

  // Barrido: si el mismo pago extra empezara en cada mes posible en vez de esperar,
  // ¿cuánto interés se ahorraría? Muestra el coste de retrasar la amortización anticipada.
  const delaySweep = useMemo(() => {
    if (extra <= 0) return [];
    const totalMonths = Math.round(years * 12);
    const step = totalMonths > 240 ? 12 : totalMonths > 120 ? 6 : 3;
    const points = [];
    for (let s = 1; s <= totalMonths; s += step) {
      const res = amortize(principal, rate, years, extra, s, { penalties });
      points.push({
        startMonth: s,
        interestSaved: base.totalInterest - res.totalInterest - res.totalPenalty,
        monthsSaved: base.months - res.months,
      });
    }
    return points;
  }, [principal, rate, years, extra, base, penalties]);

  const chartData = useMemo(() => {
    const len = base.schedule.length;
    return Array.from({ length: len }, (_, i) => ({
      month: i + 1,
      base: base.schedule[i]?.balance ?? 0,
      extra: extra > 0 ? (withExtra.schedule[i]?.balance ?? 0) : undefined,
    }));
  }, [base, withExtra, extra]);

  const monthsSaved = extra > 0 ? base.months - withExtra.months : 0;
  const grossInterestSaved = extra > 0 ? base.totalInterest - withExtra.totalInterest : 0;
  const penaltyPaid = extra > 0 ? withExtra.totalPenalty : 0;
  const interestSaved = grossInterestSaved - penaltyPaid;

  // Composición de cada cuota (interés vs amortización de capital) para el plan activo.
  const breakdownData = useMemo(() => {
    const sched = extra > 0 ? withExtra.schedule : base.schedule;
    return sched.map((s) => ({ month: s.month, interest: s.interest, principal: s.principalPaid, total: s.interest + s.principalPaid }));
  }, [base, withExtra, extra]);

  // Primer mes en el que la amortización supera al interés dentro de la cuota (punto de cruce).
  const crossoverMonth = useMemo(
    () => breakdownData.find((d) => d.principal >= d.interest)?.month,
    [breakdownData]
  );

  // Intereses acumulados mes a mes: cuota estándar vs con pago extra. El hueco entre las dos
  // líneas es, mes a mes, el ahorro de intereses conseguido por el pago extra.
  // También calcula el precio mínimo de venta para no perder dinero: entrada + todo lo pagado
  // hasta ese mes (interés + amortización) + saldo pendiente que hay que cancelar al vender.
  const cumulativeInterest = useMemo(() => {
    const len = base.schedule.length;
    const dep = propertyPrice - principal;
    let cumBase = 0;
    let cumExtra = 0;
    let cumPaidBase = 0;
    let cumPaidExtra = 0;
    return Array.from({ length: len }, (_, i) => {
      const bItem = base.schedule[i];
      cumBase += bItem?.interest ?? 0;
      cumPaidBase += (bItem?.interest ?? 0) + (bItem?.principalPaid ?? 0);
      const minPriceBase = (bItem?.balance ?? 0) + dep + cumPaidBase;
      let minPriceExtra;
      if (extra > 0) {
        const eItem = withExtra.schedule[i];
        cumExtra += eItem?.interest ?? 0;
        cumPaidExtra += (eItem?.interest ?? 0) + (eItem?.principalPaid ?? 0) + (eItem?.penalty ?? 0);
        minPriceExtra = (eItem?.balance ?? 0) + dep + cumPaidExtra;
      }
      return {
        month: i + 1,
        base: cumBase,
        extra: extra > 0 ? cumExtra : undefined,
        saved: extra > 0 ? cumBase - cumExtra : undefined,
        minPriceBase,
        minPriceExtra,
        houseValue: propertyPrice * Math.pow(1 + appreciation / 100, (i + 1) / 12),
      };
    });
  }, [base, withExtra, extra, propertyPrice, principal, appreciation]);

  const deposit = propertyPrice - principal;
  const initialLTV = propertyPrice > 0 ? (principal / propertyPrice) * 100 : 0;

  // Plan "activo" para el gráfico de equity: si hay pago extra, se usa esa senda de amortización.
  const activeSchedule = extra > 0 ? withExtra.schedule : base.schedule;
  const activeLabel =
    extra > 0
      ? `con pago extra de ${gbp(extra)}/mes${effectiveStart > 1 ? ` desde el mes ${effectiveStart}` : ""}`
      : "cuota estándar";

  const equitySeries = useMemo(() => {
    const points = [{ month: 0, balance: principal }, ...activeSchedule];
    const raw = points.map(({ month, balance }) => {
      const value = propertyPrice * Math.pow(1 + appreciation / 100, month / 12);
      const pct = value > 0 ? ((value - balance) / value) * 100 : 0;
      return { month, value, balance, pct };
    });
    const first = raw[0];
    const last = raw[raw.length - 1];
    const span = last.month - first.month || 1;
    return raw.map((p) => ({
      ...p,
      linear: first.pct + ((last.pct - first.pct) * (p.month - first.month)) / span,
    }));
  }, [activeSchedule, principal, propertyPrice, appreciation]);

  // Primer mes en el que se alcanza cada hito de equity (cada MILESTONE_STEP %) — son los umbrales de LTV que suelen importar al banco.
  const equityMilestones = useMemo(() => {
    const out = [];
    for (let milestone = MILESTONE_STEP; milestone <= 100; milestone += MILESTONE_STEP) {
      const hit = equitySeries.find((p) => p.pct >= milestone);
      if (hit) out.push({ pct: milestone, month: hit.month, value: hit.value, balance: hit.balance, actualPct: hit.pct });
    }
    return out;
  }, [equitySeries]);

  // Punto de llegada al año de renovación (con las hipótesis del panel principal: tipo, plazo, pago extra, apreciación).
  const renewalMonth = renewalYear * 12;
  const renewalPoint = useMemo(
    () => equitySeries.find((p) => p.month === renewalMonth) || equitySeries[equitySeries.length - 1],
    [equitySeries, renewalMonth]
  );
  const remainingYears = Math.max(1, years - renewalYear);

  const optRenewal = useMemo(
    () => amortize(renewalPoint.balance, optRate, remainingYears, optExtra),
    [renewalPoint, optRate, remainingYears, optExtra]
  );
  const pesRenewal = useMemo(
    () => amortize(renewalPoint.balance, pesRate, remainingYears, pesExtra),
    [renewalPoint, pesRate, remainingYears, pesExtra]
  );

  // Evolución de equity durante los 5 años posteriores a la renovación, un escenario por senda.
  const renewalChartData = useMemo(() => {
    return Array.from({ length: 61 }, (_, m) => {
      const optBal = m === 0 ? renewalPoint.balance : (optRenewal.schedule[m - 1]?.balance ?? 0);
      const pesBal = m === 0 ? renewalPoint.balance : (pesRenewal.schedule[m - 1]?.balance ?? 0);
      const optVal = renewalPoint.value * Math.pow(1 + optAppreciation / 100, m / 12);
      const pesVal = renewalPoint.value * Math.pow(1 + pesAppreciation / 100, m / 12);
      return {
        m,
        optEquity: optVal > 0 ? ((optVal - optBal) / optVal) * 100 : 0,
        pesEquity: pesVal > 0 ? ((pesVal - pesBal) / pesVal) * 100 : 0,
        optBal, pesBal, optVal, pesVal,
      };
    });
  }, [renewalPoint, optRenewal, pesRenewal, optAppreciation, pesAppreciation]);

  const renewalAt5 = renewalChartData[Math.min(60, renewalChartData.length - 1)];
  const windowInterest = (schedule) => schedule.slice(0, 60).reduce((s, x) => s + x.interest, 0);
  const optInterest5y = windowInterest(optRenewal.schedule);
  const pesInterest5y = windowInterest(pesRenewal.schedule);

  // Mismo dinero (capital inicial + aportación mensual), dos destinos: pagos extra a la hipoteca desde el
  // mes 1, o aportaciones al S&P 500 que se venden y se amortizan de golpe. Se mide la reducción de deuda
  // (saldo sin pago extra − saldo con pagos − penalizaciones), partiendo de la cuota estándar.
  const lumpH = Math.min(renewalYear * 12, base.months);
  const lumpCompare = useMemo(() => {
    if ((lumpAmount <= 0 && lumpMonthly <= 0) || lumpH < 1) return null;
    const lumpAt = (amount, month) =>
      lumpReduction(principal, rate, years, amount, month, month, penalties, base.schedule[month - 1]?.balance ?? 0);

    // Pagos extra a la hipoteca: inicial en el mes 1 + recurrente cada mes.
    const overpay = amortize(principal, rate, years, lumpMonthly, 1, { lumps: { 1: lumpAmount }, penalties });
    let cumPen = 0;
    const sweep = Array.from({ length: lumpH }, (_, i) => {
      const k = i + 1;
      const row = overpay.schedule[i];
      cumPen += row?.penalty ?? 0;
      const mortgage = (base.schedule[i]?.balance ?? 0) - (row?.balance ?? 0) - cumPen;
      const sp = portfolioValue(lumpAmount, lumpMonthly, spReturn, k, spTax);
      return { k, mortgage, mortgagePenalty: cumPen, sp: lumpAt(sp.value, k).reduction, spVal: sp.value, contributed: sp.contributed };
    });
    const atH = sweep[lumpH - 1];
    const spH = lumpAt(atH.spVal, lumpH);
    const cashH = lumpAt(atH.contributed, lumpH);

    // Rentabilidad anual del S&P a partir de la cual invertir supera a los pagos extra a la hipoteca.
    const spReductionFor = (ret) => lumpAt(portfolioValue(lumpAmount, lumpMonthly, ret, lumpH, spTax).value, lumpH).reduction;
    let breakeven = null;
    if (spReductionFor(100) >= atH.mortgage) {
      let lo = -50, hi = 100;
      for (let it = 0; it < 50; it++) {
        const mid = (lo + hi) / 2;
        if (spReductionFor(mid) >= atH.mortgage) hi = mid; else lo = mid;
      }
      breakeven = hi;
    }
    return { sweep, atH, spH, cashH, breakeven };
  }, [principal, rate, years, base, lumpAmount, lumpMonthly, lumpH, spReturn, spTax, penalties]);

  const lumpOptions = lumpCompare
    ? [
        { key: "mortgage", label: "Pagos extra a la hipoteca", value: lumpCompare.atH.mortgage, color: EXTRA_COLOR },
        { key: "sp", label: `S&P 500 y amortizar en el mes ${lumpH}`, value: lumpCompare.spH.reduction, color: SP_COLOR },
        { key: "cash", label: `Guardar en efectivo y amortizar en el mes ${lumpH}`, value: lumpCompare.cashH.reduction, color: ACCENT },
      ]
    : [];
  const lumpBest = lumpOptions.reduce((a, b) => (b.value > (a?.value ?? -Infinity) ? b : a), null);

  return (
    <div style={{ display: "flex", gap: 20, alignItems: "flex-start" }}>
      <div style={{ width: 280, flexShrink: 0, position: "sticky", top: 20, background: "#161b27", border: "1px solid #1e2537", borderRadius: 12, padding: "18px 20px", maxHeight: "calc(100vh - 40px)", overflowY: "auto" }}>
        <GroupTitle first>Vivienda y préstamo</GroupTitle>
        <SliderNumber label="Precio de la vivienda" value={propertyPrice} min={0} max={1500000} step={1000} unit="£" onChange={setPropertyPrice} color={EQUITY_COLOR} />
        <SliderNumber label="Importe del préstamo" value={principal} min={0} max={1000000} step={1000} unit="£" onChange={setPrincipal} />
        <div style={{ fontSize: 11, color: "#4a6580", marginTop: -6, marginBottom: 18 }}>
          Entrada / depósito: <span style={{ color: "#94a3b8" }}>{gbp(deposit)}</span>
          <br />
          LTV inicial:{" "}
          <span style={{ color: initialLTV > 100 ? "#f87171" : initialLTV > 90 ? "#fbbf24" : "#94a3b8", fontWeight: 600 }}>
            {initialLTV.toFixed(1)}%
          </span>
          {initialLTV > 100 && " — el préstamo supera el precio de la vivienda"}
        </div>
        <SliderNumber label="Plazo" value={years} min={1} max={40} step={1} unit="años" onChange={setYears} />
        <SliderNumber label="Apreciación anual de la vivienda" value={appreciation} min={-5} max={10} step={0.1} unit="%/año" onChange={setAppreciation} color={EQUITY_COLOR} />

        <GroupTitle>Tipo fijo</GroupTitle>
        <SliderNumber label="Tipo de interés anual" value={rate} min={0} max={10} step={0.05} unit="%" onChange={setRate} />
        <SliderNumber label="Años de tipo fijo (hasta renovar)" value={fixedYears} min={1} max={10} step={1} unit="años" onChange={setFixedYears} />
        <div style={{ fontSize: 11, color: "#4a6580", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 8 }}>
          Penalización por amortizar (ERC)
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6, marginBottom: 6 }}>
          {penalties.map((p, i) => (
            <label key={i} style={{ background: "#0d1117", border: "1px solid #1e2537", borderRadius: 6, padding: "4px 6px", fontSize: 10, color: "#4a6580" }}>
              Año {i + 1}
              <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
                <input
                  type="number"
                  min={0}
                  max={10}
                  step={0.25}
                  value={p}
                  onChange={(e) => setPenaltyAt(i)(e.target.value === "" ? 0 : Math.min(10, Math.max(0, +e.target.value)))}
                  style={{ width: "100%", background: "transparent", border: "none", color: PES_COLOR, fontSize: 13, fontFamily: "inherit", outline: "none" }}
                />
                %
              </div>
            </label>
          ))}
        </div>
        <div style={{ fontSize: 10, color: "#334155", marginBottom: 4 }}>
          Sobre cada pago extra hecho ese año; se paga aparte y no reduce capital. Desde el año {penalties.length + 1}, sin penalización.
        </div>

        <GroupTitle>Pago extra mensual</GroupTitle>
        <SliderNumber label="Importe" value={extra} min={0} max={3000} step={25} unit="£/mes" onChange={setExtra} color={EXTRA_COLOR} />
        <SliderNumber label="Empieza en el mes" value={effectiveStart} min={1} max={maxStartMonth} step={1} unit="mes" onChange={setExtraStartMonth} color={EXTRA_COLOR} />
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 20 }}>
        <StatCard
          label="Cuota mensual"
          value={gbp(base.payment + extra)}
          sub={extra > 0 ? `${gbp(base.payment)} cuota + ${gbp(extra)} extra` : "sin pago extra"}
          color={ACCENT}
        />
        <StatCard
          label="Total intereses"
          value={gbp(extra > 0 ? withExtra.totalInterest : base.totalInterest)}
          sub={`total a pagar ${gbp(principal + (extra > 0 ? withExtra.totalInterest + penaltyPaid : base.totalInterest))}`}
          color={PES_COLOR}
        />
        <StatCard
          label="Plazo real"
          value={`${((extra > 0 ? withExtra.months : base.months) / 12).toFixed(1)} años`}
          sub={extra > 0 ? `${monthsSaved} meses antes (${(monthsSaved / 12).toFixed(1)} años)` : `${base.months} meses`}
        />
        <StatCard
          label="Ahorro neto pago extra"
          value={extra > 0 ? gbp(interestSaved) : "—"}
          sub={extra > 0 ? `${gbp(grossInterestSaved)} intereses − ${gbp(penaltyPaid)} penalización` : "Añade un pago extra en el panel"}
          color={extra > 0 ? EXTRA_COLOR : "#4a6580"}
        />
      </div>

      <ViewTabs value={view} onChange={setView} />

      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {view === "resumen" && (
      <>
      <div style={{ background: "#161b27", border: "1px solid #1e2537", borderRadius: 12, padding: "16px 16px 8px" }}>
        <div style={{ fontSize: 11, color: "#4a6580", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 4 }}>
          Evolución del saldo pendiente
        </div>
        <div style={{ fontSize: 10, color: "#334155", marginBottom: 10 }}>
          <span style={{ color: ACCENT }}>■ Cuota estándar</span>
          {extra > 0 && <> · <span style={{ color: EXTRA_COLOR }}>■ Con pago extra de {gbp(extra)}/mes</span></>}
        </div>
        <ResponsiveContainer width="100%" height={260}>
          <ComposedChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e2537" vertical={false} />
            <XAxis
              dataKey="month"
              type="number"
              domain={[0, maxStartMonth]}
              ticks={yearTicks}
              tickFormatter={(m) => `${Math.round(m / 12)}a`}
              tick={{ fill: "#4a6580", fontSize: 9 }}
              tickLine={false}
              axisLine={false}
            />
            <YAxis tickFormatter={(v) => `£${(v / 1000).toFixed(0)}k`} tick={{ fill: "#4a6580", fontSize: 9 }} tickLine={false} axisLine={false} />
            <Tooltip
              content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null;
                return (
                  <div style={{ background: "#161b27", border: "1px solid #2a3045", borderRadius: 8, padding: "10px 14px", fontSize: 11 }}>
                    <div style={{ color: "#94a3b8", marginBottom: 6, fontWeight: 700 }}>
                      Mes {label} · año {(label / 12).toFixed(1)}
                    </div>
                    {payload.map((p) => (
                      <div key={p.name} style={{ color: p.color }}>
                        {p.name}: {gbp(+p.value)}
                      </div>
                    ))}
                  </div>
                );
              }}
            />
            <Legend wrapperStyle={{ fontSize: 10, color: "#4a6580" }} />
            <Area type="monotone" dataKey="base" name="Saldo (cuota estándar)" stroke={ACCENT} fill={`${ACCENT}22`} strokeWidth={2} dot={false} />
            {extra > 0 && (
              <Area type="monotone" dataKey="extra" name="Saldo (con pago extra)" stroke={EXTRA_COLOR} fill={`${EXTRA_COLOR}22`} strokeWidth={2} dot={false} />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <div style={{ background: "#161b27", border: "1px solid #1e2537", borderRadius: 12, padding: "16px 16px 8px" }}>
        <div style={{ fontSize: 11, color: "#4a6580", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 4 }}>
          Composición de la cuota: interés vs amortización
        </div>
        <div style={{ fontSize: 10, color: "#334155", marginBottom: 10 }}>
          Cada cuota ({activeLabel}) se reparte en interés (lo que cobra el banco) y amortización
          (lo que reduce el capital pendiente). Al principio la mayoría es interés; con el tiempo la
          amortización crece hasta superarlo
          {crossoverMonth ? ` — el cruce llega en el mes ${crossoverMonth} (año ${(crossoverMonth / 12).toFixed(1)})` : ""}.
        </div>
        <div style={{ fontSize: 10, color: "#334155", marginBottom: 10 }}>
          <span style={{ color: PES_COLOR }}>■ Interés</span> ·{" "}
          <span style={{ color: EXTRA_COLOR }}>■ Amortización</span> ·{" "}
          <span style={{ color: ACCENT }}>■ Total cuota</span>
        </div>
        <ResponsiveContainer width="100%" height={240}>
          <ComposedChart data={breakdownData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e2537" vertical={false} />
            <XAxis
              dataKey="month"
              type="number"
              domain={[0, maxStartMonth]}
              ticks={yearTicks}
              tickFormatter={(m) => `${Math.round(m / 12)}a`}
              tick={{ fill: "#4a6580", fontSize: 9 }}
              tickLine={false}
              axisLine={false}
            />
            <YAxis tickFormatter={(v) => `£${v.toFixed(0)}`} tick={{ fill: "#4a6580", fontSize: 9 }} tickLine={false} axisLine={false} />
            <Tooltip
              content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null;
                const d = payload[0].payload;
                return (
                  <div style={{ background: "#161b27", border: "1px solid #2a3045", borderRadius: 8, padding: "10px 14px", fontSize: 11 }}>
                    <div style={{ color: "#94a3b8", marginBottom: 6, fontWeight: 700 }}>
                      Mes {label} · año {(label / 12).toFixed(1)}
                    </div>
                    <div style={{ color: PES_COLOR }}>Interés: {gbp(d.interest)}</div>
                    <div style={{ color: EXTRA_COLOR }}>Amortización: {gbp(d.principal)}</div>
                    <div style={{ color: ACCENT, marginTop: 4, fontWeight: 700 }}>Total cuota: {gbp(d.total)}</div>
                  </div>
                );
              }}
            />
            <Legend wrapperStyle={{ fontSize: 10, color: "#4a6580" }} />
            {crossoverMonth && (
              <ReferenceLine
                x={crossoverMonth}
                stroke="#94a3b8"
                strokeDasharray="4 4"
                strokeWidth={1.5}
                label={{ value: "Cruce interés/amortización", position: "top", fill: "#94a3b8", fontSize: 10 }}
              />
            )}
            <Line type="monotone" dataKey="total" name="Total cuota" stroke={ACCENT} strokeWidth={1.5} strokeDasharray="4 3" dot={false} />
            <Line type="monotone" dataKey="interest" name="Interés" stroke={PES_COLOR} strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="principal" name="Amortización" stroke={EXTRA_COLOR} strokeWidth={2} dot={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      </>
      )}
      {view === "extra" && (
      <>
      <div style={{ background: "#161b27", border: "1px solid #1e2537", borderRadius: 12, padding: "16px 16px 8px" }}>
        <div style={{ fontSize: 11, color: "#4a6580", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 4 }}>
          Intereses acumulados — cuota estándar vs con pago extra
        </div>
        <div style={{ fontSize: 10, color: "#334155", marginBottom: 6 }}>
          {extra > 0
            ? `El hueco entre las dos líneas de interés es el ahorro acumulado hasta ese mes gracias al pago extra de ${gbp(extra)}/mes.`
            : "Sube el pago extra en el panel de la izquierda para comparar el interés acumulado con y sin amortización anticipada."}
        </div>
        <div style={{ fontSize: 10, color: "#334155", marginBottom: 10 }}>
          Líneas discontinuas ámbar (eje derecho): precio mínimo de venta en ese mes para no perder dinero —
          entrada + todo lo pagado hasta la fecha (interés + amortización) + saldo pendiente a cancelar.{" "}
          <span style={{ color: EQUITY_COLOR }}>■</span> Línea rosa: valor estimado de la vivienda con la
          apreciación anual del panel de la izquierda ({appreciation}%/año).
        </div>
        <ResponsiveContainer width="100%" height={260}>
          <ComposedChart data={cumulativeInterest} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e2537" vertical={false} />
            <XAxis
              dataKey="month"
              type="number"
              domain={[0, maxStartMonth]}
              ticks={yearTicks}
              tickFormatter={(m) => `${Math.round(m / 12)}a`}
              tick={{ fill: "#4a6580", fontSize: 9 }}
              tickLine={false}
              axisLine={false}
            />
            <YAxis yAxisId="left" tickFormatter={(v) => `£${(v / 1000).toFixed(0)}k`} tick={{ fill: "#4a6580", fontSize: 9 }} tickLine={false} axisLine={false} />
            <YAxis yAxisId="right" orientation="right" tickFormatter={(v) => `£${(v / 1000).toFixed(0)}k`} tick={{ fill: BREAKEVEN_COLOR, fontSize: 9 }} tickLine={false} axisLine={false} />
            <Tooltip
              content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null;
                const d = payload[0].payload;
                return (
                  <div style={{ background: "#161b27", border: "1px solid #2a3045", borderRadius: 8, padding: "10px 14px", fontSize: 11 }}>
                    <div style={{ color: "#94a3b8", marginBottom: 6, fontWeight: 700 }}>
                      Mes {label} · año {(label / 12).toFixed(1)}
                    </div>
                    <div style={{ color: ACCENT }}>Interés acumulado (estándar): {gbp(d.base)}</div>
                    {extra > 0 && <div style={{ color: EXTRA_COLOR }}>Interés acumulado (con extra): {gbp(d.extra)}</div>}
                    {extra > 0 && <div style={{ color: "#94a3b8", marginTop: 4, fontWeight: 700 }}>Ahorrado hasta aquí: {gbp(d.saved)}</div>}
                    <div style={{ color: BREAKEVEN_COLOR, marginTop: 4 }}>Venta mínima (estándar): {gbp(d.minPriceBase)}</div>
                    {extra > 0 && <div style={{ color: BREAKEVEN_COLOR }}>Venta mínima (con extra): {gbp(d.minPriceExtra)}</div>}
                    <div style={{ color: EQUITY_COLOR, marginTop: 4 }}>Valor vivienda est.: {gbp(d.houseValue)}</div>
                  </div>
                );
              }}
            />
            <Legend wrapperStyle={{ fontSize: 10, color: "#4a6580" }} />
            <Line yAxisId="left" type="monotone" dataKey="base" name="Interés acum. (estándar)" stroke={ACCENT} strokeWidth={2} dot={false} />
            {extra > 0 && (
              <Line yAxisId="left" type="monotone" dataKey="extra" name="Interés acum. (con extra)" stroke={EXTRA_COLOR} strokeWidth={2} dot={false} />
            )}
            <Line yAxisId="right" type="monotone" dataKey="minPriceBase" name="Venta mínima (estándar)" stroke={BREAKEVEN_COLOR} strokeWidth={1.5} strokeDasharray="4 3" dot={false} />
            {extra > 0 && (
              <Line yAxisId="right" type="monotone" dataKey="minPriceExtra" name="Venta mínima (con extra)" stroke={BREAKEVEN_COLOR} strokeWidth={1.5} strokeDasharray="1 3" dot={false} />
            )}
            <Line yAxisId="right" type="monotone" dataKey="houseValue" name="Valor vivienda est." stroke={EQUITY_COLOR} strokeWidth={2} dot={false} />
            {extra > 0 && (
              <ReferenceLine
                yAxisId="left"
                x={withExtra.months}
                stroke={EXTRA_COLOR}
                strokeDasharray="4 4"
                strokeWidth={1.5}
                label={{ value: "Hipoteca liquidada", position: "top", fill: EXTRA_COLOR, fontSize: 10 }}
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <div style={{ background: "#161b27", border: "1px solid #1e2537", borderRadius: 12, padding: "16px 16px 8px" }}>
        <div style={{ fontSize: 11, color: "#4a6580", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 4 }}>
          El coste de esperar: ahorro según el mes en que empiezas
        </div>
        <div style={{ fontSize: 10, color: "#334155", marginBottom: 10 }}>
          {extra > 0
            ? `Mismo pago extra de ${gbp(extra)}/mes, pero empezando en distintos momentos: cuanto más tarde empiezas, menos interés ahorras — cada mes de retraso es intereses que ya no se pueden recuperar. Ahorro neto de la penalización por amortizar en los primeros años.`
            : "Sube el pago extra en el panel de la izquierda para ver cómo cambia el ahorro según el mes en que empieces a pagarlo."}
        </div>
        <ResponsiveContainer width="100%" height={240}>
          <ComposedChart data={delaySweep} margin={{ top: 12, right: 16, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e2537" vertical={false} />
            <XAxis
              dataKey="startMonth"
              type="number"
              domain={[1, maxStartMonth]}
              ticks={yearTicks}
              tickFormatter={(m) => `${Math.round(m / 12)}a`}
              tick={{ fill: "#4a6580", fontSize: 9 }}
              tickLine={false}
              axisLine={false}
              label={{ value: "Mes en que empieza el pago extra", position: "insideBottom", offset: -2, fill: "#4a6580", fontSize: 9 }}
            />
            <YAxis tickFormatter={(v) => `£${(v / 1000).toFixed(0)}k`} tick={{ fill: "#4a6580", fontSize: 9 }} tickLine={false} axisLine={false} />
            <Tooltip
              content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null;
                const d = payload[0].payload;
                return (
                  <div style={{ background: "#161b27", border: "1px solid #2a3045", borderRadius: 8, padding: "10px 14px", fontSize: 11 }}>
                    <div style={{ color: "#94a3b8", marginBottom: 6, fontWeight: 700 }}>
                      Empezando en el mes {label} · año {(label / 12).toFixed(1)}
                    </div>
                    <div style={{ color: EXTRA_COLOR }}>Ahorro neto: {gbp(d.interestSaved)}</div>
                    <div style={{ color: "#94a3b8" }}>Meses ahorrados: {d.monthsSaved}</div>
                  </div>
                );
              }}
            />
            <Area type="monotone" dataKey="interestSaved" name="Ahorro neto" stroke={EXTRA_COLOR} fill={`${EXTRA_COLOR}22`} strokeWidth={2} dot={false} />
            {extra > 0 && (
              <ReferenceDot
                x={effectiveStart}
                y={interestSaved}
                r={5}
                fill={EXTRA_COLOR}
                stroke="#0d1117"
                strokeWidth={1.5}
                label={{ value: "Tu escenario", position: "top", fill: EXTRA_COLOR, fontSize: 10 }}
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      </>
      )}
      {view === "sp" && (
      <>
      <div style={{ background: "#161b27", border: "1px solid #1e2537", borderRadius: 12, padding: "16px 16px 8px" }}>
        <div style={{ fontSize: 11, color: "#4a6580", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 4 }}>
          Pagos extra a la hipoteca vs aportaciones al S&amp;P 500
        </div>
        <div style={{ fontSize: 10, color: "#334155", marginBottom: 14 }}>
          Mismo dinero, dos destinos: un capital inicial (mes 1) más una aportación mensual durante {lumpH} meses. O bien se
          destina a <span style={{ color: EXTRA_COLOR }}>pagos extra a la hipoteca</span> desde el primer mes (con la penalización
          de cada año), o bien se <span style={{ color: SP_COLOR }}>invierte en el S&amp;P 500</span> y en el mes {lumpH} se vende
          todo y se amortiza de golpe. Se mide la <b>reducción de deuda en el mes {lumpH}</b>: saldo pendiente sin pagos extra −
          saldo con ellos − penalizaciones. Parte de la cuota estándar (sin el pago extra mensual del panel).
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
          <div style={{ border: "1px solid #1e2537", borderRadius: 10, padding: "12px 14px 0" }}>
            <div style={{ fontSize: 11, color: "#94a3b8", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 12 }}>
              1 · El dinero disponible
            </div>
            <SliderNumber label="Capital inicial (mes 1)" value={lumpAmount} min={0} max={100000} step={500} unit="£" onChange={setLumpAmount} color={EXTRA_COLOR} />
            <SliderNumber label="Aportación recurrente" value={lumpMonthly} min={0} max={5000} step={25} unit="£/mes" onChange={setLumpMonthly} color={EXTRA_COLOR} />
          </div>
          <div style={{ border: `1px solid ${SP_COLOR}33`, borderRadius: 10, padding: "12px 14px 0" }}>
            <div style={{ fontSize: 11, color: SP_COLOR, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 12 }}>
              2 · Hipótesis del S&amp;P 500
            </div>
            <SliderNumber label="Rentabilidad anualizada" value={spReturn} min={-10} max={20} step={0.5} unit="%/año" onChange={setSpReturn} color={SP_COLOR} />
            <SliderNumber label="Impuesto sobre la ganancia (0% en ISA)" value={spTax} min={0} max={45} step={1} unit="%" onChange={setSpTax} color={SP_COLOR} />
          </div>
        </div>
        <div style={{ fontSize: 10, color: "#4a6580", marginBottom: 16 }}>
          Horizonte: {lumpH} meses ({(lumpH / 12).toFixed(0)} años), el fin del tipo fijo — se cambia en «Años de tipo fijo» del panel izquierdo.
        </div>

        {lumpCompare ? (
          <>
            <div style={{ border: `1px solid ${lumpBest.color}55`, background: `${lumpBest.color}10`, borderRadius: 10, padding: "14px 16px", marginBottom: 16 }}>
              <div style={{ fontSize: 10, color: "#4a6580", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 6 }}>
                Veredicto en el mes {lumpH}
              </div>
              <div style={{ fontSize: 18, fontWeight: 700, color: lumpBest.color, marginBottom: 6 }}>{lumpBest.label}</div>
              <div style={{ fontSize: 12, color: "#94a3b8" }}>
                {lumpOptions
                  .filter((o) => o.key !== lumpBest.key)
                  .map((o) => `${gbp(lumpBest.value - o.value)} más de deuda reducida que «${o.label.toLowerCase()}»`)
                  .join(" · ")}
                .
              </div>
              <div style={{ fontSize: 11, color: "#64748b", marginTop: 6 }}>
                Pagar a la hipoteca desde el mes 1 no es lo mismo que pagar lo mismo en el mes {lumpH}: la diferencia de{" "}
                {gbp(lumpCompare.atH.mortgage - lumpCompare.cashH.reduction)} son los intereses que dejas de pagar en ese tiempo
                (netos de penalización).
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 16 }}>
              <StatCard
                label="Pagos extra a la hipoteca"
                value={gbp(lumpCompare.atH.mortgage)}
                sub={`aportado ${gbp(lumpCompare.atH.contributed)} · penalizaciones ${gbp(lumpCompare.atH.mortgagePenalty)}`}
                color={EXTRA_COLOR}
              />
              <StatCard
                label={`S&P 500 y amortizar en el mes ${lumpH}`}
                value={gbp(lumpCompare.spH.reduction)}
                sub={`la cartera vale ${gbp(lumpCompare.atH.spVal)} · penalización ${gbp(lumpCompare.spH.penalty)}`}
                color={SP_COLOR}
              />
              <StatCard
                label={`Efectivo y amortizar en el mes ${lumpH}`}
                value={gbp(lumpCompare.cashH.reduction)}
                sub="referencia: el dinero guardado sin invertir"
                color={ACCENT}
              />
              <StatCard
                label="S&P necesario para empatar"
                value={lumpCompare.breakeven == null ? "> 100%/año" : `${lumpCompare.breakeven.toFixed(1)}%/año`}
                sub="rentabilidad mínima para que invertir supere a los pagos extra"
                color={lumpCompare.breakeven != null && spReturn >= lumpCompare.breakeven ? SP_COLOR : EXTRA_COLOR}
              />
            </div>

            <div style={{ fontSize: 10, color: "#334155", marginBottom: 10 }}>
              Eje X: mes en que se cierra la comparación. <span style={{ color: EXTRA_COLOR }}>■</span> deuda reducida con los pagos extra hechos hasta ese mes ·{" "}
              <span style={{ color: SP_COLOR }}>■</span> si vendieras la cartera ese mes y amortizaras · <span style={{ color: "#64748b" }}>- -</span> total aportado.
              Las líneas rojas marcan el fin de cada tramo de penalización.
            </div>
            <ResponsiveContainer width="100%" height={260}>
              <ComposedChart data={lumpCompare.sweep} margin={{ top: 12, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e2537" vertical={false} />
                <XAxis
                  dataKey="k"
                  type="number"
                  domain={[1, lumpH]}
                  tickFormatter={(m) => `m${m}`}
                  tick={{ fill: "#4a6580", fontSize: 9 }}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis tickFormatter={(v) => `£${(v / 1000).toFixed(1)}k`} tick={{ fill: "#4a6580", fontSize: 9 }} tickLine={false} axisLine={false} domain={["auto", "auto"]} />
                <Tooltip
                  content={({ active, payload, label }) => {
                    if (!active || !payload?.length) return null;
                    const d = payload[0].payload;
                    return (
                      <div style={{ background: "#161b27", border: "1px solid #2a3045", borderRadius: 8, padding: "10px 14px", fontSize: 11 }}>
                        <div style={{ color: "#94a3b8", marginBottom: 6, fontWeight: 700 }}>
                          Mes {label} · año {(label / 12).toFixed(1)} · penalización {penaltyPctAt(label, penalties)}%
                        </div>
                        <div style={{ color: "#94a3b8" }}>Aportado: {gbp(d.contributed)}</div>
                        <div style={{ color: EXTRA_COLOR }}>Pagos extra: deuda −{gbp(d.mortgage)} (penalizaciones {gbp(d.mortgagePenalty)})</div>
                        <div style={{ color: SP_COLOR }}>S&amp;P (cartera {gbp(d.spVal)}): deuda −{gbp(d.sp)}</div>
                      </div>
                    );
                  }}
                />
                <Legend wrapperStyle={{ fontSize: 10, color: "#4a6580" }} />
                {penalties.map((p, i) =>
                  p > 0 && (i + 1) * 12 < lumpH ? (
                    <ReferenceLine key={i} x={(i + 1) * 12 + 1} stroke={PES_COLOR} strokeOpacity={0.4} strokeDasharray="2 3" />
                  ) : null
                )}
                <Line type="monotone" dataKey="contributed" name="Total aportado" stroke="#64748b" strokeWidth={1.5} strokeDasharray="4 3" dot={false} />
                <Line type="monotone" dataKey="mortgage" name="Pagos extra a la hipoteca" stroke={EXTRA_COLOR} strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="sp" name="S&P 500 y amortizar" stroke={SP_COLOR} strokeWidth={2} dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
            <div style={{ fontSize: 10, color: "#334155", margin: "6px 0 8px" }}>
              Ojo: amortizar es un ahorro garantizado al tipo de la hipoteca; el S&amp;P 500 es volátil (puede estar en pérdidas justo en el mes {lumpH}).
              Usa 0% de impuesto si inviertes dentro de un ISA.
            </div>
          </>
        ) : (
          <div style={{ fontSize: 11, color: "#4a6580", paddingBottom: 10 }}>Introduce un capital inicial o una aportación mensual para comparar.</div>
        )}
      </div>

      </>
      )}
      {view === "equity" && (
      <>
      <div style={{ background: "#161b27", border: "1px solid #1e2537", borderRadius: 12, padding: "16px 16px 8px" }}>
        <div style={{ fontSize: 11, color: "#4a6580", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 4 }}>
          Hitos de equity — cada {MILESTONE_STEP}%
        </div>
        <div style={{ fontSize: 10, color: "#334155", marginBottom: 10 }}>
          Equity = valor de la vivienda (con apreciación) − saldo pendiente ({activeLabel}). Cada punto marca el mes en que
          se alcanza un nuevo tramo de {MILESTONE_STEP}% — relevante para renegociar LTV con el banco.
        </div>
        <ResponsiveContainer width="100%" height={280}>
          <ComposedChart data={equitySeries} margin={{ top: 12, right: 16, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e2537" vertical={false} />
            <XAxis
              dataKey="month"
              type="number"
              domain={[0, maxStartMonth]}
              ticks={yearTicks}
              tickFormatter={(m) => `${Math.round(m / 12)}a`}
              tick={{ fill: "#4a6580", fontSize: 9 }}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              domain={[0, 100]}
              ticks={[0, 25, 50, 75, 100]}
              tickFormatter={(v) => `${v}%`}
              tick={{ fill: "#4a6580", fontSize: 9 }}
              tickLine={false}
              axisLine={false}
            />
            {Array.from({ length: 100 / MILESTONE_STEP - 1 }, (_, i) => (i + 1) * MILESTONE_STEP).map((pct) => (
              <ReferenceLine key={`line-${pct}`} y={pct} stroke={pct % 25 === 0 ? "#334155" : "#1e2537"} strokeDasharray={pct % 25 === 0 ? "0" : "2 3"} />
            ))}
            <Tooltip
              content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null;
                const d = payload[0].payload;
                return (
                  <div style={{ background: "#161b27", border: "1px solid #2a3045", borderRadius: 8, padding: "10px 14px", fontSize: 11 }}>
                    <div style={{ color: "#94a3b8", marginBottom: 6, fontWeight: 700 }}>
                      Mes {label} · año {(label / 12).toFixed(1)}
                    </div>
                    <div style={{ color: EQUITY_COLOR, fontWeight: 700 }}>Equity: {d.pct.toFixed(1)}% · LTV: {(100 - d.pct).toFixed(1)}%</div>
                    <div style={{ color: "#94a3b8" }}>Valor vivienda: {gbp(d.value)}</div>
                    <div style={{ color: "#94a3b8" }}>Saldo pendiente: {gbp(d.balance)}</div>
                  </div>
                );
              }}
            />
            <Line type="linear" dataKey="linear" name="Línea recta (referencia)" stroke="#4a6580" strokeWidth={1.5} strokeDasharray="4 4" dot={false} legendType="none" />
            <Line type="monotone" dataKey="pct" name="Equity %" stroke={EQUITY_COLOR} strokeWidth={2.5} dot={false} />
            {equityMilestones.map((m) => (
              <ReferenceDot
                key={`dot-${m.pct}`}
                x={m.month}
                y={Math.min(100, m.actualPct)}
                r={4}
                fill={EQUITY_COLOR}
                stroke="#0d1117"
                strokeWidth={1.5}
                label={m.pct % 10 === 0 ? { value: `${m.pct}%`, position: "top", fill: "#94a3b8", fontSize: 10 } : undefined}
              />
            ))}
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <div style={{ background: "#161b27", border: "1px solid #1e2537", borderRadius: 12, overflow: "hidden" }}>
        <div style={{ padding: "12px 18px", borderBottom: "1px solid #1e2537", fontSize: 11, color: "#4a6580", letterSpacing: "0.1em", textTransform: "uppercase" }}>
          Detalle de hitos de equity
        </div>
        <div style={{ maxHeight: 320, overflowY: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead style={{ position: "sticky", top: 0, background: "#0d1117" }}>
              <tr>
                <th style={{ padding: "8px 16px", textAlign: "left", color: "#4a6580", fontWeight: 400 }}>Equity</th>
                <th style={{ padding: "8px 12px", textAlign: "right", color: "#4a6580", fontWeight: 400 }}>LTV</th>
                <th style={{ padding: "8px 12px", textAlign: "right", color: "#4a6580", fontWeight: 400 }}>Mes</th>
                <th style={{ padding: "8px 12px", textAlign: "right", color: "#4a6580", fontWeight: 400 }}>Año</th>
                <th style={{ padding: "8px 12px", textAlign: "right", color: "#4a6580", fontWeight: 400 }}>Valor vivienda</th>
                <th style={{ padding: "8px 16px", textAlign: "right", color: "#4a6580", fontWeight: 400 }}>Saldo pendiente</th>
              </tr>
            </thead>
            <tbody>
              {equityMilestones.map((m, i) => (
                <tr key={m.pct} style={{ borderTop: "1px solid #1e253766", background: i % 2 === 0 ? "transparent" : "#0d111766" }}>
                  <td style={{ padding: "7px 16px", color: EQUITY_COLOR, fontWeight: 600 }}>{m.pct}%</td>
                  <td style={{ padding: "7px 12px", textAlign: "right", color: "#94a3b8" }}>{(100 - m.pct).toFixed(0)}%</td>
                  <td style={{ padding: "7px 12px", textAlign: "right", color: "#e2e8f0" }}>{m.month}</td>
                  <td style={{ padding: "7px 12px", textAlign: "right", color: "#94a3b8" }}>{(m.month / 12).toFixed(1)}</td>
                  <td style={{ padding: "7px 12px", textAlign: "right", color: "#94a3b8" }}>{gbp(m.value)}</td>
                  <td style={{ padding: "7px 16px", textAlign: "right", color: "#94a3b8" }}>{gbp(m.balance)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div style={{ background: "#161b27", border: "1px solid #1e2537", borderRadius: 12, padding: "16px 16px 8px" }}>
        <div style={{ fontSize: 11, color: "#4a6580", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 4 }}>
          Renovación de hipoteca — año {renewalYear}
        </div>
        <div style={{ fontSize: 10, color: "#334155", marginBottom: 14 }}>
          Al terminar el tipo fijo (con las hipótesis del panel de la izquierda; se cambia en «Años de tipo fijo») toca renovar.
          A partir de ese punto el banco suele ofrecer mejor tipo cuanta más equity tengas — compara un escenario optimista y uno
          pesimista para los 5 años siguientes.
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 20 }}>
          <StatCard label="Saldo pendiente" value={gbp(renewalPoint.balance)} />
          <StatCard label="Valor vivienda est." value={gbp(renewalPoint.value)} />
          <StatCard label="Equity" value={`${renewalPoint.pct.toFixed(1)}%`} color={EQUITY_COLOR} />
          <StatCard label="LTV" value={`${(100 - renewalPoint.pct).toFixed(1)}%`} />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 20 }}>
          <div style={{ border: `1px solid ${OPT_COLOR}33`, background: `${OPT_COLOR}0d`, borderRadius: 10, padding: "14px 16px" }}>
            <div style={{ fontSize: 11, color: OPT_COLOR, letterSpacing: "0.1em", textTransform: "uppercase", fontWeight: 700, marginBottom: 12 }}>
              Escenario optimista
            </div>
            <SliderNumber label="Apreciación anual" value={optAppreciation} min={-5} max={12} step={0.1} unit="%/año" onChange={setOptAppreciation} color={OPT_COLOR} />
            <SliderNumber label="Nuevo tipo de interés" value={optRate} min={0} max={10} step={0.05} unit="%" onChange={setOptRate} color={OPT_COLOR} />
            <SliderNumber label="Pago extra mensual" value={optExtra} min={0} max={3000} step={25} unit="£/mes" onChange={setOptExtra} color={OPT_COLOR} />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 8 }}>
              <StatCard label="Cuota mensual" value={gbp(optRenewal.payment + optExtra)} color={OPT_COLOR} />
              <StatCard label="Saldo a +5 años" value={gbp(renewalAt5.optBal)} />
              <StatCard label="Equity a +5 años" value={`${renewalAt5.optEquity.toFixed(1)}%`} color={OPT_COLOR} />
              <StatCard label="Intereses (5 años)" value={gbp(optInterest5y)} />
            </div>
          </div>

          <div style={{ border: `1px solid ${PES_COLOR}33`, background: `${PES_COLOR}0d`, borderRadius: 10, padding: "14px 16px" }}>
            <div style={{ fontSize: 11, color: PES_COLOR, letterSpacing: "0.1em", textTransform: "uppercase", fontWeight: 700, marginBottom: 12 }}>
              Escenario pesimista
            </div>
            <SliderNumber label="Apreciación anual" value={pesAppreciation} min={-5} max={12} step={0.1} unit="%/año" onChange={setPesAppreciation} color={PES_COLOR} />
            <SliderNumber label="Nuevo tipo de interés" value={pesRate} min={0} max={10} step={0.05} unit="%" onChange={setPesRate} color={PES_COLOR} />
            <SliderNumber label="Pago extra mensual" value={pesExtra} min={0} max={3000} step={25} unit="£/mes" onChange={setPesExtra} color={PES_COLOR} />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 8 }}>
              <StatCard label="Cuota mensual" value={gbp(pesRenewal.payment + pesExtra)} color={PES_COLOR} />
              <StatCard label="Saldo a +5 años" value={gbp(renewalAt5.pesBal)} />
              <StatCard label="Equity a +5 años" value={`${renewalAt5.pesEquity.toFixed(1)}%`} color={PES_COLOR} />
              <StatCard label="Intereses (5 años)" value={gbp(pesInterest5y)} />
            </div>
          </div>
        </div>

        <div style={{ fontSize: 10, color: "#334155", marginBottom: 10 }}>
          <span style={{ color: OPT_COLOR }}>■ Optimista</span> · <span style={{ color: PES_COLOR }}>■ Pesimista</span> — equity en los 5 años tras la renovación
        </div>
        <ResponsiveContainer width="100%" height={260}>
          <ComposedChart data={renewalChartData} margin={{ top: 12, right: 16, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e2537" vertical={false} />
            <XAxis
              dataKey="m"
              tickFormatter={(m) => `+${Math.round(m / 12)}a`}
              tick={{ fill: "#4a6580", fontSize: 9 }}
              tickLine={false}
              axisLine={false}
            />
            <YAxis domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} tickFormatter={(v) => `${v}%`} tick={{ fill: "#4a6580", fontSize: 9 }} tickLine={false} axisLine={false} />
            <ReferenceLine y={25} stroke="#1e2537" />
            <ReferenceLine y={50} stroke="#1e2537" />
            <ReferenceLine y={75} stroke="#1e2537" />
            <Tooltip
              content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null;
                const d = payload[0].payload;
                return (
                  <div style={{ background: "#161b27", border: "1px solid #2a3045", borderRadius: 8, padding: "10px 14px", fontSize: 11 }}>
                    <div style={{ color: "#94a3b8", marginBottom: 6, fontWeight: 700 }}>
                      Año {(renewalYear + label / 12).toFixed(1)} · +{Math.round(label / 12)} desde la renovación
                    </div>
                    <div style={{ color: OPT_COLOR }}>Optimista: {d.optEquity.toFixed(1)}% equity ({gbp(d.optBal)} pendiente)</div>
                    <div style={{ color: PES_COLOR }}>Pesimista: {d.pesEquity.toFixed(1)}% equity ({gbp(d.pesBal)} pendiente)</div>
                  </div>
                );
              }}
            />
            <Legend wrapperStyle={{ fontSize: 10, color: "#4a6580" }} />
            <Line type="monotone" dataKey="optEquity" name="Equity optimista" stroke={OPT_COLOR} strokeWidth={2.5} dot={false} />
            <Line type="monotone" dataKey="pesEquity" name="Equity pesimista" stroke={PES_COLOR} strokeWidth={2.5} dot={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      </>
      )}
      </div>
      </div>
    </div>
  );
}
