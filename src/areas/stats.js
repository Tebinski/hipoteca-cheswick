// Estadísticas de un barrio a partir de sus propiedades (se recalculan al filtrar por tipo de vivienda).

export function yearlyStats(properties) {
  const byYear = new Map();
  properties.forEach((p) =>
    p.sales.forEach((s) => {
      const y = +s.date.slice(0, 4);
      if (!byYear.has(y)) byYear.set(y, []);
      byYear.get(y).push(s.price);
    })
  );
  let prevAvg = null;
  return [...byYear.keys()].sort((a, b) => a - b).map((year) => {
    const prices = byYear.get(year);
    const avgPrice = prices.reduce((a, b) => a + b, 0) / prices.length;
    const row = { year, avgPrice: Math.round(avgPrice), count: prices.length, yoyPct: prevAvg ? avgPrice / prevAvg - 1 : null };
    prevAvg = avgPrice;
    return row;
  });
}

export function summaryStats(properties) {
  const withCagr = properties.filter((p) => p.cagr != null);
  const dates = properties.flatMap((p) => p.sales.map((s) => s.date)).sort();

  // CAGR global "desde la primera venta hasta hoy": precio medio de primera venta vs precio medio
  // de la última venta de cada propiedad revendida, anualizado con los años medios transcurridos.
  let overallCagr = null;
  if (withCagr.length) {
    const avg = (f) => withCagr.reduce((s, p) => s + f(p), 0) / withCagr.length;
    const avgFirst = avg((p) => p.sales[0].price);
    const avgLast = avg((p) => p.sales[p.sales.length - 1].price);
    const avgYears = avg((p) => p.yearsSpan);
    if (avgYears > 0) overallCagr = (avgLast / avgFirst) ** (1 / avgYears) - 1;
  }

  return {
    totalProperties: properties.length,
    totalTransactions: properties.reduce((s, p) => s + p.numSales, 0),
    resoldCount: withCagr.length,
    newBuildCount: properties.filter((p) => p.sales[0].newBuild).length,
    avgCagr: withCagr.length ? withCagr.reduce((s, p) => s + p.cagr, 0) / withCagr.length : null,
    overallCagr,
    firstSaleDate: dates[0] ?? null,
    lastSaleDate: dates[dates.length - 1] ?? null,
  };
}
