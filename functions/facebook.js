/**
 * Cliente mínimo de Facebook (Graph API): publica una foto o un video en una Página.
 * Usa la clave de la página (la misma que ya guarda "Guardar token Instagram.bat").
 * Necesita el permiso `pages_manage_posts` en esa clave.
 */
const G = "https://graph.facebook.com/v21.0";

/** Traduce los errores de Meta a algo que se entienda en el panel. */
function mensajeDeError(error) {
  const code = error?.code;
  const meta = error?.message ? ` (Meta dice: ${String(error.message).slice(0, 220)})` : "";
  if (code === 200 || code === 10 || /permission/i.test(error?.message || "")) {
    return `Falta un permiso para publicar en la Página: pages_manage_posts en la clave, o permisos de administración sobre la Página.${meta}`;
  }
  if (code === 190) return `La clave de Facebook venció o no sirve: generá el token de nuevo y volvé a correr "Guardar token Instagram.bat".${meta}`;
  return error?.error_user_msg || error?.message || "Facebook no respondió.";
}

async function postear(ruta, params) {
  const res = await fetch(`${G}/${ruta}`, { method: "POST", body: new URLSearchParams(params) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error) throw new Error(mensajeDeError(data.error) || `Facebook respondió ${res.status}`);
  return data;
}

/** Foto con texto en la Página. Devuelve { id, url }. */
async function publicarFoto(pageId, token, { url, mensaje }) {
  const d = await postear(`${pageId}/photos`, { url, message: mensaje, published: "true", access_token: token });
  return { id: d.post_id || d.id, url: `https://www.facebook.com/${d.post_id || d.id}` };
}

/** Video con texto en la Página. Devuelve { id, url }. */
async function publicarVideo(pageId, token, { url, mensaje }) {
  const d = await postear(`${pageId}/videos`, { file_url: url, description: mensaje, access_token: token });
  return { id: d.id, url: `https://www.facebook.com/${d.id}` };
}

const RUPLOAD = "https://rupload.facebook.com/video-upload/v21.0";

/**
 * Video vertical corto como Reel de la Página (API de Reels, 3 pasos):
 * 1) abrir la subida, 2) pasarle el link público del video, 3) publicar.
 * Facebook lo procesa después; el Reel aparece en la Página en unos minutos.
 * Requisitos de Facebook: MP4 vertical (9:16), de 3 a 90 segundos.
 */
async function publicarReel(pageId, token, { url, mensaje }) {
  const inicio = await postear(`${pageId}/video_reels`, { upload_phase: "start", access_token: token });
  if (!inicio.video_id) throw new Error("Facebook no abrió la subida del Reel.");
  const subida = await fetch(inicio.upload_url || `${RUPLOAD}/${inicio.video_id}`, {
    method: "POST",
    headers: { Authorization: `OAuth ${token}`, file_url: url },
  });
  const dSubida = await subida.json().catch(() => ({}));
  if (!subida.ok || dSubida.error || dSubida.success === false) {
    throw new Error(mensajeDeError(dSubida.error) || `Facebook no pudo leer el video (${subida.status}).`);
  }
  await postear(`${pageId}/video_reels`, {
    upload_phase: "finish", video_id: inicio.video_id, video_state: "PUBLISHED", description: mensaje, access_token: token,
  });
  return { id: inicio.video_id, url: `https://www.facebook.com/reel/${inicio.video_id}` };
}

module.exports = { publicarFoto, publicarVideo, publicarReel, mensajeDeError };
