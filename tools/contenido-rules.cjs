/**
 * Revisor de contenido (puente Grok → panel). Reglas puras, se prueban con node --test.
 * Lee pieza.md (frontmatter + secciones Instagram / Facebook / YouTube). NO reescribe textos y NO publica.
 */
const VETO_MS = 12 * 60 * 60 * 1000;
const CANALES = ["contenido-reel", "contenido-carrusel"];
const MAX_CARRUSEL = 10;

const sinComillas = (v) => String(v).trim().replace(/^(["'])(.*)\1$/, "$2");

/** Objeto en línea tipo `{archivo: a.mp4, tipo: video, bytes: 12}`. */
function parseInline(s) {
  const o = {};
  for (const par of s.replace(/^\{|\}$/g, "").split(/,(?=\s*\w+\s*:)/)) {
    const i = par.indexOf(":");
    if (i > 0) o[par.slice(0, i).trim()] = sinComillas(par.slice(i + 1));
  }
  if (o.bytes !== undefined) o.bytes = Number(o.bytes);
  return o;
}

/** Separa frontmatter y secciones. Devuelve { meta, secciones } o { error }. */
function parsePieza(texto) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(String(texto || "").replace(/^\uFEFF/, ""));
  if (!m) return { error: "pieza.md no tiene frontmatter (--- … ---)." };
  const meta = {};
  let lista = null;
  for (const linea of m[1].split(/\r?\n/)) {
    const item = /^\s+-\s+(.*)$/.exec(linea);
    if (item && lista) { lista.push(item[1].trim().startsWith("{") ? parseInline(item[1].trim()) : sinComillas(item[1])); continue; }
    const kv = /^([\w-]+):\s*(.*)$/.exec(linea);
    if (!kv) continue;
    if (kv[2].trim() === "" && kv[1] === "medios") { lista = meta[kv[1]] = []; continue; }
    lista = null;
    meta[kv[1]] = sinComillas(kv[2]);
  }
  const secciones = {};
  let actual = null;
  for (const linea of m[2].split(/\r?\n/)) {
    const h = /^##\s+(.+?)\s*$/.exec(linea);
    if (h) { actual = h[1].toLowerCase(); secciones[actual] = []; continue; }
    if (actual) secciones[actual].push(linea);
  }
  for (const k of Object.keys(secciones)) secciones[k] = secciones[k].join("\n").trim();
  return { meta, secciones };
}

/** "Título: …\nDescripción: …" → { titulo, descripcion } (la descripción puede seguir en varias líneas). */
function parseYoutube(s) {
  const t = /^T[ií]tulo:\s*(.*)$/im.exec(s || "");
  const d = /^Descripci[oó]n:\s*([\s\S]*)$/im.exec(s || "");
  return { titulo: t ? t[1].trim() : "", descripcion: d ? d[1].trim() : "" };
}

/** Marca de tiempo "YYYY-MM-DD HH:MM" (hora local del archivo) → ms. NaN si no es válida. */
const aMs = (s) => (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(String(s || "")) ? Date.parse(String(s).replace(" ", "T") + ":00") : NaN);
const pad = (n) => String(n).padStart(2, "0");
const aTexto = (ms) => { const d = new Date(ms); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`; };

/**
 * Chequeos propios del contenido (los de texto y límites los hace posts-rules.validarImportado).
 * `archivos` = { nombre: { bytes, sha256 } } de lo que realmente hay en la carpeta.
 */
function revisarMedios(meta, archivos) {
  const motivos = [];
  const medios = Array.isArray(meta.medios) ? meta.medios : [];
  if (!CANALES.includes(meta.canal)) motivos.push(`Canal no reconocido: "${meta.canal || ""}".`);
  if (!medios.length) motivos.push("La pieza no lista medios.");
  for (const x of medios) {
    const real = archivos[x.archivo];
    if (!real) { motivos.push(`Falta el archivo ${x.archivo}.`); continue; }
    if (!/^[0-9a-f]{64}$/i.test(x.sha256 || "")) motivos.push(`${x.archivo}: sha256 vacío o inválido.`);
    else if (real.sha256.toLowerCase() !== x.sha256.toLowerCase()) motivos.push(`${x.archivo}: el sha256 no coincide (archivo cambiado o incompleto).`);
    if (real.bytes !== x.bytes) motivos.push(`${x.archivo}: pesa ${real.bytes} bytes y la pieza dice ${x.bytes}.`);
  }
  const videos = medios.filter((x) => x.tipo === "video");
  const imagenes = medios.filter((x) => x.tipo === "imagen");
  if (medios.some((x) => x.tipo !== "video" && x.tipo !== "imagen")) motivos.push('Cada medio tiene que ser tipo "video" o "imagen".');
  if (meta.canal === "contenido-reel" && videos.length !== 1) motivos.push("Un Reel necesita exactamente un video.");
  if (meta.canal === "contenido-carrusel" && (videos.length || imagenes.length < 2 || imagenes.length > MAX_CARRUSEL)) motivos.push(`Un carrusel necesita de 2 a ${MAX_CARRUSEL} imágenes (sin video).`);
  return motivos;
}

/** Cuerpo para postsImport (lo que ya entiende el panel) + extras que hoy el endpoint ignora (youtube, medios). */
function armarJson(meta, secciones) {
  const pin = meta.pin_titulo && meta.pin_descripcion ? { titulo: meta.pin_titulo, descripcion: meta.pin_descripcion } : undefined;
  return {
    slug: meta.slug,
    url: meta.url,
    fechaPublicacion: meta.fechaPublicacion,
    etiqueta: meta.etiqueta,
    angulo: meta.angulo || "",
    placa: { titulo: meta.placa_titulo, subtitulo: meta.placa_subtitulo || "" },
    instagram: secciones.instagram || "",
    facebook: secciones.facebook || "",
    pinterest: pin,
    youtube: parseYoutube(secciones.youtube),
    canal: meta.canal,
    medios: (meta.medios || []).map(({ archivo, tipo, bytes, sha256 }) => ({ archivo, tipo, bytes, sha256 })),
  };
}

/** Estado según el veto: "recien-llegada" (hay que fijar llegada), "en-veto" o "lista". */
function estadoVeto(meta, ahora) {
  if (meta.estado === "vetada") return { estado: "vetada" };
  const llegada = aMs(meta.llegada);
  if (Number.isNaN(llegada)) return { estado: "recien-llegada", llegada: aTexto(ahora), despues: aTexto(ahora + VETO_MS) };
  const despues = aMs(meta.publicar_despues_de);
  const fin = Number.isNaN(despues) ? llegada + VETO_MS : despues;
  return ahora >= fin ? { estado: "lista" } : { estado: "en-veto", hasta: aTexto(fin) };
}

/** Cambia solo líneas del frontmatter; el cuerpo (los textos) queda idéntico. */
function actualizarFrontmatter(texto, cambios) {
  const m = /^(\uFEFF?---\r?\n)([\s\S]*?)(\r?\n---)/.exec(texto);
  if (!m) return texto;
  let fm = m[2];
  for (const [k, v] of Object.entries(cambios)) {
    const re = new RegExp(`^${k}:.*$`, "m");
    fm = re.test(fm) ? fm.replace(re, `${k}: ${v}`) : `${fm}\n${k}: ${v}`;
  }
  return texto.slice(0, m.index) + m[1] + fm + m[3] + texto.slice(m.index + m[0].length);
}

const MIME = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", mp4: "video/mp4", mov: "video/quicktime" };
const mimeDe = (archivo) => MIME[String(archivo).split(".").pop().toLowerCase()] || null;

/** Pasos de subida: primero el post (postsImport) y después cada medio, en el orden de la pieza. */
function planDeSubida(json, base) {
  const { _carpeta, ...cuerpo } = json;
  return { importar: { url: `${base}/postsImport`, cuerpo }, carpeta: _carpeta, id: `redes-${json.slug}` };
}

module.exports = { mimeDe, planDeSubida, VETO_MS, CANALES, MAX_CARRUSEL, parsePieza, parseYoutube, revisarMedios, armarJson, estadoVeto, actualizarFrontmatter, aMs, aTexto };
