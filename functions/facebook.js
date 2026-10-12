/**
 * Cliente mínimo de Facebook (Graph API): publica una foto o un video en una Página.
 * Usa la clave de la página (la misma que ya guarda "Guardar token Instagram.bat").
 * Necesita el permiso `pages_manage_posts` en esa clave.
 */
const G = "https://graph.facebook.com/v21.0";

/** Traduce los errores de Meta a algo que se entienda en el panel. */
function mensajeDeError(error) {
  const code = error?.code;
  if (code === 200 || code === 10 || /permission/i.test(error?.message || "")) {
    return "Falta el permiso pages_manage_posts: activá el caso de uso de la Página en la app de Meta, generá el token de nuevo y volvé a correr \"Guardar token Instagram.bat\".";
  }
  if (code === 190) return "La clave de Facebook venció o no sirve: generá el token de nuevo y volvé a correr \"Guardar token Instagram.bat\".";
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

module.exports = { publicarFoto, publicarVideo, mensajeDeError };
