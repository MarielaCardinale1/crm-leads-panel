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
const AGENT = "publicador";
const REDES = ["instagram", "linkedin"]; // LinkedIn solo si está conectado (se pasa en `activas`)
const MAX_INTENTOS = 3;
const IG_RATIO_MIN = 4 / 5; // Instagram acepta fotos entre 4:5 …
const IG_RATIO_MAX = 1.91; // … y 1.91:1

/** "YYYY-MM-DD HH:MM" en la zona dada. */
function nowKey(date = new Date(), timeZone = "Europe/Madrid") {
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

/** ¿Hay que publicarlo ahora? Solo aprobados, con fecha cumplida y algo pendiente. */
function isDue(post, now, activas = REDES) {
  return post.estado === "aprobado" && !!post.fechaPublicacion && post.fechaPublicacion <= now && pendingRedes(post, activas).length > 0;
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

/** ¿Hay que reconectar LinkedIn? (la conexión dura 60 días) */
function diasLinkedin(expiresAt, now = Date.now()) {
  return expiresAt ? Math.floor((expiresAt - now) / 86400000) : -1;
}

/** Si la foto no entra en el formato de Instagram, hay que agregarle bordes (sin recortar). */
function necesitaBordes(width, height) {
  const r = width / height;
  return r < IG_RATIO_MIN || r > IG_RATIO_MAX;
}

module.exports = { AGENT, REDES, textoLinkedin, diasLinkedin, MAX_INTENTOS, nowKey, pendingRedes, isDue, estadoTras, captionInstagram, necesitaBordes };
