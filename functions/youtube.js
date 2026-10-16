/**
 * Cliente mínimo de YouTube (Data API v3, solo subir videos).
 * OJO: mientras Google no audite el proyecto, todo video subido por API queda BLOQUEADO como privado
 * (no se puede pasar a público desde Studio): hay que volver a subirlo a mano. Por eso siempre va como privado.
 */
const crypto = require("node:crypto");

const SCOPE = "https://www.googleapis.com/auth/youtube.upload";
const CATEGORIA_VIAJES = "19"; // "Viajes y eventos"

// ── Guardar el refresh token cifrado (AES-256-GCM con clave derivada del Client Secret) ──
function key(secret) {
  return crypto.createHash("sha256").update(`youtube-token:${secret}`).digest();
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
  // access_type=offline + prompt=consent: sin esto Google no devuelve el refresh token.
  const q = new URLSearchParams({ response_type: "code", client_id: clientId, redirect_uri: redirectUri, state, scope: SCOPE, access_type: "offline", prompt: "consent" });
  return `https://accounts.google.com/o/oauth2/v2/auth?${q}`;
}

async function pedirToken(params) {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params),
  });
  const d = await res.json().catch(() => ({}));
  if (!res.ok || !d.access_token) {
    if (d.error === "invalid_grant") throw new Error("YouTube pide reconectar la cuenta (tocá \"Reconectar YouTube\").");
    throw new Error(d.error_description || `Google respondió ${res.status}`);
  }
  return d;
}

async function canjearCodigo({ code, clientId, clientSecret, redirectUri }) {
  const d = await pedirToken({ grant_type: "authorization_code", code, client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri });
  if (!d.refresh_token) throw new Error("Google no devolvió el permiso permanente. Reconectá y aceptá todo.");
  return { refreshToken: d.refresh_token };
}

async function tokenDeAcceso({ refreshToken, clientId, clientSecret }) {
  const d = await pedirToken({ grant_type: "refresh_token", refresh_token: refreshToken, client_id: clientId, client_secret: clientSecret });
  return d.access_token;
}

// ── Subir ──
/** Cuerpo del video: siempre privado, no es para niños. */
function metadatos({ titulo, descripcion }) {
  return {
    snippet: { title: titulo, description: descripcion, categoryId: CATEGORIA_VIAJES },
    status: { privacyStatus: "private", selfDeclaredMadeForKids: false },
  };
}

/** Subida resumible: 1) pide la URL de subida, 2) manda el archivo entero. Devuelve el id del video. */
async function subirVideo(accessToken, buffer, textos, contentType = "video/mp4") {
  const ini = await fetch("https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json; charset=UTF-8",
      "X-Upload-Content-Length": String(buffer.length),
      "X-Upload-Content-Type": contentType,
    },
    body: JSON.stringify(metadatos(textos)),
  });
  if (!ini.ok) {
    const d = await ini.json().catch(() => ({}));
    throw new Error(d.error?.message || `YouTube respondió ${ini.status}`);
  }
  const uploadUrl = ini.headers.get("location");
  if (!uploadUrl) throw new Error("YouTube no devolvió la dirección de subida.");
  const up = await fetch(uploadUrl, { method: "PUT", headers: { "Content-Type": contentType, "Content-Length": String(buffer.length) }, body: buffer });
  const d = await up.json().catch(() => ({}));
  if (!up.ok || !d.id) throw new Error(d.error?.message || `YouTube no aceptó el video (${up.status}).`);
  return { id: d.id, url: `https://studio.youtube.com/video/${d.id}/edit` };
}

module.exports = { SCOPE, cifrar, descifrar, authUrl, canjearCodigo, tokenDeAcceso, metadatos, subirVideo };
