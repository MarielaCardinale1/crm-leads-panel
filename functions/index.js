/**
 * Codebase "leads" de Firebase Functions.
 * Se despliega aparte del tablero (codebase "default"), así que no lo toca.
 *
 * - leadsApi    → alta / edición / borrado / listado de leads (CRM Leads)
 * - leadScoring → microagente Lead Scoring: "Oportunidades de hoy" (solo lectura)
 * - seguimientos → microagente Seguimientos: qué mirar hoy, sin repetir avisos
 * - copyComercial → microagente Copy Comercial: borrador de mail/WhatsApp para un lead (no envía nada)
 * - redactorPosts → microagente Redactor de posts (CM 7a): 3 borradores por semana con placa
 * - postsApi / postsMedia → ver, editar, aprobar posts y subir foto/video propio
 */
const { onRequest } = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");
const { AGENT, ESTADOS, parseActiveOffers, scoreLead, buildDailyOpportunities, toDateKey } = require("./lead-scoring-rules");
const followups = require("./followup-rules");
const copy = require("./copy-rules");
const posts = require("./posts-rules");
const { renderPlaca } = require("./placa");
const { randomUUID } = require("node:crypto");
const { defineSecret } = require("firebase-functions/params");

// Misma clave que usa Jefe IA (secreto del proyecto). Solo la usa copyComercial.
const OPENAI_API_KEY = defineSecret("OPENAI_API_KEY");

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();

// Configuración en functions/.env (no se sube al repo). Ver .env.example.
const list = (v) => String(v || "").split(",").map((s) => s.trim()).filter(Boolean);
const ALLOWED_EMAILS = new Set(list(process.env.ALLOWED_EMAILS).map((e) => e.toLowerCase()));
const ALLOWED_ORIGINS = new Set(list(process.env.ALLOWED_ORIGINS));
const ACTIVE_OFFERS = parseActiveOffers(process.env.ACTIVE_OFFERS);
const ZONE = "Europe/Paris";
const MAX_LEADS = 500;

function todayKey() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

