'use client'

import { Code, Copy, FileCode, ExternalLink } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { TacticalButton } from '@/components/tactical/TacticalButton'
import { useToast } from '@/components/ui/ToastProvider'

interface XmlAuditModalProps {
  invoice: any
  onClose: () => void
}

export function XmlAuditModal({ invoice, onClose }: XmlAuditModalProps) {
  const { toast } = useToast()

  function handleCopy(text: string, label: string) {
    navigator.clipboard.writeText(text)
    toast(`✓ Copiado al portapapeles: ${label}`)
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
            <span className="font-bold text-ok uppercase">
              {invoice.isElectronicSent ? '✓ FACTURA TRANSMITIDA Y ACEPTADA' : 'PENDIENTE DE TRANSMISIÓN'}
            </span>
          </div>
          <div className="flex justify-between items-center text-[11px]">
            <span className="text-fg-muted">CÓDIGO ÚNICO CUFE:</span>
            <span className="font-bold text-fg font-mono text-[10px] break-all">
              {invoice.cufe || invoice.fiscalDocument?.uniqueCode || 'CUFE_GENERATED_ON_TRANSMISSION'}
            </span>
          </div>
          <div className="flex justify-between items-center text-[11px]">
            <span className="text-fg-muted">NÚMERO DE REFERENCIA / CONSECUTIVO:</span>
            <span className="font-bold text-accent">
              {invoice.fullNumber || `FACT-#${invoice.ticketNumber || invoice.id}`}
            </span>
          </div>
        </div>

        {/* XML PAYLOAD PREVIEW */}
        <div className="space-y-1">
          <div className="flex items-center justify-between text-fg-muted text-[11px]">
            <span className="flex items-center gap-1 font-bold">
              <FileCode className="w-3.5 h-3.5 text-accent" /> PAYLOAD XML UBL 2.1 GENERADO PARA DIAN:
            </span>
            <button
              onClick={() =>
                handleCopy(
                  invoice.fiscalDocument?.xmlSignedStorageKey ||
                  `<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2" CUFE="${invoice.cufe || 'DEMO_CUFE'}"><ID>${invoice.ticketNumber}</ID><Total>${invoice.total}</Total></Invoice>`,
                  'Estructura XML'
                )
              }
              className="text-accent hover:underline flex items-center gap-1"
            >
              <Copy className="w-3 h-3" /> COPIAR XML
            </button>
          </div>

          <pre className="bg-ink-2 border border-line-faint text-success-fg-mid p-3 rounded text-[10px] overflow-x-auto max-h-60 leading-relaxed font-mono whitespace-pre-wrap">
            {invoice.fiscalDocument?.xmlSignedStorageKey ||
              `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
         xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
         xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:UBLVersionID>UBL 2.1</cbc:UBLVersionID>
  <cbc:CustomizationID>10</cbc:CustomizationID>
  <cbc:ProfileExecutionID>1</cbc:ProfileExecutionID>
  <cbc:ID>${invoice.ticketNumber ? `FACT-#${String(invoice.ticketNumber).padStart(4, '0')}` : invoice.id}</cbc:ID>
  <cbc:UUID schemeName="CUFE-SHA384">${invoice.cufe || 'CUFE_TRANSMISSION_PENDING'}</cbc:UUID>
  <cbc:IssueDate>${invoice.createdAt ? new Date(invoice.createdAt).toISOString().split('T')[0] : '2026-08-03'}</cbc:IssueDate>
  <cbc:InvoiceTypeCode>01</cbc:InvoiceTypeCode>
  <cbc:DocumentCurrencyCode>COP</cbc:DocumentCurrencyCode>
  <cac:AccountingSupplierParty>
    <cac:Party>
      <cac:PartyName><cbc:Name>COMERCIALIZADORA POS RETAIL S.A.S.</cbc:Name></cac:PartyName>
    </cac:Party>
  </cac:AccountingSupplierParty>
  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="COP">${invoice.subtotal}</cbc:LineExtensionAmount>
    <cbc:TaxInclusiveAmount currencyID="COP">${invoice.total}</cbc:TaxInclusiveAmount>
    <cbc:PayableAmount currencyID="COP">${invoice.total}</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>
</Invoice>`}
          </pre>
        </div>

        {invoice.pdfUrl && (
          <div className="pt-2">
            <a
              href={invoice.pdfUrl}
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
