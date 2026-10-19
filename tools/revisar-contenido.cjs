/**
 * Revisa las piezas de entrada/contenido/<fecha>-<slug>/ y deja el JSON listo para postsImport.
 * Uso:  node tools/revisar-contenido.cjs [carpeta-entrada] [carpeta-salida]
 * Por defecto: entrada/contenido → salida/postsImport/<panel>/<slug>.json
 * - Pieza nueva: anota llegada y publicar_despues_de (12 h de veto) en el frontmatter. No toca los textos.
 * - Pasado el veto y sin errores: escribe el JSON. Con errores: lo informa y no escribe nada.
 * - Para vetarla a mano: poné "estado: vetada" en pieza.md. NUNCA publica ni llama a la red.
 */
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const R = require("./contenido-rules.cjs");

const raiz = path.join(__dirname, "..");
const entrada = path.resolve(process.argv[2] || "entrada/contenido");
const salida = path.resolve(process.argv[3] || "salida/postsImport");

function archivosDe(dir) {
  const out = {};
  for (const n of fs.readdirSync(dir)) {
    const p = path.join(dir, n);
    if (!fs.statSync(p).isFile() || n === "pieza.md") continue;
    const buf = fs.readFileSync(p);
    out[n] = { bytes: buf.length, sha256: crypto.createHash("sha256").update(buf).digest("hex") };
  }
  return out;
}

/** posts-rules lee el perfil del panel (¿Facebook obligatorio?) al cargarse: se apunta al de cada panel. */
function validadorDe(panel) {
  const perfil = path.join(raiz, "proyectos", panel, "project.json");
  if (fs.existsSync(perfil)) process.env.BRAND_PROYECTO = perfil;
  else delete process.env.BRAND_PROYECTO;
  const ruta = require.resolve("../functions/posts-rules");
  for (const k of Object.keys(require.cache)) if (k.startsWith(path.join(raiz, "functions") + path.sep) && !k.includes("node_modules")) delete require.cache[k];
  return require(ruta).validarImportado;
}

function procesar(carpeta) {
  const archivo = path.join(entrada, carpeta, "pieza.md");
  if (!fs.existsSync(archivo)) return { carpeta, estado: "omitida", detalle: "sin pieza.md" };
  const texto = fs.readFileSync(archivo, "utf8");
  const p = R.parsePieza(texto);
  if (p.error) return { carpeta, estado: "con-errores", detalle: [p.error] };
  const { meta, secciones } = p;
  if (meta.estado === "vetada") return { carpeta, estado: "vetada" };

  const motivos = [...R.revisarMedios(meta, archivosDe(path.join(entrada, carpeta)))];
  if (!meta.panel) motivos.push("Falta panel.");
  if (!meta.aprobado_en) motivos.push("Falta aprobado_en (la pieza no figura aprobada).");
  const json = R.armarJson(meta, secciones);
  if (meta.panel) {
    const v = validadorDe(meta.panel)(json);
    if (!v.ok) motivos.push(v.motivo);
  }
  if (motivos.length) return { carpeta, estado: "con-errores", detalle: motivos };

  const veto = R.estadoVeto(meta, Date.now());
  if (veto.estado === "recien-llegada") {
    fs.writeFileSync(archivo, R.actualizarFrontmatter(texto, { llegada: veto.llegada, publicar_despues_de: veto.despues, estado: "en_veto" }));
    return { carpeta, estado: "en-veto", detalle: `veto hasta ${veto.despues}` };
  }
  if (veto.estado === "en-veto") return { carpeta, estado: "en-veto", detalle: `veto hasta ${veto.hasta}` };

  const destino = path.join(salida, meta.panel, `${meta.slug}.json`);
  fs.mkdirSync(path.dirname(destino), { recursive: true });
  fs.writeFileSync(destino, JSON.stringify(json, null, 2));
  fs.writeFileSync(archivo, R.actualizarFrontmatter(texto, { estado: "listo" }));
  return { carpeta, estado: "lista", detalle: destino, medios: json.medios.map((x) => path.join(entrada, carpeta, x.archivo)) };
}

if (!fs.existsSync(entrada)) { console.error(`No existe ${entrada}`); process.exit(1); }
for (const c of fs.readdirSync(entrada).filter((n) => fs.statSync(path.join(entrada, n)).isDirectory()).sort()) {
  const r = procesar(c);
  console.log(`[${r.estado}] ${c}`);
  for (const d of [].concat(r.detalle || [])) console.log(`    ${d}`);
  if (r.medios) console.log(`    subir a mano (postsMedia): ${r.medios.join(", ")}`);
}
