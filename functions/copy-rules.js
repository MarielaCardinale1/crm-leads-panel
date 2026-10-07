/**
 * Microagente: COPY COMERCIAL
 * ---------------------------------------------------------------
 * Una sola responsabilidad: redactar un borrador de mensaje para UN lead.
 * NO envía nada, NO guarda el mensaje, NO cambia el lead.
 *
 * Este módulo es la parte determinística (sin IA, se prueba con node --test):
 *  - decide si se puede redactar o qué datos faltan,
 *  - decide el objetivo del mensaje según el estado del lead,
 *  - arma las instrucciones con datos REALES de la oferta (nada inventado),
 *  - valida y limpia lo que devuelve el modelo.
 */
const AGENT = "copyComercial";
const CANALES = ["email", "whatsapp"];

// Lo único que el mensaje puede afirmar de cada oferta. Si no está acá, no se promete.
const OFFER_FACTS = {
  "ecommerce para creadores": [
    "Mariela arma la tienda online de merch (remeras, tazas, etc. con el diseño de la creadora) con impresión bajo demanda.",
    "La creadora no compra stock ni paga costo fijo: el proveedor imprime y envía cada pedido cuando se vende.",
    "Se ofrece por canje: la creadora no paga la tienda, a cambio menciona/promociona a Mariela a su audiencia.",
    "Hay cupo limitado: hasta 5 tiendas por canje.",
  ],
  "agenda online": [
    "Gestor de Turnos: agenda online para estudios de belleza (uñas, peluquería, estética).",
    "La clienta reserva sola desde el link de Instagram o la web, elige servicio, profesional y hora, y deja la señal.",
    "Confirmaciones por WhatsApp y sincronización con Google, Apple y Outlook.",
    "Precio fijo: 19 €/mes o 190 €/año. Sin comisión por reserva, sin coste por profesional, sin permanencia.",
  ],
};

const OBJETIVOS = {
  nuevo: "Primer contacto. Presentarse en una línea, mostrar que conocés su trabajo (solo con lo que dicen las notas) y proponer UNA cosa concreta y fácil de aceptar.",
  conversando: "Avanzar la conversación hacia el próximo paso indicado, sin repetir lo ya dicho.",
  esperando_mi_respuesta: "Responder lo que el lead está esperando (ver próxima acción y notas). Es lo más urgente: ir directo a eso.",
  esperando_su_respuesta: "Seguimiento suave: recordar lo pendiente sin presionar y facilitar que responda con una sola línea.",
};

function norm(s) {
  return String(s || "").trim().toLowerCase();
}

/** ¿Se puede redactar? Devuelve { ok, faltantes[], motivo }. */
function checkLead(lead, canal) {
  const faltantes = [];
  if (!CANALES.includes(canal)) return { ok: false, faltantes: [], motivo: "Canal no válido: usá email o whatsapp." };
  if (["ganado", "perdido"].includes(lead?.estado)) {
    return { ok: false, faltantes: [], motivo: `El lead está ${lead.estado}: no hace falta mensaje comercial.` };
  }
  if (!norm(lead?.nombre) && !norm(lead?.negocio)) faltantes.push("nombre o negocio");
  if (!norm(lead?.oferta)) faltantes.push("oferta de interés");
  if (!OBJETIVOS[lead?.estado]) faltantes.push("estado comercial");
  if (["esperando_mi_respuesta", "conversando"].includes(lead?.estado) && !norm(lead?.proximaAccion) && !norm(lead?.notas)) {
    faltantes.push("próxima acción o notas (qué hay que responder)");
  }
  if (faltantes.length) return { ok: false, faltantes, motivo: `Faltan datos para no inventar: ${faltantes.join(", ")}.` };
  return { ok: true, faltantes: [], motivo: "" };
}

function factsFor(oferta) {
  return OFFER_FACTS[norm(oferta)] || null;
}

/** Arma los mensajes para el modelo. Solo datos del lead + hechos de la oferta. */
function buildPrompt(lead, canal) {
  const facts = factsFor(lead.oferta);
  const formato = canal === "email"
    ? "Email: devolvé un asunto de máximo 60 caracteres y un cuerpo de máximo 120 palabras, con saludo y firma \"Mariela\"."
    : "WhatsApp: sin asunto, máximo 450 caracteres, tono cercano, sin saludos largos, firma \"Mariela\".";
  const system = [
    "Sos el redactor comercial de Mariela Cardinale. Escribís UN borrador; Mariela lo revisa y lo manda a mano.",
    "Español de España (tú, \"cita\", \"reserva\", \"señal\"), cálido y directo. Nada de frases de marketing vacías ni emojis en exceso (máximo uno).",
    "Usá SOLO los datos del lead y los hechos de la oferta que te paso. No inventes precios, cifras, resultados, clientes, plazos ni detalles personales del lead.",
    facts ? "" : "La oferta no tiene hechos cargados: no describas características ni precios, solo proponé conversar.",
    "Un solo pedido concreto al final (una pregunta fácil de responder). No presiones ni uses urgencia falsa.",
    formato,
    "Respondé SOLO con JSON: {\"asunto\": string, \"mensaje\": string}. En WhatsApp, asunto vacío.",
  ].filter(Boolean).join("\n");
  const user = JSON.stringify({
    objetivo: OBJETIVOS[lead.estado],
    canal,
    lead: {
      nombre: lead.nombre || "",
      negocio: lead.negocio || "",
      oferta: lead.oferta || "",
      estado: lead.estado,
      pidioPrecio: lead.pidioPrecio === true,
      pidioDemo: lead.pidioDemo === true,
      ultimaInteraccion: lead.ultimaInteraccion || "",
      proximaAccion: lead.proximaAccion || "",
      notas: String(lead.notas || "").slice(0, 1500),
    },
    hechosDeLaOferta: facts || [],
  });
  return { system, user };
}

/** Valida lo que devuelve el modelo. Nunca devuelve algo vacío o fuera de formato. */
function parseModelOutput(raw, canal) {
  let data;
  try {
    const text = String(raw || "").trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
    data = JSON.parse(text);
  } catch {
    return { ok: false, motivo: "El modelo no devolvió un formato válido." };
  }
  const mensaje = String(data?.mensaje || "").trim();
  const asunto = canal === "email" ? String(data?.asunto || "").trim().slice(0, 80) : "";
  if (!mensaje) return { ok: false, motivo: "El modelo devolvió un mensaje vacío." };
  if (canal === "email" && !asunto) return { ok: false, motivo: "Falta el asunto del email." };
  const limite = canal === "whatsapp" ? 600 : 1500;
  return { ok: true, asunto, mensaje: mensaje.slice(0, limite), recortado: mensaje.length > limite };
}

/** Si el contacto parece un teléfono, arma el link de WhatsApp (lo abre Mariela, no se envía solo). */
function whatsappLink(contacto, mensaje) {
  const digits = String(contacto || "").replace(/[^\d+]/g, "");
  const phone = digits.replace(/^\+/, "");
  if (phone.length < 9 || phone.length > 15) return "";
  const full = phone.length === 9 ? `34${phone}` : phone; // 9 dígitos = móvil español
  return `https://wa.me/${full}?text=${encodeURIComponent(mensaje)}`;
}

module.exports = { AGENT, CANALES, OFFER_FACTS, checkLead, buildPrompt, parseModelOutput, whatsappLink };
