/**
 * Microagente: PUBLICADOR (Community Manager 7b)
 * ---------------------------------------------------------------
 * Una sola responsabilidad: publicar en la red los posts que Mariela APROBÓ,
 * cuando llega su fecha. Nunca publica borradores ni descartados, nunca
 * cambia textos, y si algo falla lo deja anotado en el post (no reintenta
 * en bucle: máximo MAX_INTENTOS).
 *
 * Esta parte es determinística (se prueba con node --test).
 */
const { brand } = require("./brand");

const AGENT = "publicador";
const REDES = ["instagram", "linkedin", "facebook"]; // LinkedIn solo si está conectado y Facebook solo si hay Página (se pasa en `activas`)
const MAX_INTENTOS = 3;
const IG_RATIO_MIN = 4 / 5; // Instagram acepta fotos entre 4:5 …
const IG_RATIO_MAX = 1.91; // … y 1.91:1
const MAX_CARRUSEL = 10; // tope de Instagram por carrusel

/** "YYYY-MM-DD HH:MM" en la zona dada. */
function nowKey(date = new Date(), timeZone = brand.horario.zona) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
      .formatToParts(date)
      .map((x) => [x.type, x.value]),
  );
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}`;
}

/** Redes que este post todavía tiene que publicar (y que ya están conectadas). */
function pendingRedes(post, activas = REDES) {
  const pub = post.publicacion || {};
  return (post.redes || [])
    .filter((r) => activas.includes(r))
    .filter((r) => !pub[r]?.ok && (pub[r]?.intentos || 0) < MAX_INTENTOS);
}

/** Medios anunciados al importar que todavía no se subieron (nombres de archivo). */
function mediosFaltantes(post) {
  const subidos = post.mediosSubidos || {};
  return (post.mediosPendientes || []).map((m) => m.archivo).filter((a) => !subidos[a]);
}

/** ¿Hay que publicarlo ahora? Solo aprobados, completos, con fecha cumplida y algo pendiente. */
function isDue(post, now, activas = REDES) {
  return post.estado === "aprobado" && !mediosFaltantes(post).length && !!post.fechaPublicacion && post.fechaPublicacion <= now && pendingRedes(post, activas).length > 0;
}

/** Pasa a "publicado" cuando todas sus redes elegidas ya salieron. */
function estadoTras(post) {
  const pub = post.publicacion || {};
  const elegidas = post.redes || [];
  return elegidas.length && elegidas.every((r) => pub[r]?.ok) ? "publicado" : post.estado;
}

/** Instagram: tope 2200 caracteres y 30 hashtags. */
function captionInstagram(text) {
  let n = 0;
  const limpio = String(text || "").replace(/#[\p{L}\p{N}_]+/gu, (tag) => (++n <= 30 ? tag : ""));
  return limpio.trim().slice(0, 2200);
}

/**
 * LinkedIn: el texto usa "little text", donde ( ) [ ] { } < > @ | ~ _ * # \\ son especiales.
 * Si no se escapan, LinkedIn corta el post. Tope 3000 caracteres.
 */
function textoLinkedin(text) {
  return String(text || "").trim().slice(0, 3000).replace(/[\\|{}@\[\]()<>#*_~]/g, (c) => `\\${c}`);
}

/**
 * Facebook: usa el texto propio del post; si no tiene (posts viejos), el de Instagram sin hashtags y con el link.
 * Tope 2000 caracteres.
 */
function textoFacebook(post) {
  const propio = String(post.facebook || "").trim();
  if (propio) return propio.slice(0, 2000);
  const sinInstagram = String(post.instagram || "")
    .replace(/#[\p{L}\p{N}_]+/gu, "")
    .split("\n")
    // Frases que solo tienen sentido en Instagram ("link en la bio", "escribinos por DM")
    .map((linea) => linea.split(/(?<=[.!?])\s+/).filter((f) => !/\b(bio|DM|mensaje directo|mensaje privado)\b/i.test(f)).join(" ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return `${sinInstagram}\n\n${post.url || ""}`.trim().slice(0, 2000);
}

/**
 * YouTube Shorts: título (tope 100, con #Shorts) y descripción (tope 5000) a partir del texto de Instagram.
 * Es el mismo texto que se muestra en el panel para subirlo a mano.
 */
function textoYoutube(post) {
  const base = String(post.instagram || "").replace(/#\S+/g, "").replace(/\n{3,}/g, "\n\n").trim();
  const titulo = `${String(post.placa?.titulo || "").slice(0, 88).trim()} #Shorts`.trim();
  const descripcion = `${base}\n\n${post.url || ""}\n\n#Shorts`.slice(0, 4900);
  return { titulo, descripcion };
}

/** ¿Hay que reconectar LinkedIn? (la conexión dura 60 días) */
function diasLinkedin(expiresAt, now = Date.now()) {
  return expiresAt ? Math.floor((expiresAt - now) / 86400000) : -1;
}

/** Si la foto no entra en el formato de Instagram, hay que agregarle bordes (sin recortar). */
function necesitaBordes(width, height) {
  const r = width / height;
  return r < IG_RATIO_MIN || r > IG_RATIO_MAX;
}

/** Medio del post como lista de imágenes: carrusel = sus items; foto o placa = una sola. Video = []. */
function itemsDeImagen(media) {
  if (media?.tipo === "carrusel") return media.items || [];
  return media?.tipo === "video" || !media?.url ? [] : [media];
}

/** Un carrusel sale con 2 a 10 imágenes (sin video). Devuelve el motivo si no se puede, o "". */
function motivoCarruselInvalido(media) {
  const n = (media?.items || []).length;
  return n < 2 || n > MAX_CARRUSEL ? `El carrusel necesita de 2 a ${MAX_CARRUSEL} imágenes (tiene ${n}).` : "";
}

module.exports = { mediosFaltantes, MAX_CARRUSEL, itemsDeImagen, motivoCarruselInvalido, AGENT, REDES, textoFacebook, textoLinkedin, textoYoutube, diasLinkedin, MAX_INTENTOS, nowKey, pendingRedes, isDue, estadoTras, captionInstagram, necesitaBordes };
