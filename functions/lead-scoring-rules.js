/**
 * Microagente: LEAD SCORING
 * ---------------------------------------------------------------
 * Una sola responsabilidad: decir qué leads merecen atención hoy.
 * NO envía mensajes, NO agenda, NO modifica leads, NO cambia estados.
 *
 * 100% determinístico (sin IA). Módulo puro: recibe datos, devuelve
 * una clasificación. Sin Firebase ni red, así se prueba con `node --test`.
 */

const AGENT = "leadScoring";

// Ofertas activas: el lead suma puntos si su oferta está acá.
// Se puede cambiar desde functions/.env (ACTIVE_OFFERS="Agenda Online,Web a medida").
const DEFAULT_ACTIVE_OFFERS = ["Agenda Online"];

const ESTADOS = [
  "nuevo",
  "conversando",
  "esperando_mi_respuesta", // el lead espera algo de mí
  "esperando_su_respuesta", // yo espero algo del lead
  "ganado",
  "perdido",
];
const ESTADOS_CERRADOS = new Set(["ganado", "perdido"]);

// Pesos de cada señal. Un solo lugar para ajustarlos.
const PESOS = {
  pidioPrecio: 5,
  pidioDemo: 5,
  esperaMiRespuesta: 5,
  intencionExplicita: 5,
  plazoCercano: 4, // próxima acción vencida o en <= 2 días
  buenEncaje: 3, // oferta activa
  interaccionReciente: 2, // <= 3 días
  contactoAntiguo: -4, // > 30 días sin interacción
  sinNecesidadClara: -2, // sin oferta
};

const UMBRALES = { alta: 10, media: 4 };
const DIAS = { reciente: 3, antiguo: 30, plazo: 2 };

function parseActiveOffers(raw) {
  if (!raw) return DEFAULT_ACTIVE_OFFERS;
  const list = String(raw).split(",").map((s) => s.trim()).filter(Boolean);
  return list.length ? list : DEFAULT_ACTIVE_OFFERS;
}

/** "YYYY-MM-DD" válido o null. Nunca inventa fechas. */
function toDateKey(value) {
  if (!value) return null;
  const str = String(value).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(str) && !Number.isNaN(Date.parse(str + "T00:00:00Z")) ? str : null;
}

/** Días entre dos "YYYY-MM-DD" (b - a). */
function daysBetween(a, b) {
  return Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 86400000);
}

function norm(s) {
  return String(s || "").trim().toLowerCase();
}

function describeDays(n) {
  if (n === 0) return "hoy";
  if (n === 1) return "ayer";
  return `hace ${n} días`;
}

/**
 * Puntúa un lead. `today` es "YYYY-MM-DD" (zona Europe/Paris, lo calcula quien llama).
 * Devuelve { score, prioridad, motivos[], faltantes[], cerrado }.
 */
