import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { onAuthStateChanged, signInWithPopup, signOut, User } from 'firebase/auth';
import { auth, googleProvider, isAuthorizedEmail, isFirebaseConfigured, getMissingEnvVars } from './firebase-config';
import { Header } from './components/Header';
import { StatCards, LeadStats } from './components/StatCards';
import { FiltersBar } from './components/FiltersBar';
import { LeadsTable } from './components/LeadsTable';
import { LeadForm } from './components/LeadForm';
import { OpportunitiesPanel } from './components/OpportunitiesPanel';
import { LoginScreen } from './components/LoginScreen';
import { PostsPanel } from './components/PostsPanel';
import { ProspectorCard } from './components/ProspectorCard';
import { EMPTY_LEAD, FilterState, Lead, LeadInput } from './types';
import { fetchLeads, saveLead, deleteLead } from './services/leadService';
import { exportLeadsToCSV } from './utils/csvExport';
import { ThemeMode, getInitialTheme, applyTheme } from './utils/themeUtils';
import { AlertTriangle, CheckCircle, Info } from 'lucide-react';

const EMPTY_FILTERS: FilterState = { searchQuery: '', prioridad: 'all', estado: 'all' };
const PRIORITY_ORDER = { Alta: 0, Media: 1, Baja: 2 } as const;

function toInput(lead: Lead): LeadInput {
  const { scoring, createdAt, updatedAt, ...rest } = lead;
  return { ...EMPTY_LEAD, ...rest };
}

