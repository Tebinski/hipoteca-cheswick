// Todos los barrios generados por scripts/fetch_area.py. Cualquier JSON nuevo en ./data aparece
// automáticamente en la pestaña "Barrios" — no hace falta tocar la interfaz.
const modules = import.meta.glob("./data/*.json", { eager: true, import: "default" });

export const AREAS = Object.values(modules).sort((a, b) => a.name.localeCompare(b.name));
