/**
 * Microagente: SEGUIMIENTOS
 * ---------------------------------------------------------------
 * Una sola responsabilidad: decir qué seguimientos hay que mirar HOY,
 * sin repetir avisos cuando nada cambió.
 * NO escribe mensajes, NO cambia estados, NO toca tareas ni leads.
 *
 * Módulo puro (sin Firebase): recibe datos + memoria de avisos previos,
 * devuelve qué avisar y la memoria nueva. Se prueba con `node --test`.
 *
 * Vuelve a avisar un seguimiento solo si:
 *  1. es nuevo (nunca se avisó),
 *  2. cambió (estado, fecha, notas),
 *  3. vence hoy o está vencido y no se avisó desde que venció,
 *  4. pasaron REMINDER_DAYS desde el último aviso (recordatorio).
 */
const AGENT = "seguimientos";
const REMINDER_DAYS = 3;

function pad(n) {
  return String(n).padStart(2, "0");
}

/** Fecha real ("YYYY-MM-DD") de un dueLabel del tablero, o null. No adivina "hoy"/"mañana". */
function parseDueDate(label, today) {
  const text = String(label || "").trim();
  if (!text) return null;
  const iso = text.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) return `${iso[1]}-${pad(iso[2])}-${pad(iso[3])}`;
  const short = text.match(/(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?/);
  if (short) {
    const year = short[3] ? (short[3].length === 2 ? `20${short[3]}` : short[3]) : today.slice(0, 4);
    return `${year}-${pad(short[2])}-${pad(short[1])}`;
  }
  return null;
}

function daysBetween(a, b) {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);
}

/** Pasa tareas WAITING del tablero y leads en espera a un formato común. */
function collectFollowups({ items = [], leads = [] }, today) {
  const out = [];
  for (const item of Array.isArray(items) ? items : []) {
    if (item?.status !== "WAITING" || !item?.id) continue;
    out.push({
      key: `tarea:${item.id}`,
      origen: "tablero",
      titulo: item.title || "(sin título)",
      fecha: parseDueDate(item.dueLabel, today),
      firma: [item.status, item.dueLabel || "", item.notes || "", item.updatedAt || ""].join("|"),
    });
  }
  for (const lead of Array.isArray(leads) ? leads : []) {
    if (!["esperando_mi_respuesta", "esperando_su_respuesta"].includes(lead?.estado) || !lead?.id) continue;
    const nombre = [lead.nombre, lead.negocio].filter(Boolean).join(" / ") || "(sin nombre)";
    out.push({
      key: `lead:${lead.id}`,
      origen: "lead",
      titulo: `${nombre}${lead.proximaAccion ? ` — ${lead.proximaAccion}` : ""}`,
      esperaMiRespuesta: lead.estado === "esperando_mi_respuesta",
      fecha: /^\d{4}-\d{2}-\d{2}$/.test(lead.fechaProximaAccion || "") ? lead.fechaProximaAccion : null,
      firma: [lead.estado, lead.proximaAccion || "", lead.fechaProximaAccion || "", lead.ultimaInteraccion || ""].join("|"),
    });
  }
  return out;
}

/**
 * Decide qué avisar hoy.
 * memory: { [key]: { firma, avisado: "YYYY-MM-DD" } } — lo que ya se avisó.
 * Devuelve { agent, today, total, avisar[], silenciados, memory, text }.
 */
function decideFollowups(sources, memory = {}, today) {
  const all = collectFollowups(sources, today);
  const avisar = [];
  const nextMemory = {};

  for (const f of all) {
    const prev = memory[f.key];
    let motivo = null;
    if (!prev) motivo = "nuevo";
    else if (prev.firma !== f.firma) motivo = "cambió";
    else if (f.fecha && f.fecha <= today && prev.avisado < f.fecha) motivo = f.fecha === today ? "vence hoy" : "vencido";
    else if (daysBetween(prev.avisado, today) >= REMINDER_DAYS) motivo = `sin novedades hace ${daysBetween(prev.avisado, today)} días`;

    if (motivo) {
      avisar.push({ ...f, motivo });
      nextMemory[f.key] = { firma: f.firma, avisado: today };
    } else {
      nextMemory[f.key] = prev;
    }
  }

  // Primero: leads que esperan mi respuesta, vencidos, vence hoy; después el resto.
  const peso = (f) => (f.esperaMiRespuesta ? 0 : 1) * 10 + (f.motivo === "vencido" ? 0 : f.motivo === "vence hoy" ? 1 : 2);
  avisar.sort((a, b) => peso(a) - peso(b));

  return {
    agent: AGENT,
    today,
    total: all.length,
    avisar: avisar.map(({ firma, ...rest }) => rest),
    silenciados: all.length - avisar.length,
    memory: nextMemory,
    text: formatText(all.length, avisar),
  };
}

function formatText(total, avisar) {
  if (!total) return "Seguimientos: no tenés ninguno pendiente.";
  const head = `Tenés ${total} seguimiento${total === 1 ? "" : "s"} pendiente${total === 1 ? "" : "s"}.`;
  if (!avisar.length) return `${head} Ninguno cambió desde el último aviso: hoy no hace falta mirarlos.`;
  const lines = avisar.map((f) => `- ${f.titulo} (${f.motivo}${f.esperaMiRespuesta ? ", espera TU respuesta" : ""})`);
  return `${head} Para mirar hoy (${avisar.length}):\n${lines.join("\n")}`;
}

module.exports = { AGENT, REMINDER_DAYS, parseDueDate, collectFollowups, decideFollowups };
