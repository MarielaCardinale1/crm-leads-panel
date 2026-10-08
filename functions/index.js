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
 * - publicador / publicarAhora → microagente Publicador (CM 7b): sube a Instagram y LinkedIn lo aprobado
 * - linkedinConectar / linkedinCallback → conectar LinkedIn (dura 60 días)
 * - prospectorSemanal / prospectorApi → agente 8 Prospector: busca negocios en Google Maps y los carga como leads
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

/** Imagen vertical 2:3 para Pinterest (misma placa, otro formato). */
async function armarImagenPin(uid, base, etiqueta, placa) {
  const png = await renderPlaca({ etiqueta, titulo: placa.titulo, subtitulo: placa.subtitulo }, "pin");
  return saveMedia(uid, `${base}-pin-${Date.now()}.png`, png, "image/png");
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
      const pin = out.pinterest ? await armarImagenPin(user.uid, `${slot.semana}-${slot.oferta.replace(/\s+/g, "-")}`, slot.etiqueta, out.placa) : null;
      const now = Date.now();
      const doc = await postsRef(user.uid).add({
        ...slot,
        placa: out.placa,
        instagram: out.instagram,
        linkedin: out.linkedin,
        pinterest: out.pinterest ? { ...out.pinterest, ...pin } : null,
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
    if (b.pinterest && typeof b.pinterest === "object") {
      const pin = posts.limpiarPin(b.pinterest);
      if (pin) {
        patch["pinterest.titulo"] = pin.titulo;
        patch["pinterest.descripcion"] = pin.descripcion;
      }
    }
    // Mientras Pinterest no apruebe la app, Mariela lo sube a mano y lo marca acá.
    if (b.pinterestHecho === true) patch["publicacion.pinterest"] = { ok: true, manual: true, at: Date.now() };
    const doc = await ref.doc(id).get();
    if (!doc.exists) return res.status(404).json({ agent: "postsApi", error: "No encontré ese post." });
    await ref.doc(id).update(patch);
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

// Pinterest: arma (o rearma) el pin de un post: texto con IA + imagen vertical.
exports.pinterestPin = wrap(posts.AGENT, async (req, res, user) => {
  if (req.method !== "POST") return res.status(405).json({ agent: posts.AGENT, error: "Método no permitido." });
  const id = String(req.body?.id || "").slice(0, 60);
  const ref = postsRef(user.uid).doc(id);
  const doc = id ? await ref.get() : null;
  if (!doc?.exists) return res.status(404).json({ agent: posts.AGENT, error: "No encontré ese post." });
  const post = doc.data();
  let pin = post.pinterest?.titulo ? { titulo: post.pinterest.titulo, descripcion: post.pinterest.descripcion } : null;
  if (!pin) {
    const { system, user: msg } = posts.buildPinPrompt(post);
    pin = posts.parsePin(await askOpenAI(system, msg, 500));
    if (!pin) throw new Error("El modelo no devolvió un pin válido. Probá de nuevo.");
  }
  const img = await armarImagenPin(user.uid, id, post.etiqueta, post.placa || { titulo: pin.titulo, subtitulo: "" });
  await ref.update({ pinterest: { ...pin, ...img }, updatedAt: Date.now() });
  res.json({ ok: true, pinterest: { ...pin, ...img } });
}, { secrets: [OPENAI_API_KEY], timeoutSeconds: 120, memory: "512MiB" });

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

// ── Community Manager 7b: Publicador ─────────────────────────────────────
// Publica en Instagram los posts APROBADOS cuando llega su fecha.
// Borradores y descartados no se tocan. Si falla, lo anota en el post.
const { onSchedule } = require("firebase-functions/v2/scheduler");
const publisher = require("./publisher-rules");
const ig = require("./instagram");
const IG_PAGE_TOKEN = defineSecret("IG_PAGE_TOKEN");
const LINKEDIN_CLIENT_ID = defineSecret("LINKEDIN_CLIENT_ID");
const LINKEDIN_CLIENT_SECRET = defineSecret("LINKEDIN_CLIENT_SECRET");
const li = require("./linkedin");
const LI_REDIRECT = "https://us-central1-gen-lang-client-0047460717.cloudfunctions.net/linkedinCallback";
const PANEL_URL = "https://marielacardinale-leads.web.app";
const liRef = (uid) => db.collection("crmLinkedin").doc(uid);
const PUB_SECRETS = [IG_PAGE_TOKEN, LINKEDIN_CLIENT_ID, LINKEDIN_CLIENT_SECRET];

/** Conexión de LinkedIn vigente (token descifrado) o null. */
async function linkedinConexion(uid) {
  const d = (await liRef(uid).get()).data();
  if (!d?.tokenCifrado || publisher.diasLinkedin(d.expiresAt) < 0) return null;
  return { token: li.descifrar(d.tokenCifrado, LINKEDIN_CLIENT_SECRET.value()), author: `urn:li:person:${d.sub}` };
}

/** Publica UN post en LinkedIn (texto + placa/foto/video). */
async function publicarEnLinkedin(post, conexion) {
  const prev = post.publicacion?.linkedin || {};
  const intentos = (prev.intentos || 0) + 1;
  try {
    const [buf] = await admin.storage().bucket().file(post.media.path).download();
    const tipoArchivo = post.media.tipo === "video" ? null : post.media.path.endsWith(".png") ? "image/png" : "image/jpeg";
    const mediaId = post.media.tipo === "video"
      ? await li.subirVideo(conexion.token, conexion.author, buf)
      : await li.subirImagen(conexion.token, conexion.author, buf, tipoArchivo);
    const { id, url } = await li.publicarPost(conexion.token, { author: conexion.author, commentary: publisher.textoLinkedin(post.linkedin), mediaId });
    return { ok: true, id, url, at: Date.now(), intentos };
  } catch (error) {
    return { ok: false, intentos, error: error.message, at: Date.now() };
  }
}
const IG_USER_ID = process.env.IG_USER_ID || "17841458234882016"; // @mariela.cardinale (no es secreto)
const LOCK_MS = 6 * 60 * 1000;

/** Instagram solo acepta JPG y dentro de 4:5 … 1.91:1. Convierte (y agrega bordes) si hace falta. */
async function urlParaInstagram(uid, postId, media) {
  if (media.tipo === "video") return media.url;
  if (media.jpgUrl) return media.jpgUrl;
  const sharp = require("sharp");
  const [buf] = await admin.storage().bucket().file(media.path).download();
  let img = sharp(buf).rotate();
  const { width, height } = await img.metadata();
  if (publisher.necesitaBordes(width, height)) {
    const vertical = width / height < 1;
    img = img.resize(1080, vertical ? 1350 : 566, { fit: "contain", background: "#FFF8F0" });
  }
  const jpg = await img.flatten({ background: "#FFF8F0" }).jpeg({ quality: 90 }).toBuffer();
  const saved = await saveMedia(uid, `${postId}-ig-${Date.now()}.jpg`, jpg, "image/jpeg");
  await postsRef(uid).doc(postId).set({ media: { jpgUrl: saved.url } }, { merge: true });
  return saved.url;
}

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

/** Publica UN post en Instagram. Devuelve el nuevo estado de publicacion.instagram. */
async function publicarEnInstagram(uid, postRef, post, token) {
  const prev = post.publicacion?.instagram || {};
  const estado = { ...prev, ok: false, intentos: prev.intentos || 0 };
  try {
    let containerId = prev.containerId;
    if (!containerId) {
      const url = await urlParaInstagram(uid, postRef.id, post.media);
      containerId = await ig.crearContenedor(IG_USER_ID, token, { tipo: post.media.tipo, url, caption: publisher.captionInstagram(post.instagram) });
      estado.containerId = containerId;
      await postRef.set({ publicacion: { instagram: estado } }, { merge: true });
    }
    const limite = Date.now() + (post.media.tipo === "video" ? 200000 : 45000);
    for (;;) {
      const { status_code: code, status } = await ig.estadoContenedor(containerId, token);
      if (code === "FINISHED") break;
      if (code === "ERROR" || code === "EXPIRED") throw Object.assign(new Error(`Instagram no aceptó el archivo (${status || code}).`), { reset: true });
      if (Date.now() > limite) return { ...estado, error: "Instagram sigue procesando el video; se reintenta en 15 minutos." };
      await esperar(5000);
    }
    const { id, permalink } = await ig.publicarContenedor(IG_USER_ID, token, containerId);
    return { ok: true, id, url: permalink, at: Date.now(), intentos: estado.intentos + 1 };
  } catch (error) {
    const out = { ...estado, intentos: estado.intentos + 1, error: error.message, at: Date.now() };
    if (error.reset) delete out.containerId;
    return out;
  }
}

/** Revisa los posts aprobados de un usuario y publica los que tocan. */
async function correrPublicador(uid, soloId = null) {
  const token = IG_PAGE_TOKEN.value();
  const now = publisher.nowKey();
  const conexionLi = await linkedinConexion(uid).catch(() => null);
  const activas = conexionLi ? ["instagram", "linkedin"] : ["instagram"];
  const snap = await postsRef(uid).where("estado", "==", "aprobado").get();
  const resultados = [];
  for (const doc of snap.docs) {
    if (soloId && doc.id !== soloId) continue;
    const post = { id: doc.id, ...doc.data() };
    if (!publisher.isDue(post, now, activas)) continue;
    // Candado: evita publicar dos veces si dos corridas se pisan.
    const tomado = await db.runTransaction(async (t) => {
      const fresh = (await t.get(doc.ref)).data() || {};
      if (fresh.publicando && Date.now() - fresh.publicando < LOCK_MS) return false;
      t.update(doc.ref, { publicando: Date.now() });
      return true;
    });
    if (!tomado) continue;
    try {
      const fresh = { id: doc.id, ...(await doc.ref.get()).data() };
      const publicacion = { ...(fresh.publicacion || {}) };
      const pendientes = publisher.pendingRedes(fresh, activas);
      if (pendientes.includes("instagram")) {
        publicacion.instagram = await publicarEnInstagram(uid, doc.ref, fresh, token);
      }
      if (pendientes.includes("linkedin")) {
        publicacion.linkedin = await publicarEnLinkedin(fresh, conexionLi);
      }
      const estado = publisher.estadoTras({ ...fresh, publicacion });
      await doc.ref.update({ publicacion, estado, publicando: admin.firestore.FieldValue.delete(), updatedAt: Date.now() });
      resultados.push({ id: doc.id, oferta: fresh.etiqueta, instagram: publicacion.instagram, linkedin: publicacion.linkedin });
      logger.info(`[${publisher.AGENT}] ${doc.id}`, { ig: publicacion.instagram?.ok ?? null, li: publicacion.linkedin?.ok ?? null, igError: publicacion.instagram?.error, liError: publicacion.linkedin?.error });
    } catch (error) {
      await doc.ref.update({ publicando: admin.firestore.FieldValue.delete() });
      throw error;
    }
  }
  return { now, resultados };
}

// Cada 15 minutos, hora de Madrid.
exports.publicador = onSchedule(
  { schedule: "every 15 minutes", timeZone: "Europe/Madrid", region: "us-central1", secrets: PUB_SECRETS, timeoutSeconds: 540, memory: "1GiB" },
  async () => {
    const usuarios = await db.collection("crmPosts").listDocuments();
    for (const u of usuarios) {
      try {
        const r = await correrPublicador(u.id);
        if (r.resultados.length) logger.info(`[${publisher.AGENT}] ok`, { uid: u.id, publicados: r.resultados.length });
      } catch (error) {
        logger.error(`[${publisher.AGENT}] falló`, { uid: u.id, error: error?.message });
      }
    }
  },
);

// "Publicar ya": pone la fecha en este momento y publica ese post (solo si está aprobado).
exports.publicarAhora = wrap(publisher.AGENT, async (req, res, user) => {
  if (req.method !== "POST") return res.status(405).json({ agent: publisher.AGENT, error: "Método no permitido." });
  const id = String(req.body?.id || "").slice(0, 60);
  const ref = postsRef(user.uid).doc(id);
  const doc = id ? await ref.get() : null;
  if (!doc?.exists) return res.status(404).json({ agent: publisher.AGENT, error: "No encontré ese post." });
  if (doc.data().estado !== "aprobado") return res.status(400).json({ agent: publisher.AGENT, error: "Primero aprobalo." });
  await ref.update({ fechaPublicacion: publisher.nowKey() });
  const r = await correrPublicador(user.uid, id);
  const out = r.resultados[0];
  if (!out) return res.status(409).json({ agent: publisher.AGENT, error: "Ya se está publicando o ya estaba publicado." });
  const redes = [out.instagram, out.linkedin].filter(Boolean);
  res.json({ ok: redes.every((x) => x.ok), instagram: out.instagram, linkedin: out.linkedin });
}, { secrets: PUB_SECRETS, timeoutSeconds: 540, memory: "1GiB" });

// ── LinkedIn: conectar (dura 60 días) ────────────────────────────────────
exports.linkedinConectar = wrap("linkedin", async (req, res, user) => {
  if (req.method === "GET") {
    const d = (await liRef(user.uid).get()).data();
    return res.json({ conectado: !!d?.tokenCifrado && publisher.diasLinkedin(d.expiresAt) >= 0, dias: publisher.diasLinkedin(d?.expiresAt), nombre: d?.nombre || "" });
  }
  if (req.method !== "POST") return res.status(405).json({ agent: "linkedin", error: "Método no permitido." });
  const state = randomUUID();
  await liRef(user.uid).set({ state, stateAt: Date.now() }, { merge: true });
  res.json({ url: li.authUrl(LINKEDIN_CLIENT_ID.value(), LI_REDIRECT, state) });
}, { secrets: [LINKEDIN_CLIENT_ID] });

// LinkedIn vuelve acá después de que Mariela acepta. Público, pero solo sirve con un `state` recién creado.
exports.linkedinCallback = onRequest({ region: "us-central1", secrets: [LINKEDIN_CLIENT_ID, LINKEDIN_CLIENT_SECRET] }, async (req, res) => {
  const volver = (r) => res.redirect(`${PANEL_URL}/?linkedin=${r}`);
  try {
    const { code, state, error } = req.query;
    if (error || !code || !state) return volver("cancelado");
    const snap = await db.collection("crmLinkedin").where("state", "==", String(state)).limit(1).get();
    const doc = snap.docs[0];
    if (!doc || Date.now() - (doc.data().stateAt || 0) > 15 * 60 * 1000) return volver("vencido");
    const { token, expiresAt } = await li.canjearCodigo({ code: String(code), clientId: LINKEDIN_CLIENT_ID.value(), clientSecret: LINKEDIN_CLIENT_SECRET.value(), redirectUri: LI_REDIRECT });
    const { sub, nombre } = await li.quienSoy(token);
    await doc.ref.set({
      tokenCifrado: li.cifrar(token, LINKEDIN_CLIENT_SECRET.value()), expiresAt, sub, nombre,
      state: admin.firestore.FieldValue.delete(), stateAt: admin.firestore.FieldValue.delete(), conectadoAt: Date.now(),
    }, { merge: true });
    logger.info("[linkedin] conectado", { uid: doc.id, dias: publisher.diasLinkedin(expiresAt) });
    volver("ok");
  } catch (e) {
    logger.error("[linkedin] callback falló", { error: e?.message });
    volver("error");
  }
});

// ── Agente 8: Prospector ─────────────────────────────────────────────────
// Busca negocios de belleza en Google Maps, mira su web y carga los mejores
// en el panel como "nuevo", repartidos 5 por día. No contacta a nadie.
const prospector = require("./prospector-rules");
const PROJECT_ID = process.env.GCLOUD_PROJECT || "gen-lang-client-0047460717";
const PLACES_FIELDS = [
  "places.id", "places.displayName", "places.formattedAddress", "places.nationalPhoneNumber", "places.websiteUri",
  "places.rating", "places.userRatingCount", "places.businessStatus", "places.regularOpeningHours", "places.googleMapsUri",
].join(",");

async function googleToken() {
  const { applicationDefault } = require("firebase-admin/app");
  const { access_token: t } = await applicationDefault().getAccessToken();
  return t;
}

async function buscarEnMaps(texto, token) {
  const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "X-Goog-User-Project": PROJECT_ID, "X-Goog-FieldMask": PLACES_FIELDS, "Content-Type": "application/json" },
    body: JSON.stringify({ textQuery: texto, languageCode: "es", regionCode: "ES", pageSize: 20 }),
  });
  const d = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(d.error?.message || `Google Maps respondió ${res.status}`);
  return d.places || [];
}