function cors(req, res) {
  const origin = req.get("Origin") || "";
  if (ALLOWED_ORIGINS.has(origin)) res.set("Access-Control-Allow-Origin", origin);
  res.set("Vary", "Origin");
  res.set("Access-Control-Allow-Headers", "Authorization, Content-Type");
  res.set("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
}

async function verifyUser(req, res, name) {
  const match = (req.get("Authorization") || "").match(/^Bearer (.+)$/);
  if (!match) {
    res.status(401).json({ agent: name, error: "Falta iniciar sesión." });
    return null;
  }
  const decoded = await admin.auth().verifyIdToken(match[1]);
  if (!ALLOWED_EMAILS.has((decoded.email || "").toLowerCase())) {
    res.status(403).json({ agent: name, error: "Cuenta no autorizada." });
    return null;
  }
  return decoded;
}

const leadsRef = (uid) => db.collection("crmLeads").doc(uid).collection("leads");

const str = (v, max = 300) => String(v ?? "").trim().slice(0, max);

/** Solo guarda los campos del modelo. Todo lo demás se descarta. */
function sanitizeLead(body) {
  return {
    nombre: str(body.nombre, 120),
    negocio: str(body.negocio, 160),
    contacto: str(body.contacto, 200),
    oferta: str(body.oferta, 80),
    estado: ESTADOS.includes(body.estado) ? body.estado : "nuevo",
    ultimaInteraccion: toDateKey(body.ultimaInteraccion) || "",
    pidioPrecio: body.pidioPrecio === true,
    pidioDemo: body.pidioDemo === true,
    intencionExplicita: body.intencionExplicita === true,
    proximaAccion: str(body.proximaAccion, 200),
    fechaProximaAccion: toDateKey(body.fechaProximaAccion) || "",
    notas: str(body.notas, 4000),
  };
}

async function readLeads(uid) {
  const snap = await leadsRef(uid).orderBy("updatedAt", "desc").limit(MAX_LEADS).get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

function wrap(name, handler, options = {}) {
  return onRequest({ region: "us-central1", timeoutSeconds: 30, ...options }, async (req, res) => {
    cors(req, res);
    if (req.method === "OPTIONS") return res.status(204).send("");
    try {
      const user = await verifyUser(req, res, name);
      if (!user) return;
      await handler(req, res, user);
    } catch (error) {
      // Observabilidad: cada error dice qué agente/función falló.
      logger.error(`[${name}] falló`, { error: error?.message, stack: error?.stack });
      res.status(500).json({ agent: name, error: `Falló ${name}: ${error?.message || "error desconocido"}` });
    }
  });
}

exports.leadsApi = wrap("leadsApi", async (req, res, user) => {
  const ref = leadsRef(user.uid);
  const today = todayKey();

  if (req.method === "GET") {
    const leads = await readLeads(user.uid);
    return res.json({
      today,
      activeOffers: ACTIVE_OFFERS,
      leads: leads.map((lead) => ({ ...lead, scoring: scoreLead(lead, today, ACTIVE_OFFERS) })),
    });
  }

  if (req.method === "POST") {
    const body = req.body || {};
    const data = sanitizeLead(body);
    if (!data.nombre && !data.negocio) return res.status(400).json({ agent: "leadsApi", error: "Poné al menos nombre o negocio." });
    const now = Date.now();
    const id = str(body.id, 60);
    if (id) {
      await ref.doc(id).set({ ...data, updatedAt: now }, { merge: true });
      return res.json({ ok: true, id });
    }
    const doc = await ref.add({ ...data, createdAt: now, updatedAt: now });
    return res.json({ ok: true, id: doc.id });
  }

  if (req.method === "DELETE") {
    const id = str(req.query.id, 60);
    if (!id) return res.status(400).json({ agent: "leadsApi", error: "Falta id." });
    await ref.doc(id).delete();
    return res.json({ ok: true });
  }

  res.status(405).json({ agent: "leadsApi", error: "Método no permitido." });
});

// Microagente Lead Scoring: solo lee y clasifica. Pensado para que Jefe IA lo consulte.
exports.leadScoring = wrap(AGENT, async (req, res, user) => {
  if (!["GET", "POST"].includes(req.method)) return res.status(405).json({ agent: AGENT, error: "Método no permitido." });
  const leads = await readLeads(user.uid);
  const result = buildDailyOpportunities(leads, todayKey(), ACTIVE_OFFERS);
  logger.info(`[${AGENT}] ok`, { leads: leads.length, relevantes: result.relevantes });
  res.json(result);
});

// Microagente Seguimientos: lee tareas WAITING del tablero + leads en espera.
// GET = vista previa (no marca nada). POST = avisa y guarda qué se avisó (lo usa Jefe IA),
// así el mismo seguimiento no se repite si nada cambió.
exports.seguimientos = wrap(followups.AGENT, async (req, res, user) => {
  if (!["GET", "POST"].includes(req.method)) return res.status(405).json({ agent: followups.AGENT, error: "Método no permitido." });
  const [boardSnap, leads, memSnap] = await Promise.all([
    db.collection("crmDashboardState").doc(user.uid).get(),
    readLeads(user.uid),
    db.collection("crmFollowupState").doc(user.uid).get(),
  ]);
  const items = boardSnap.exists && Array.isArray(boardSnap.data().items) ? boardSnap.data().items : [];
  const memory = memSnap.exists ? memSnap.data().memory || {} : {};
  const result = followups.decideFollowups({ items, leads }, memory, todayKey());
  if (req.method === "POST") {
    await db.collection("crmFollowupState").doc(user.uid).set({ memory: result.memory, updatedAt: Date.now() });
  }
  logger.info(`[${followups.AGENT}] ok`, { total: result.total, avisar: result.avisar.length, marcado: req.method === "POST" });
  const { memory: _omit, ...publico } = result;
  res.json(publico);
});

// Microagente Copy Comercial: redacta UN borrador para UN lead. No envía, no guarda, no cambia el lead.
exports.copyComercial = wrap(copy.AGENT, async (req, res, user) => {
  if (req.method !== "POST") return res.status(405).json({ agent: copy.AGENT, error: "Método no permitido." });
  const leadId = String(req.body?.leadId || "").slice(0, 60);
  const canal = String(req.body?.canal || "");
  if (!leadId) return res.status(400).json({ agent: copy.AGENT, error: "Falta leadId." });

  const snap = await leadsRef(user.uid).doc(leadId).get();
  if (!snap.exists) return res.status(404).json({ agent: copy.AGENT, error: "No encontré ese lead." });
  const lead = snap.data();

  const check = copy.checkLead(lead, canal);
  if (!check.ok) return res.json({ agent: copy.AGENT, ok: false, motivo: check.motivo, faltantes: check.faltantes });

  const { system, user: userMsg } = copy.buildPrompt(lead, canal);
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${OPENAI_API_KEY.value()}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      max_output_tokens: 500,
      input: [
        { role: "system", content: system },
        { role: "user", content: userMsg },
      ],
    }),
  });
  const data = await response.json();
  if (!response.ok) {
    const code = data?.error?.code || data?.error?.type;
    logger.error(`[${copy.AGENT}] OpenAI`, { code });
    const sinSaldo = code === "credit_balance_exhausted" || code === "insufficient_quota";
    return res.status(sinSaldo ? 402 : 502).json({
      agent: copy.AGENT,
      error: sinSaldo ? "La cuenta de OpenAI no tiene saldo." : "OpenAI no respondió. Probá de nuevo.",
    });
  }
  const raw = data.output_text || data.output?.flatMap((p) => p.content || []).map((p) => p.text || "").join("\n");
  const out = copy.parseModelOutput(raw, canal);
  if (!out.ok) return res.json({ agent: copy.AGENT, ok: false, motivo: out.motivo, faltantes: [] });

  logger.info(`[${copy.AGENT}] ok`, { canal, estado: lead.estado });
  res.json({
    agent: copy.AGENT,
    ok: true,
    canal,
    asunto: out.asunto,
    mensaje: out.mensaje,
    whatsappLink: canal === "whatsapp" ? copy.whatsappLink(lead.contacto, out.mensaje) : "",
  });
}, { secrets: [OPENAI_API_KEY], timeoutSeconds: 60 });

