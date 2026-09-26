import { useMemo, useState } from 'react';
import QRCode from 'qrcode';
import { toast } from 'sonner';
import { Copy, Download, Loader2, MessageCircle, QrCode as QrCodeIcon, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

// ----------------------------------------------------------------------------
// WhatsAppLinkTool — gerador de link "clique pra conversar" (wa.me) com
// mensagem pré-preenchida + QR code, pedido pelo dono (2026-08-27) com uma
// referência visual de layout. Usa pra divulgar (bio do Instagram, cartão de
// visita, placa de imóvel) — quem clica ou escaneia já abre o WhatsApp com a
// mensagem pronta, só precisa apertar Enviar. 100% no navegador, sem
// depender do Vivas Envia estar conectado.
// ----------------------------------------------------------------------------

function onlyDigits(v: string): string {
  return v.replace(/\D/g, '');
}

function formatPhoneDisplay(digits: string): string {
  // (DD) 9XXXX-XXXX conforme a pessoa digita — só cosmético, o link usa os
  // dígitos puros.
  const d = digits.slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 7) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

export function WhatsAppLinkTool() {
  const [phoneDigits, setPhoneDigits] = useState('');
  const [message, setMessage] = useState(
    'Olá! Quero conhecer as melhores opções de imóveis disponíveis.',
  );
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);

  const fullDigits = useMemo(() => {
    const d = onlyDigits(phoneDigits);
    return d ? `55${d}` : '';
  }, [phoneDigits]);

  const isValid = phoneDigits.replace(/\D/g, '').length >= 10;

  const link = useMemo(() => {
    if (!fullDigits) return '';
    const params = message.trim() ? `?text=${encodeURIComponent(message.trim())}` : '';
    return `https://wa.me/${fullDigits}${params}`;
  }, [fullDigits, message]);

  // QR muda (número/mensagem) sem o QR antigo continuar valendo pra outra coisa.
  const handlePhoneChange = (raw: string) => {
    setPhoneDigits(onlyDigits(raw));
    setQrDataUrl(null);
  };
  const handleMessageChange = (raw: string) => {
    setMessage(raw);
    setQrDataUrl(null);
  };

  const handleCopy = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      toast.success('Link copiado.');
    } catch {
      toast.error('Não foi possível copiar — copie manualmente.');
    }
  };

  const handleGenerateQr = async () => {
    if (!isValid || !link) return;
    setGenerating(true);
    try {
      const dataUrl = await QRCode.toDataURL(link, {
        width: 320,
        margin: 1,
        color: { dark: '#0A0A0F', light: '#FFFFFF' },
      });
      setQrDataUrl(dataUrl);
    } catch (err) {
      toast.error('Falha ao gerar QR code', {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setGenerating(false);
    }
  };

  const handleDownloadQr = () => {
    if (!qrDataUrl) return;
    const a = document.createElement('a');
    a.href = qrDataUrl;
    a.download = 'whatsapp-qr-code.png';
    a.click();
  };

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Card>
        <div className="space-y-4">
          <header className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl flex items-center justify-center bg-[rgba(37,211,102,0.15)]">
              <MessageCircle className="h-5 w-5 text-[#25D366]" />
            </div>
            <div>
              <h2 className="text-lg font-bold">Configure a conversa</h2>
              <p className="text-xs text-[var(--color-text-secondary)]">
                Gere um link (e um QR code) que já abre o WhatsApp com a mensagem pronta.
              </p>
            </div>
          </header>

          <div className="space-y-2">
            <Label htmlFor="wa_phone">Número com DDD</Label>
            <Input
              id="wa_phone"
              value={formatPhoneDisplay(phoneDigits)}
              onChange={(e) => handlePhoneChange(e.target.value)}
              placeholder="(85) 99999-9999"
              inputMode="numeric"
            />
            <p className="text-[11px] text-[var(--color-text-secondary)] opacity-70">
              O código do Brasil (+55) será incluído automaticamente.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="wa_message">Mensagem personalizada</Label>
            <textarea
              id="wa_message"
              value={message}
              onChange={(e) => handleMessageChange(e.target.value)}
              rows={4}
              placeholder="Ex.: Olá! Quero conhecer as melhores opções de imóveis disponíveis."
              className="w-full rounded-lg border border-[rgba(var(--accent-secondary-rgb),0.2)] bg-white/[0.03] px-4 py-3 text-sm text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--accent-primary)]"
            />
          </div>

          <div className="flex items-start gap-2.5 rounded-lg border border-[rgba(37,211,102,0.25)] bg-[rgba(37,211,102,0.06)] px-3.5 py-3">
            <MessageCircle className="h-4 w-4 text-[#25D366] flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-semibold text-[#25D366]">Como o link funciona pro cliente</p>
              <p className="text-xs text-[var(--color-text-secondary)] mt-0.5">
                Ao clicar, o cliente abre uma conversa com você e a mensagem personalizada já
                aparece preenchida. Pra concluir, ele só precisa tocar em Enviar.
              </p>
            </div>
          </div>

          {isValid && (
            <div className="space-y-2">
              <Label>Link gerado</Label>
              <div className="flex items-start gap-2">
                <div className="flex-1 min-w-0 rounded-lg border border-[rgba(var(--accent-secondary-rgb),0.2)] bg-white/[0.03] px-3 py-2 text-xs font-mono text-[var(--color-text-primary)] break-all">
                  {link}
                </div>
                <Button type="button" variant="outline" size="icon" onClick={handleCopy} aria-label="Copiar link">
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </div>
      </Card>

      <Card>
        <div className="space-y-4 flex flex-col items-center text-center">
          <header>
            <h2 className="text-lg font-bold">WhatsApp + QR Code</h2>
            <p className="text-xs text-[var(--color-text-secondary)]">
              Gere o QR code só quando precisar — pra cartão de visita, placa de imóvel, etc.
            </p>
          </header>

          <div className="flex h-64 w-64 items-center justify-center rounded-xl border border-[rgba(var(--accent-secondary-rgb),0.2)] bg-white">
            {qrDataUrl ? (
              <img src={qrDataUrl} alt="QR code do link do WhatsApp" className="h-56 w-56" />
            ) : (
              <div className="flex flex-col items-center gap-2 px-6 text-[var(--bg-primary)]">
                <QrCodeIcon className="h-8 w-8 opacity-40" />
                <p className="text-sm font-semibold opacity-70">QR code ainda não gerado</p>
                <p className="text-xs opacity-50">Preencha o número e clique no botão abaixo.</p>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 w-full max-w-xs">
            <Button type="button" className="flex-1" onClick={handleGenerateQr} disabled={!isValid || generating}>
              {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Gerar QR Code
            </Button>
            {qrDataUrl && (
              <Button type="button" variant="outline" size="icon" onClick={handleDownloadQr} aria-label="Baixar QR code">
                <Download className="h-4 w-4" />
              </Button>
            )}
          </div>
          {!isValid && (
            <p className="text-[11px] text-[var(--color-text-secondary)] opacity-70">
              Digite um número válido com DDD pra liberar o QR code.
            </p>
          )}
        </div>
      </Card>
    </div>
  );
}
