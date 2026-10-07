/**
 * Cliente mínimo de Instagram (API con inicio de sesión de Facebook).
 * Publicar = 1) crear contenedor  2) esperar que esté listo  3) publicarlo.
 */
const G = "https://graph.facebook.com/v21.0";

async function api(method, path, token, params = {}) {
  const body = new URLSearchParams({ ...params, access_token: token });
  const url = method === "GET" ? `${G}/${path}?${body}` : `${G}/${path}`;
  const res = await fetch(url, method === "GET" ? {} : { method, body });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error) throw new Error(data.error?.error_user_msg || data.error?.message || `Instagram respondió ${res.status}`);
  return data;
}

function crearContenedor(igId, token, { tipo, url, caption }) {
  const params = tipo === "video"
    ? { media_type: "REELS", video_url: url, caption, share_to_feed: "true" }
    : { image_url: url, caption };
  return api("POST", `${igId}/media`, token, params).then((d) => d.id);
}

/** FINISHED | IN_PROGRESS | ERROR | EXPIRED | PUBLISHED */
function estadoContenedor(containerId, token) {
  return api("GET", containerId, token, { fields: "status_code,status" });
}

async function publicarContenedor(igId, token, containerId) {
  const { id } = await api("POST", `${igId}/media_publish`, token, { creation_id: containerId });
  let permalink = "";
  try {
    permalink = (await api("GET", id, token, { fields: "permalink" })).permalink || "";
  } catch {
    // el post salió igual; el link es opcional
  }
  return { id, permalink };
}

module.exports = { crearContenedor, estadoContenedor, publicarContenedor };
