'use client'

import { useState, useEffect } from 'react'
import {
  getCurrentCashierSessionSummary,
  openCashierSession,
  closeCashierSession,
  getCashierSessionsHistory,
  getCashierSessionDetails,
  getUsersList,
  getAllLocations,
  registerCashMovement,
} from '@/app/actions/pos-actions'
import { isSessionError, redirectToLogin } from '@/lib/hooks/use-protected-query'
import { formatCOP } from '@/lib/utils/pos-utils'
import { SectionPanel } from '@/components/tactical/SectionPanel'
import { TacticalButton } from '@/components/tactical/TacticalButton'
import { StatusBadge } from '@/components/tactical/StatusBadge'
import { Modal } from '@/components/ui/Modal'
import { DataTable } from '@/components/ui/DataTable'
import { Pagination } from '@/components/tactical/Pagination'
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
  Eye,
  ArrowDownUp } from 'lucide-react'

const HISTORY_PAGE_SIZE = 10

export default function CashierPage() {
  const [, setLoading] = useState(true)
  const { toast } = useToast()
  const [activeSessionSummary, setActiveSessionSummary] = useState<any>(null)
  const [history, setHistory] = useState<any[]>([])
  const [historyPage, setHistoryPage] = useState(1)
  const [users, setUsers] = useState<any[]>([])
  const [locations, setLocations] = useState<any[]>([])
  const [selectedUserId, setSelectedUserId] = useState<string>('')
  const [selectedLocationId, setSelectedLocationId] = useState<string>('')
  const [openOverride, setOpenOverride] = useState(false)
  const [overrideReason, setOverrideReason] = useState('')
  const [closeTarget, setCloseTarget] = useState<any>(null)
  const [consolidationDate, setConsolidationDate] = useState(
    new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' })
  )

  // Modals & Form States
  const [isOpenModalOpen, setIsOpenModalOpen] = useState(false)
  const [isCloseModalOpen, setIsCloseModalOpen] = useState(false)
  const [isReportModalOpen, setIsReportModalOpen] = useState(false)
  const [isMovementModalOpen, setIsMovementModalOpen] = useState(false)
  const [movementType, setMovementType] = useState('EGRESO')
  const [movementConcept, setMovementConcept] = useState('')
  const [movementAmount, setMovementAmount] = useState('')
  const [movementNote, setMovementNote] = useState('')
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
      const [summary, hist, userList, locationList] = await Promise.all([
        getCurrentCashierSessionSummary().catch((err) => {
          if (isSessionError(err)) redirectToLogin()
          return null
        }),
        getCashierSessionsHistory().catch((err) => {
          if (isSessionError(err)) redirectToLogin()
          return []
        }),
        getUsersList().catch(() => []),
        getAllLocations().catch(() => []),
      ])

      setActiveSessionSummary(summary)
      setHistory(hist || [])
      setUsers(userList || [])
      setLocations(locationList || [])

      const current = userList?.find((u: any) => u.isCurrent)
      if (current) {
        setSelectedUserId(current.id)
      } else if (userList && userList.length > 0) {
        setSelectedUserId(userList[0].id)
      }

      const activeLocationId = summary?.session?.locationId
      const firstActiveLocation = locationList?.find((location: any) => location.status === 'ACTIVE')
      setSelectedLocationId(activeLocationId || firstActiveLocation?.id || '')

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
    if (openOverride && overrideReason.trim().length < 5) {
      toast('Debe registrar el motivo de la autorización administrativa.', 'error')
      return
    }
    try {
      const bal = parseFloat(openingBalance) || 0
      await openCashierSession(bal, openingNotes, selectedUserId, {
        locationId: selectedLocationId || undefined,
        ...(openOverride ? { override: { reason: overrideReason } } : {}),
      })
      toast('¡SESIÓN DE CAJA ABIERTA Y ASOCIADA AL USUARIO CON ÉXITO!')
      setIsOpenModalOpen(false)
      setOpenOverride(false)
      setOverrideReason('')
      loadData()
    } catch (err: any) {
      toast(`Error al abrir caja: ${err.message}`, 'error')
    }
  }

  function startCloseSession(summary: any) {
    if (!summary?.session?.id) return
    setCloseTarget(summary)
    setActualCash(String(summary.expectedCash ?? 0))
    setClosingNotes('')
    setIsCloseModalOpen(true)
  }

  async function handleStartCloseSession(sessionId: string) {
    try {
      const details = await getCashierSessionDetails(sessionId)
      startCloseSession(details)
    } catch (err: any) {
      toast(`Error al cargar el turno: ${err.message}`, 'error')
    }
  }

  async function handleCloseSession(e: React.FormEvent) {
    e.preventDefault()
    if (!closeTarget?.session?.id) return

    try {
      const counted = parseFloat(actualCash) || 0
      const res = await closeCashierSession(closeTarget.session.id, counted, closingNotes)
      toast('¡CIERRE DE CAJA REALIZADO Y REPORTE Z GENERADO!')
      setIsCloseModalOpen(false)
      setCloseTarget(null)
      setSelectedZReport(res.zReport)
      setIsReportModalOpen(true)
      loadData()
    } catch (err: any) {
      toast(`Error al cerrar caja: ${err.message}`, 'error')
    }
  }

  async function handleRegisterMovement(e: React.FormEvent) {
    e.preventDefault()
    try {
      await registerCashMovement({
        type: movementType,
        concept: movementConcept,
        amount: parseFloat(movementAmount) || 0,
        note: movementNote,
      })
      toast('MOVIMIENTO DE CAJA REGISTRADO CORRECTAMENTE')
      setIsMovementModalOpen(false)
      setMovementConcept('')
      setMovementAmount('')
      setMovementNote('')
      loadData()
    } catch (err: any) {
      toast(`Error al registrar movimiento: ${err.message}`, 'error')
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

  const currentDiff = closeTarget?.expectedCash !== undefined
    ? (parseFloat(actualCash) || 0) - closeTarget.expectedCash
    : 0

  const totalHistoryPages = Math.max(1, Math.ceil(history.length / HISTORY_PAGE_SIZE))
  const safeHistoryPage = Math.min(historyPage, totalHistoryPages)
  const paginatedHistory = history.slice(
    (safeHistoryPage - 1) * HISTORY_PAGE_SIZE,
    safeHistoryPage * HISTORY_PAGE_SIZE
  )

  const todayBusinessDate = new Date().toLocaleDateString('en-CA', {
    timeZone: 'America/Bogota',
  })
  const currentUser = users.find((user: any) => user.isCurrent)
  const isAdmin = currentUser?.role === 'ADMIN'
  const selectedUserOpenSessions = history.filter(
    (session: any) =>
      session.userId === selectedUserId &&
      session.status === 'OPEN' &&
      session.businessDate < todayBusinessDate
  )
  const pendingOpenSessions = history
    .filter(
      (session: any) => session.status === 'OPEN' && session.businessDate < todayBusinessDate
    )
    .sort(
      (a: any, b: any) =>
        a.businessDate.localeCompare(b.businessDate) ||
        new Date(a.openedAt).getTime() - new Date(b.openedAt).getTime()
    )

  const consolidationSessions = history.filter(
    (session: any) => session.businessDate === consolidationDate
  )
  const consolidation = consolidationSessions.reduce(
    (acc: any, session: any) => ({
      sessions: acc.sessions + 1,
      open: acc.open + (session.status === 'OPEN' ? 1 : 0),
      salesCount: acc.salesCount + Number(session.salesCount || 0),
      totalSales: acc.totalSales + Number(session.totalSales || 0),
      cashSales: acc.cashSales + Number(session.cashSales || 0),
      cardSales: acc.cardSales + Number(session.cardSales || 0),
      transferSales: acc.transferSales + Number(session.transferSales || 0),
      creditSales: acc.creditSales + Number(session.creditSales || 0),
    }),
    {
      sessions: 0,
      open: 0,
      salesCount: 0,
      totalSales: 0,
      cashSales: 0,
      cardSales: 0,
      transferSales: 0,
      creditSales: 0,
    }
  )

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
            <>
              <TacticalButton variant="secondary" size="sm" onClick={() => setIsMovementModalOpen(true)}>
                <ArrowDownUp className="w-3.5 h-3.5 mr-1" /> MOVIMIENTO DE CAJA
              </TacticalButton>
              <TacticalButton
                variant="danger"
                size="sm"
                onClick={() => startCloseSession(activeSessionSummary)}
              >
                <Lock className="w-3.5 h-3.5 mr-1" /> EFECTUAR CIERRE DE CAJA (Z)
              </TacticalButton>
            </>
          ) : (
            <TacticalButton variant="primary" size="sm" onClick={() => setIsOpenModalOpen(true)}>
              <Unlock className="w-3.5 h-3.5 mr-1" /> ABRIR NUEVO TURNO / CAJA
            </TacticalButton>
          )}
        </div>
      </div>

      {/* BANNER DE TURNOS ANTERIORES PENDIENTES DE CIERRE */}
      {pendingOpenSessions.length > 0 && (
        <div className="bg-danger-dim border-2 border-alert rounded-lg p-4 text-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-red-soft shadow-xl">
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-6 h-6 text-alert shrink-0" />
            <div>
              <h4 className="font-bold text-sm text-alert uppercase tracking-wider">
                ATENCIÓN: {pendingOpenSessions.length} TURNO(S) PENDIENTE(S) DE CIERRE
              </h4>
              <p className="text-xs text-fg mt-0.5">
                Cierre cada turno desde el historial. Las fechas y horas reales del cierre
                quedan registradas al momento del arqueo, sin modificar las ventas.
              </p>
            </div>
          </div>
          <TacticalButton
            variant="danger"
            size="sm"
            onClick={() => handleStartCloseSession(pendingOpenSessions[0].id)}
          >
            CERRAR EL MÁS ANTIGUO &gt;
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
                <p className="text-[9px] text-fg-muted font-bold uppercase tracking-wider">TRANSFERENCIAS</p>
                <p className="text-base font-black text-cyan mt-1">
                  {formatCOP(activeSessionSummary.transferSales || 0)}
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

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-[10px] bg-night p-3 border border-line-soft rounded">
              <div>
                <span className="text-fg-muted">Ingresos caja:</span>{' '}
                <span className="font-bold text-success">+{formatCOP(activeSessionSummary.cashIncome || 0)}</span>
              </div>
              <div>
                <span className="text-fg-muted">Egresos:</span>{' '}
                <span className="font-bold text-alert">-{formatCOP(activeSessionSummary.cashExpenses || 0)}</span>
              </div>
              <div>
                <span className="text-fg-muted">Retiros:</span>{' '}
                <span className="font-bold text-alert">-{formatCOP(activeSessionSummary.cashWithdrawals || 0)}</span>
              </div>
              <div>
                <span className="text-fg-muted">Devoluciones:</span>{' '}
                <span className="font-bold text-alert">-{formatCOP(activeSessionSummary.cashRefunds || 0)}</span>
              </div>
            </div>

            {activeSessionSummary.unclassifiedSales > 0 && (
              <div className="bg-alert-dim border border-alert-line rounded-lg p-3 text-[10px] text-alert">
                ATENCIÓN: {activeSessionSummary.unclassifiedSales} venta(s) por{' '}
                {formatCOP(activeSessionSummary.unclassifiedAmount || 0)} no tienen un pago
                procesado asociado; no se suman al efectivo esperado.
              </div>
            )}

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

      {/* CONSOLIDADO DIARIO POR FECHA DE NEGOCIO */}
      <SectionPanel
        title="CONSOLIDADO DIARIO // TURNOS DEL DÍA"
        subtitle="Suma de todos los turnos registrados para la fecha de negocio"
      >
        <div className="flex flex-col sm:flex-row sm:items-end gap-3 mb-4">
          <div>
            <Label>FECHA DE NEGOCIO</Label>
            <Input
              type="date"
              value={consolidationDate}
              onChange={(e) => setConsolidationDate(e.target.value)}
              className="w-full sm:w-48"
            />
          </div>
          <p className="text-[10px] text-fg-muted pb-2">
            {consolidation.sessions} turno(s) · {consolidation.open} sin cerrar
          </p>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="bg-surface border border-line-dim rounded-lg p-3">
            <p className="text-[9px] text-fg-muted font-bold uppercase tracking-wider">VENTAS DEL DÍA</p>
            <p className="text-base font-black text-success mt-1">
              {formatCOP(consolidation.totalSales)}
            </p>
            <p className="text-[10px] text-fg-muted">{consolidation.salesCount} ventas</p>
          </div>
          <div className="bg-surface border border-line-dim rounded-lg p-3">
            <p className="text-[9px] text-fg-muted font-bold uppercase tracking-wider">EFECTIVO</p>
            <p className="text-base font-black text-fg mt-1">
              {formatCOP(consolidation.cashSales)}
            </p>
          </div>
          <div className="bg-surface border border-line-dim rounded-lg p-3">
            <p className="text-[9px] text-fg-muted font-bold uppercase tracking-wider">TARJETA / TRANSFERENCIA</p>
            <p className="text-base font-black text-fg mt-1">
              {formatCOP(consolidation.cardSales + consolidation.transferSales)}
            </p>
          </div>
          <div className="bg-surface border border-line-dim rounded-lg p-3">
            <p className="text-[9px] text-fg-muted font-bold uppercase tracking-wider">CRÉDITO</p>
            <p className="text-base font-black text-fg mt-1">
              {formatCOP(consolidation.creditSales)}
            </p>
          </div>
        </div>
        {consolidation.open > 0 && (
          <p className="text-[10px] text-alert mt-3">
            Hay turnos abiertos en esta fecha: sus totales se consolidan definitivamente al
            realizar el cierre de cada turno.
          </p>
        )}
      </SectionPanel>

      {/* HISTORIAL DE CIERRES DIARIOS (REPORTES Z) */}
      <SectionPanel title="HISTORIAL DE CIERRES DE CAJA Y REPORTES Z" subtitle="Registro histórico de arqueos y diferencias">
        <DataTable
          columns={[
            {
              key: 'businessDate',
              header: 'FECHA NEGOCIO',
              render: (h: any) =>
                h.businessDate
                  ? new Date(`${h.businessDate}T12:00:00`).toLocaleDateString('es-CO')
                  : '---',
            },
            {
              key: 'openedAt',
              header: 'APERTURA / SEDE',
              render: (h: any) => (
                <div>
                  <div>{new Date(h.openedAt).toLocaleString()}</div>
                  <div className="text-[10px] text-fg-muted">{h.locationName || '---'}</div>
                </div>
              ),
            },
            {
              key: 'userName',
              header: 'CAJERO / USUARIO',
              cellClassName: 'font-semibold text-accent',
              render: (h: any) => (
                <div>
                  <div>{h.userName || h.userId}</div>
                  {h.isOverride && (
                    <div className="text-[10px] text-alert" title={h.overrideReason || ''}>
                      EXCEPCIÓN AUTORIZADA
                    </div>
                  )}
                </div>
              ),
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
              render: (h: any) => {
                const isPending =
                  h.status === 'OPEN' && h.businessDate < todayBusinessDate
                return (
                  <StatusBadge
                    status={isPending ? 'warning' : h.status === 'OPEN' ? 'online' : 'default'}
                    label={isPending ? 'PENDIENTE' : h.status === 'OPEN' ? 'ABIERTA' : 'CERRADA'}
                  />
                )
              },
            },
            {
              key: 'report',
              header: 'ACCIONES',
              align: 'right',
              render: (h: any) => (
                <div className="flex items-center justify-end gap-2">
                  <TacticalButton
                    variant="secondary"
                    size="sm"
                    onClick={() => handleViewZReport(h.id)}
                  >
                    <Eye className="w-3 h-3 mr-1" /> REPORTE Z
                  </TacticalButton>
                  {h.status === 'OPEN' && (
                    <TacticalButton
                      variant="danger"
                      size="sm"
                      onClick={() => handleStartCloseSession(h.id)}
                    >
                      <Lock className="w-3 h-3 mr-1" /> CERRAR
                    </TacticalButton>
                  )}
                </div>
              ),
            },
          ]}
          rows={paginatedHistory}
          rowKey={(h: any) => h.id}
          emptyMessage="[NO HAY HISTORIAL DE CIERRES DE CAJA REGISTRADOS]"
        />

        <div className="mt-3">
          <Pagination
            currentPage={safeHistoryPage}
            totalPages={totalHistoryPages}
            totalItems={history.length}
            itemsPerPage={HISTORY_PAGE_SIZE}
            onPageChange={setHistoryPage}
          />
        </div>
      </SectionPanel>

      {/* MODAL: ABRIR CAJA */}
      {isOpenModalOpen && (
        <Modal
          open={isOpenModalOpen}
          onClose={() => {
            setIsOpenModalOpen(false)
            setOpenOverride(false)
            setOverrideReason('')
          }}
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
                  onChange={(e) => {
                    setSelectedUserId(e.target.value)
                    setOpenOverride(false)
                    setOverrideReason('')
                  }}
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
                <Label>SEDE / CAJA FÍSICA</Label>
                <Select
                  value={selectedLocationId}
                  onChange={(e) => setSelectedLocationId(e.target.value)}
                  className="font-normal font-semibold text-xs"
                >
                  <option value="">-- Sede activa predeterminada --</option>
                  {locations
                    .filter((location: any) => location.status === 'ACTIVE')
                    .map((location: any) => (
                      <option key={location.id} value={location.id}>
                        {location.name}
                      </option>
                    ))}
                </Select>
                <p className="text-[10px] text-fg-muted mt-1">
                  Un usuario no puede tener dos turnos abiertos sobre la misma caja.
                </p>
              </div>

              {selectedUserOpenSessions.length > 0 && (
                <div className="bg-danger-dim border border-alert rounded-lg p-3 space-y-3">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 text-alert shrink-0 mt-0.5" />
                    <div>
                      <p className="font-bold text-alert uppercase tracking-wider">
                        TURNO ANTERIOR PENDIENTE DE CIERRE
                      </p>
                      <p className="text-[10px] text-fg mt-1">
                        El usuario tiene {selectedUserOpenSessions.length} turno(s) abierto(s).
                        Lo normal es cerrarlo antes de abrir uno nuevo. La apertura excepcional
                        requiere autorización de un administrador y queda auditada.
                      </p>
                    </div>
                  </div>
                  {isAdmin ? (
                    <label className="flex items-center gap-2 text-[11px] text-fg cursor-pointer">
                      <input
                        type="checkbox"
                        checked={openOverride}
                        onChange={(e) => setOpenOverride(e.target.checked)}
                        className="accent-alert"
                      />
                      Autorizar apertura excepcional sin cerrar el turno pendiente
                    </label>
                  ) : (
                    <p className="text-[10px] text-alert font-bold">
                      Solicite a un administrador para operar sin cerrar el turno pendiente.
                    </p>
                  )}
                  {isAdmin && openOverride && (
                    <div>
                      <Label>MOTIVO DE LA AUTORIZACIÓN *</Label>
                      <TextArea
                        rows={2}
                        required
                        placeholder="Ej: Continuidad operativa autorizada por gerencia..."
                        value={overrideReason}
                        onChange={(e) => setOverrideReason(e.target.value)}
                        className="w-full bg-input border border-line focus:border-accent p-2.5 rounded text-fg"
                      />
                    </div>
                  )}
                </div>
              )}

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
                <TacticalButton
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setIsOpenModalOpen(false)
                    setOpenOverride(false)
                    setOverrideReason('')
                  }}
                >
                  CANCELAR
                </TacticalButton>
                <TacticalButton type="submit" variant="primary" size="sm">
                  ABRIR CAJA AHORA
                </TacticalButton>
              </div>
            </form>
        </Modal>
      )}

      {/* MODAL: MOVIMIENTO DE CAJA */}
      {isMovementModalOpen && (
        <Modal
          open={isMovementModalOpen}
          onClose={() => setIsMovementModalOpen(false)}
          title="MOVIMIENTO MANUAL DE CAJA"
          icon={<ArrowDownUp className="w-4 h-4" />}
          size="md"
        >
          <form onSubmit={handleRegisterMovement} className="space-y-4 text-xs">
            <div>
              <Label>TIPO DE MOVIMIENTO *</Label>
              <Select
                required
                value={movementType}
                onChange={(e) => setMovementType(e.target.value)}
              >
                <option value="INGRESO">INGRESO DE EFECTIVO</option>
                <option value="EGRESO">EGRESO / GASTO</option>
                <option value="RETIRO">RETIRO / TRASLADO</option>
                <option value="DEVOLUCION">DEVOLUCIÓN A CLIENTE</option>
              </Select>
              <p className="text-[10px] text-fg-muted mt-1">
                El ingreso suma al efectivo esperado; egresos, retiros y devoluciones lo reducen.
              </p>
            </div>

            <div>
              <Label>CONCEPTO *</Label>
              <Input
                required
                maxLength={160}
                value={movementConcept}
                onChange={(e) => setMovementConcept(e.target.value)}
                placeholder="Ej: Pago proveedor, retiro a bóveda, devolución ticket..."
              />
            </div>

            <div>
              <Label>VALOR ($ COP) *</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-fg-muted">$</span>
                <Input
                  type="number"
                  min="0.01"
                  step="0.01"
                  required
                  value={movementAmount}
                  onChange={(e) => setMovementAmount(e.target.value)}
                  className="pl-7 font-bold text-base"
                />
              </div>
            </div>

            <div>
              <Label>NOTA / SOPORTE</Label>
              <TextArea
                rows={2}
                value={movementNote}
                onChange={(e) => setMovementNote(e.target.value)}
                placeholder="Número de comprobante, autorización o detalle..."
              />
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-line-dim">
              <TacticalButton type="button" variant="secondary" size="sm" onClick={() => setIsMovementModalOpen(false)}>
                CANCELAR
              </TacticalButton>
              <TacticalButton type="submit" variant="primary" size="sm">
                REGISTRAR MOVIMIENTO
              </TacticalButton>
            </div>
          </form>
        </Modal>
      )}

      {/* MODAL: EFECTUAR CIERRE Y ARQUEO */}
      {isCloseModalOpen && (
        <Modal
          open={isCloseModalOpen}
          onClose={() => {
            setIsCloseModalOpen(false)
            setCloseTarget(null)
          }}
          title="ARQUEO Y CIERRE DE TURNO DE CAJA"
          icon={<Lock className="w-4 h-4" />}
          tone="danger"
          size="lg"
        >
            <form onSubmit={handleCloseSession} className="space-y-4 text-xs">
              <div className="bg-input p-3 rounded border border-line-soft space-y-2">
                <div className="flex justify-between text-fg-muted">
                  <span>Fecha de negocio / apertura:</span>
                  <span className="text-fg font-semibold">
                    {closeTarget?.businessDate || '---'} ·{' '}
                    {closeTarget?.session?.openedAt
                      ? new Date(closeTarget.session.openedAt).toLocaleString()
                      : '---'}
                  </span>
                </div>
                <div className="flex justify-between text-fg-muted">
                  <span>Cajero Responsable:</span>
                  <span className="text-accent font-bold">{closeTarget?.userName || 'N/A'}</span>
                </div>
                <div className="flex justify-between text-fg-muted">
                  <span>Base Inicial en Caja:</span>
                  <span className="text-fg font-semibold">{formatCOP(closeTarget?.openingBase)}</span>
                </div>
                <div className="flex justify-between text-fg-muted">
                  <span>Ventas en Efectivo:</span>
                  <span className="text-success font-bold">+{formatCOP(closeTarget?.cashSales)}</span>
                </div>
                <div className="flex justify-between text-fg-muted">
                  <span>Ingresos manuales:</span>
                  <span className="text-success font-bold">+{formatCOP(closeTarget?.cashIncome || 0)}</span>
                </div>
                <div className="flex justify-between text-fg-muted">
                  <span>Egresos / retiros / devoluciones:</span>
                  <span className="text-alert font-bold">-{formatCOP((closeTarget?.cashExpenses || 0) + (closeTarget?.cashWithdrawals || 0) + (closeTarget?.cashRefunds || 0))}</span>
                </div>
                <div className="flex justify-between text-fg font-semibold border-t border-line-faint pt-2 text-sm">
                  <span>Efectivo Esperado en Cajón:</span>
                  <span className="text-accent">{formatCOP(closeTarget?.expectedCash)}</span>
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
                <TacticalButton
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setIsCloseModalOpen(false)
                    setCloseTarget(null)
                  }}
                >
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
                  <span>Transferencias / Nequi:</span>
                  <span>{formatCOP(selectedZReport.transferSales || 0)}</span>
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
                  <span>Ventas Efectivo:</span>
                  <span>{formatCOP(selectedZReport.cashSales)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Ingresos Manuales:</span>
                  <span>{formatCOP(selectedZReport.cashIncome || 0)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Egresos / Retiros / Devoluciones:</span>
                  <span>
                    -{formatCOP(
                      (selectedZReport.cashExpenses || 0) +
                      (selectedZReport.cashWithdrawals || 0) +
                      (selectedZReport.cashRefunds || 0)
                    )}
                  </span>
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