export default function App() {
  const [theme, setTheme] = useState<ThemeMode>(getInitialTheme);
  useEffect(() => applyTheme(theme), [theme]);
  const handleToggleTheme = () => setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));

  // Auth
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [unauthorizedEmail, setUnauthorizedEmail] = useState<string | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);

  // Datos
  const [leads, setLeads] = useState<Lead[]>([]);
  const [today, setToday] = useState<string>(new Date().toISOString().slice(0, 10));
  const [activeOffers, setActiveOffers] = useState<string[]>([]);
  const [isDataLoading, setIsDataLoading] = useState(true);
  const [dataError, setDataError] = useState<string | null>(null);
  const [filters, setFilters] = useState<FilterState>(EMPTY_FILTERS);
  const [editing, setEditing] = useState<LeadInput | null>(null);
  const [tab, setTab] = useState<'leads' | 'redes'>('leads');
  const [toastMessage, setToastMessage] = useState<{ text: string; type: 'success' | 'info' | 'error' } | null>(null);

  const showToast = (text: string, type: 'success' | 'info' | 'error' = 'success') => {
    setToastMessage({ text, type });
    setTimeout(() => setToastMessage(null), 3500);
  };

  useEffect(() => {
    if (!auth) {
      setIsAuthLoading(false);
      return;
    }
    return onAuthStateChanged(auth, async (user) => {
      setIsAuthLoading(false);
      if (user && isAuthorizedEmail(user.email)) {
        setCurrentUser(user);
        setUnauthorizedEmail(null);
        setAuthError(null);
      } else if (user) {
        if (auth) await signOut(auth);
        setCurrentUser(null);
        setUnauthorizedEmail(user.email || 'Email no identificado');
      } else {
        setCurrentUser(null);
      }
    });
  }, []);

  const loadLeads = useCallback(async () => {
    setIsDataLoading(true);
    setDataError(null);
    try {
      const data = await fetchLeads();
      setLeads(data.leads || []);
      setToday(data.today);
      setActiveOffers(data.activeOffers || []);
    } catch (err: any) {
      setDataError(err.message);
    } finally {
      setIsDataLoading(false);
    }
  }, []);

  // Vuelta de LinkedIn después de conectar
  useEffect(() => {
    const r = new URLSearchParams(window.location.search).get('linkedin');
    if (!r) return;
    setTab('redes');
    const msg: Record<string, [string, 'success' | 'info' | 'error']> = {
      ok: ['LinkedIn conectado', 'success'],
      cancelado: ['Conexión con LinkedIn cancelada', 'info'],
      vencido: ['El enlace venció, probá de nuevo', 'error'],
    };
    const [text, type] = msg[r] || ['No se pudo conectar LinkedIn', 'error'];
    showToast(text, type);
    window.history.replaceState({}, '', window.location.pathname);
  }, []);

  useEffect(() => {
    if (currentUser) loadLeads();
    else setLeads([]);
  }, [currentUser, loadLeads]);

  const handleGoogleLogin = async () => {
    if (!auth) {
      setAuthError('Falta configurar .env: Firebase Auth no está inicializado.');
      return;
    }
    setIsLoggingIn(true);
    setAuthError(null);
    setUnauthorizedEmail(null);
    try {
      const { user } = await signInWithPopup(auth, googleProvider);
      if (!isAuthorizedEmail(user.email)) {
        await signOut(auth);
        setUnauthorizedEmail(user.email || 'Email no identificado');
      } else {
        setCurrentUser(user);
      }
    } catch (err: any) {
      if (err.code === 'auth/unauthorized-domain') setAuthError('auth/unauthorized-domain');
      else if (err.code === 'auth/popup-closed-by-user') setAuthError('Se cerró la ventana de Google antes de terminar.');
      else if (err.code !== 'auth/cancelled-popup-request') setAuthError(`Error de autenticación: ${err.message || 'No se pudo conectar con Google.'}`);
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleLogout = async () => {
    if (auth) await signOut(auth);
    setCurrentUser(null);
    showToast('Sesión cerrada', 'info');
  };

  const handleSave = async (lead: LeadInput) => {
    await saveLead(lead);
    setEditing(null);
    showToast(lead.id ? 'Lead actualizado' : 'Lead creado');
    await loadLeads();
  };

  const handleDelete = async (id: string) => {
    await deleteLead(id);
    setEditing(null);
    showToast('Lead borrado', 'info');
    await loadLeads();
  };

  const stats: LeadStats = useMemo(() => {
    const s = { alta: 0, media: 0, baja: 0, abiertos: 0, cerrados: 0 };
    leads.forEach((l) => {
      if (l.scoring.cerrado) return void s.cerrados++;
      s.abiertos++;
      if (l.scoring.prioridad === 'Alta') s.alta++;
      else if (l.scoring.prioridad === 'Media') s.media++;
      else s.baja++;
    });
    return s;
  }, [leads]);

  const filteredLeads = useMemo(() => {
    const q = filters.searchQuery.toLowerCase().trim();
    return leads
      .filter((l) => {
        if (q && ![l.nombre, l.negocio, l.oferta, l.notas, l.contacto].some((v) => (v || '').toLowerCase().includes(q))) return false;
        if (filters.estado !== 'all' && l.estado !== filters.estado) return false;
        if (filters.prioridad === 'cerrados') return l.scoring.cerrado;
        if (filters.prioridad !== 'all' && l.scoring.prioridad !== filters.prioridad) return false;
        return true;
      })
      .sort((a, b) => {
        if (a.scoring.cerrado !== b.scoring.cerrado) return a.scoring.cerrado ? 1 : -1;
        const pa = a.scoring.prioridad ? PRIORITY_ORDER[a.scoring.prioridad] : 3;
        const pb = b.scoring.prioridad ? PRIORITY_ORDER[b.scoring.prioridad] : 3;
        return pa - pb || b.scoring.score - a.scoring.score;
      });
  }, [leads, filters]);

  // Si falta el .env, el panel no arranca (nunca muestra datos de ejemplo)
  if (!isFirebaseConfigured()) {
    const missing = getMissingEnvVars();
    return (
      <div className="min-h-screen bg-[#FFF8F0] dark:bg-[#141210] flex flex-col items-center justify-center p-4 transition-colors">
        <div className="max-w-md w-full bg-white dark:bg-[#1C1814] border border-rose-200 dark:border-rose-900 rounded-3xl p-6 sm:p-8 shadow-sm space-y-4">
          <div className="w-14 h-14 rounded-2xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-900 text-rose-600 dark:text-rose-400 flex items-center justify-center mx-auto">
            <AlertTriangle className="w-8 h-8" />
          </div>
          <h1 className="text-xl font-bold text-[#1a1a1a] dark:text-[#F5EBE1] font-heading text-center">
            Falta configurar .env
          </h1>
          <p className="text-xs sm:text-sm text-[#666] dark:text-[#99897A] font-ui text-center">
            El panel no puede conectarse a Firestore porque faltan las credenciales de Firebase. Cre&aacute; un archivo <code>.env</code> en la carpeta del proyecto (mir&aacute; <code>.env.example</code>) y volv&eacute; a publicar.
          </p>
          <ul className="text-xs font-mono bg-[#FFF8F0] dark:bg-[#231E19] border border-[#F5C9A8] dark:border-[#3D2E22] rounded-xl p-3 space-y-1 text-[#1a1a1a] dark:text-[#F5EBE1]">
            {missing.map((name) => (
              <li key={name}>{name}</li>
            ))}
          </ul>
        </div>
      </div>
    );
  }

  // Pantalla de carga inicial de Auth
  if (isAuthLoading) {
    return (
      <div className="min-h-screen bg-[#FFF8F0] dark:bg-[#141210] flex flex-col items-center justify-center p-4 transition-colors">
        <div className="w-12 h-12 rounded-2xl bg-[#E8610A] text-white flex items-center justify-center animate-bounce shadow-md mb-4">
          <span className="font-bold text-lg font-heading">CL</span>
        </div>
        <div className="inline-block animate-spin rounded-full h-6 w-6 border-2 border-[#E8610A] border-t-transparent mb-2"></div>
        <p className="text-sm font-semibold text-[#1a1a1a] dark:text-[#F5EBE1] font-heading">Iniciando panel...</p>
      </div>
    );
  }

  // Si no está autenticado, mostrar LoginScreen
  if (!currentUser) {
    return (
      <LoginScreen
        onLoginWithGoogle={handleGoogleLogin}
        isLoggingIn={isLoggingIn}
        unauthorizedEmail={unauthorizedEmail}
        errorMessage={authError}
        onClearUnauthorized={() => {
          setUnauthorizedEmail(null);
          setAuthError(null);
        }}
        theme={theme}
        onToggleTheme={handleToggleTheme}
      />
    );
  }

  return (
    <div className="min-h-screen bg-[#FFF8F0] dark:bg-[#141210] text-[#555] dark:text-[#C8B9A9] flex flex-col font-ui transition-colors duration-200">
      {toastMessage && (
        <div className="fixed bottom-5 right-5 z-50">
          <div className={`px-4 py-3 rounded-xl shadow-lg border text-xs font-semibold flex items-center gap-2 ${
            toastMessage.type === 'success' ? 'bg-emerald-900 text-white border-emerald-700'
            : toastMessage.type === 'error' ? 'bg-rose-900 text-white border-rose-700'
            : 'bg-[#1a1a1a] text-white border-neutral-700'}`}>
            {toastMessage.type === 'success' && <CheckCircle className="w-4 h-4 text-emerald-400" />}
            {toastMessage.type === 'error' && <AlertTriangle className="w-4 h-4 text-rose-400" />}
            {toastMessage.type === 'info' && <Info className="w-4 h-4 text-sky-400" />}
            <span>{toastMessage.text}</span>
          </div>
        </div>
      )}

      <Header
        userEmail={currentUser.email}
        userName={currentUser.displayName}
        userPhoto={currentUser.photoURL}
        onLogout={handleLogout}
        theme={theme}
        onToggleTheme={handleToggleTheme}
        onRefresh={loadLeads}
        isRefreshing={isDataLoading}
      />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-6">
        {dataError && (
          <div className="bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 rounded-2xl p-4 text-rose-900 dark:text-rose-200 text-xs sm:text-sm flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
            <div>
              <strong className="font-heading font-bold block">No se pudieron cargar los leads</strong>
              <p>{dataError}</p>
            </div>
          </div>
        )}

        <div className="inline-flex p-1 rounded-xl bg-white dark:bg-[#1C1814] border border-[#E0E0E0] dark:border-[#2E2721]">
          {(['leads', 'redes'] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-4 py-1.5 rounded-lg text-xs sm:text-sm font-semibold font-heading transition-colors ${tab === t ? 'bg-[#E8610A] text-white' : 'text-[#666] dark:text-[#99897A] hover:text-[#1a1a1a] dark:hover:text-[#F5EBE1]'}`}>
              {t === 'leads' ? 'Leads' : 'Redes'}
            </button>
          ))}
        </div>

        {tab === 'redes' ? <PostsPanel onToast={showToast} /> : (<>
        <StatCards stats={stats} />

        <ProspectorCard onLoaded={loadLeads} onToast={showToast} />

        {!isDataLoading && <OpportunitiesPanel leads={leads} onOpen={(l) => setEditing(toInput(l))} />}

        <FiltersBar
          filters={filters}
          onChange={(patch) => setFilters((prev) => ({ ...prev, ...patch }))}
          onReset={() => setFilters(EMPTY_FILTERS)}
          onExport={() => (exportLeadsToCSV(filteredLeads) ? showToast(`Exportados ${filteredLeads.length} leads`) : showToast('No hay leads para exportar', 'error'))}
          onNewLead={() => setEditing({ ...EMPTY_LEAD, ultimaInteraccion: today })}
          filteredCount={filteredLeads.length}
          totalCount={leads.length}
        />

        <LeadsTable leads={filteredLeads} isLoading={isDataLoading} today={today} onEdit={(l) => setEditing(toInput(l))} />
        </>)}
      </main>

      {editing && (
        <LeadForm
          initial={editing}
          activeOffers={activeOffers}
          today={today}
          onSave={handleSave}
          onDelete={handleDelete}
          onClose={() => setEditing(null)}
        />
      )}

      <footer className="bg-white dark:bg-[#1C1814] border-t border-[#E0E0E0] dark:border-[#2E2721] py-4 mt-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-[#666] dark:text-[#99897A] font-ui">
          <span><strong className="font-heading text-[#1a1a1a] dark:text-[#F5EBE1]">CRM LEADS</strong> · Lead Scoring determinístico</span>
          <span>Sin IA: cada prioridad explica su motivo</span>
        </div>
      </footer>
    </div>
  );
}
