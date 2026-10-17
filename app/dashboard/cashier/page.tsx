'use client'

import { useState, useEffect } from 'react'
import {
  getCurrentCashierSessionSummary,
  openCashierSession,
  closeCashierSession,
  getCashierSessionsHistory,
  getCashierSessionDetails,
  getUsersList,
} from '@/app/actions/pos-actions'
import { isSessionError, redirectToLogin } from '@/lib/hooks/use-protected-query'
import { formatCOP } from '@/lib/utils/pos-utils'
import { SectionPanel } from '@/components/tactical/SectionPanel'
import { TacticalButton } from '@/components/tactical/TacticalButton'
import { StatusBadge } from '@/components/tactical/StatusBadge'
import { Modal } from '@/components/ui/Modal'
import { DataTable } from '@/components/ui/DataTable'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { TextArea } from '@/components/ui/TextArea'
import { Label } from '@/components/ui/Label'
import { useToast } from '@/components/ui/ToastProvider'
import {
  Lock,
  Unlock,
  Printer,
  AlertTriangle,
  FileText,
  UserCheck,
  RefreshCw,
  Eye } from 'lucide-react'

export default function CashierPage() {
  const [, setLoading] = useState(true)
  const { toast } = useToast()
  const [activeSessionSummary, setActiveSessionSummary] = useState<any>(null)
  const [history, setHistory] = useState<any[]>([])
  const [users, setUsers] = useState<any[]>([])
  const [selectedUserId, setSelectedUserId] = useState<string>('')

  // Modals & Form States
  const [isOpenModalOpen, setIsOpenModalOpen] = useState(false)
  const [isCloseModalOpen, setIsCloseModalOpen] = useState(false)
  const [isReportModalOpen, setIsReportModalOpen] = useState(false)
  const [selectedZReport, setSelectedZReport] = useState<any>(null)

  const [openingBalance, setOpeningBalance] = useState<string>('50000')
  const [openingNotes, setOpeningNotes] = useState<string>('')

  const [actualCash, setActualCash] = useState<string>('')
  const [closingNotes, setClosingNotes] = useState<string>('')

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    setLoading(true)
    try {
      const [summary, hist, userList] = await Promise.all([
        getCurrentCashierSessionSummary().catch((err) => {
          if (isSessionError(err)) redirectToLogin()
          return null
        }),
        getCashierSessionsHistory().catch((err) => {
          if (isSessionError(err)) redirectToLogin()
          return []
        }),
        getUsersList().catch(() => []),
      ])

      setActiveSessionSummary(summary)
      setHistory(hist || [])
      setUsers(userList || [])

      const current = userList?.find((u: any) => u.isCurrent)
      if (current) {
        setSelectedUserId(current.id)
      } else if (userList && userList.length > 0) {
        setSelectedUserId(userList[0].id)
      }

      if (summary && 'expectedCash' in summary && summary.expectedCash !== undefined) {
        setActualCash(String(summary.expectedCash))
      }
    } catch (err: any) {
      if (isSessionError(err)) redirectToLogin()
      console.error('Error cargando cierres de caja:', err)
    } finally {
      setLoading(false)
    }
  }

  // Handlers
  async function handleOpenSession(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedUserId) {
      toast('Debe seleccionar un usuario responsable para abrir la caja.', 'error')
      return
    }
    try {
      const bal = parseFloat(openingBalance) || 0
      await openCashierSession(bal, openingNotes, selectedUserId)
      toast('¡SESIÓN DE CAJA ABIERTA Y ASOCIADA AL USUARIO CON ÉXITO!')
      setIsOpenModalOpen(false)
      loadData()
    } catch (err: any) {
      toast(`Error al abrir caja: ${err.message}`, 'error')
    }
  }

  async function handleCloseSession(e: React.FormEvent) {
    e.preventDefault()
    if (!activeSessionSummary?.session?.id) return

    try {
      const counted = parseFloat(actualCash) || 0
      const res = await closeCashierSession(activeSessionSummary.session.id, counted, closingNotes)
      toast('¡CIERRE DE CAJA REALIZADO Y REPORTE Z GENERADO!')
      setIsCloseModalOpen(false)
      setSelectedZReport(res.zReport)
      setIsReportModalOpen(true)
      loadData()
    } catch (err: any) {
      toast(`Error al cerrar caja: ${err.message}`, 'error')
    }
  }

  async function handleViewZReport(sessionId: string) {
    try {
      const details = await getCashierSessionDetails(sessionId)
      const sessionHist = history.find((h) => h.id === sessionId)
      setSelectedZReport({
        ...details,
        closingBalance: sessionHist?.closingBalance,
        difference: sessionHist?.difference,
        userName: sessionHist?.userName || details.userName,
        userEmail: sessionHist?.userEmail || details.userEmail,
      })
      setIsReportModalOpen(true)
    } catch (err: any) {
      toast(`Error al cargar Reporte Z: ${err.message}`, 'error')
    }
  }

  const currentDiff = activeSessionSummary?.expectedCash !== undefined
    ? (parseFloat(actualCash) || 0) - activeSessionSummary.expectedCash
    : 0

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-line-soft pb-4">
        <div>
          <div className="flex items-center gap-2 text-accent text-xs font-semibold">
            <span>MÓDULO DE CAJA // ARQUEOS Y CIERRES Z</span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <TacticalButton variant="secondary" size="sm" onClick={loadData}>
            <RefreshCw className="w-3.5 h-3.5 mr-1" /> ACTUALIZAR
          </TacticalButton>

          {activeSessionSummary?.hasOpenSession ? (
            <TacticalButton variant="danger" size="sm" onClick={() => setIsCloseModalOpen(true)}>
              <Lock className="w-3.5 h-3.5 mr-1" /> EFECTUAR CIERRE DE CAJA (Z)
            </TacticalButton>
          ) : (
            <TacticalButton variant="primary" size="sm" onClick={() => setIsOpenModalOpen(true)}>
              <Unlock className="w-3.5 h-3.5 mr-1" /> ABRIR NUEVO TURNO / CAJA
            </TacticalButton>
          )}
        </div>
      </div>

      {/* BANNER DE ALERTA DE TURNO VENCIDO */}
      {activeSessionSummary?.hasOpenSession && activeSessionSummary?.isOverdue && (
        <div className="bg-danger-dim border-2 border-alert rounded-lg p-4 text-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-red-soft animate-pulse shadow-xl">
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-6 h-6 text-alert shrink-0" />
            <div>
              <h4 className="font-bold text-sm text-alert uppercase tracking-wider">
                🔴 ATENCIÓN: TURNO VENCIDO PENDIENTE DE CIERRE (DÍA ANTERIOR)
              </h4>
              <p className="text-xs text-fg mt-0.5">
                Esta caja fue aperturada el <span className="font-bold text-accent">{new Date(activeSessionSummary.session.openedAt).toLocaleString()}</span> (hace {activeSessionSummary.daysOverdue || 1} día/s) y <span className="text-alert font-bold">NO FUE CERRADA AL FINALIZAR LA JORNADA</span>.
              </p>
            </div>
          </div>
          <TacticalButton variant="danger" size="sm" onClick={() => setIsCloseModalOpen(true)}>
            EFECTUAR CIERRE Z AHORA &gt;
          </TacticalButton>
        </div>
      )}

      {/* STATUS DE CAJA ACTIVA */}
      <SectionPanel
        title="ESTADO ACTUAL DE LA CAJA // TURNO EN VIVO"
        subtitle={
          activeSessionSummary?.hasOpenSession
            ? `Caja Abierta desde ${new Date(activeSessionSummary.session.openedAt).toLocaleString()}`
            : 'Caja actualmente Cerrada'
        }
      >
        {activeSessionSummary?.hasOpenSession ? (
          <div className="space-y-6">
            <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
              <div className="bg-surface border border-accent/50 rounded-lg p-3">
                <p className="text-[9px] text-accent font-bold uppercase tracking-wider">CAJERO RESPONSABLE</p>
                <div className="flex items-center gap-1.5 mt-1 text-fg font-semibold text-xs">
                  <UserCheck className="w-4 h-4 text-accent shrink-0" />
                  <span className="truncate">{activeSessionSummary.userName || 'Operador POS'}</span>
                </div>
                {activeSessionSummary.userEmail && (
                  <p className="text-[10px] text-fg-muted truncate mt-0.5">{activeSessionSummary.userEmail}</p>
                )}
              </div>

              <div className="bg-surface border border-line-dim rounded-lg p-3">
                <p className="text-[9px] text-fg-muted font-bold uppercase tracking-wider">BASE INICIAL</p>
                <p className="text-base font-black text-fg mt-1">
                  {formatCOP(activeSessionSummary.openingBase)}
                </p>
              </div>

              <div className="bg-surface border border-line-dim rounded-lg p-3">
                <p className="text-[9px] text-fg-muted font-bold uppercase tracking-wider">EFECTIVO ({activeSessionSummary.cashCount || 0})</p>
                <p className="text-base font-black text-success mt-1">
                  {formatCOP(activeSessionSummary.cashSales)}
                </p>
              </div>

              <div className="bg-surface border border-line-dim rounded-lg p-3">
                <p className="text-[9px] text-fg-muted font-bold uppercase tracking-wider">NEQUI ({activeSessionSummary.nequiCount || 0})</p>
                <p className="text-base font-black text-cyan mt-1">
                  {formatCOP(activeSessionSummary.nequiSales || activeSessionSummary.transferSales)}
                </p>
              </div>

              <div className="bg-surface border border-line-dim rounded-lg p-3">
                <p className="text-[9px] text-fg-muted font-bold uppercase tracking-wider">T. CRÉDITO ({activeSessionSummary.creditCardCount || 0})</p>
                <p className="text-base font-black text-warning mt-1">
                  {formatCOP(activeSessionSummary.creditCardSales || activeSessionSummary.cardSales)}
                </p>
              </div>

              <div className="bg-surface border border-line-dim rounded-lg p-3">
                <p className="text-[9px] text-fg-muted font-bold uppercase tracking-wider">T. DÉBITO ({activeSessionSummary.debitCardCount || 0})</p>
                <p className="text-base font-black text-purple mt-1">
                  {formatCOP(activeSessionSummary.debitCardSales || 0)}
                </p>
              </div>
            </div>

            <div className="bg-surface border border-accent/40 rounded-lg p-3 bg-accent/5 flex items-center justify-between">
              <p className="text-xs text-accent font-bold uppercase tracking-wider">EFECTIVO ESPERADO EN CAJÓN:</p>
              <p className="text-xl font-black text-accent">
                {formatCOP(activeSessionSummary.expectedCash)}
              </p>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-xs bg-night p-3 border border-line-soft rounded">
              <div>
                <span className="text-fg-muted">Cajero Asignado:</span>{' '}
                <span className="font-bold text-accent">{activeSessionSummary.userName || 'Operador POS'}</span>
              </div>
              <div>
                <span className="text-fg-muted">Transacciones:</span>{' '}
                <span className="font-semibold text-fg">{activeSessionSummary.totalSalesCount} ventas</span>
              </div>
              <div>
                <span className="text-fg-muted">Total Facturado:</span>{' '}
                <span className="font-bold text-success">{formatCOP(activeSessionSummary.totalRevenue)}</span>
              </div>
              <div>
                <span className="text-fg-muted">Rango Consecutivos:</span>{' '}
                <span className="font-bold text-cyan">
                  {activeSessionSummary.minTicket > 0 ? `#${activeSessionSummary.minTicket} - #${activeSessionSummary.maxTicket}` : 'Sin ventas'}
                </span>
              </div>
              <div>
                <span className="text-fg-muted">Estado de Sesión:</span>{' '}
                <span className="bg-ok-dim text-success border border-ok-line px-2 py-0.5 rounded text-[10px] font-bold">
                  TURNO ACTIVO
                </span>
              </div>
            </div>
          </div>
        ) : (
          <div className="py-10 text-center space-y-3 bg-night rounded border border-dashed border-line-hover">
            <Lock className="w-10 h-10 text-fg-muted mx-auto" />
            <p className="text-sm font-bold text-fg">LA CAJA SE ENCUENTRA CERRADA</p>
            <p className="text-xs text-fg-muted">
              Inicie un nuevo turno registrando el usuario responsable y el saldo inicial en caja para comenzar a recibir pagos POS.
            </p>
            <TacticalButton variant="primary" size="sm" onClick={() => setIsOpenModalOpen(true)}>
              <Unlock className="w-3.5 h-3.5 mr-1" /> ABRIR CAJA AHORA
            </TacticalButton>
          </div>
        )}
      </SectionPanel>

      {/* HISTORIAL DE CIERRES DIARIOS (REPORTES Z) */}
      <SectionPanel title="HISTORIAL DE CIERRES DE CAJA Y REPORTES Z" subtitle="Registro histórico de arqueos y diferencias">
        <DataTable
          columns={[
            {
              key: 'openedAt',
              header: 'FECHA APERTURA',
              render: (h: any) => new Date(h.openedAt).toLocaleString(),
            },
            {
              key: 'userName',
              header: 'CAJERO / USUARIO',
              cellClassName: 'font-semibold text-accent',
              render: (h: any) => h.userName || h.userId,
            },
            {
              key: 'openingBalance',
              header: 'BASE INICIAL',
              cellClassName: 'text-fg-muted',
              render: (h: any) => formatCOP(h.openingBalance),
            },
            {
              key: 'totalSales',
              header: 'TOTAL VENTAS',
              cellClassName: 'font-bold text-success',
              render: (h: any) => formatCOP(h.totalSales),
            },
            {
              key: 'closingBalance',
              header: 'EFECTIVO CONTADO',
              cellClassName: 'font-semibold text-fg',
              render: (h: any) => (h.closingBalance ? formatCOP(h.closingBalance) : '---'),
            },
            {
              key: 'difference',
              header: 'DIFERENCIA',
              cellClassName: 'font-bold',
              render: (h: any) => {
                const diff = Number(h.difference || 0)
                if (h.status === 'OPEN') return <span className="text-fg-muted">En curso...</span>
                if (diff === 0) return <span className="text-ok">✓ Exacto ($0)</span>
                if (diff > 0) return <span className="text-cyan">Sobrante +{formatCOP(diff)}</span>
                return <span className="text-alert">Faltante -{formatCOP(Math.abs(diff))}</span>
              },
            },
            {
              key: 'status',
              header: 'ESTADO',
              render: (h: any) => (
                <StatusBadge
                  status={h.status === 'OPEN' ? 'online' : 'default'}
                  label={h.status === 'OPEN' ? 'ABIERTA' : 'CERRADA'}
                />
              ),
            },
            {
              key: 'report',
              header: 'REPORTE Z',
              align: 'right',
              render: (h: any) => (
                <TacticalButton
                  variant="secondary"
                  size="sm"
                  onClick={() => handleViewZReport(h.id)}
                >
                  <Eye className="w-3 h-3 mr-1" /> REPORTE Z
                </TacticalButton>
              ),
            },
          ]}
          rows={history}
          rowKey={(h: any) => h.id}
          emptyMessage="[NO HAY HISTORIAL DE CIERRES DE CAJA REGISTRADOS]"
        />
      </SectionPanel>

      {/* MODAL: ABRIR CAJA */}
      {isOpenModalOpen && (
        <Modal
          open={isOpenModalOpen}
          onClose={() => setIsOpenModalOpen(false)}
          title="APERTURA DE TURNO DE CAJA"
          icon={<Unlock className="w-4 h-4" />}
          size="md"
        >
            <form onSubmit={handleOpenSession} className="space-y-4 text-xs">
              <div>
                <Label>USUARIO / CAJERO RESPONSABLE *</Label>
                <Select
                  required
                  value={selectedUserId}
                  onChange={(e) => setSelectedUserId(e.target.value)}
                  className="font-normal font-semibold text-xs"
                >
                  <option value="">-- Seleccionar usuario responsable --</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name} ({u.email}) {u.isCurrent ? '• (Tu usuario actual)' : ''}
                    </option>
                  ))}
                </Select>
                <p className="text-[10px] text-fg-muted mt-1">
                  La caja quedará vinculada legalmente a este usuario para el cuadre y arqueo de turno.
                </p>
              </div>

              <div>
                <Label>BASE INICIAL DE CAJA ($ COP) *</Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-fg-muted">$</span>
                  <Input
                    type="number"
                    required
                    value={openingBalance}
                    onChange={(e) => setOpeningBalance(e.target.value)}
                    className="pl-7 font-bold text-base"
                  />
                </div>
                <p className="text-[10px] text-fg-muted mt-1">
                  Monto en efectivo asignado para dar cambio / vueltas al inicio de la jornada.
                </p>
              </div>

              <div>
                <Label>OBSERVACIONES / NOTAS APERTURA</Label>
                <TextArea
                  rows={2}
                  placeholder="Ej: Turno mañana sucursal principal..."
                  value={openingNotes}
                  onChange={(e) => setOpeningNotes(e.target.value)}
                  className="w-full bg-input border border-line focus:border-accent p-2.5 rounded text-fg"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-line-dim">
                <TacticalButton type="button" variant="secondary" size="sm" onClick={() => setIsOpenModalOpen(false)}>
                  CANCELAR
                </TacticalButton>
                <TacticalButton type="submit" variant="primary" size="sm">
                  ABRIR CAJA AHORA
                </TacticalButton>
              </div>
            </form>
        </Modal>
      )}

      {/* MODAL: EFECTUAR CIERRE Y ARQUEO */}
      {isCloseModalOpen && (
        <Modal
          open={isCloseModalOpen}
          onClose={() => setIsCloseModalOpen(false)}
          title="ARQUEO Y CIERRE DIARIO DE CAJA"
          icon={<Lock className="w-4 h-4" />}
          tone="danger"
          size="lg"
        >
            <form onSubmit={handleCloseSession} className="space-y-4 text-xs">
              <div className="bg-input p-3 rounded border border-line-soft space-y-2">
                <div className="flex justify-between text-fg-muted">
                  <span>Cajero Responsable:</span>
                  <span className="text-accent font-bold">{activeSessionSummary?.userName || 'N/A'}</span>
                </div>
                <div className="flex justify-between text-fg-muted">
                  <span>Base Inicial en Caja:</span>
                  <span className="text-fg font-semibold">{formatCOP(activeSessionSummary?.openingBase)}</span>
                </div>
                <div className="flex justify-between text-fg-muted">
                  <span>Ventas en Efectivo:</span>
                  <span className="text-success font-bold">+{formatCOP(activeSessionSummary?.cashSales)}</span>
                </div>
                <div className="flex justify-between text-fg font-semibold border-t border-line-faint pt-2 text-sm">
                  <span>Efectivo Esperado en Cajón:</span>
                  <span className="text-accent">{formatCOP(activeSessionSummary?.expectedCash)}</span>
                </div>
              </div>

              <div>
                <Label>EFECTIVO FÍSICO CONTADO EN CAJA ($ COP) *</Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-fg-muted">$</span>
                  <input
                    type="number"
                    required
                    value={actualCash}
                    onChange={(e) => setActualCash(e.target.value)}
                    className="w-full bg-input border border-line focus:border-alert p-2.5 pl-7 rounded text-fg font-semibold text-lg"
                  />
                </div>
              </div>

              {/* Resultado Arqueo */}
              <div className={`p-3 rounded border text-xs font-bold flex items-center justify-between ${currentDiff === 0
                ? 'bg-ok-dim border-ok-line text-ok'
                : currentDiff > 0
                  ? 'bg-teal-deep border-teal-line text-cyan'
                  : 'bg-alert-dim border-alert-line text-alert'
                }`}>
                <span>RESULTADO DEL ARQUEO:</span>
                <span>
                  {currentDiff === 0
                    ? '✓ CAJA CUADRADA EXACTA ($0)'
                    : currentDiff > 0
                      ? `SOBRANTE: +${formatCOP(currentDiff)}`
                      : `FALTANTE: -${formatCOP(Math.abs(currentDiff))}`}
                </span>
              </div>

              <div>
                <Label>OBSERVACIONES DE CIERRE</Label>
                <textarea
                  rows={2}
                  placeholder="Notas adicionales sobre el cierre o novedades del turno..."
                  value={closingNotes}
                  onChange={(e) => setClosingNotes(e.target.value)}
                  className="w-full bg-input border border-line focus:border-alert p-2.5 rounded text-fg"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-line-dim">
                <TacticalButton type="button" variant="secondary" size="sm" onClick={() => setIsCloseModalOpen(false)}>
                  CANCELAR
                </TacticalButton>
                <TacticalButton type="submit" variant="danger" size="sm">
                  CERRAR CAJA Y IMPRIMIR Z
                </TacticalButton>
              </div>
            </form>
        </Modal>
      )}

      {/* MODAL: COMPROBANTE INFORME Z IMPRIMIBLE */}
      {isReportModalOpen && selectedZReport && (
        <Modal
          open={isReportModalOpen && !!selectedZReport}
          onClose={() => setIsReportModalOpen(false)}
          title="INFORME DIARIO DE VENTAS // REPORTE Z"
          icon={<FileText className="w-4 h-4" />}
          size="lg"
          actions={
            <TacticalButton variant="primary" size="sm" onClick={() => window.print()}>
              <Printer className="w-3 h-3 mr-1" /> IMPRIMIR Z
            </TacticalButton>
          }
        >
            {/* FORMATO VOUCHER TICKET IMPRIMIBLE */}
            <div id="z-report-printable" className="bg-white text-black p-6 font-mono text-xs space-y-4 rounded shadow">
              <div className="text-center border-b pb-3 border-gray-300">
                <h2 className="font-black text-sm uppercase tracking-wider">
                  {selectedZReport.company?.legalName || 'COMERCIALIZADORA POS RETAIL S.A.S.'}
                </h2>
                <p className="text-[10px]">
                  NIT: {selectedZReport.company?.nit || 'N/A'}
                  {selectedZReport.company?.address
                    ? ` • ${selectedZReport.company.address}${selectedZReport.company.city ? `, ${selectedZReport.company.city}` : ''}`
                    : ''}
                </p>
                <p className="font-bold text-xs mt-2 border-t pt-1 border-gray-300">REPORTE Z — INFORME DIARIO DE VENTAS</p>
                <p className="text-[9px] text-gray-600">Documento de control interno · No reemplaza la factura electrónica DIAN</p>
              </div>

              <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-[11px] border border-gray-300 p-2">
                <div className="flex justify-between">
                  <span>SESIÓN:</span>
                  <span className="font-bold truncate max-w-[140px]">{selectedZReport.session?.id?.slice(0, 8) || 'N/A'}</span>
                </div>
                <div className="flex justify-between">
                  <span>CAJERO:</span>
                  <span className="font-bold truncate max-w-[140px]">{selectedZReport.userName || 'Operador POS'}</span>
                </div>
                <div className="flex justify-between">
                  <span>APERTURA:</span>
                  <span>{selectedZReport.openedAtDisplay || (selectedZReport.session?.openedAt ? new Date(selectedZReport.session.openedAt).toLocaleString() : '—')}</span>
                </div>
                <div className="flex justify-between">
                  <span>CIERRE:</span>
                  <span>{selectedZReport.closedAtDisplay || (selectedZReport.session?.closedAt ? new Date(selectedZReport.session.closedAt).toLocaleString() : 'En curso')}</span>
                </div>
                <div className="flex justify-between">
                  <span>CONSECUTIVOS:</span>
                  <span className="font-bold">#{selectedZReport.minTicket} AL #{selectedZReport.maxTicket}</span>
                </div>
                <div className="flex justify-between">
                  <span>AMBIENTE DIAN:</span>
                  <span className="font-bold uppercase">{selectedZReport.dianEnvironment || 'sandbox'}</span>
                </div>
              </div>

              {/* DISCRIMINADO DE VENTAS */}
              <div className="border-t border-b py-2 border-gray-300 space-y-1">
                <p className="font-bold text-center text-[10px] uppercase">RESUMEN POR MEDIO DE PAGO</p>
                <div className="flex justify-between">
                  <span>Ventas Efectivo ({selectedZReport.cashCount || 0}):</span>
                  <span>{formatCOP(selectedZReport.cashSales)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Ventas Nequi ({selectedZReport.nequiCount || 0}):</span>
                  <span>{formatCOP(selectedZReport.nequiSales || selectedZReport.transferSales)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Ventas Tarjeta Crédito ({selectedZReport.creditCardCount || 0}):</span>
                  <span>{formatCOP(selectedZReport.creditCardSales || selectedZReport.cardSales)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Ventas Tarjeta Débito ({selectedZReport.debitCardCount || 0}):</span>
                  <span>{formatCOP(selectedZReport.debitCardSales || 0)}</span>
                </div>
                <div className="flex justify-between font-bold border-t pt-1 border-gray-200">
                  <span>TOTAL INGRESOS VENTAS:</span>
                  <span>{formatCOP(selectedZReport.totalRevenue)}</span>
                </div>
              </div>

              {/* DISCRIMINADO IMPUESTOS */}
              <div className="border-b pb-2 border-gray-300 space-y-1 text-[10px]">
                <p className="font-bold text-center uppercase">IMPUESTOS Y BASE GRAVABLE</p>
                <div className="flex justify-between">
                  <span>Subtotal Neto (Base):</span>
                  <span>{formatCOP(selectedZReport.totalSubtotal)}</span>
                </div>
                <div className="flex justify-between">
                  <span>IVA 19%:</span>
                  <span>{formatCOP(selectedZReport.tax19)}</span>
                </div>
                <div className="flex justify-between">
                  <span>IVA 5%:</span>
                  <span>{formatCOP(selectedZReport.tax5)}</span>
                </div>
                <div className="flex justify-between font-bold border-t pt-1 border-gray-200">
                  <span>TOTAL IVA RECAUDADO:</span>
                  <span>{formatCOP(selectedZReport.totalTax)}</span>
                </div>
              </div>

              {/* ARQUEO DE CAJA */}
              <div className="space-y-1 border-b pb-2 border-gray-300">
                <p className="font-bold text-center text-[10px] uppercase">ARQUEO FÍSICO Y AUDITORÍA DE CAJA</p>
                <div className="flex justify-between">
                  <span>Base Inicial:</span>
                  <span>{formatCOP(selectedZReport.openingBase)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Efectivo Esperado:</span>
                  <span>{formatCOP(selectedZReport.expectedCash)}</span>
                </div>
                <div className="flex justify-between font-bold">
                  <span>Efectivo Contado:</span>
                  <span>{selectedZReport.closingBalance ? formatCOP(selectedZReport.closingBalance) : '---'}</span>
                </div>
                <div className="flex justify-between font-bold text-xs border-t pt-1 border-gray-300">
                  <span>DIFERENCIA (CUADRE):</span>
                  <span>
                    {selectedZReport.difference !== undefined
                      ? formatCOP(selectedZReport.difference)
                      : '$0'}
                  </span>
                </div>
              </div>

              <div className="text-center text-[9px] text-gray-600 pt-2 space-y-1 border-t border-gray-300">
                <p>TOTAL TRANSACCIONES VINCULADAS: <strong>{selectedZReport.totalSalesCount}</strong></p>
                <div className="flex justify-around pt-6">
                  <div className="text-center border-t border-gray-400 pt-1 w-40">FIRMA CAJERO</div>
                  <div className="text-center border-t border-gray-400 pt-1 w-40">REVISIÓN SUPERVISOR</div>
                </div>
                <p>SOFTWARE POS RETAIL Y DIAN v2.0 • MÓDULO AUDITORÍA DE CIERRES</p>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-line-dim no-print">
              <TacticalButton variant="secondary" size="sm" onClick={() => setIsReportModalOpen(false)}>
                CERRAR
              </TacticalButton>
              <TacticalButton variant="primary" size="sm" onClick={() => window.print()}>
                <Printer className="w-3.5 h-3.5 mr-1" /> IMPRIMIR VOUCHER Z
              </TacticalButton>
            </div>
        </Modal>
      )}
    </div>
  )
}
