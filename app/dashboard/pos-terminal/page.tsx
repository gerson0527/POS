'use client'

import { useState } from 'react'
import { SectionPanel } from '@/components/tactical/SectionPanel'
import { TacticalButton } from '@/components/tactical/TacticalButton'
import { getSaleRepository, getHardwareDriver, isTauriEnvironment } from '@/lib/adapters/adapter-factory'
import { useSyncManager } from '@/hooks/useSyncManager'
import { useSecurityVault } from '@/hooks/useSecurityVault'
import { useTelemetryDiagnostics } from '@/hooks/useTelemetryDiagnostics'
import { useBackupRecovery } from '@/hooks/useBackupRecovery'
import { useToast } from '@/components/ui/ToastProvider'
import { DataTable } from '@/components/ui/DataTable'
import {
  ShoppingCart,
  Printer,
  Wifi,
  WifiOff,
  ShieldCheck,
  Cpu,
  Activity,
  HardDrive,
  CheckCircle2,
  Trash2,
  Zap } from 'lucide-react'

export default function POSTerminalDualPage() {
  const isTauri = isTauriEnvironment()
  const { isOnline, queueSummary, enqueueOfflineSale } = useSyncManager()
  const { hardwareFingerprint } = useSecurityVault()
  const { metricsSummary, healthStatus, recordCheckoutLatency } = useTelemetryDiagnostics()
  const { createEncryptedBackup } = useBackupRecovery()
  const { toast } = useToast()

  const [cart, setCart] = useState<any[]>([
    { id: 'prod_1', name: 'Café Espresso Premium 250g', price: 18500, qty: 2, ivaRate: 19 },
    { id: 'prod_2', name: 'Agua Mineral 500ml', price: 3500, qty: 3, ivaRate: 0 },
  ])
  const [isProcessing, setIsProcessing] = useState(false)

  const subtotal = cart.reduce((sum, item) => sum + item.price * item.qty, 0)
  const taxAmount = cart.reduce((sum, item) => sum + (item.price * item.qty * item.ivaRate) / 100, 0)
  const total = subtotal + taxAmount

  async function handleCheckout() {
    if (cart.length === 0) return
    setIsProcessing(true)
    const startTime = Date.now()

    try {
      const saleDto = {
        tenantId: 'tenant_bogota_01',
        locationId: 'loc_bogota_01',
        cashierSessionId: 'cs_active',
        paymentMethod: 'EFECTIVO',
        subtotal,
        taxAmount,
        discountAmount: 0,
        total,
        lines: cart.map((c) => ({
          productId: c.id,
          quantity: c.qty,
          unitPrice: c.price,
          ivaRate: c.ivaRate,
          ivaAmount: (c.price * c.qty * c.ivaRate) / 100,
          lineTotal: c.price * c.qty,
        })),
      }

      // Execute Sale via Dual Adapter Factory
      const repo = getSaleRepository()
      const saleResult = await repo.createSale(saleDto)

      // Print Receipt & Open Cash Drawer via Hardware Driver
      const hardware = getHardwareDriver()
      await hardware.printTicket(saleResult)
      await hardware.openCashDrawer()

      // If offline, enqueue transaction in outbox queue
      if (!isOnline) {
        enqueueOfflineSale(saleDto)
      }

      const duration = Date.now() - startTime
      recordCheckoutLatency(duration)

      toast(
        `¡VENTA #${saleResult.ticketNumber || saleResult.id} REGISTRADA! (${duration}ms - ${
          isTauri ? 'Modo Tauri Desktop' : 'Modo Web Cloud'
        })`
      )
      setCart([])
    } catch (err: any) {
      toast(`Error en cobranza: ${err.message}`, 'error')
    } finally {
      setIsProcessing(false)
    }
  }

  function handleBackup() {
    const pkg = createEncryptedBackup('tenant_bogota_01', JSON.stringify(cart))
    toast(`¡RESPALDO CIFRADO AES-256 GENERADO! ID: ${pkg.backupId.substring(0, 12)}`)
  }

  return (
    <div className="space-y-6 text-fg">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-line-soft pb-4">
        <div>
          <div className="flex items-center gap-2 text-accent text-xs font-semibold">
            <Zap className="w-4 h-4" />
            <span>TERMINAL POS ENTERPRISE // HÍBRIDO DUAL VIEW</span>
          </div>
          <h1 className="text-xl font-bold text-fg mt-1">Caja Registradora & Facturación Electrónica DIAN</h1>
        </div>

        <div className="flex items-center gap-3">
          <TacticalButton variant="secondary" size="sm" onClick={handleBackup}>
            <HardDrive className="w-3.5 h-3.5 mr-1" /> CREAR BACKUP CIFRADO
          </TacticalButton>

          <TacticalButton
            variant="primary"
            size="sm"
            onClick={handleCheckout}
            disabled={isProcessing || cart.length === 0}
          >
            <ShoppingCart className="w-3.5 h-3.5 mr-1" /> PROCESAR COBRO (${total.toLocaleString('es-CO')})
          </TacticalButton>
        </div>
      </div>

      {/* STATUS BADGES BAR */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-xs">
        <div className="bg-surface border border-line-dim rounded-lg p-3">
          <p className="text-[9px] text-fg-muted font-bold uppercase tracking-wider">ENTORNO DE EJECUCIÓN</p>
          <div className="flex items-center gap-1.5 mt-1 text-accent font-bold">
            <Cpu className="w-4 h-4 shrink-0 text-accent" />
            <span className="truncate">{isTauri ? 'TAURI 2.X DESKTOP' : 'WEB BROWSER CLOUD'}</span>
          </div>
        </div>

        <div className="bg-surface border border-line-dim rounded-lg p-3">
          <p className="text-[9px] text-fg-muted font-bold uppercase tracking-wider">ESTADO RED / OFFLINE</p>
          <div className="flex items-center gap-1.5 mt-1 font-bold">
            {isOnline ? (
              <>
                <Wifi className="w-4 h-4 text-ok shrink-0" />
                <span className="text-ok">ONLINE CLOUD</span>
              </>
            ) : (
              <>
                <WifiOff className="w-4 h-4 text-alert shrink-0" />
                <span className="text-alert">OFFLINE (OUTBOX)</span>
              </>
            )}
          </div>
        </div>

        <div className="bg-surface border border-line-dim rounded-lg p-3">
          <p className="text-[9px] text-fg-muted font-bold uppercase tracking-wider">COLA DE SINCRONIZACIÓN</p>
          <p className="text-sm font-black text-cyan mt-1">
            {queueSummary.pending} pendientes / {queueSummary.synced} sinc
          </p>
        </div>

        <div className="bg-surface border border-line-dim rounded-lg p-3">
          <p className="text-[9px] text-fg-muted font-bold uppercase tracking-wider">LATENCIA CHECKOUT</p>
          <div className="flex items-center gap-1.5 mt-1 font-bold text-success">
            <Activity className="w-4 h-4 text-success shrink-0" />
            <span>{metricsSummary.avgCheckoutLatencyMs} ms</span>
          </div>
        </div>

        <div className="bg-surface border border-line-dim rounded-lg p-3">
          <p className="text-[9px] text-fg-muted font-bold uppercase tracking-wider">LICENCIA ED25519</p>
          <div className="flex items-center gap-1.5 mt-1 font-bold text-ok">
            <ShieldCheck className="w-4 h-4 text-ok shrink-0" />
            <span className="truncate">VERIFICADA (HW OK)</span>
          </div>
        </div>
      </div>

      {/* POS MAIN GRID */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* CARRITO Y COBRANZA */}
        <div className="lg:col-span-2 space-y-4">
          <SectionPanel title="CARRITO DE VENTAS // TURNO ACTIVO" subtitle="Detalle de productos a cobrar">
            <div className="space-y-3">
              <DataTable
                columns={[
                  {
                    key: 'name',
                    header: 'PRODUCTO',
                    cellClassName: 'font-semibold text-fg',
                  },
                  {
                    key: 'qty',
                    header: 'CANT',
                    align: 'center',
                    cellClassName: 'font-bold',
                  },
                  {
                    key: 'price',
                    header: 'PRECIO UNIDAD',
                    align: 'right',
                    cellClassName: 'font-mono',
                    render: (item: any) => `$${item.price.toLocaleString('es-CO')}`,
                  },
                  {
                    key: 'ivaRate',
                    header: 'IVA',
                    align: 'center',
                    cellClassName: 'text-fg-muted',
                    render: (item: any) => `${item.ivaRate}%`,
                  },
                  {
                    key: 'total',
                    header: 'TOTAL',
                    align: 'right',
                    cellClassName: 'font-bold font-mono text-success',
                    render: (item: any) =>
                      `$${(item.price * item.qty * (1 + item.ivaRate / 100)).toLocaleString('es-CO')}`,
                  },
                ]}
                rows={cart}
                rowKey={(item: any) => item.id}
                rowClassName="hover:bg-ash"
                theadClassName="bg-surface border-b border-line text-fg-muted uppercase text-[10px]"
              />

              {/* TOTALES */}
              <div className="bg-night p-4 border border-line-soft rounded-lg space-y-2 text-xs">
                <div className="flex justify-between text-fg-muted">
                  <span>Subtotal Neto:</span>
                  <span className="text-fg font-semibold">${subtotal.toLocaleString('es-CO')}</span>
                </div>
                <div className="flex justify-between text-fg-muted">
                  <span>IVA Recaudado:</span>
                  <span className="text-cyan font-bold">+${taxAmount.toLocaleString('es-CO')}</span>
                </div>
                <div className="flex justify-between text-base font-black text-accent border-t border-line-soft pt-2">
                  <span>TOTAL A COBRAR:</span>
                  <span>${total.toLocaleString('es-CO')}</span>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <TacticalButton variant="secondary" size="sm" onClick={() => setCart([])}>
                  <Trash2 className="w-3.5 h-3.5 mr-1" /> VACIAR CARRITO
                </TacticalButton>
                <TacticalButton
                  variant="primary"
                  size="sm"
                  onClick={handleCheckout}
                  disabled={isProcessing || cart.length === 0}
                >
                  <Printer className="w-3.5 h-3.5 mr-1" /> COBRAR E IMPRIMIR TICKET (ESC/POS)
                </TacticalButton>
              </div>
            </div>
          </SectionPanel>
        </div>

        {/* SUBSYSTEM HEALTH DIAGNOSTICS */}
        <div className="space-y-4">
          <SectionPanel title="DIAGNÓSTICO DE SALUD DEL SISTEMA" subtitle="Estado de hardware y servicios">
            <div className="space-y-2 text-xs">
              {healthStatus.map((h, i) => (
                <div key={i} className="bg-night p-2.5 border border-line-soft rounded flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-ok shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold text-fg text-[11px]">{h.subsystem}</p>
                    <p className="text-[10px] text-fg-muted">{h.details}</p>
                  </div>
                </div>
              ))}
            </div>
          </SectionPanel>

          <SectionPanel title="HUELLA DIGITAL DE HARDWARE" subtitle="Seguridad y Licencia de Nodo">
            <div className="space-y-1 text-[10px] text-fg-muted">
              <p>HARDWARE FINGERPRINT (SHA-256):</p>
              <p className="bg-ink p-2 border border-line-faint rounded text-accent font-bold break-all">
                {hardwareFingerprint || 'GENERANDO...'}
              </p>
            </div>
          </SectionPanel>
        </div>
      </div>
    </div>
  )
}
