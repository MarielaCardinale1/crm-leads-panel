import React, { useState, useEffect } from 'react';
import { LogOut, Target, ShieldCheck, Maximize, Minimize, Sun, Moon, RefreshCw } from 'lucide-react';
import { AUTHORIZED_ADMIN_EMAIL } from '../firebase-config';
import { ThemeMode } from '../utils/themeUtils';

interface HeaderProps {
  userEmail: string | null;
  userName?: string | null;
  userPhoto?: string | null;
  onLogout: () => void;
  theme: ThemeMode;
  onToggleTheme: () => void;
  onRefresh: () => void;
  isRefreshing: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  userEmail,
  userName,
  userPhoto,
  onLogout,
  theme,
  onToggleTheme,
  onRefresh,
  isRefreshing,
}) => {
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, []);

  const toggleFullscreen = async () => {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
      } else {
        if (document.exitFullscreen) {
          await document.exitFullscreen();
        }
      }
    } catch (err) {
      console.error('Error al alternar pantalla completa:', err);
    }
  };

  const isDark = theme === 'dark';

  return (
    <header id="main-header" className="bg-white dark:bg-[#1C1814] border-b border-[#E0E0E0] dark:border-[#2E2721] sticky top-0 z-40 shadow-xs transition-colors duration-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 sm:h-20">
          
          {/* Logo y Branding */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#E8610A] text-white flex items-center justify-center shadow-sm">
              <Target className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-heading font-extrabold text-lg sm:text-xl tracking-tight text-[#1a1a1a] dark:text-[#F5EBE1]">
                  CRM LEADS
                </span>
                <span className="hidden sm:inline-block px-2 py-0.5 text-xs font-semibold rounded-md bg-[#FFF3EB] dark:bg-[#2D1C10] text-[#E8610A] dark:text-[#FFA86B] border border-[#F5C9A8] dark:border-[#59361B]">
                  Panel Privado
                </span>
              </div>
              <p className="text-xs text-[#666] dark:text-[#99897A] font-ui hidden sm:block">
                Oportunidades comerciales · Lead Scoring
              </p>
            </div>
          </div>

          {/* Estado en vivo, Selector de Tema, Pantalla Completa & Usuario */}
          <div className="flex items-center gap-2 sm:gap-2.5">
            
            {/* Recargar datos */}
            <button
              id="btn-refresh"
              onClick={onRefresh}
              disabled={isRefreshing}
              title="Recargar leads"
              className="p-2 sm:px-2.5 sm:py-1.5 rounded-lg text-[#555] dark:text-[#C8B9A9] hover:text-[#E8610A] dark:hover:text-[#FFA86B] hover:bg-[#FFF3EB] dark:hover:bg-[#2D1C10] border border-transparent hover:border-[#F5C9A8] dark:hover:border-[#59361B] transition-all flex items-center gap-1.5 text-xs font-medium cursor-pointer font-ui disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 text-[#E8610A] dark:text-[#FFA86B] ${isRefreshing ? 'animate-spin' : ''}`} />
              <span className="hidden lg:inline">Recargar</span>
            </button>

            {/* Selector de Tema (Modo Claro / Oscuro) */}
            <button
              id="btn-toggle-theme"
              onClick={onToggleTheme}
              title={isDark ? 'Cambiar a modo diurno' : 'Cambiar a modo nocturno'}
              className="p-2 sm:px-2.5 sm:py-1.5 rounded-lg text-[#555] dark:text-[#C8B9A9] hover:text-[#E8610A] dark:hover:text-[#FFA86B] hover:bg-[#FFF3EB] dark:hover:bg-[#2D1C10] border border-transparent hover:border-[#F5C9A8] dark:hover:border-[#59361B] transition-all flex items-center gap-1.5 text-xs font-medium cursor-pointer font-ui"
              aria-label={isDark ? 'Activar modo claro' : 'Activar modo oscuro'}
            >
              {isDark ? (
                <>
                  <Sun className="w-4 h-4 text-[#FFA86B]" />
                  <span className="hidden lg:inline">Modo claro</span>
                </>
              ) : (
                <>
                  <Moon className="w-4 h-4 text-[#E8610A]" />
                  <span className="hidden lg:inline">Modo oscuro</span>
                </>
              )}
            </button>

            {/* Botón de Pantalla Completa para Monitoreo */}
            <button
              id="btn-toggle-fullscreen"
              onClick={toggleFullscreen}
              title={isFullscreen ? 'Salir de pantalla completa' : 'Activar modo pantalla completa para monitoreo'}
              className="p-2 sm:px-2.5 sm:py-1.5 rounded-lg text-[#555] dark:text-[#C8B9A9] hover:text-[#E8610A] dark:hover:text-[#FFA86B] hover:bg-[#FFF3EB] dark:hover:bg-[#2D1C10] border border-transparent hover:border-[#F5C9A8] dark:hover:border-[#59361B] transition-all flex items-center gap-1.5 text-xs font-medium cursor-pointer font-ui"
            >
              {isFullscreen ? (
                <>
                  <Minimize className="w-4 h-4 text-[#E8610A] dark:text-[#FFA86B]" />
                  <span className="hidden lg:inline">Salir</span>
                </>
              ) : (
                <>
                  <Maximize className="w-4 h-4 text-[#E8610A] dark:text-[#FFA86B]" />
                  <span className="hidden lg:inline">Pantalla completa</span>
                </>
              )}
            </button>

            {/* Info usuario & Logout */}
            <div className="flex items-center gap-2 pl-2 sm:pl-2.5 sm:border-l sm:border-[#E0E0E0] dark:sm:border-[#2E2721]">
              {userPhoto ? (
                <img
                  src={userPhoto}
                  alt={userName || 'Admin'}
                  className="w-8 h-8 sm:w-9 sm:h-9 rounded-full object-cover border border-[#F5C9A8] dark:border-[#59361B]"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-[#FFF3EB] dark:bg-[#2D1C10] text-[#E8610A] dark:text-[#FFA86B] font-bold flex items-center justify-center text-sm border border-[#F5C9A8] dark:border-[#59361B]">
                  {userName ? userName.charAt(0).toUpperCase() : 'A'}
                </div>
              )}

              <div className="hidden xl:block text-left">
                <div className="flex items-center gap-1">
                  <span className="text-xs font-semibold text-[#1a1a1a] dark:text-[#F5EBE1]">
                    {userName || 'Admin'}
                  </span>
                  <ShieldCheck className="w-3.5 h-3.5 text-[#E8610A] dark:text-[#FFA86B]" />
                </div>
                <span className="text-[11px] text-[#666] dark:text-[#99897A] block truncate max-w-[150px]">
                  {userEmail || AUTHORIZED_ADMIN_EMAIL}
                </span>
              </div>

              <button
                id="btn-logout"
                onClick={onLogout}
                title="Cerrar sesión"
                className="p-2 sm:px-3 sm:py-1.5 rounded-lg text-[#555] dark:text-[#C8B9A9] hover:text-[#E8610A] dark:hover:text-[#FFA86B] hover:bg-[#FFF3EB] dark:hover:bg-[#2D1C10] transition-colors flex items-center gap-1.5 text-xs font-medium cursor-pointer"
              >
                <LogOut className="w-4 h-4" />
                <span className="hidden sm:inline">Salir</span>
              </button>
            </div>

          </div>
        </div>
      </div>
    </header>
  );
};
