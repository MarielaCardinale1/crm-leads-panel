import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Sparkles, Upload, Check, X, Instagram, Linkedin, Copy, RotateCcw, Loader2, Send, ExternalLink, AlertTriangle } from 'lucide-react';
import { Post, EstadoPost, fetchPosts, generateWeek, updatePost, uploadPostMedia, publishNow, MAX_MEDIA_MB } from '../services/leadService';

interface Props {
  onToast: (text: string, type?: 'success' | 'info' | 'error') => void;
}

const ESTADO_STYLE: Record<EstadoPost, string> = {
  borrador: 'bg-amber-100 text-amber-900 dark:bg-amber-950/50 dark:text-amber-200',
  aprobado: 'bg-emerald-100 text-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-200',
  publicado: 'bg-sky-100 text-sky-900 dark:bg-sky-950/50 dark:text-sky-200',
  descartado: 'bg-neutral-200 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400',
};

const DIAS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
function fechaLinda(f: string) {
  const [d, h] = f.split(' ');
  const date = new Date(`${d}T12:00:00`);
  return `${DIAS[date.getDay()]} ${d.slice(8, 10)}/${d.slice(5, 7)} · ${h}`;
}

const card = 'bg-white dark:bg-[#1C1814] border border-[#E0E0E0] dark:border-[#2E2721] rounded-2xl shadow-xs';
const btn = 'inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition-colors disabled:opacity-50';
const area = 'w-full text-xs sm:text-sm rounded-xl border border-[#F5C9A8] dark:border-[#3D2E22] bg-[#FFF8F0] dark:bg-[#231E19] text-[#1a1a1a] dark:text-[#F5EBE1] p-3 font-ui focus:outline-none focus:ring-2 focus:ring-[#E8610A]/40';

