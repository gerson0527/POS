'use client'

import { useState } from 'react'
import { FileUp, Upload } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { TacticalButton } from '@/components/tactical/TacticalButton'
import { Label } from '@/components/ui/Label'
import { TextArea } from '@/components/ui/TextArea'
import { useToast } from '@/components/ui/ToastProvider'
import { importProductsFromCSV, getImportTemplateCSV } from '@/app/actions/pos-actions'

interface ImportCsvModalProps {
  open: boolean
  onClose: () => void
  onImported: () => void
}

export function ImportCsvModal({ open, onClose, onImported }: ImportCsvModalProps) {
  const { toast } = useToast()
  const [importCsv, setImportCsv] = useState('')
  const [importMode, setImportMode] = useState<'create' | 'upsert'>('upsert')
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState<{ inserted: number; updated: number; errors: string[] } | null>(null)

  async function handleDownloadTemplate() {
    try {
      const csv = await getImportTemplateCSV()
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'plantilla_productos.csv'
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (err: any) {
      toast(`Error: ${err.message}`, 'error')
    }
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      const text = ev.target?.result as string
      setImportCsv(text)
    }
    reader.readAsText(file)
  }

  async function handleRunImport() {
    if (!importCsv.trim()) {
      toast('Pega el contenido CSV o selecciona un archivo primero.')
      return
    }
    setImporting(true)
    setImportResult(null)
    try {
      const res = await importProductsFromCSV({ csvContent: importCsv, mode: importMode })
      setImportResult(res)
      if (res.inserted > 0 || res.updated > 0) onImported()
      if (res.errors.length === 0) {
        toast(`IMPORTACIÓN OK — ${res.inserted} nuevos, ${res.updated} actualizados`)
      }
    } catch (err: any) {
      toast(`Error al importar: ${err.message}`, 'error')
    } finally {
      setImporting(false)
    }
  }

  function handleClose() {
    setImportCsv('')
    setImportResult(null)
    onClose()
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="IMPORTAR PRODUCTOS DESDE EXCEL/CSV"
      icon={<FileUp className="w-4 h-4" />}
      size="2xl"
    >
      <div className="text-[10px] text-fg-muted space-y-1 font-mono">
        <p>
          <span className="text-accent font-bold">Columnas requeridas:</span> <code className="text-fg">nombre</code>, <code className="text-fg">precio_venta</code>
        </p>
        <p>
          <span className="text-accent font-bold">Columnas opcionales:</span> sku, descripcion, codigo_barras, categoria, costo, tasa_iva, stock, estado
        </p>
        <p>
          <span className="text-ok font-bold">Tip:</span> Descarga la plantilla con datos de ejemplo para ver el formato.
        </p>
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={handleDownloadTemplate}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-raised border border-line hover:border-accent text-[10px] font-bold uppercase text-accent rounded"
        >
          <Upload className="w-3 h-3" />
          Descargar plantilla CSV
        </button>
        <Label className="flex items-center gap-1.5 px-3 py-1.5 bg-raised border border-line hover:border-ok uppercase text-ok rounded cursor-pointer">
          <Upload className="w-3 h-3" />
          Seleccionar archivo .csv
          <input
            type="file"
            accept=".csv,text/csv"
            onChange={handleFileSelect}
            className="hidden"
          />
        </Label>
      </div>

      <div>
        <Label>
          Contenido CSV (pegar o cargado)
        </Label>
        <TextArea
          value={importCsv}
          onChange={(e) => setImportCsv(e.target.value)}
          placeholder={'SKU,nombre,descripcion,codigo_barras,categoria,precio_venta,costo,tasa_iva,stock,estado\nSKU-001,Teclado RGB,Switches MX Red,770123450001,Tecnología,250000,150000,19,25,ACTIVE'}
          rows={8}
          className="w-full bg-input border border-line focus:border-accent text-fg p-2.5 rounded font-mono text-[11px] resize-y"
        />
      </div>

      <div className="space-y-2">
        <Label>
          Modo de importación
        </Label>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setImportMode('upsert')}
            className={`p-2.5 rounded border text-left ${importMode === 'upsert'
              ? 'bg-accent text-white border-accent'
              : 'bg-input text-fg-muted border-line hover:border-line-strong'
              }`}
          >
            <div className="text-[11px] font-bold uppercase">UPSERT</div>
            <div className={`text-[10px] mt-0.5 ${importMode === 'upsert' ? 'text-white/80' : 'text-fg-faint'}`}>
              Crea nuevos y actualiza los que coincidan por SKU
            </div>
          </button>
          <button
            type="button"
            onClick={() => setImportMode('create')}
            className={`p-2.5 rounded border text-left ${importMode === 'create'
              ? 'bg-accent text-white border-accent'
              : 'bg-input text-fg-muted border-line hover:border-line-strong'
              }`}
          >
            <div className="text-[11px] font-bold uppercase">SOLO CREAR</div>
            <div className={`text-[10px] mt-0.5 ${importMode === 'create' ? 'text-white/80' : 'text-fg-faint'}`}>
              Solo agrega productos nuevos. Omite los SKUs que ya existen.
            </div>
          </button>
        </div>
      </div>

      {importResult && (
        <div className="bg-input border border-line rounded p-3 space-y-1 text-[11px] font-mono">
          <div className="flex justify-between">
            <span className="text-fg-muted">PRODUCTOS NUEVOS:</span>
            <span className="text-ok font-bold">+{importResult.inserted}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-fg-muted">ACTUALIZADOS:</span>
            <span className="text-cyan font-bold">~{importResult.updated}</span>
          </div>
          <div className="flex justify-between border-t border-line-soft pt-1 mt-1">
            <span className="text-fg-muted">ERRORES / OMISIONES:</span>
            <span className={importResult.errors.length === 0 ? 'text-ok font-bold' : 'text-warning font-bold'}>
              {importResult.errors.length}
            </span>
          </div>
          {importResult.errors.length > 0 && (
            <div className="max-h-32 overflow-y-auto mt-2 text-[10px] text-warning space-y-0.5 border-t border-line-soft pt-1">
              {importResult.errors.slice(0, 10).map((err, i) => (
                <div key={i}>• {err}</div>
              ))}
              {importResult.errors.length > 10 && (
                <div className="text-fg-faint italic">… y {importResult.errors.length - 10} más</div>
              )}
            </div>
          )}
        </div>
      )}

      <div className="flex justify-end gap-2 pt-3 border-t border-line-dim">
        <TacticalButton
          type="button"
          variant="secondary"
          size="sm"
          onClick={handleClose}
        >
          CERRAR
        </TacticalButton>
        <TacticalButton
          type="button"
          variant="primary"
          size="sm"
          onClick={handleRunImport}
          loading={importing}
          disabled={!importCsv.trim()}
        >
          EJECUTAR IMPORTACIÓN
        </TacticalButton>
      </div>
    </Modal>
  )
}
