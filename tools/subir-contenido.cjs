/**
 * Sube al panel las piezas que dejó revisar-contenido: crea el BORRADOR (postsImport) y sube sus medios (postsMedia).
 * No aprueba ni publica nada: aprobar lo hacés vos en el panel. Si se corta, volvé a correrlo: retoma lo que falta.
 * Uso:  node tools/subir-contenido.cjs <panel> [carpeta-salida]
 * Variables: PANEL_FUNCTIONS_URL (ej. https://us-central1-<proyecto>.cloudfunctions.net) y PANEL_TOKEN (token de sesión del panel, dura 1 h).
 */
const fs = require("node:fs");
const path = require("node:path");
const R = require("./contenido-rules.cjs");

const [panel, salidaArg] = process.argv.slice(2);
const base = (process.env.PANEL_FUNCTIONS_URL || "").replace(/\/$/, "");
const token = process.env.PANEL_TOKEN || "";
if (!panel || !base || !token) {
  console.error("Uso: node tools/subir-contenido.cjs <panel> [carpeta-salida]\nFaltan PANEL_FUNCTIONS_URL y/o PANEL_TOKEN.");
  process.exit(1);
}
const dir = path.join(path.resolve(salidaArg || "salida/postsImport"), panel);
if (!fs.existsSync(dir)) { console.error(`No hay nada en ${dir}`); process.exit(1); }

async function llamar(url, init) {
  const res = await fetch(url, { ...init, headers: { Authorization: `Bearer ${token}`, ...init.headers } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

(async () => {
  let fallos = 0;
  for (const f of fs.readdirSync(dir).filter((n) => n.endsWith(".json")).sort()) {
    const json = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
    const plan = R.planDeSubida(json, base);
    try {
      const r = await llamar(plan.importar.url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(plan.importar.cuerpo) });
      console.log(`[${r.yaExistia ? "ya estaba" : "borrador"}] ${r.id}`);
      for (const archivo of r.faltan || []) {
        const mime = R.mimeDe(archivo);
        if (!mime) throw new Error(`${archivo}: formato no admitido`);
        const out = await llamar(`${base}/postsMedia?id=${encodeURIComponent(r.id)}&archivo=${encodeURIComponent(archivo)}`, {
          method: "POST", headers: { "Content-Type": mime }, body: fs.readFileSync(path.join(plan.carpeta, archivo)),
        });
        console.log(`    subido ${archivo} (faltan ${out.faltan.length})`);
      }
    } catch (e) {
      fallos++;
      console.error(`[error] ${f}: ${e.message}`);
    }
  }
  if (fallos) process.exitCode = 1;
})();
