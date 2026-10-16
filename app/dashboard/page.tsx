import { auth } from '@/lib/auth'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { and, eq, gte, lte, desc } from 'drizzle-orm'
import {
  ShoppingCart,
  Package,
  BarChart3,
  Settings,
  Users,
  Terminal,
  ArrowUpRight,
  Wallet,
  Wallet as WalletIcon,
  Database,
  Cpu,
  Radio,
  AlertTriangle,
  Boxes,
  Tags,
  UserCheck,
  Activity,
  CircleDollarSign,
  Banknote,
  ShieldCheck } from 'lucide-react'
import { StatusBadge } from '@/components/tactical/StatusBadge'
import { SectionPanel } from '@/components/tactical/SectionPanel'
import { ActivityLog } from '@/components/tactical/ActivityLog'
import { MetricCard } from '@/components/tactical/MetricCard'
import { db } from '@/lib/db'
import * as schema from '@/lib/db/schema'
import { getTelemetryLogs } from '@/app/actions/pos-actions'
import { formatCOP } from '@/lib/utils/pos-utils'
import { todayRange } from '@/lib/utils/date-ranges'
import { formatTrend } from '@/lib/utils/format'

async function getDashboardSummary(userId: string, tenantId: string) {
  const { start, end } = todayRange()

  // Ventas de hoy
  const todaySales = await db
    .select({
      id: schema.sale.id,
      total: schema.sale.total,
    })
    .from(schema.sale)
    .where(
      and(
        eq(schema.sale.tenantId, tenantId),
        eq(schema.sale.status, 'COMPLETED'),
        gte(schema.sale.createdAt, start),
        lte(schema.sale.createdAt, end)
      )
    )

  const todayRevenue = todaySales.reduce((acc, s) => acc + Number(s.total || 0), 0)
  const todayCount = todaySales.length
  const avgTicket = todayCount > 0 ? todayRevenue / todayCount : 0

  // Ventas de ayer (para comparar tendencia)
  const yesterdayStart = new Date(start)
  yesterdayStart.setDate(yesterdayStart.getDate() - 1)
  const yesterdayEnd = new Date(end)
  yesterdayEnd.setDate(yesterdayEnd.getDate() - 1)
  const yesterdaySales = await db
    .select({ total: schema.sale.total })
    .from(schema.sale)
    .where(
      and(
        eq(schema.sale.tenantId, tenantId),
        eq(schema.sale.status, 'COMPLETED'),
        gte(schema.sale.createdAt, yesterdayStart),
        lte(schema.sale.createdAt, yesterdayEnd)
      )
    )
  const yesterdayRevenue = yesterdaySales.reduce((acc, s) => acc + Number(s.total || 0), 0)
  const trendVsYesterday =
    yesterdayRevenue > 0 ? ((todayRevenue - yesterdayRevenue) / yesterdayRevenue) * 100 : 0

  // Caja abierta
  const openSessions = await db
    .select({
      id: schema.cashierSession.id,
      openedAt: schema.cashierSession.openedAt,
      totalSales: schema.cashierSession.totalSales,
    })
    .from(schema.cashierSession)
    .where(
      and(
        eq(schema.cashierSession.tenantId, tenantId),
        eq(schema.cashierSession.status, 'OPEN')
      )
    )

  // Productos
  const products = await db
    .select({
      id: schema.product.id,
      status: schema.product.status,
    })
    .from(schema.product)
    .where(eq(schema.product.tenantId, tenantId))
  const activeProducts = products.filter((p) => p.status === 'ACTIVE').length

  // Stock bajo
  const lowStockRows = await db
    .select({
      id: schema.inventory.id,
      quantity: schema.inventory.quantity,
    })
    .from(schema.inventory)
    .where(eq(schema.inventory.tenantId, tenantId))
  const lowStockCount = lowStockRows.filter((s) => Number(s.quantity || 0) < 10).length

  // Clientes
  const customers = await db
    .select({ id: schema.customer.id })
    .from(schema.customer)
    .where(eq(schema.customer.tenantId, tenantId))
  const activeCustomers = customers.length

  // Categorías
  const categories = await db
    .select({ id: schema.productCategory.id })
    .from(schema.productCategory)
    .where(eq(schema.productCategory.tenantId, tenantId))

  // Clientes en mora
  const overdueInvoices = await db
    .select({ id: schema.customerCreditTransaction.id })
    .from(schema.customerCreditTransaction)
    .where(
      and(
        eq(schema.customerCreditTransaction.tenantId, tenantId),
        eq(schema.customerCreditTransaction.status, 'VENCIDO')
      )
    )
  const overdueCount = overdueInvoices.length

  // Últimas ventas
  const recentSales = await db
    .select({
      id: schema.sale.id,
      ticketNumber: schema.sale.ticketNumber,
      total: schema.sale.total,
      customerName: schema.sale.customerName,
      createdAt: schema.sale.createdAt,
    })
    .from(schema.sale)
    .where(eq(schema.sale.tenantId, tenantId))
    .orderBy(desc(schema.sale.createdAt))
    .limit(5)

  return {
    todayRevenue,
    todayCount,
    avgTicket,
    trendVsYesterday,
    openSessions: openSessions.length,
    openSessionData: openSessions[0],
    activeProducts,
    lowStockCount,
    activeCustomers,
    activeCategories: categories.length,
    overdueCount,
    recentSales,
  }
}

