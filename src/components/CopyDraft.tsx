import React, { useState } from 'react';
import { Mail, MessageCircle, Copy, Check, ExternalLink, Sparkles, Instagram } from 'lucide-react';
import { Canal, CopyResult, draftMessage } from '../services/leadService';

/** Bloque "Redactar mensaje" (microagente Copy Comercial). Solo arma el borrador: enviar es cosa de Mariela. */
export const CopyDraft: React.FC<{ leadId: string; dirty: boolean }> = ({ leadId, dirty }) => {
  const [loading, setLoading] = useState<Canal | null>(null);
  const [result, setResult] = useState<CopyResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [copied, setCopied] = useState(false);

  const run = async (canal: Canal) => {
    setLoading(canal);
    setError(null);
    setResult(null);
    try {
      const r = await draftMessage(leadId, canal);
      setResult(r);
      if (r.ok) setText(r.mensaje || '');
    } catch (err: any) {
      setError(err.message || 'No se pudo redactar.');
    } finally {
      setLoading(null);
    }
  };

  const copyAll = () => {
    const full = result?.asunto ? `Asunto: ${result.asunto}\n\n${text}` : text;
    navigator.clipboard.writeText(full);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const btn = 'px-3 py-2 rounded-lg text-xs font-semibold border border-[#F5C9A8] dark:border-[#3D2E22] hover:border-[#E8610A] flex items-center gap-1.5 cursor-pointer disabled:opacity-50';

  return (
    <div className="sm:col-span-2 rounded-xl border border-dashed border-[#F5C9A8] dark:border-[#3D2E22] p-3 space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <span className="text-xs font-semibold text-[#1a1a1a] dark:text-[#F5EBE1] font-heading flex items-center gap-1.5">
          <Sparkles className="w-3.5 h-3.5 text-[#E8610A]" /> Redactar mensaje
        </span>
        <div className="flex gap-2">
          <button type="button" disabled={!!loading} onClick={() => run('email')} className={btn}>
            <Mail className="w-3.5 h-3.5" /> {loading === 'email' ? 'Redactando…' : 'Email'}
          </button>
          <button type="button" disabled={!!loading} onClick={() => run('whatsapp')} className={btn}>
            <MessageCircle className="w-3.5 h-3.5" /> {loading === 'whatsapp' ? 'Redactando…' : 'WhatsApp'}
          </button>
          <button type="button" disabled={!!loading} onClick={() => run('instagram')} className={btn}>
            <Instagram className="w-3.5 h-3.5" /> {loading === 'instagram' ? 'Redactando…' : 'DM Instagram'}
          </button>
        </div>
      </div>
      {dirty && <p className="text-[11px] text-amber-700 dark:text-amber-300">Usa los datos guardados: si cambiaste algo, guardá primero.</p>}
      {error && <p className="text-xs text-rose-600">{error}</p>}
      {result && !result.ok && <p className="text-xs text-amber-700 dark:text-amber-300">{result.motivo}</p>}
      {result?.ok && (
        <div className="space-y-2">
          {result.asunto && <p className="text-xs"><strong>Asunto:</strong> {result.asunto}</p>}
          <textarea
            rows={7}
            value={text}
            onChange={(e) => setText(e.target.value)}
            className="w-full px-3 py-2 rounded-lg text-sm bg-white dark:bg-[#141210] border border-[#F5C9A8] dark:border-[#3D2E22] text-[#1a1a1a] dark:text-[#F5EBE1] font-ui"
          />
          <div className="flex gap-2 flex-wrap">
            <button type="button" onClick={copyAll} className={btn}>
              {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />} {copied ? 'Copiado' : 'Copiar'}
            </button>
            {result.whatsappLink && (
              <a href={`${result.whatsappLink.split('?')[0]}?text=${encodeURIComponent(text)}`} target="_blank" rel="noreferrer" className={btn}>
                <ExternalLink className="w-3.5 h-3.5" /> Abrir en WhatsApp
              </a>
            )}
          </div>
          <p className="text-[11px] text-[#999]">Borrador: revisalo antes de mandarlo. Nada se envía solo.</p>
        </div>
      )}
    </div>
  );
};
