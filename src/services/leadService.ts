import { auth, FUNCTIONS_BASE_URL } from '../firebase-config';
import { DailyOpportunities, Lead, LeadInput } from '../types';

async function call<T>(fn: string, init: RequestInit = {}, query = ''): Promise<T> {
  const user = auth?.currentUser;
  if (!user) throw new Error('Tenés que iniciar sesión.');
  const token = await user.getIdToken();
  const res = await fetch(`${FUNCTIONS_BASE_URL}/${fn}${query}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init.headers || {}) },
  });
  let data: any = null;
  try {
    data = await res.json();
  } catch {
    // respuesta sin JSON
  }
  if (!res.ok) {
    // Observabilidad: el error dice qué función/agente falló
    const agent = data?.agent ? `[${data.agent}] ` : `[${fn}] `;
    throw new Error(agent + (data?.error || `Error ${res.status}`));
  }
  return data as T;
}

export async function fetchLeads(): Promise<{ today: string; activeOffers: string[]; leads: Lead[] }> {
  return call('leadsApi', { method: 'GET' });
}

export async function saveLead(lead: LeadInput): Promise<{ ok: boolean; id: string }> {
  return call('leadsApi', { method: 'POST', body: JSON.stringify(lead) });
}

export async function deleteLead(id: string): Promise<{ ok: boolean }> {
  return call('leadsApi', { method: 'DELETE' }, `?id=${encodeURIComponent(id)}`);
}

export async function fetchDailyOpportunities(): Promise<DailyOpportunities> {
  return call('leadScoring', { method: 'GET' });
}

export type Canal = 'email' | 'whatsapp' | 'instagram' | 'linkedin';

export interface CopyResult {
  ok: boolean;
  canal?: Canal;
  asunto?: string;
  mensaje?: string;
  whatsappLink?: string;
  motivo?: string;
  faltantes?: string[];
}

/** Microagente Copy Comercial: borrador para un lead guardado. No envía nada. */
export async function draftMessage(leadId: string, canal: Canal): Promise<CopyResult> {
  return call('copyComercial', { method: 'POST', body: JSON.stringify({ leadId, canal }) });
}

// ---- Community Manager 7a: posts de la semana (borradores; no publica nada) ----
export type EstadoPost = 'borrador' | 'aprobado' | 'publicado' | 'descartado';

export interface Publicacion { ok: boolean; url?: string; error?: string; intentos?: number; at?: number }

export interface Post {
  id: string;
  semana: string;
  oferta: string;
  etiqueta: string;
  url: string;
  angulo: string;
  fechaPublicacion: string;
  placa: { titulo: string; subtitulo: string };
  instagram: string;
  linkedin: string;
  facebook?: string;
  redes: ('instagram' | 'linkedin' | 'facebook')[];
  media: { tipo: 'placa' | 'foto' | 'video' | 'carrusel'; url: string; path: string; items?: { url: string; path: string }[] };
  estado: EstadoPost;
  publicacion?: { instagram?: Publicacion; linkedin?: Publicacion; facebook?: Publicacion; pinterest?: Publicacion & { manual?: boolean }; youtube?: Publicacion & { manual?: boolean }; youtubeApi?: Publicacion & { privado?: boolean; id?: string } };
  pinterest?: { titulo: string; descripcion: string; url?: string; path?: string } | null;
  mediosPendientes?: { archivo: string; tipo: 'video' | 'imagen' }[];
  mediosSubidos?: Record<string, { url: string; path: string }>;
}

export async function generateWeek(): Promise<{ semana: string; creados: number; yaExistian: number; fallos: string[] }> {
  return call('redactorPosts', { method: 'POST', body: '{}' });
}

export async function fetchPosts(): Promise<{ posts: Post[]; zona?: string; facebook?: boolean; youtube?: boolean }> {
  return call('postsApi', { method: 'GET' });
}

export async function updatePost(id: string, patch: Partial<Pick<Post, 'instagram' | 'linkedin' | 'facebook' | 'estado' | 'fechaPublicacion' | 'redes'>> & { pinterest?: { titulo: string; descripcion: string }; pinterestHecho?: boolean; youtubeHecho?: boolean; reintentar?: 'instagram' | 'linkedin' | 'facebook' }): Promise<{ ok: boolean }> {
  return call('postsApi', { method: 'POST', body: JSON.stringify({ id, ...patch }) });
}

export async function deletePost(id: string): Promise<{ ok: boolean }> {
  return call('postsApi', { method: 'DELETE' }, `?id=${encodeURIComponent(id)}`);
}

export const MEDIA_TYPES = ['image/jpeg', 'image/png', 'video/mp4', 'video/quicktime'];
export const MAX_MEDIA_MB = 30;

export const MAX_CARRUSEL = 10;

/** Sube tu foto o video para reemplazar la placa del post. Con `carrusel`, suma una imagen al carrusel (máx. 10; `reiniciar` empieza de cero). */
export async function uploadPostMedia(id: string, file: File, carrusel?: { reiniciar?: boolean }): Promise<{ ok: boolean; media: Post['media'] }> {
  if (!MEDIA_TYPES.includes(file.type)) throw new Error('Usá JPG, PNG, MP4 o MOV.');
  if (carrusel && !file.type.startsWith('image/')) throw new Error('El carrusel lleva solo imágenes (JPG o PNG).');
  if (file.size > MAX_MEDIA_MB * 1024 * 1024) throw new Error(`Máximo ${MAX_MEDIA_MB} MB.`);
  const extra = carrusel ? `&modo=carrusel${carrusel.reiniciar ? '&reiniciar=1' : ''}` : '';
  return call('postsMedia', { method: 'POST', body: file, headers: { 'Content-Type': file.type } }, `?id=${encodeURIComponent(id)}${extra}`);
}

/** Microagente Publicador: publica YA en Instagram un post aprobado. */
export async function publishNow(id: string): Promise<{ ok: boolean; instagram?: Publicacion; linkedin?: Publicacion; facebook?: Publicacion }> {
  return call('publicarAhora', { method: 'POST', body: JSON.stringify({ id }) });
}

/** LinkedIn: estado de la conexión (dura 60 días) y botón para conectar. */
export async function linkedinStatus(): Promise<{ conectado: boolean; dias: number; nombre: string }> {
  return call('linkedinConectar', { method: 'GET' });
}

export async function linkedinConnect(): Promise<void> {
  const { url } = await call<{ url: string }>('linkedinConectar', { method: 'POST', body: '{}' });
  window.location.href = url;
}

/** YouTube por API: estado de la conexión, conectar y subir el video de un post (queda PRIVADO y bloqueado hasta que Google audite el proyecto). */
export async function youtubeStatus(): Promise<{ conectado: boolean }> {
  return call('youtubeConectar', { method: 'GET' });
}

export async function youtubeConnect(): Promise<void> {
  const { url } = await call<{ url: string }>('youtubeConectar', { method: 'POST', body: '{}' });
  window.location.href = url;
}

export async function youtubeUpload(id: string): Promise<{ ok: boolean }> {
  return call('youtubeSubir', { method: 'POST', body: JSON.stringify({ id }) });
}

/** Pinterest: arma el pin (texto + imagen vertical) de un post que todavía no lo tiene. */
export async function makePin(id: string): Promise<{ ok: boolean }> {
  return call('pinterestPin', { method: 'POST', body: JSON.stringify({ id }) });
}

// ---- Agente 8: Prospector (busca negocios en Google Maps y los carga como leads) ----
export interface CorridaProspector {
  semana: number;
  fecha: string;
  busquedas: string[];
  encontrados: number;
  cargados: number;
  porPrioridad: Record<string, number>;
  conInstagram: number;
  descartes: Record<string, number>;
  at: number;
}

export async function fetchProspector(): Promise<{ ultimaCorrida: CorridaProspector | null }> {
  return call('prospectorApi', { method: 'GET' });
}

export async function runProspector(): Promise<CorridaProspector> {
  return call('prospectorApi', { method: 'POST', body: '{}' });
}