export default async function DashboardPage() {
  const session = await auth.api.getSession({ headers: await headers() })

  if (!session?.user) {
    redirect('/login')
  }

  const tenantId = (session.user as any).tenantId || 'tenant_default'

  const [stats, telemetryLogs] = await Promise.all([
    getDashboardSummary(session.user.id, tenantId),
    getTelemetryLogs().catch(() => []),
  ])

  const modules = [
    {
      title: 'Punto de Venta',
      short: 'POS',
      subtitle: 'Terminal de caja y facturación',
      href: '/dashboard/pos',
      icon: ShoppingCart,
      tag: 'OPERATIVO',
      color: '#FF6A00',
    },
    {
      title: 'Cajas',
      short: 'CAJ',
      subtitle: 'Sesiones, cierres Z y movimientos',
      href: '/dashboard/cashier',
      icon: Wallet,
      tag: 'CAJA',
      color: '#10B981',
    },
    {
      title: 'Inventario',
      short: 'INV',
      subtitle: 'Stock, kardex y proveedores',
      href: '/dashboard/inventory',
      icon: Package,
      tag: 'STOCK',
      color: '#3B82F6',
    },
    {
      title: 'Categorías',
      short: 'CAT',
      subtitle: 'Taxonomía del catálogo',
      href: '/dashboard/categories',
      icon: Tags,
      tag: 'TAXON',
      color: '#A855F7',
    },
    {
      title: 'Clientes',
      short: 'CLI',
      subtitle: 'CRM, crédito y cartera',
      href: '/dashboard/customers',
      icon: UserCheck,
      tag: 'CRM',
      color: '#EC4899',
    },
    {
      title: 'Reportes',
      short: 'REP',
      subtitle: 'Analítica fiscal y financiera',
      href: '/dashboard/reports',
      icon: BarChart3,
      tag: 'BI',
      color: '#06B6D4',
    },
    {
      title: 'Configuración',
      short: 'CFG',
      subtitle: 'Empresa, ubicaciones y resoluciones',
      href: '/dashboard/settings',
      icon: Settings,
      tag: 'SYS',
      color: '#F59E0B',
    },
    {
      title: 'Usuarios',
      short: 'USR',
      subtitle: 'IAM, roles y permisos',
      href: '/dashboard/users',
      icon: Users,
      tag: 'IAM',
      color: '#FF3B4D',
    },
  ]

  return (
    <div className="w-full space-y-6 font-mono">
      {/* HEADER */}
      <div className="relative overflow-hidden bg-gradient-to-r from-panel via-veil to-ember border border-line-hover rounded-[8px] p-5 sm:p-6 shadow-xl border-l-4 border-l-accent">
        <div className="absolute top-0 right-0 p-4 opacity-[0.07] pointer-events-none">
          <Terminal className="w-56 h-56 text-accent" />
        </div>
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge status="online" label="SOC COMMAND ONLINE" showPulse />
              <span className="font-mono text-[10px] text-fg-muted bg-sidebar px-2 py-0.5 rounded border border-line-dim">
                SESIÓN: {session.user.id.substring(0, 8).toUpperCase()}...
              </span>
              <span className="font-mono text-[10px] text-success bg-ok-dim px-2 py-0.5 rounded border border-ok-line">
                v1.0.4-TACTICAL
              </span>
            </div>
            <h1 className="font-mono text-xl sm:text-2xl font-extrabold tracking-tight text-white uppercase">
              COMMAND CENTER <span className="text-accent">//</span> PANEL OPERATIVO
            </h1>
            <p className="text-xs text-fg-soft font-sans">
              <strong className="text-white">{session.user.name || session.user.email}</strong>
              <span className="text-fg-faint"> · </span>
              <span>{session.user.email}</span>
            </p>
          </div>
          <div className="flex items-center gap-2 text-[10px]">
            <div className="flex items-center gap-1.5 text-fg-muted bg-sidebar px-2.5 py-1.5 rounded border border-line-dim">
              <Database className="w-3 h-3 text-ok" />
              <span>POSTGRES LOCAL</span>
            </div>
            <div className="flex items-center gap-1.5 text-fg-muted bg-sidebar px-2.5 py-1.5 rounded border border-line-dim">
              <Cpu className="w-3 h-3 text-accent" />
              <span>REDIS OFFLINE</span>
            </div>
          </div>
        </div>
      </div>

      {/* KPIs PRINCIPALES */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <MetricCard
          icon={<CircleDollarSign className="w-4 h-4" />}
          title="VENTAS HOY"
          value={formatCOP(stats.todayRevenue)}
          subtext={`${stats.todayCount} ventas · ticket prom. ${formatCOP(stats.avgTicket)}`}
          trend={formatTrend(stats.trendVsYesterday)}
          trendType={stats.trendVsYesterday >= 0 ? 'positive' : 'negative'}
          trendDirection={stats.trendVsYesterday >= 0 ? 'up' : 'down'}
          accentColor="orange"
          accentValue
        />
        <MetricCard
          icon={
            stats.openSessions > 0 ? (
              <WalletIcon className="w-4 h-4" />
            ) : (
              <Banknote className="w-4 h-4" />
            )
          }
          title="CAJA"
          value={stats.openSessions > 0 ? 'ABIERTA' : 'CERRADA'}
          subtext={
            stats.openSessions > 0
              ? `Ventas: ${formatCOP(Number(stats.openSessionData?.totalSales || 0))}`
              : 'Abre una sesión para vender'
          }
          trend={stats.openSessions > 0 ? 'OPERATIVA' : 'INACTIVA'}
          trendType={stats.openSessions > 0 ? 'positive' : 'negative'}
          trendDirection={stats.openSessions > 0 ? 'up' : 'down'}
          accentColor={stats.openSessions > 0 ? 'green' : 'neutral'}
          accentValue
          action={
            stats.openSessions > 0 ? (
              <Link
                href="/dashboard/cashier"
                className="text-[10px] text-accent hover:underline uppercase font-bold"
              >
                Ver cierre →
              </Link>
            ) : (
              <Link
                href="/dashboard/pos"
                className="text-[10px] text-ok hover:underline uppercase font-bold"
              >
                Abrir POS →
              </Link>
            )
          }
        />
        <MetricCard
          icon={<Boxes className="w-4 h-4" />}
          title="PRODUCTOS"
          value={stats.activeProducts.toString()}
          subtext={`${stats.lowStockCount} con stock bajo · ${stats.activeCategories} categorías`}
          trend={stats.lowStockCount === 0 ? 'SIN ALERTAS' : `${stats.lowStockCount} BAJOS`}
          trendType={stats.lowStockCount === 0 ? 'positive' : 'negative'}
          trendDirection={stats.lowStockCount === 0 ? 'up' : 'down'}
          accentColor={stats.lowStockCount === 0 ? 'green' : 'red'}
          accentValue
          action={
            <Link
              href="/dashboard/inventory"
              className="text-[10px] text-accent hover:underline uppercase font-bold"
            >
              Gestionar →
            </Link>
          }
        />
        <MetricCard
          icon={<UserCheck className="w-4 h-4" />}
          title="CLIENTES"
          value={stats.activeCustomers.toString()}
          subtext={
            stats.overdueCount > 0
              ? `${stats.overdueCount} con mora activa`
              : 'Cartera al día'
          }
          trend={stats.overdueCount > 0 ? 'REQUIERE ATENCIÓN' : 'AL DÍA'}
          trendType={stats.overdueCount === 0 ? 'positive' : 'negative'}
          trendDirection={stats.overdueCount === 0 ? 'up' : 'down'}
          accentColor={stats.overdueCount === 0 ? 'green' : 'red'}
          accentValue
          action={
            <Link
              href="/dashboard/customers"
              className="text-[10px] text-accent hover:underline uppercase font-bold"
            >
              Ver cartera →
            </Link>
          }
        />
      </div>
      {/* MÓDULOS PRINCIPALES */}
      <SectionPanel
        title="MÓDULOS DEL SISTEMA"
        subtitle={`${modules.length} SUBSISTEMAS · ACCESO RÁPIDO A TODAS LAS ÁREAS`}
        statusSlot={
          <span className="text-[10px] text-ok bg-ok-dim border border-ok-line px-2 py-0.5 rounded font-bold uppercase flex items-center gap-1">
            <Activity className="w-3 h-3" />
            {modules.length} ACTIVOS
          </span>
        }
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {modules.map((mod) => {
            const Icon = mod.icon
            return (
              <Link key={mod.href} href={mod.href} className="group block">
                <div
                  className="bg-input border border-line-soft rounded-[6px] p-3.5 transition-all duration-150 hover:border-[var(--accent)] hover:shadow-[0_0_18px_rgba(0,0,0,0.4)] relative overflow-hidden"
                  style={{ ['--accent' as any]: mod.color }}
                >
                  <div
                    className="absolute top-0 left-0 right-0 h-0.5 opacity-60 group-hover:h-1 transition-all"
                    style={{ backgroundColor: mod.color }}
                  />
                  <div className="flex items-start justify-between mb-2.5">
                    <div
                      className="w-9 h-9 rounded-[5px] flex items-center justify-center shrink-0"
                      style={{
                        backgroundColor: `${mod.color}15`,
                        border: `1px solid ${mod.color}40`,
                        color: mod.color,
                      }}
                    >
                      <Icon className="w-4 h-4" />
                    </div>
                    <ArrowUpRight className="w-3.5 h-3.5 text-fg-faint group-hover:text-accent transition-colors shrink-0" />
                  </div>
                  <h3 className="font-mono text-xs font-bold text-white group-hover:text-accent transition-colors leading-tight line-clamp-1">
                    {mod.title}
                  </h3>
                  <p className="font-mono text-[10px] text-fg-muted leading-snug mt-1 line-clamp-2">
                    {mod.subtitle}
                  </p>
                </div>
              </Link>
            )
          })}
        </div>
      </SectionPanel>

      {/* ACTIVIDAD + ÚLTIMAS VENTAS */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Telemetría */}
        <div className="xl:col-span-2">
          <SectionPanel
            title="TELEMETRÍA EN VIVO"
            subtitle="AUDITORÍA DE SERVICIOS Y STREAM DE EVENTOS"
            statusSlot={
              <StatusBadge status="online" label="LIVE" showPulse />
            }
          >
            <ActivityLog logs={telemetryLogs.slice(0, 8)} />
          </SectionPanel>
        </div>

        {/* Últimas ventas */}
        <SectionPanel
          title="ÚLTIMAS VENTAS"
          subtitle="MOVIMIENTO EN TIEMPO REAL"
          statusSlot={<Radio className="w-4 h-4 text-accent" />}
          contentClassName="space-y-2"
        >
          {stats.recentSales.length === 0 ? (
            <div className="py-8 text-center text-fg-muted text-xs">
              [NO HAY VENTAS REGISTRADAS AÚN]
            </div>
          ) : (
            stats.recentSales.map((sale) => (
              <div
                key={sale.id}
                className="bg-surface border border-line-soft rounded p-2.5 flex items-center justify-between gap-2 hover:border-blue transition-colors"
              >
                <div className="min-w-0 flex-1">
                  <div className="font-mono text-[10px] text-accent font-bold uppercase">
                    #{String(sale.ticketNumber ?? sale.id.substring(0, 6)).padStart(4, '0')}
                  </div>
                  <div className="font-mono text-[10px] text-fg-muted truncate">
                    {sale.customerName?.trim() || 'Consumidor Final'}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="font-mono text-xs font-bold text-success">
                    {formatCOP(Number(sale.total || 0))}
                  </div>
                  <div className="font-mono text-[10px] text-fg-faint">
                    {new Date(sale.createdAt).toLocaleTimeString('es-CO', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </div>
                </div>
              </div>
            ))
          )}
          <Link
            href="/dashboard/reports"
            className="block text-center font-mono text-[10px] text-accent hover:text-accent-hover font-bold uppercase py-2 border-t border-line-soft mt-2"
          >
            Ver todos los reportes →
          </Link>
        </SectionPanel>
      </div>

      {/* ALERTAS Y OBSERVACIONES */}
      {(stats.lowStockCount > 0 || stats.overdueCount > 0) && (
        <div className="bg-veil border border-amber rounded-[8px] p-4 space-y-3">
          <div className="flex items-center gap-2 text-amber font-bold text-xs uppercase tracking-wider">
            <AlertTriangle className="w-3.5 h-3.5" />
            <span>ATENCIÓN REQUERIDA — {stats.lowStockCount + stats.overdueCount} ALERTAS</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
            {stats.lowStockCount > 0 && (
              <div className="bg-input border border-amber-line rounded p-3 flex items-center justify-between">
                <div className="flex items-center gap-2 min-w-0">
                  <AlertTriangle className="w-4 h-4 text-amber shrink-0" />
                  <div className="min-w-0">
                    <div className="font-mono text-[11px] font-bold text-white">
                      {stats.lowStockCount} productos con stock bajo
                    </div>
                    <div className="font-mono text-[10px] text-fg-muted">Menos de 10 unidades</div>
                  </div>
                </div>
                <Link
                  href="/dashboard/inventory"
                  className="font-mono text-[10px] text-accent hover:underline uppercase font-bold shrink-0"
                >
                  Revisar →
                </Link>
              </div>
            )}
            {stats.overdueCount > 0 && (
              <div className="bg-input border border-red-line rounded p-3 flex items-center justify-between">
                <div className="flex items-center gap-2 min-w-0">
                  <AlertTriangle className="w-4 h-4 text-alert shrink-0" />
                  <div className="min-w-0">
                    <div className="font-mono text-[11px] font-bold text-white">
                      {stats.overdueCount} facturas vencidas (clientes)
                    </div>
                    <div className="font-mono text-[10px] text-fg-muted">Cartera en mora</div>
                  </div>
                </div>
                <Link
                  href="/dashboard/customers"
                  className="font-mono text-[10px] text-accent hover:underline uppercase font-bold shrink-0"
                >
                  Cobrar →
                </Link>
              </div>
            )}
          </div>
        </div>
      )}

      {/* BANNER DIAN DESHABILITADO */}
      <div className="bg-veil border border-dashed border-line rounded-[8px] px-4 py-3 flex items-center gap-3 text-[10px] text-fg-muted">
        <ShieldCheck className="w-4 h-4 text-fg-faint shrink-0" />
        <div>
          <span className="text-fg-faint uppercase tracking-wider font-bold">Módulo DIAN</span>
          <span className="mx-2 text-line-strong">|</span>
          <span>
            Facturación electrónica deshabilitada temporalmente.{' '}
            <Link href="/dashboard/dian" className="text-accent hover:underline">
              Ver stub
            </Link>
          </span>
        </div>
      </div>
    </div>
  )
}