async function leerWeb(url) {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 8000);
    const res = await fetch(url, { signal: ctrl.signal, redirect: "follow", headers: { "User-Agent": "Mozilla/5.0 (compatible; MarielaProspector/1.0)" } });
    clearTimeout(t);
    const html = (await res.text()).slice(0, 600000);
    return { html, finalUrl: res.url || url };
  } catch {
    return { html: "", finalUrl: url };
  }
}

/** Corre de a `n` tareas a la vez. */
async function enParalelo(items, n, fn) {
  const out = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: n }, async () => {
    while (i < items.length) {
      const k = i++;
      out[k] = await fn(items[k], k);
    }
  }));
  return out;
}

async function correrProspector(uid) {
  const hoy = todayKey();
  const semana = posts.isoWeek(hoy);
  const busquedas = prospector.busquedasDeLaSemana(semana);
  const token = await googleToken();
  const seenRef = db.collection("crmProspector").doc(uid).collection("vistos");

  const [leads, seenSnap] = await Promise.all([readLeads(uid), seenRef.select().get()]);
  const vistos = new Set(seenSnap.docs.map((d) => d.id));
  const nombresEnPanel = new Set(leads.map((l) => prospector.normalizar(l.nombre)).concat(leads.map((l) => prospector.normalizar(l.negocio))));
  const telefonosEnPanel = new Set(leads.map((l) => prospector.normalizar(l.contacto)).filter((t) => /^\d{9,}$/.test(t)));

  // 1) Google Maps (máx. 6 búsquedas)
  const encontrados = [];
  for (const b of busquedas) {
    const lugares = await buscarEnMaps(`${b.tipo} en ${b.zona}`, token);
    lugares.forEach((pl) => encontrados.push({ ...b, place: pl }));
  }
  const conteoNombres = new Map();
  encontrados.forEach(({ place }) => {
    const k = prospector.normalizar(place.displayName?.text);
    conteoNombres.set(k, (conteoNombres.get(k) || 0) + 1);
  });

  // 2) Descartes
  const descartes = {};
  const unicos = new Map();
  for (const e of encontrados) {
    const motivo = prospector.descartar(e.place, { vistos, nombresEnPanel, telefonosEnPanel, conteoNombres });
    if (motivo || unicos.has(e.place.id)) {
      descartes[motivo || "repetido"] = (descartes[motivo || "repetido"] || 0) + 1;
      continue;
    }
    unicos.set(e.place.id, e);
  }

  // 3) Mirar la web de cada uno (gratis) y clasificar
  const candidatos = (await enParalelo([...unicos.values()], 8, async (e) => {
    const pl = e.place;
    const web = pl.websiteUri || "";
    const { html, finalUrl } = web ? await leerWeb(web) : { html: "", finalUrl: "" };
    const { reservas, instagram } = prospector.analizarWeb(html, finalUrl || web);
    const tieneWeb = !!web && !/instagram\.com|facebook\.com|booksy\.com|treatwell\.|fresha\.com|planity\.com/i.test(web);
    const ganchos = prospector.ganchosDeFicha(pl);
    if (!tieneWeb && /instagram\.com\//i.test(web)) e.igDesdeMaps = `@${web.split("instagram.com/")[1].split(/[/?]/)[0]}`;
    const prio = prospector.prioridad({ tieneWeb, reservas: tieneWeb ? reservas : (reservas || null), ganchosFicha: ganchos });
    if (!prio) {
      descartes["ya tiene reservas propias y ficha completa"] = (descartes["ya tiene reservas propias y ficha completa"] || 0) + 1;
      return null;
    }
    return {
      placeId: pl.id, nombre: pl.displayName?.text || "", tipo: e.tipo, zona: e.zona, prio,
      motivo: prospector.motivoDe({ tieneWeb, reservas }),
      ganchos: tieneWeb ? ganchos : ["no tiene web", ...ganchos],
      instagram: instagram || e.igDesdeMaps || "",
      telefono: pl.nationalPhoneNumber || "", web: tieneWeb ? web : "", direccion: pl.formattedAddress || "", maps: pl.googleMapsUri || "",
    };
  })).filter(Boolean);

  // 4) Cargar en el panel y recordar los vistos (todos, para no volver a analizarlos)
  const nuevos = prospector.armarLeads(candidatos, hoy);
  const now = Date.now();
  const batch = db.batch();
  nuevos.forEach((l) => batch.set(leadsRef(uid).doc(), { ...l, createdAt: now, updatedAt: now }));
  [...unicos.keys()].forEach((id) => batch.set(seenRef.doc(id), { at: now }));
  await batch.commit();

  const resumen = {
    semana, fecha: hoy, busquedas: busquedas.map((b) => `${b.tipo} en ${b.zona}`),
    encontrados: encontrados.length, cargados: nuevos.length,
    porPrioridad: nuevos.reduce((acc, l) => ({ ...acc, [l.prioridadContacto]: (acc[l.prioridadContacto] || 0) + 1 }), {}),
    conInstagram: nuevos.filter((l) => l.contacto.startsWith("@")).length,
    descartes, at: now,
  };
  await db.collection("crmProspector").doc(uid).set({ ultimaCorrida: resumen }, { merge: true });
  logger.info(`[${prospector.AGENT}] ok`, resumen);
  return resumen;
}

// Todos los lunes 7:30 (Madrid).
exports.prospectorSemanal = onSchedule(
  { schedule: "30 7 * * 1", timeZone: "Europe/Madrid", region: "us-central1", timeoutSeconds: 540, memory: "512MiB" },
  async () => {
    const usuarios = await db.collection("crmLeads").listDocuments();
    for (const u of usuarios) {
      try {
        await correrProspector(u.id);
      } catch (error) {
        logger.error(`[${prospector.AGENT}] falló`, { uid: u.id, error: error?.message });
      }
    }
  },
);

// Panel: ver la última corrida (GET) o buscar ahora (POST). Máx. una corrida manual por día.
exports.prospectorApi = wrap(prospector.AGENT, async (req, res, user) => {
  const ref = db.collection("crmProspector").doc(user.uid);
  if (req.method === "GET") return res.json({ ultimaCorrida: (await ref.get()).data()?.ultimaCorrida || null });
  if (req.method !== "POST") return res.status(405).json({ agent: prospector.AGENT, error: "Método no permitido." });
  const ultima = (await ref.get()).data()?.ultimaCorrida;
  if (ultima?.fecha === todayKey()) return res.status(429).json({ agent: prospector.AGENT, error: "Ya buscó hoy. Mañana de nuevo (así no se pasa del cupo gratis)." });
  res.json(await correrProspector(user.uid));
}, { timeoutSeconds: 540, memory: "512MiB" });