const PostCard: React.FC<{ post: Post; onChanged: () => void; onToast: Props['onToast'] }> = ({ post, onChanged, onToast }) => {
  const [ig, setIg] = useState(post.instagram);
  const [li, setLi] = useState(post.linkedin);
  const [busy, setBusy] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const dirty = ig !== post.instagram || li !== post.linkedin;

  useEffect(() => {
    setIg(post.instagram);
    setLi(post.linkedin);
  }, [post.instagram, post.linkedin]);

  const run = async (key: string, fn: () => Promise<unknown>, ok: string) => {
    setBusy(key);
    try {
      await fn();
      onToast(ok);
      onChanged();
    } catch (e: any) {
      onToast(e.message, 'error');
    } finally {
      setBusy(null);
    }
  };

  const setEstado = (estado: EstadoPost) =>
    run(estado, () => updatePost(post.id, { estado, ...(dirty ? { instagram: ig, linkedin: li } : {}) }),
      estado === 'aprobado' ? 'Post aprobado' : estado === 'descartado' ? 'Post descartado' : 'Volvió a borrador');

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (f) run('media', () => uploadPostMedia(post.id, f), f.type.startsWith('video') ? 'Video subido (sale como Reel)' : 'Foto subida');
  };

  const copy = async (t: string, red: string) => {
    await navigator.clipboard.writeText(t);
    onToast(`Texto de ${red} copiado`, 'info');
  };

  const editable = post.estado !== 'publicado';

  return (
    <div className={`${card} overflow-hidden ${post.estado === 'descartado' ? 'opacity-60' : ''}`}>
      <div className="px-4 py-3 bg-[#FFF8F0]/80 dark:bg-[#231E19] border-b border-[#F5C9A8]/40 dark:border-[#2E2721] flex flex-wrap items-center gap-2">
        <span className="text-sm font-bold text-[#1a1a1a] dark:text-[#F5EBE1] font-heading">{post.etiqueta}</span>
        <span className="text-xs text-[#666] dark:text-[#99897A]">{fechaLinda(post.fechaPublicacion)}</span>
        <span className={`ml-auto px-2 py-0.5 rounded-full text-xs font-semibold ${ESTADO_STYLE[post.estado]}`}>{post.estado}</span>
      </div>

      <div className="grid md:grid-cols-[260px_1fr] gap-4 p-4">
        <div className="space-y-2">
          {post.media?.tipo === 'video' ? (
            <video src={post.media.url} controls className="w-full rounded-xl bg-black aspect-[4/5] object-cover" />
          ) : (
            <img src={post.media?.url} alt={post.placa?.titulo} className="w-full rounded-xl border border-[#F5C9A8]/60 aspect-[4/5] object-cover" />
          )}
          <p className="text-[11px] text-[#666] dark:text-[#99897A]">
            {post.media?.tipo === 'placa' ? 'Placa automática' : post.media?.tipo === 'video' ? 'Tu video (Reel)' : 'Tu foto'}
          </p>
          {editable && (
            <>
              <input ref={fileRef} type="file" accept="image/jpeg,image/png,video/mp4,video/quicktime" className="hidden" onChange={onFile} />
              <button disabled={!!busy} onClick={() => fileRef.current?.click()}
                className={`${btn} w-full justify-center border border-[#F5C9A8] dark:border-[#3D2E22] text-[#1a1a1a] dark:text-[#F5EBE1] hover:bg-[#FFF8F0] dark:hover:bg-[#231E19]`}>
                {busy === 'media' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                Subir foto/video
              </button>
              <p className="text-[11px] text-[#666] dark:text-[#99897A]">JPG, PNG, MP4 o MOV · máx. {MAX_MEDIA_MB} MB</p>
            </>
          )}
        </div>

        <div className="space-y-3">
          <p className="text-[11px] text-[#666] dark:text-[#99897A]"><strong>Ángulo:</strong> {post.angulo}</p>
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Instagram className="w-4 h-4 text-[#E8610A]" />
              <span className="text-xs font-semibold text-[#1a1a1a] dark:text-[#F5EBE1]">Instagram</span>
              <span className="text-[11px] text-[#999]">{ig.length}/2200</span>
              <button onClick={() => copy(ig, 'Instagram')} className="ml-auto text-[#666] hover:text-[#E8610A]" title="Copiar"><Copy className="w-4 h-4" /></button>
            </div>
            <textarea className={area} rows={7} maxLength={2200} value={ig} disabled={!editable} onChange={(e) => setIg(e.target.value)} />
          </div>
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Linkedin className="w-4 h-4 text-[#E8610A]" />
              <span className="text-xs font-semibold text-[#1a1a1a] dark:text-[#F5EBE1]">LinkedIn</span>
              <span className="text-[11px] text-[#999]">{li.length}/3000</span>
              <button onClick={() => copy(li, 'LinkedIn')} className="ml-auto text-[#666] hover:text-[#E8610A]" title="Copiar"><Copy className="w-4 h-4" /></button>
            </div>
            <textarea className={area} rows={7} maxLength={3000} value={li} disabled={!editable} onChange={(e) => setLi(e.target.value)} />
          </div>

          {post.publicacion?.instagram?.ok ? (
            <a href={post.publicacion.instagram.url || 'https://www.instagram.com/mariela.cardinale/'} target="_blank" rel="noreferrer"
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-sky-700 dark:text-sky-300 hover:underline">
              <Instagram className="w-4 h-4" /> Publicado en Instagram <ExternalLink className="w-3.5 h-3.5" />
            </a>
          ) : post.publicacion?.instagram?.error ? (
            <p className="flex items-start gap-1.5 text-xs text-rose-700 dark:text-rose-300">
              <AlertTriangle className="w-4 h-4 shrink-0" /> Instagram: {post.publicacion.instagram.error} (intento {post.publicacion.instagram.intentos || 1} de 3)
            </p>
          ) : post.estado === 'aprobado' ? (
            <p className="text-xs text-emerald-700 dark:text-emerald-300">Sale solo en Instagram el {fechaLinda(post.fechaPublicacion)}. LinkedIn: copiá el texto por ahora.</p>
          ) : null}

          {editable && (
            <div className="flex flex-wrap gap-2">
              {post.estado === 'aprobado' && !post.publicacion?.instagram?.ok && (
                <button disabled={!!busy}
                  onClick={() => window.confirm('¿Publicar este post en Instagram ahora mismo?') &&
                    run('pub', async () => {
                      const r = await publishNow(post.id);
                      if (!r.ok) throw new Error(`Instagram: ${r.instagram?.error || 'no se pudo publicar'}`);
                    }, 'Publicado en Instagram')}
                  className={`${btn} bg-[#E8610A] text-white hover:bg-[#cf5608]`}>
                  {busy === 'pub' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} Publicar ya
                </button>
              )}
              {dirty && (
                <button disabled={!!busy} onClick={() => run('save', () => updatePost(post.id, { instagram: ig, linkedin: li }), 'Cambios guardados')}
                  className={`${btn} bg-[#1a1a1a] text-white hover:bg-black`}>
                  {busy === 'save' && <Loader2 className="w-4 h-4 animate-spin" />} Guardar cambios
                </button>
              )}
              {post.estado !== 'aprobado' && (
                <button disabled={!!busy} onClick={() => setEstado('aprobado')} className={`${btn} bg-emerald-600 text-white hover:bg-emerald-700`}>
                  <Check className="w-4 h-4" /> Aprobar
                </button>
              )}
              {post.estado !== 'descartado' && (
                <button disabled={!!busy} onClick={() => setEstado('descartado')} className={`${btn} border border-[#E0E0E0] dark:border-[#3D2E22] hover:bg-neutral-100 dark:hover:bg-[#231E19]`}>
                  <X className="w-4 h-4" /> Descartar
                </button>
              )}
              {post.estado !== 'borrador' && (
                <button disabled={!!busy} onClick={() => setEstado('borrador')} className={`${btn} border border-[#E0E0E0] dark:border-[#3D2E22] hover:bg-neutral-100 dark:hover:bg-[#231E19]`}>
                  <RotateCcw className="w-4 h-4" /> A borrador
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

/** Vista "Redes": borradores del Redactor de posts (CM 7a). Nada se publica desde acá. */
export const PostsPanel: React.FC<Props> = ({ onToast }) => {
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const { posts } = await fetchPosts();
      setPosts(posts || []);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const generar = async () => {
    setGenerating(true);
    try {
      const r = await generateWeek();
      if (r.fallos?.length) onToast(`Fallaron: ${r.fallos.join(' · ')}`, 'error');
      else if (!r.creados) onToast(`La semana ${r.semana} ya estaba armada`, 'info');
      else onToast(`${r.creados} post(s) nuevos para ${r.semana}`);
      await load();
    } catch (e: any) {
      onToast(e.message, 'error');
    } finally {
      setGenerating(false);
    }
  };

  const semanas = Array.from(new Set(posts.map((p) => p.semana))).sort().reverse();

  return (
    <div className="space-y-5">
      <div className={`${card} p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center gap-3`}>
        <div className="flex-1">
          <h2 className="text-sm sm:text-base font-bold text-[#1a1a1a] dark:text-[#F5EBE1] font-heading">Posts de la semana</h2>
          <p className="text-xs text-[#666] dark:text-[#99897A]">3 borradores (agenda, ficha de Google, web) para lun/mié/vie. Revisalos, cambiá la placa por tu foto o video si querés, y aprobalos.</p>
        </div>
        <button onClick={generar} disabled={generating} className={`${btn} bg-[#E8610A] text-white hover:bg-[#cf5608] px-4 py-2.5`}>
          {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
          {generating ? 'Redactando… (1 min)' : 'Generar semana'}
        </button>
      </div>

      {error && <div className="bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 rounded-2xl p-4 text-rose-900 dark:text-rose-200 text-sm">{error}</div>}

      {loading ? (
        <p className="text-sm text-center py-8"><Loader2 className="w-5 h-5 animate-spin inline" /> Cargando posts…</p>
      ) : !posts.length ? (
        <p className="text-sm text-center py-8 text-[#666] dark:text-[#99897A]">Todavía no hay posts. Tocá "Generar semana".</p>
      ) : (
        semanas.map((s) => (
          <section key={s} className="space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wide text-[#E8610A]">Semana {s}</h3>
            {posts
              .filter((p) => p.semana === s)
              .sort((a, b) => a.fechaPublicacion.localeCompare(b.fechaPublicacion))
              .map((p) => <PostCard key={p.id} post={p} onChanged={load} onToast={onToast} />)}
          </section>
        ))
      )}
    </div>
  );
};