function scoreLead(lead, today, activeOffers = DEFAULT_ACTIVE_OFFERS) {
  const motivos = [];
  const faltantes = [];
  let score = 0;
  const add = (puntos, texto) => {
    score += puntos;
    motivos.push(texto);
  };

  const estado = ESTADOS.includes(lead?.estado) ? lead.estado : null;
  if (estado && ESTADOS_CERRADOS.has(estado)) {
    return { score: 0, prioridad: null, motivos: [`Lead ${estado}: no es oportunidad abierta.`], faltantes: [], cerrado: true };
  }

  // Datos faltantes: se informan, no se rellenan.
  if (!norm(lead?.nombre) && !norm(lead?.negocio)) faltantes.push("nombre o negocio");
  if (!estado) faltantes.push("estado comercial");
  if (!norm(lead?.oferta)) faltantes.push("oferta de interés");
  const ultima = toDateKey(lead?.ultimaInteraccion);
  if (!ultima) faltantes.push("fecha de última interacción");
  if (!norm(lead?.proximaAccion)) faltantes.push("próxima acción");

  // Señales de intención
  if (lead?.pidioPrecio === true) add(PESOS.pidioPrecio, "pidió precio");
  if (lead?.pidioDemo === true) add(PESOS.pidioDemo, "pidió demo");
  if (estado === "esperando_mi_respuesta") add(PESOS.esperaMiRespuesta, "espera tu respuesta");
  if (lead?.intencionExplicita === true) add(PESOS.intencionExplicita, "mostró intención de compra");

  // Plazo
  const fechaAccion = toDateKey(lead?.fechaProximaAccion);
  if (fechaAccion) {
    const d = daysBetween(today, fechaAccion);
    if (d < 0) add(PESOS.plazoCercano, `próxima acción vencida (${describeDays(-d)})`);
    else if (d <= DIAS.plazo) add(PESOS.plazoCercano, d === 0 ? "próxima acción es hoy" : `próxima acción en ${d} día(s)`);
  }

  // Encaje
  const oferta = norm(lead?.oferta);
  if (oferta) {
    if (activeOffers.some((o) => norm(o) === oferta)) add(PESOS.buenEncaje, `encaja con ${lead.oferta}`);
  } else {
    add(PESOS.sinNecesidadClara, "sin necesidad clara");
  }

  // Recencia (solo si hay fecha real)
  if (ultima) {
    const hace = daysBetween(ultima, today);
    if (hace >= 0 && hace <= DIAS.reciente) add(PESOS.interaccionReciente, `interacción ${describeDays(hace)}`);
    else if (hace > DIAS.antiguo) add(PESOS.contactoAntiguo, `sin actividad desde ${describeDays(hace)}`);
  }

  const prioridad = score >= UMBRALES.alta ? "Alta" : score >= UMBRALES.media ? "Media" : "Baja";
  return { score, prioridad, motivos, faltantes, cerrado: false };
}

const ORDEN = { Alta: 0, Media: 1, Baja: 2 };

/**
 * Arma "Oportunidades de hoy" a partir de todos los leads.
 * Devuelve { agent, today, opportunities[], relevantes, text }.
 */
function buildDailyOpportunities(leads, today, activeOffers = DEFAULT_ACTIVE_OFFERS) {
  const list = Array.isArray(leads) ? leads : [];
  const opportunities = list
    .map((lead) => ({
      id: lead?.id || "",
      nombre: lead?.nombre || "",
      negocio: lead?.negocio || "",
      proximaAccion: lead?.proximaAccion || "",
      fechaProximaAccion: toDateKey(lead?.fechaProximaAccion) || "",
      ...scoreLead(lead, today, activeOffers),
    }))
    .filter((o) => !o.cerrado)
    .sort((a, b) => ORDEN[a.prioridad] - ORDEN[b.prioridad] || b.score - a.score);

  const relevantes = opportunities.filter((o) => o.prioridad !== "Baja");
  return { agent: AGENT, today, opportunities, relevantes: relevantes.length, text: formatText(opportunities, relevantes.length) };
}

function etiqueta(o) {
  return [o.nombre, o.negocio].filter(Boolean).join(" / ") || "(sin nombre)";
}

function formatText(opportunities, relevantes) {
  if (!opportunities.length) return "Oportunidades de hoy\n\nNo hay leads abiertos cargados.";
  const lines = ["Oportunidades de hoy", ""];
  if (!relevantes) {
    lines.push(`No hay oportunidades relevantes hoy (${opportunities.length} lead(s) en prioridad baja).`);
    return lines.join("\n");
  }
  opportunities.forEach((o, i) => {
    lines.push(`${i + 1}. ${etiqueta(o)}`);
    lines.push(`   Prioridad: ${o.prioridad}`);
    lines.push(`   Motivo: ${o.motivos.length ? o.motivos.join(", ") : "sin señales"}.`);
    if (o.faltantes.length) lines.push(`   Faltan datos: ${o.faltantes.join(", ")}.`);
    lines.push("");
  });
  return lines.join("\n").trim();
}

module.exports = {
  AGENT,
  ESTADOS,
  PESOS,
  UMBRALES,
  DEFAULT_ACTIVE_OFFERS,
  parseActiveOffers,
  scoreLead,
  buildDailyOpportunities,
  toDateKey,
};
