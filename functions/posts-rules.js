/**
 * Microagente: REDACTOR DE POSTS (Community Manager 7a)
 * ---------------------------------------------------------------
 * Una sola responsabilidad: proponer los posts de la semana (borradores).
 * NO publica (eso es el 7b) y NO aprueba: Mariela aprueba o edita en el panel.
 *
 * Parte determinística (se prueba con node --test): qué oferta va cada día,
 * qué ángulo, cuándo se publicaría, y validar/limpiar lo que redacta el modelo.
 */
const { OFFER_FACTS } = require("./copy-rules");

const AGENT = "redactorPosts";

// Lo que vende el Community Manager (decisión 07/10). Un post por oferta, por semana.
const OFERTAS = [
  { key: "agenda online", etiqueta: "Agenda online", url: "https://www.marielacardinale.com/gestion-de-turnos" },
  { key: "ficha de google", etiqueta: "Ficha de Google", url: "https://www.marielacardinale.com/diseno-web-gbp" },
  { key: "sitio web", etiqueta: "Sitio web", url: "https://www.marielacardinale.com/diseno-web-gbp" },
];

// Ángulos que rotan semana a semana para no repetir el mismo post.
const ANGULOS = [
  "Un dolor concreto del día a día del negocio y cómo se resuelve.",
  "Error común que le cuesta clientas a un negocio local, y el arreglo.",
  "Antes y después: cómo cambia la rutina con esto.",
  "Pregunta frecuente respondida en claro.",
  "Mito vs. realidad sobre el tema.",
  "Checklist corto (3 puntos) para revisar hoy.",
];

// Lunes, miércoles y viernes a las 10:00 (hora de Madrid).
const DIAS = [1, 3, 5];
const HORA = 10;

function pad(n) {
  return String(n).padStart(2, "0");
}

/** Número de semana ISO (para rotar ángulos de forma estable). */
function isoWeek(dateKey) {
  const d = new Date(`${dateKey}T12:00:00Z`);
  const day = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - day + 3);
  const firstThursday = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  return 1 + Math.round(((d - firstThursday) / 86400000 - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7);
}

/** Lunes de la semana SIGUIENTE a `today` ("YYYY-MM-DD"). */
function nextMonday(today) {
  const d = new Date(`${today}T12:00:00Z`);
  const day = d.getUTCDay(); // 0 dom … 6 sáb
  const add = ((8 - day) % 7) || 7;
  d.setUTCDate(d.getUTCDate() + add);
  return d.toISOString().slice(0, 10);
}

/** Plan de la semana: 3 posts, uno por oferta, con fecha y ángulo. */
function weeklyPlan(today) {
  const lunes = nextMonday(today);
  const semana = isoWeek(lunes);
  return OFERTAS.map((oferta, i) => {
    const d = new Date(`${lunes}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + (DIAS[i] - 1));
    const fecha = d.toISOString().slice(0, 10);
    return {
      semana: `${lunes.slice(0, 4)}-S${pad(semana)}`,
      oferta: oferta.key,
      etiqueta: oferta.etiqueta,
      url: oferta.url,
      angulo: ANGULOS[(semana + i * 2) % ANGULOS.length],
      fechaPublicacion: `${fecha} ${pad(HORA)}:00`,
    };
  });
}

function buildPostPrompt(slot) {
  const facts = OFFER_FACTS[slot.oferta] || [];
  const system = [
    "Sos la community manager de Mariela Cardinale (negocios locales en España: estudios de belleza, peluquerías, centros de estética).",
    "Escribís UN post para Instagram y LinkedIn. Mariela lo revisa antes de publicar.",
    "Español de España (tú, \"cita\", \"reserva\", \"señal\"). Claro, cercano, sin frases de marketing vacías. Máximo 2 emojis por texto.",
    "Usá SOLO los hechos de la oferta que te paso. No inventes precios, cifras, porcentajes, testimonios, clientes ni resultados.",
    "Placa (la imagen): titulo de máximo 60 caracteres que enganche; subtitulo de máximo 90 caracteres o vacío.",
    "Instagram: máximo 1000 caracteres, primera línea que enganche, cierre con una llamada a la acción suave (escribir por DM o link en la bio) y 3 a 5 hashtags en español al final.",
    "LinkedIn: máximo 1200 caracteres, tono profesional pero humano, sin hashtags o como mucho 3, cerrá con el link de la oferta.",
    "Respondé SOLO con JSON: {\"placa\":{\"titulo\":string,\"subtitulo\":string},\"instagram\":string,\"linkedin\":string}.",
  ].join("\n");
  const user = JSON.stringify({
    oferta: slot.etiqueta,
    angulo: slot.angulo,
    linkDeLaOferta: slot.url,
    hechosDeLaOferta: facts,
  });
  return { system, user };
}

function cut(s, n) {
  const t = String(s || "").trim();
  return t.length > n ? `${t.slice(0, n - 1).trimEnd()}…` : t;
}

/** Valida y acota lo que devuelve el modelo. Nunca devuelve un post vacío. */
function parsePost(raw) {
  let data;
  try {
    const text = String(raw || "").trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
    data = JSON.parse(text);
  } catch {
    return { ok: false, motivo: "El modelo no devolvió un formato válido." };
  }
  const titulo = cut(data?.placa?.titulo, 70);
  const instagram = cut(data?.instagram, 2200); // límite real de Instagram
  const linkedin = cut(data?.linkedin, 3000); // límite real de LinkedIn
  if (!titulo || !instagram || !linkedin) return { ok: false, motivo: "Faltan partes del post (título, Instagram o LinkedIn)." };
  return { ok: true, placa: { titulo, subtitulo: cut(data?.placa?.subtitulo, 100) }, instagram, linkedin };
}

const ESTADOS_POST = ["borrador", "aprobado", "publicado", "descartado"];

module.exports = { AGENT, OFERTAS, ANGULOS, ESTADOS_POST, weeklyPlan, nextMonday, isoWeek, buildPostPrompt, parsePost };
