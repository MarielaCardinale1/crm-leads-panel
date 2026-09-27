import React, { useState } from 'react';
import { Target, ShieldAlert, LogIn, Lock, CheckCircle2, AlertCircle, Sun, Moon, Copy, Check, ExternalLink, Globe } from 'lucide-react';
import { AUTHORIZED_ADMIN_EMAIL } from '../firebase-config';
import { ThemeMode } from '../utils/themeUtils';

interface LoginScreenProps {
  onLoginWithGoogle: () => void;
  isLoggingIn: boolean;
  unauthorizedEmail: string | null;
  errorMessage: string | null;
  onClearUnauthorized: () => void;
  theme: ThemeMode;
  onToggleTheme: () => void;
}

export const LoginScreen: React.FC<LoginScreenProps> = ({
  onLoginWithGoogle,
  isLoggingIn,
  unauthorizedEmail,
  errorMessage,
  onClearUnauthorized,
  theme,
  onToggleTheme,
}) => {
  const isDark = theme === 'dark';
  const [copiedDomain, setCopiedDomain] = useState<boolean>(false);
  const currentHostname = typeof window !== 'undefined' ? window.location.hostname : '';

  const isUnauthorizedDomain = errorMessage && (
    errorMessage.includes('unauthorized-domain') || 
    errorMessage.includes('auth/unauthorized-domain') ||
    errorMessage.toLowerCase().includes('dominio no autorizado')
  );

  const handleCopyHostname = () => {
    if (!currentHostname) return;
    navigator.clipboard.writeText(currentHostname);
    setCopiedDomain(true);
    setTimeout(() => setCopiedDomain(false), 2500);
  };

  return (
    <div className="min-h-screen bg-[#FFF8F0] dark:bg-[#141210] flex flex-col justify-center items-center px-4 py-12 relative transition-colors duration-200">
      
      {/* Botón flotante superior para alternar tema */}
      <div className="absolute top-4 right-4">
        <button
          id="btn-login-theme-toggle"
          onClick={onToggleTheme}
          title={isDark ? 'Cambiar a modo diurno' : 'Cambiar a modo nocturno'}
          className="p-2.5 rounded-xl bg-white dark:bg-[#1C1814] text-[#555] dark:text-[#C8B9A9] hover:text-[#E8610A] dark:hover:text-[#FFA86B] border border-[#F5C9A8] dark:border-[#3D2E22] shadow-2xs transition-all flex items-center gap-1.5 text-xs font-medium cursor-pointer font-ui"
          aria-label={isDark ? 'Activar modo claro' : 'Activar modo oscuro'}
        >
          {isDark ? (
            <>
              <Sun className="w-4 h-4 text-[#FFA86B]" />
              <span className="hidden sm:inline">Modo claro</span>
            </>
          ) : (
            <>
              <Moon className="w-4 h-4 text-[#E8610A]" />
              <span className="hidden sm:inline">Modo oscuro</span>
            </>
          )}
        </button>
      </div>

      <div className="max-w-md w-full">
        
        {/* Logo de la marca */}
        <div className="text-center mb-6 sm:mb-8">
          <div className="w-16 h-16 rounded-2xl bg-[#E8610A] text-white flex items-center justify-center mx-auto shadow-md mb-4">
            <Target className="w-9 h-9" />
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-[#1a1a1a] dark:text-[#F5EBE1] tracking-tight font-heading">
            CRM LEADS
          </h1>
          <p className="text-sm text-[#666] dark:text-[#99897A] font-ui mt-1">
            Oportunidades comerciales · Lead Scoring
          </p>
        </div>

        {/* Tarjeta principal */}
        <div className="bg-white dark:bg-[#1C1814] border border-[#F5C9A8] dark:border-[#3D2E22] rounded-3xl p-6 sm:p-8 shadow-sm space-y-6 transition-colors">
          
          {/* CASO: ACCESO DENEGADO ("Sin acceso") */}
          {unauthorizedEmail ? (
            <div id="access-denied-box" className="space-y-4 text-center">
              <div className="w-14 h-14 rounded-2xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-900 text-rose-600 dark:text-rose-400 flex items-center justify-center mx-auto">
                <ShieldAlert className="w-8 h-8" />
              </div>

              <div>
                <h2 className="text-xl font-bold text-[#1a1a1a] dark:text-[#F5EBE1] font-heading">
                  Sin acceso
                </h2>
                <p className="text-xs sm:text-sm text-[#666] dark:text-[#99897A] font-ui mt-2">
                  La cuenta <strong className="text-[#1a1a1a] dark:text-[#F5EBE1] font-mono">{unauthorizedEmail}</strong> no tiene permisos para acceder a este panel.
                </p>
                <div className="mt-3 p-3 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/60 rounded-xl text-xs text-amber-900 dark:text-amber-200 font-ui text-left">
                  🔒 Este panel es de acceso restringido únicamente para: <strong className="font-semibold">{AUTHORIZED_ADMIN_EMAIL}</strong>.
                </div>
              </div>

              <button
                id="btn-retry-login"
                onClick={onClearUnauthorized}
                className="w-full py-3 px-4 bg-[#E8610A] hover:bg-[#C4500A] text-white font-semibold rounded-xl text-sm transition-all shadow-xs flex items-center justify-center gap-2 cursor-pointer font-heading"
              >
                <LogIn className="w-4 h-4" />
                <span>Intentar con otra cuenta</span>
              </button>
            </div>
          ) : (
            /* CASO: PANTALLA DE INICIO DE SESIÓN */
            <div className="space-y-5">
              <div className="text-center space-y-1.5">
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#FFF3EB] dark:bg-[#2D1C10] text-[#E8610A] dark:text-[#FFA86B] text-xs font-semibold border border-[#F5C9A8] dark:border-[#59361B]">
                  <Lock className="w-3.5 h-3.5" /> Acceso seguro
                </div>
                <h2 className="text-xl font-bold text-[#1a1a1a] dark:text-[#F5EBE1] font-heading">
                  Iniciar sesión
                </h2>
                <p className="text-xs sm:text-sm text-[#666] dark:text-[#99897A] font-ui">
                  Ingresá con tu cuenta de Google autorizada para ver y priorizar tus leads.
                </p>
              </div>

              {/* Diagnóstico especial para error de Dominio no Autorizado en Firebase Auth */}
              {isUnauthorizedDomain && (
                <div className="p-4 bg-amber-50 dark:bg-amber-950/40 border-2 border-amber-300 dark:border-amber-800/80 rounded-2xl text-xs text-amber-950 dark:text-amber-200 font-ui space-y-3 shadow-xs">
                  <div className="flex items-start gap-2">
                    <Globe className="w-4 h-4 text-[#E8610A] shrink-0 mt-0.5" />
                    <div className="space-y-1">
                      <strong className="font-heading font-bold text-sm text-[#1a1a1a] dark:text-[#F5EBE1] block">
                        Dominio no autorizado en Firebase Auth
                      </strong>
                      <p className="text-[#555] dark:text-[#C8B9A9]">
                        Firebase requiere que agregues la URL de este entorno a la lista de dominios permitidos para el popup de Google.
                      </p>
                    </div>
                  </div>

                  {/* Caja de Copiado del Hostname */}
                  <div className="bg-white dark:bg-[#1C1814] p-2.5 rounded-xl border border-amber-200 dark:border-amber-900 flex items-center justify-between gap-2">
                    <span className="font-mono text-[11px] text-[#1a1a1a] dark:text-[#F5EBE1] truncate select-all">
                      {currentHostname}
                    </span>
                    <button
                      type="button"
                      onClick={handleCopyHostname}
                      className="px-2.5 py-1 bg-[#FFF3EB] dark:bg-[#2D1C10] text-[#E8610A] dark:text-[#FFA86B] hover:bg-[#E8610A] hover:text-white rounded-lg border border-[#F5C9A8] dark:border-[#59361B] text-[11px] font-semibold flex items-center gap-1 transition-all shrink-0 cursor-pointer"
                    >
                      {copiedDomain ? (
                        <>
                          <Check className="w-3 h-3 text-emerald-600" />
                          <span>¡Copiado!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3 h-3" />
                          <span>Copiar dominio</span>
                        </>
                      )}
                    </button>
                  </div>

                  {/* Pasos rápidos */}
                  <div className="text-[11px] text-[#666] dark:text-[#99897A] space-y-1 pl-1">
                    <p><strong>1.</strong> Entrá a tu <a href="https://console.firebase.google.com" target="_blank" rel="noreferrer" className="text-[#E8610A] dark:text-[#FFA86B] underline font-medium inline-flex items-center gap-0.5">Firebase Console <ExternalLink className="w-2.5 h-2.5" /></a></p>
                    <p><strong>2.</strong> Andá a <strong>Authentication</strong> &gt; pestaña <strong>Settings</strong> &gt; <strong>Authorized domains</strong></p>
                    <p><strong>3.</strong> Hacé clic en <strong>Add domain</strong> y pegá el dominio copiado arriba.</p>
                  </div>

                </div>
              )}

              {/* Mensaje de error general si hubo (distinto de unauthorized-domain) */}
              {errorMessage && !isUnauthorizedDomain && (
                <div className="p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 rounded-xl flex items-start gap-2.5 text-xs text-rose-800 dark:text-rose-300 font-ui">
                  <AlertCircle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
                  <span>{errorMessage}</span>
                </div>
              )}

              {/* Botón de Google Auth */}
              <button
                id="btn-login-google"
                onClick={onLoginWithGoogle}
                disabled={isLoggingIn}
                className="w-full py-3.5 px-4 bg-white dark:bg-[#231E19] hover:bg-[#FFF8F0] dark:hover:bg-[#2D1C10] border-2 border-[#E0E0E0] dark:border-[#3D2E22] hover:border-[#E8610A] dark:hover:border-[#FFA86B] text-[#1a1a1a] dark:text-[#F5EBE1] font-semibold rounded-2xl text-sm transition-all shadow-2xs flex items-center justify-center gap-3 cursor-pointer group disabled:opacity-50 font-heading"
              >
                {/* Ícono de Google */}
                <svg className="w-5 h-5" viewBox="0 0 24 24">
                  <path
                    fill="#4285F4"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                  />
                </svg>
                <span>{isLoggingIn ? 'Conectando con Google...' : 'Ingresar con Google'}</span>
              </button>

              {/* Lista de características de seguridad */}
              <div className="pt-2 border-t border-[#F5C9A8]/40 dark:border-[#2E2721] space-y-2 text-xs text-[#666] dark:text-[#99897A] font-ui">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-[#E8610A] dark:text-[#FFA86B] shrink-0" />
                  <span>Cada prioridad explica <strong>por qué</strong></span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-[#E8610A] dark:text-[#FFA86B] shrink-0" />
                  <span>Datos protegidos: solo tu cuenta autorizada</span>
                </div>
              </div>
            </div>
          )}

        </div>

        {/* Footer sutil */}
        <p className="text-center text-xs text-[#666] dark:text-[#99897A] font-ui mt-6">
          © {new Date().getFullYear()} CRM Leads · Panel privado
        </p>

      </div>
    </div>
  );
};
