'use client'

import { Code, Copy, FileCode, ExternalLink, AlertTriangle } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { TacticalButton } from '@/components/tactical/TacticalButton'
import { useToast } from '@/components/ui/ToastProvider'
import { fiscalUiStatus } from '@/components/invoices/invoice-utils'

interface XmlAuditModalProps {
  invoice: any
  onClose: () => void
}

export function XmlAuditModal({ invoice, onClose }: XmlAuditModalProps) {
  const { toast } = useToast()
  const fiscal = fiscalUiStatus(invoice)
  const xmlUrl =
    invoice.xmlUrl || invoice.fiscalDocument?.xmlSignedStorageKey || null
  const pdfUrl = invoice.pdfUrl || invoice.fiscalDocument?.pdfStorageKey || null
  const hasRealXml = Boolean(xmlUrl && /^https?:\/\//i.test(String(xmlUrl)))

  function handleCopy(text: string, label: string) {
    navigator.clipboard.writeText(text)
    toast(`V Copiado al portapapeles: ${label}`)
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="VISOR Y AUDITORÍA XML DIAN // FACTUS V2"
      icon={<Code className="w-4 h-4" />}
      size="2xl"
    >
      <div className="space-y-3 font-mono text-xs">
        <div className="bg-input p-3 rounded border border-line-soft space-y-2">
          <div className="flex justify-between items-center text-[11px]">
            <span className="text-fg-muted">ESTADO TRANSMISIÓN DIAN:</span>
            <span
              className={`font-bold uppercase ${
                fiscal.isAccepted
                  ? 'text-ok'
                  : fiscal.isRejected
                    ? 'text-danger'
                    : 'text-warn'
              }`}
            >
              {fiscal.label}
            </span>
          </div>
          <div className="flex justify-between items-center text-[11px]">
            <span className="text-fg-muted">CÓDIGO ÚNICO CUFE:</span>
            <span className="font-bold text-fg font-mono text-[10px] break-all">
              {fiscal.cufe || 'NO DISPONIBLE'}
            </span>
          </div>
          <div className="flex justify-between items-center text-[11px]">
            <span className="text-fg-muted">NÚMERO DE REFERENCIA / CONSECUTIVO:</span>
            <span className="font-bold text-accent">
              {invoice.fullNumber || `FACT-#${invoice.ticketNumber || invoice.id}`}
            </span>
          </div>
        </div>

        <div className="space-y-1">
          <div className="flex items-center justify-between text-fg-muted text-[11px]">
            <span className="flex items-center gap-1 font-bold">
              <FileCode className="w-3.5 h-3.5 text-accent" /> XML FIRMADO / DOCUMENTO OFICIAL:
            </span>
            {hasRealXml && (
              <button
                onClick={() => handleCopy(String(xmlUrl), 'URL del XML')}
                className="text-accent hover:underline flex items-center gap-1"
              >
                <Copy className="w-3 h-3" /> COPIAR URL
              </button>
            )}
          </div>

          {hasRealXml ? (
            <div className="bg-ink-2 border border-line-faint p-4 rounded text-[11px] text-fg space-y-3">
              <p>
                El XML firmado no se muestra dentro de la aplicación. Descárguelo
                desde el enlace oficial entregado por Factus.
              </p>
              <a
                href={String(xmlUrl)}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 bg-accent text-white font-bold px-4 py-2 rounded text-xs hover:bg-warn-solid transition-colors"
              >
                <ExternalLink className="w-3.5 h-3.5" /> ABRIR XML OFICIAL
              </a>
            </div>
          ) : (
            <div className="bg-alert-dim border border-alert-line text-danger p-3 rounded text-[11px] flex gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>
                No hay un XML oficial firmado disponible para este documento.
                {fiscal.isAccepted
                  ? ' Verifique la configuración de Factus o vuelva a consultar la factura.'
                  : ' Transmita la factura y espere la respuesta de DIAN.'}
              </span>
            </div>
          )}
        </div>

        {pdfUrl && (
          <div className="pt-2">
            <a
              href={String(pdfUrl)}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 bg-accent text-white font-bold px-4 py-2 rounded text-xs hover:bg-warn-solid transition-colors"
            >
              <ExternalLink className="w-3.5 h-3.5" /> DESCARGAR PDF OFICIAL FACTUS DIAN
            </a>
          </div>
        )}
      </div>

      <div className="flex justify-end pt-3 border-t border-line-dim">
        <TacticalButton variant="secondary" size="sm" onClick={onClose}>
          CERRAR VISOR
        </TacticalButton>
      </div>
    </Modal>
  )
}
