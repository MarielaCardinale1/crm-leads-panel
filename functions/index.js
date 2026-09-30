/**
 * Codebase "leads" de Firebase Functions.
 * Se despliega aparte del tablero (codebase "default"), así que no lo toca.
 *
 * - leadsApi    → alta / edición / borrado / listado de leads (CRM Leads)
 * - leadScoring → microagente Lead Scoring: "Oportunidades de hoy" (solo lectura)
 * - seguimientos → microagente Seguimientos: qué mirar hoy, sin repetir avisos
 */
const { onRequest } = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");
const { AGENT, ESTADOS, parseActiveOffers, scoreLead, buildDailyOpportunities, toDateKey } = require("./lead-scoring-rules");
const followups = require("./followup-rules");

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

function wrap(name, handler) {
  return onRequest({ region: "us-central1", timeoutSeconds: 30 }, async (req, res) => {
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
