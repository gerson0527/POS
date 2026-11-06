'use client'

import { useMemo, useState } from 'react'
import { DatabaseBackup } from 'lucide-react'
import { SectionPanel } from '@/components/tactical/SectionPanel'
import { TacticalButton } from '@/components/tactical/TacticalButton'
import { Input } from '@/components/ui/Input'
import { Label } from '@/components/ui/Label'
import { useToast } from '@/components/ui/ToastProvider'
import { BACKUP_TABLES, backupGroups } from '@/lib/backup/catalog'
import { backupFileName, parseMonthRange } from '@/lib/backup/sql'

type Scope = 'all' | 'tables'
type Period = 'all' | 'months'

export function BackupSection() {
  const { toast } = useToast()
  const groups = useMemo(() => backupGroups(), [])
  const [scope, setScope] = useState<Scope>('all')
  const [period, setPeriod] = useState<Period>('all')
  const [fromMonth, setFromMonth] = useState('')
  const [toMonth, setToMonth] = useState('')
  const [selected, setSelected] = useState<string[]>([])
  const [saving, setSaving] = useState(false)

  function toggleTable(name: string) {
    setSelected((current) =>
      current.includes(name) ? current.filter((item) => item !== name) : [...current, name]
    )
  }

  function toggleGroup(names: string[]) {
    setSelected((current) => {
      const allOn = names.every((name) => current.includes(name))
      if (allOn) return current.filter((name) => !names.includes(name))
      return [...new Set([...current, ...names])]
    })
  }

  async function createBackup() {
    let range = null
    try {
      range = period === 'months' ? parseMonthRange(fromMonth, toMonth) : null
    } catch (error: any) {
      toast(error?.message || 'Rango de meses inválido.', 'error')
      return
    }

    if (scope === 'tables' && selected.length === 0) {
      toast('Seleccione al menos una tabla.', 'error')
      return
    }

    const filename = backupFileName(range)
    let handle: FileSystemFileHandle | null = null
    const picker = (window as Window & {
      showSaveFilePicker?: (options: {
        suggestedName?: string
        types?: Array<{ description: string; accept: Record<string, string[]> }>
      }) => Promise<FileSystemFileHandle>
    }).showSaveFilePicker

    try {
      if (picker) {
        handle = await picker({
          suggestedName: filename,
          types: [{ description: 'Copia SQL', accept: { 'application/sql': ['.sql'] } }],
        })
      }
    } catch (error: any) {
      if (error?.name === 'AbortError') return
      toast('No se pudo abrir el selector de carpeta. Se descargará el archivo.', 'info')
    }

    setSaving(true)
    try {
      const response = await fetch('/api/backup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scope,
          tables: scope === 'tables' ? selected : BACKUP_TABLES.map((table) => table.name),
          fromMonth: range?.from,
          toMonth: range?.to,
        }),
      })

      if (!response.ok) {
        const payload = await response.json().catch(() => null)
        throw new Error(payload?.message || payload?.error || 'No se pudo generar la copia de seguridad.')
      }

      const blob = await response.blob()
      if (handle) {
        const writable = await handle.createWritable()
        await writable.write(blob)
        await writable.close()
        toast(`Copia guardada: ${handle.name}`)
        return
      }

      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = filename
      link.click()
      URL.revokeObjectURL(url)
      toast(`Copia descargada: ${filename}`)
    } catch (error: any) {
      toast(error?.message || 'No se pudo generar la copia de seguridad.', 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <SectionPanel
      title="COPIA DE SEGURIDAD DE LA BASE DE DATOS"
      subtitle="Elija qué exportar, los meses y la carpeta donde se guardará el archivo SQL."
    >
      <div className="space-y-5">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => setScope('all')}
            className={`text-left rounded border p-3 transition-colors ${
              scope === 'all' ? 'border-accent bg-accent/10' : 'border-line bg-input hover:border-line-strong'
            }`}
          >
            <div className="text-xs font-bold text-fg">Toda la base de datos</div>
            <p className="text-[11px] text-fg-muted mt-1">
              Empresa, clientes, inventario, ventas, devoluciones, fiscal y auditoría de esta empresa.
            </p>
          </button>
          <button
            type="button"
            onClick={() => setScope('tables')}
            className={`text-left rounded border p-3 transition-colors ${
              scope === 'tables' ? 'border-accent bg-accent/10' : 'border-line bg-input hover:border-line-strong'
            }`}
          >
            <div className="text-xs font-bold text-fg">Elegir tablas</div>
            <p className="text-[11px] text-fg-muted mt-1">
              Marque solo los datos que quiere incluir en la copia.
            </p>
          </button>
        </div>

        {scope === 'tables' && (
          <div className="border border-line rounded max-h-72 overflow-y-auto divide-y divide-line">
            {groups.map((group) => {
              const names = group.tables.map((table) => table.name)
              const allOn = names.every((name) => selected.includes(name))
              return (
                <div key={group.group} className="p-3 space-y-2">
                  <label className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-fg-muted">
                    <input
                      type="checkbox"
                      checked={allOn}
                      onChange={() => toggleGroup(names)}
                      className="accent-accent"
                    />
                    {group.group}
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 pl-6">
                    {group.tables.map((table) => (
                      <label key={table.name} className="flex items-center gap-2 text-xs text-fg">
                        <input
                          type="checkbox"
                          checked={selected.includes(table.name)}
                          onChange={() => toggleTable(table.name)}
                          className="accent-accent"
                        />
                        {table.label}
                      </label>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        <div className="space-y-3">
          <Label>Meses</Label>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setPeriod('all')}
              className={`px-3 py-1.5 rounded border text-xs font-semibold ${
                period === 'all' ? 'border-accent text-accent' : 'border-line text-fg-muted'
              }`}
            >
              Todos los meses
            </button>
            <button
              type="button"
              onClick={() => setPeriod('months')}
              className={`px-3 py-1.5 rounded border text-xs font-semibold ${
                period === 'months' ? 'border-accent text-accent' : 'border-line text-fg-muted'
              }`}
            >
              Elegir meses
            </button>
          </div>
          {period === 'months' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Desde</Label>
                <Input type="month" value={fromMonth} onChange={(event) => setFromMonth(event.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Hasta</Label>
                <Input type="month" value={toMonth} onChange={(event) => setToMonth(event.target.value)} />
              </div>
            </div>
          )}
          <p className="text-[11px] text-fg-muted">
            El rango aplica a ventas, pagos, caja, devoluciones, movimientos, documentos y auditoría.
            Clientes, productos, sedes y usuarios se incluyen completos para que la copia se pueda restaurar.
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
          <p className="text-[11px] text-fg-muted max-w-xl">
            Al continuar se abre el cuadro para elegir la carpeta y el nombre del archivo.
          </p>
          <TacticalButton
            variant="primary"
            size="sm"
            loading={saving}
            onClick={createBackup}
            icon={<DatabaseBackup className="w-3.5 h-3.5" />}
          >
            COPIA DE SEGURIDAD DE LA BASE DE DATOS
          </TacticalButton>
        </div>
      </div>
    </SectionPanel>
  )
}
