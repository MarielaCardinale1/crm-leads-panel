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

export type Canal = 'email' | 'whatsapp' | 'instagram';

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
