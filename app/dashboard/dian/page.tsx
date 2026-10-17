import { ShieldCheck } from 'lucide-react'
import { PageHeader } from '@/components/ui/PageHeader'

export default function DIANPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        tone="muted"
        icon={<ShieldCheck className="w-4 h-4" />}
        kicker="COLOMBIA DIAN FISCAL GATEWAY // DESHABILITADO"
        title="FACTURACIÓN ELECTRÓNICA DIAN"
        description="Módulo deshabilitado temporalmente. Contacta al administrador para reactivarlo."
      />

      <div className="bg-panel border border-dashed border-line rounded-[6px] p-8 text-center font-mono text-xs text-fg-muted">
        <ShieldCheck className="w-10 h-10 mx-auto mb-3 text-line" />
        <div className="text-fg-faint uppercase tracking-widest text-[10px] mb-2">Módulo en pausa</div>
        <div className="text-fg">
          Los envíos a la DIAN Colombia están deshabilitados por configuración.
        </div>
        <div className="mt-4 text-[10px]">
          Para reactivar: descomentar variables <code className="text-accent">DIAN_*</code> en <code className="text-accent">.env</code>,
          habilitar la entrada del sidebar en <code className="text-accent">app/dashboard/layout.tsx</code> y reiniciar.
        </div>
      </div>
    </div>
  )
}
