/**
 * Cliente mínimo de LinkedIn (producto "Share on LinkedIn" + "Sign In with OpenID Connect").
 * Publica en el perfil personal de Mariela. La conexión dura 60 días (regla de LinkedIn).
 */
const crypto = require("node:crypto");

const API = "https://api.linkedin.com";
// LinkedIn-Version (YYYYMM): LinkedIn da de baja las versiones viejas cada mes.
// Probamos desde el mes pasado hacia atrás y nos quedamos con la primera activa.
function versionesCandidatas(now = new Date()) {
  const out = [];
  for (let i = 1; i <= 6; i++) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    out.push(`${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
  }
  return out;
}
let versionActiva = null;
const esVersionInactiva = (msg) => /version .* is not active|NONEXISTENT_VERSION|VERSION_MISSING/i.test(String(msg || ""));
const SCOPES = "openid profile w_member_social";

// ── Guardar el token cifrado (AES-256-GCM con clave derivada del Client Secret) ──
function key(secret) {
  return crypto.createHash("sha256").update(`linkedin-token:${secret}`).digest();
}
function cifrar(texto, secret) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", key(secret), iv);
  const enc = Buffer.concat([c.update(texto, "utf8"), c.final()]);
  return [iv, c.getAuthTag(), enc].map((b) => b.toString("base64")).join(".");
}
function descifrar(blob, secret) {
  const [iv, tag, enc] = String(blob).split(".").map((s) => Buffer.from(s, "base64"));
  const d = crypto.createDecipheriv("aes-256-gcm", key(secret), iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(enc), d.final()]).toString("utf8");
}

// ── OAuth ──
function authUrl(clientId, redirectUri, state) {
  const q = new URLSearchParams({ response_type: "code", client_id: clientId, redirect_uri: redirectUri, state, scope: SCOPES });
  return `https://www.linkedin.com/oauth/v2/authorization?${q}`;
}

async function canjearCodigo({ code, clientId, clientSecret, redirectUri }) {
  const res = await fetch("https://www.linkedin.com/oauth/v2/accessToken", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "authorization_code", code, client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri }),
  });
  const d = await res.json().catch(() => ({}));
  if (!res.ok || !d.access_token) throw new Error(d.error_description || `LinkedIn respondió ${res.status}`);
  return { token: d.access_token, expiresAt: Date.now() + (d.expires_in || 0) * 1000 };
}

async function quienSoy(token) {
  const res = await fetch(`${API}/v2/userinfo`, { headers: { Authorization: `Bearer ${token}` } });
  const d = await res.json().catch(() => ({}));
  if (!res.ok || !d.sub) throw new Error(d.message || `LinkedIn respondió ${res.status}`);
  return { sub: d.sub, nombre: d.name || "" };
}

// ── Publicar ──
function headers(token, extra = {}, version = versionActiva || versionesCandidatas()[0]) {
  return { Authorization: `Bearer ${token}`, "LinkedIn-Version": version, "X-Restli-Protocol-Version": "2.0.0", "Content-Type": "application/json", ...extra };
}

async function rest(token, path, body) {
  const versiones = versionActiva ? [versionActiva] : versionesCandidatas();
  let ultimo = "";
  for (const v of versiones) {
    const res = await fetch(`${API}/rest/${path}`, { method: "POST", headers: headers(token, {}, v), body: JSON.stringify(body) });
    const text = await res.text();
    let d = {};
    try {
      d = text ? JSON.parse(text) : {};
    } catch {
      // sin JSON
    }
    if (res.ok) {
      versionActiva = v;
      return { data: d, res };
    }
    ultimo = d.message || `LinkedIn respondió ${res.status}`;
    if (!esVersionInactiva(ultimo)) break;
    if (versionActiva) versionActiva = null; // se venció: volver a buscar
  }
  throw new Error(ultimo);
}

async function subirImagen(token, owner, buffer, contentType) {
  const { data } = await rest(token, "images?action=initializeUpload", { initializeUploadRequest: { owner } });
  const { uploadUrl, image } = data.value;
  const up = await fetch(uploadUrl, { method: "PUT", headers: { Authorization: `Bearer ${token}`, "Content-Type": contentType }, body: buffer });
  if (!up.ok) throw new Error(`LinkedIn no aceptó la imagen (${up.status}).`);
  return image;
}

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

async function subirVideo(token, owner, buffer) {
  const { data } = await rest(token, "videos?action=initializeUpload", {
    initializeUploadRequest: { owner, fileSizeBytes: buffer.length, uploadCaptions: false, uploadThumbnail: false },
  });
  const { uploadInstructions, video, uploadToken } = data.value;
  const etags = [];
  for (const part of uploadInstructions) {
    const chunk = buffer.subarray(part.firstByte, part.lastByte + 1);
    const up = await fetch(part.uploadUrl, { method: "PUT", headers: { "Content-Type": "application/octet-stream" }, body: chunk });
    if (!up.ok) throw new Error(`LinkedIn no aceptó el video (${up.status}).`);
    etags.push(up.headers.get("etag"));
  }
  await rest(token, "videos?action=finalizeUpload", { finalizeUploadRequest: { video, uploadToken: uploadToken || "", uploadedPartIds: etags } });
  // Esperar a que LinkedIn termine de procesarlo (máx. ~3 min).
  for (let i = 0; i < 36; i++) {
    const r = await fetch(`${API}/rest/videos/${encodeURIComponent(video)}`, { headers: headers(token) });
    const d = await r.json().catch(() => ({}));
    if (d.status === "AVAILABLE") return video;
    if (d.status === "PROCESSING_FAILED") throw new Error("LinkedIn no pudo procesar el video.");
    await esperar(5000);
  }
  throw new Error("LinkedIn sigue procesando el video; se reintenta en 15 minutos.");
}

async function publicarPost(token, { author, commentary, mediaId }) {
  const body = {
    author,
    commentary,
    visibility: "PUBLIC",
    distribution: { feedDistribution: "MAIN_FEED", targetEntities: [], thirdPartyDistributionChannels: [] },
    lifecycleState: "PUBLISHED",
    isReshareDisabledByAuthor: false,
  };
  if (mediaId) body.content = { media: { id: mediaId } };
  const { res } = await rest(token, "posts", body);
  const id = res.headers.get("x-restli-id") || "";
  return { id, url: id ? `https://www.linkedin.com/feed/update/${id}/` : "" };
}

module.exports = { versionesCandidatas, esVersionInactiva, SCOPES, cifrar, descifrar, authUrl, canjearCodigo, quienSoy, subirImagen, subirVideo, publicarPost };
