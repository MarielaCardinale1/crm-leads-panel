export type LeadEstado =
  | 'nuevo'
  | 'conversando'
  | 'esperando_mi_respuesta'
  | 'esperando_su_respuesta'
  | 'ganado'
  | 'perdido';

export const ESTADO_LABELS: Record<LeadEstado, string> = {
  nuevo: 'Nuevo',
  conversando: 'Conversando',
  esperando_mi_respuesta: 'Espera mi respuesta',
  esperando_su_respuesta: 'Espero su respuesta',
  ganado: 'Ganado',
  perdido: 'Perdido',
};

export type Prioridad = 'Alta' | 'Media' | 'Baja';

export interface Scoring {
  score: number;
  prioridad: Prioridad | null; // null = lead cerrado (ganado/perdido)
  motivos: string[];
  faltantes: string[];
  cerrado: boolean;
}

/** Campos editables del lead. Mínimos a propósito. */
export interface LeadInput {
  id?: string;
  nombre: string;
  negocio: string;
  contacto: string;
  oferta: string;
  estado: LeadEstado;
  ultimaInteraccion: string; // YYYY-MM-DD
  pidioPrecio: boolean;
  pidioDemo: boolean;
  intencionExplicita: boolean;
  proximaAccion: string;
  fechaProximaAccion: string; // YYYY-MM-DD
  notas: string;
  /** Permiso que dio el negocio para escribirle por cada canal (fecha YYYY-MM-DD). */
  consentimiento?: { dm?: string; whatsapp?: string; email?: string };
}

export interface Lead extends LeadInput {
  id: string;
  createdAt?: number;
  updatedAt?: number;
  scoring: Scoring;
}

export interface Opportunity {
  id: string;
  nombre: string;
  negocio: string;
  score: number;
  prioridad: Prioridad;
  motivos: string[];
  faltantes: string[];
}

export interface DailyOpportunities {
  agent: string;
  today: string;
  opportunities: Opportunity[];
  relevantes: number;
  text: string;
}

export interface FilterState {
  searchQuery: string;
  prioridad: 'all' | Prioridad | 'cerrados';
  estado: 'all' | LeadEstado;
}

export const EMPTY_LEAD: LeadInput = {
  nombre: '',
  negocio: '',
  contacto: '',
  oferta: '',
  estado: 'nuevo',
  ultimaInteraccion: '',
  pidioPrecio: false,
  pidioDemo: false,
  intencionExplicita: false,
  proximaAccion: '',
  fechaProximaAccion: '',
  notas: '',
  consentimiento: {},
};