// ── Community Manager 7a: Redactor de posts ──────────────────────────────
const postsRef = (uid) => db.collection("crmPosts").doc(uid).collection("posts");
const MAX_MEDIA_BYTES = 30 * 1024 * 1024; // límite práctico de subida por función

/** Guarda un archivo en Storage y devuelve una URL pública con token (la que necesita Instagram). */
async function saveMedia(uid, name, buffer, contentType) {
  const bucket = admin.storage().bucket();
  const filePath = `crmPosts/${uid}/${name}`;
  const token = randomUUID();
  await bucket.file(filePath).save(buffer, {
    contentType,
    metadata: { metadata: { firebaseStorageDownloadTokens: token } },
    resumable: false,
  });
  const url = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(filePath)}?alt=media&token=${token}`;
  return { url, path: filePath };
}

async function askOpenAI(system, user, maxTokens) {
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${OPENAI_API_KEY.value()}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      max_output_tokens: maxTokens,
      input: [{ role: "system", content: system }, { role: "user", content: user }],
    }),
  });
  const data = await response.json();
  if (!response.ok) {
    const code = data?.error?.code || data?.error?.type;
    const err = new Error(code === "insufficient_quota" || code === "credit_balance_exhausted" ? "La cuenta de OpenAI no tiene saldo." : "OpenAI no respondió.");
    err.status = 502;
    throw err;
  }
  return data.output_text || data.output?.flatMap((p) => p.content || []).map((p) => p.text || "").join("\n");
}

// Arma los 3 posts de la semana que viene. Si ya existen, no los duplica.
exports.redactorPosts = wrap(posts.AGENT, async (req, res, user) => {
  if (req.method !== "POST") return res.status(405).json({ agent: posts.AGENT, error: "Método no permitido." });
  const plan = posts.weeklyPlan(todayKey());
  const existing = await postsRef(user.uid).where("semana", "==", plan[0].semana).get();
  const ya = new Set(existing.docs.map((d) => d.data().oferta));
  const creados = [];
  const fallos = [];
  for (const slot of plan) {
    if (ya.has(slot.oferta)) continue;
    try {
      const { system, user: msg } = posts.buildPostPrompt(slot);
      const out = posts.parsePost(await askOpenAI(system, msg, 1200));
      if (!out.ok) throw new Error(out.motivo);
      const png = await renderPlaca({ etiqueta: slot.etiqueta, titulo: out.placa.titulo, subtitulo: out.placa.subtitulo });
      const media = await saveMedia(user.uid, `${slot.semana}-${slot.oferta.replace(/\s+/g, "-")}-placa.png`, png, "image/png");
      const now = Date.now();
      const doc = await postsRef(user.uid).add({
        ...slot,
        placa: out.placa,
        instagram: out.instagram,
        linkedin: out.linkedin,
        redes: ["instagram", "linkedin"],
        media: { tipo: "placa", ...media },
        estado: "borrador",
        createdAt: now,
        updatedAt: now,
      });
      creados.push(doc.id);
    } catch (error) {
      logger.error(`[${posts.AGENT}] ${slot.oferta}`, { error: error?.message });
      fallos.push(`${slot.etiqueta}: ${error?.message || "error"}`);
    }
  }
  logger.info(`[${posts.AGENT}] ok`, { semana: plan[0].semana, creados: creados.length, fallos: fallos.length });
  res.json({ agent: posts.AGENT, semana: plan[0].semana, creados: creados.length, yaExistian: ya.size, fallos });
}, { secrets: [OPENAI_API_KEY], timeoutSeconds: 180, memory: "512MiB" });

// Ver / editar / aprobar / borrar posts. No publica nada.
exports.postsApi = wrap("postsApi", async (req, res, user) => {
  const ref = postsRef(user.uid);
  if (req.method === "GET") {
    const snap = await ref.orderBy("fechaPublicacion", "desc").limit(60).get();
    return res.json({ posts: snap.docs.map((d) => ({ id: d.id, ...d.data() })) });
  }
  if (req.method === "POST") {
    const b = req.body || {};
    const id = String(b.id || "").slice(0, 60);
    if (!id) return res.status(400).json({ agent: "postsApi", error: "Falta id." });
    const patch = { updatedAt: Date.now() };
    if (typeof b.instagram === "string") patch.instagram = b.instagram.slice(0, 2200);
    if (typeof b.linkedin === "string") patch.linkedin = b.linkedin.slice(0, 3000);
    if (posts.ESTADOS_POST.includes(b.estado) && b.estado !== "publicado") patch.estado = b.estado; // "publicado" solo lo pone el Publicador
    if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(b.fechaPublicacion || "")) patch.fechaPublicacion = b.fechaPublicacion;
    if (Array.isArray(b.redes)) patch.redes = b.redes.filter((r) => ["instagram", "linkedin"].includes(r));
    await ref.doc(id).set(patch, { merge: true });
    return res.json({ ok: true });
  }
  if (req.method === "DELETE") {
    const id = String(req.query.id || "").slice(0, 60);
    if (!id) return res.status(400).json({ agent: "postsApi", error: "Falta id." });
    await ref.doc(id).delete();
    return res.json({ ok: true });
  }
  res.status(405).json({ agent: "postsApi", error: "Método no permitido." });
});

// Subir foto o video propio para reemplazar la placa de un post (máx. 30 MB).
exports.postsMedia = wrap("postsMedia", async (req, res, user) => {
  if (req.method !== "POST") return res.status(405).json({ agent: "postsMedia", error: "Método no permitido." });
  const id = String(req.query.id || "").slice(0, 60);
  const type = String(req.get("Content-Type") || "");
  const tipo = type.startsWith("image/") ? "foto" : type.startsWith("video/") ? "video" : null;
  if (!id || !tipo) return res.status(400).json({ agent: "postsMedia", error: "Subí una imagen (JPG/PNG) o un video (MP4/MOV)." });
  if (!["image/jpeg", "image/png", "video/mp4", "video/quicktime"].includes(type)) {
    return res.status(400).json({ agent: "postsMedia", error: "Formato no admitido por Instagram: usá JPG, PNG, MP4 o MOV." });
  }
  const buf = req.rawBody;
  if (!buf?.length) return res.status(400).json({ agent: "postsMedia", error: "Archivo vacío." });
  if (buf.length > MAX_MEDIA_BYTES) return res.status(413).json({ agent: "postsMedia", error: "Máximo 30 MB." });
  const doc = await postsRef(user.uid).doc(id).get();
  if (!doc.exists) return res.status(404).json({ agent: "postsMedia", error: "No encontré ese post." });
  const ext = { "image/jpeg": "jpg", "image/png": "png", "video/mp4": "mp4", "video/quicktime": "mov" }[type];
  const media = await saveMedia(user.uid, `${id}-propio-${Date.now()}.${ext}`, buf, type);
  await postsRef(user.uid).doc(id).set({ media: { tipo, ...media }, updatedAt: Date.now() }, { merge: true });
  res.json({ ok: true, media: { tipo, ...media } });
}, { timeoutSeconds: 120, memory: "512MiB" });
