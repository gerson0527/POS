'use client'

import { useState, useEffect } from 'react'
import {
  BarChart3,
  TrendingUp,
  CheckCircle2,
  Package,
  Download,
  RefreshCw,
  DollarSign,
  PieChart as PieChartIcon,
  Percent,
  CalendarDays,
  X,
  Filter } from 'lucide-react'
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  PieChart as RechartsPieChart,
  Pie,
  Cell } from 'recharts'
import { StatusBadge } from '@/components/tactical/StatusBadge'
import { MetricCard } from '@/components/tactical/MetricCard'
import { SectionPanel } from '@/components/tactical/SectionPanel'
import { TacticalButton } from '@/components/tactical/TacticalButton'
import { Pagination } from '@/components/tactical/Pagination'
import { getSalesReports, getProducts } from '@/app/actions/pos-actions'
import { isSessionError, redirectToLogin } from '@/lib/hooks/use-protected-query'
import { formatCOP } from '@/lib/utils/pos-utils'
import { PRESETS, computeRange, type DatePreset, type DateRange } from '@/lib/utils/date-ranges'
import { DataTable } from '@/components/ui/DataTable'
import { PageHeader } from '@/components/ui/PageHeader'
import { Input } from '@/components/ui/Input'
import { Label } from '@/components/ui/Label'

export default function ReportsPage() {
  const [selectedReport, setSelectedReport] = useState('profits')
  const [salesReport, setSalesReport] = useState({
    totalRevenue: 0,
    totalSubtotal: 0,
    totalTaxes: 0,
    totalCost: 0,
    netProfit: 0,
    profitMarginPercentage: 0,
    totalSalesCount: 0,
    averageTicket: 0,
    totalInvoicesCount: 0,
    salesList: [] as any[],
    topProfitableProducts: [] as any[],
  })

  const [products, setProducts] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [reportPage, setReportPage] = useState(1)
  const itemsPerPage = 8

  const initialRange = computeRange('thisMonth')
  const [datePreset, setDatePreset] = useState<DatePreset>('thisMonth')
  const [dateRange, setDateRange] = useState<DateRange>({
    preset: 'thisMonth',
    start: initialRange.start,
    end: initialRange.end,
  })

  useEffect(() => {
    loadReportsData()
  }, [dateRange.start, dateRange.end])

  async function loadReportsData() {
    setLoading(true)
    try {
      const [reportsData, productsData] = await Promise.all([
        getSalesReports(dateRange.start, dateRange.end).catch((err) => {
          if (isSessionError(err)) redirectToLogin()
          return {
            totalRevenue: 0,
            totalSubtotal: 0,
            totalTaxes: 0,
            totalCost: 0,
            netProfit: 0,
            profitMarginPercentage: 0,
            totalSalesCount: 0,
            averageTicket: 0,
            totalInvoicesCount: 0,
            salesList: [],
            topProfitableProducts: [],
          }
        }),
        getProducts().catch((err) => {
          if (isSessionError(err)) redirectToLogin()
          return []
        }),
      ])

      setSalesReport(reportsData)
      setProducts(productsData || [])
      setReportPage(1)
    } catch (error: any) {
      if (isSessionError(error)) redirectToLogin()
      console.error('Error fetching sales reports from PostgreSQL:', error)
    } finally {
      setLoading(false)
    }
  }

  function applyPreset(preset: DatePreset) {
    setDatePreset(preset)
    const r = computeRange(preset, dateRange.start, dateRange.end)
    setDateRange({ preset, start: r.start, end: r.end })
  }

  function applyCustom() {
    setDatePreset('custom')
    setDateRange({ preset: 'custom', start: dateRange.start, end: dateRange.end })
  }

  const reports = [
    {
      id: 'profits',
      name: 'GANANCIA NETA VS VENTAS BRUTAS',
      description: 'Análisis de utilidad real, costo de mercancía vendida y margen de beneficio %',
      icon: DollarSign,
    },
    {
      id: 'sales',
      name: 'VENTAS POR PERÍODO',
      description: 'Análisis cuantitativo de ingresos y promedio por ticket',
      icon: BarChart3,
    },
    {
      id: 'top-products',
      name: 'ROTACIÓN Y RENTABILIDAD POR PRODUCTO',
      description: 'Desglose de ingresos, costo y margen por producto del catálogo',
      icon: TrendingUp,
    },
    {
      id: 'audit',
      name: 'AUDITORÍA FISCAL DIAN',
      description: 'Cumplimiento de emisión de facturas y recaudación tributaria',
      icon: CheckCircle2,
    },
  ]

  const totalProfitablePages = Math.ceil((salesReport.topProfitableProducts || []).length / itemsPerPage) || 1
  const paginatedProfitableProducts = (salesReport.topProfitableProducts || []).slice(
    (reportPage - 1) * itemsPerPage,
    reportPage * itemsPerPage
  )

  const handleDownloadPDF = () => {
    window.open('/api/reports/inventory-pdf', '_blank')
  }

  return (
    <div className="space-y-6">
      <PageHeader
        icon={<BarChart3 className="w-4 h-4" />}
        kicker="Análisis de ventas y rentabilidad"
        title="Reportes de ventas y ganancia neta"
        description="Métricas de ingresos brutos, costos de productos y utilidad neta en tiempo real."
        actions={
          <>
            <TacticalButton
              variant="secondary"
              size="sm"
              onClick={loadReportsData}
              loading={loading}
              icon={<RefreshCw className="w-3.5 h-3.5" />}
            >
              RECARGAR
            </TacticalButton>

            <TacticalButton
              variant="primary"
              size="sm"
              onClick={handleDownloadPDF}
              icon={<Download className="w-3.5 h-3.5" />}
            >
              DESCARGAR PDF
            </TacticalButton>
          </>
        }
      />

      {/* Date Range Filter */}
      <div className="bg-panel border border-line rounded-[6px] p-4 space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2 text-accent font-bold text-xs uppercase tracking-wider">
            <Filter className="w-3.5 h-3.5" />
            Filtro de Período
            <span className="text-[10px] text-fg-muted font-normal normal-case tracking-normal ml-2">
              ({dateRange.start} → {dateRange.end})
            </span>
          </div>
          <div className="flex items-center gap-2">
            <CalendarDays className="w-3.5 h-3.5 text-fg-muted" />
            <span className="text-[10px] text-fg-muted uppercase">
              {salesReport.totalSalesCount} ventas en el período
            </span>
          </div>
        </div>

        {/* Preset Chips */}
        <div className="flex flex-wrap gap-1.5">
          {PRESETS.map((p) => {
            const isActive = datePreset === p.id
            return (
              <button
                key={p.id}
                onClick={() => applyPreset(p.id)}
                className={`px-3 py-1.5 rounded font-mono text-[10px] font-bold uppercase tracking-wider border transition-all ${
                  isActive
                    ? 'bg-accent text-white border-accent shadow-sm'
                    : 'bg-surface text-fg-muted border-line hover:border-accent hover:text-fg'
                }`}
              >
                {p.label}
              </button>
            )
          })}
        </div>

        {/* Custom Date Inputs */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-2 border-t border-line-soft">
          <div className="flex flex-col gap-1">
            <Label>
              DESDE
            </Label>
            <Input
              type="date"
              value={dateRange.start}
              max={dateRange.end}
              onChange={(e) => setDateRange({ ...dateRange, start: e.target.value })}
              className="px-2.5 py-1.5 font-mono text-xs"
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label>
              HASTA
            </Label>
            <Input
              type="date"
              value={dateRange.end}
              min={dateRange.start}
              onChange={(e) => setDateRange({ ...dateRange, end: e.target.value })}
              className="px-2.5 py-1.5 font-mono text-xs"
            />
          </div>
          <div className="flex items-end gap-2">
            <button
              onClick={applyCustom}
              className="flex-1 h-[34px] bg-accent hover:bg-accent-hover text-white font-bold uppercase tracking-wider rounded text-xs"
            >
              Aplicar Rango
            </button>
            <button
              onClick={() => applyPreset('thisMonth')}
              className="px-3 h-[34px] bg-raised border border-line hover:border-alert hover:text-alert text-fg-muted rounded text-xs"
              title="Limpiar filtro"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Real Metrics Bar - Gross Revenue vs Net Profit */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          title="VENTAS BRUTAS (RECAUDO)"
          value={formatCOP(salesReport.totalRevenue)}
          subtext={`${salesReport.totalSalesCount} Ventas Completadas`}
          trend="RECAUDO TOTAL"
          trendType={salesReport.totalRevenue > 0 ? 'positive' : 'neutral'}
          accentColor="orange"
          icon={<TrendingUp className="w-4 h-4 text-accent" />}
        />
        <MetricCard
          title="COSTO DE MERCANCÍA (COGS)"
          value={formatCOP(salesReport.totalCost)}
          subtext="Costo de Ítems Vendidos"
          trend="COSTO TOTAL"
          trendType="neutral"
          accentColor="neutral"
          icon={<Package className="w-4 h-4 text-fg-muted" />}
        />
        <MetricCard
          title="GANANCIA NETA (UTILIDAD)"
          value={formatCOP(salesReport.netProfit)}
          subtext="Utilidad Real Descontando Costos"
          trend="GANANCIA NETA"
          trendType={salesReport.netProfit > 0 ? 'positive' : 'negative'}
          accentColor="green"
          icon={<DollarSign className="w-4 h-4 text-success" />}
        />
        <MetricCard
          title="MARGEN DE GANANCIA PROMEDIO"
          value={`${salesReport.profitMarginPercentage}%`}
          subtext="Rentabilidad Sobre Subtotal"
          trend="MARGEN %"
          trendType={salesReport.profitMarginPercentage > 0 ? 'positive' : 'neutral'}
          accentColor="green"
          icon={<Percent className="w-4 h-4 text-cyan" />}
        />
      </div>

      {/* Main Grid: Selector + Preview */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Report Types Selector */}
        <SectionPanel
          title="TIPO DE REPORTE"
          subtitle="SELECCIONE EL INFORME DE ANÁLISIS"
        >
          <div className="space-y-2">
            {reports.map((report) => {
              const Icon = report.icon
              const isSelected = selectedReport === report.id
              return (
                <button
                  key={report.id}
                  onClick={() => setSelectedReport(report.id)}
                  className={`w-full text-left p-3.5 rounded border transition-all flex items-start gap-3 cursor-pointer ${
                    isSelected
                      ? 'bg-accent text-white border-accent shadow-sm'
                      : 'bg-surface text-fg-muted border-line-soft hover:border-line-strong hover:text-fg'
                  }`}
                >
                  <Icon className={`w-4 h-4 shrink-0 mt-0.5 ${isSelected ? 'text-white' : 'text-accent'}`} />
                  <div>
                    <div className="font-mono text-xs font-bold uppercase tracking-wider">
                      {report.name}
                    </div>
                    <div
                      className={`text-[11px] mt-0.5 ${
                        isSelected ? 'text-white/80' : 'text-fg-muted'
                      }`}
                    >
                      {report.description}
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        </SectionPanel>

        {/* Report Output Preview Panel */}
        <SectionPanel
          title={`INFORME: ${reports.find((r) => r.id === selectedReport)?.name}`}
          subtitle="ANÁLISIS COMPARATIVO DE INGRESOS Y GANANCIAS"
          className="lg:col-span-2"
          action={
            <StatusBadge status="online" label="SISTEMA ACTIVO" />
          }
        >
          {selectedReport === 'profits' && (
            <div className="space-y-5 font-mono text-xs">
              {/* RECHARTS: VISUAL INTERACTIVE GRAPH */}
              <div className="bg-surface border border-line-soft rounded p-4 space-y-3">
                <div className="flex items-center justify-between border-b border-line-soft pb-2 font-bold text-fg">
                  <span className="flex items-center gap-2 text-accent">
                    <BarChart3 className="w-4 h-4" />
                    COMPARATIVO GRÁFICO DE RESULTADOS FINANCIEROS
                  </span>
                  <span className="text-[10px] text-fg-muted uppercase">Valores en COP ($)</span>
                </div>

                <div className="h-64 w-full pt-2">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={[
                        { name: 'Ventas Brutas', monto: salesReport.totalRevenue },
                        { name: 'Subtotal Netas', monto: salesReport.totalSubtotal },
                        { name: 'Costo Mercancía', monto: salesReport.totalCost },
                        { name: 'Ganancia Neta', monto: salesReport.netProfit },
                      ]}
                      margin={{ top: 10, right: 10, left: 10, bottom: 20 }}
                    >
                      <XAxis dataKey="name" stroke="#8C8C8C" fontSize={11} tickLine={false} />
                      <YAxis
                        stroke="#8C8C8C"
                        fontSize={10}
                        tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
                        tickLine={false}
                      />
                      <Tooltip
                        contentStyle={{ backgroundColor: 'var(--bg-panel)', borderColor: 'var(--accent)', borderRadius: '6px', color: 'var(--text-primary)' }}
                        formatter={(val: any) => [formatCOP(val), 'Monto']}
                      />
                      <Bar dataKey="monto" radius={[4, 4, 0, 0]}>
                        <Cell key="cell-0" fill="#FF6A00" />
                        <Cell key="cell-1" fill="#3B82F6" />
                        <Cell key="cell-2" fill="#EF4444" />
                        <Cell key="cell-3" fill="#10B981" />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Comparative Summary Box */}
              <div className="bg-surface border border-line-soft rounded p-4 space-y-3">
                <div className="flex justify-between items-center border-b border-line-soft pb-2 font-bold text-fg">
                  <span>CONCEPTO FINANCIERO</span>
                  <span>MONTO TOTAL (COP)</span>
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between text-fg">
                    <span>Ventas Brutas Totales (Con IVA):</span>
                    <span className="font-bold text-accent">{formatCOP(salesReport.totalRevenue)}</span>
                  </div>
                  <div className="flex justify-between text-fg-muted">
                    <span>(-) Impuestos Recaudados (IVA / Impoconsumo):</span>
                    <span className="text-fg-muted">-{formatCOP(salesReport.totalTaxes)}</span>
                  </div>
                  <div className="flex justify-between text-fg">
                    <span>(=) Subtotal Ventas Netas (Sin IVA):</span>
                    <span className="font-bold text-white">{formatCOP(salesReport.totalSubtotal)}</span>
                  </div>
                  <div className="flex justify-between text-alert">
                    <span>(-) Costo de Mercancía Vendida (COGS):</span>
                    <span className="font-bold text-alert">-{formatCOP(salesReport.totalCost)}</span>
                  </div>
                  <div className="flex justify-between font-black text-sm border-t border-line pt-2 bg-ok-dim p-2.5 rounded border border-ok-line">
                    <span className="text-success">GANANCIA NETA TOTAL (UTILIDAD REAL):</span>
                    <span className="text-success">{formatCOP(salesReport.netProfit)}</span>
                  </div>
                  <div className="flex justify-between text-xs font-bold text-cyan px-2.5">
                    <span>MARGEN DE GANANCIA BRUTO SOBRE VENTAS:</span>
                    <span>{salesReport.profitMarginPercentage}%</span>
                  </div>
                </div>
              </div>

              {/* Profitable Products Breakdown */}
              <div className="bg-surface border border-line-soft rounded p-4 space-y-3">
                <div className="font-bold text-fg border-b border-line-soft pb-2 uppercase tracking-wider">
                  RENTABILIDAD Y MARGEN NETA POR PRODUCTO
                </div>

                <DataTable
                  columns={[
                    {
                      key: 'name',
                      header: 'PRODUCTO',
                      cellClassName: 'font-bold text-fg',
                    },
                    {
                      key: 'qty',
                      header: 'CANT. VENDIDA',
                      cellClassName: 'text-fg-muted',
                      render: (p: any) => `${p.qty} un.`,
                    },
                    {
                      key: 'revenue',
                      header: 'VENTAS ($)',
                      cellClassName: 'text-white font-semibold',
                      render: (p: any) => formatCOP(p.revenue),
                    },
                    {
                      key: 'cost',
                      header: 'COSTO ($)',
                      cellClassName: 'text-fg-muted',
                      render: (p: any) => formatCOP(p.cost),
                    },
                    {
                      key: 'netProfit',
                      header: 'GANANCIA NETA ($)',
                      cellClassName: 'font-bold text-success',
                      render: (p: any) => formatCOP(p.netProfit),
                    },
                    {
                      key: 'margin',
                      header: 'MARGEN (%)',
                      align: 'right',
                      cellClassName: 'font-bold text-cyan',
                      render: (p: any) => `${p.margin}%`,
                    },
                  ]}
                  rows={paginatedProfitableProducts}
                  rowKey={(_p: any, idx: number) => idx}
                  emptyMessage="[NO HAY VENTAS REGISTRADAS PARA CALCULAR RENTABILIDAD DE PRODUCTOS]"
                />

                {salesReport.topProfitableProducts.length > 0 && (
                  <Pagination
                    currentPage={reportPage}
                    totalPages={totalProfitablePages}
                    totalItems={salesReport.topProfitableProducts.length}
                    itemsPerPage={itemsPerPage}
                    onPageChange={(page) => setReportPage(page)}
                    className="mt-4"
                  />
                )}
              </div>
            </div>
          )}

          {selectedReport === 'sales' && (
            <div className="space-y-4 font-mono text-xs">
              <div className="bg-surface border border-line-soft rounded p-4 space-y-3">
                <div className="flex justify-between items-center border-b border-line-soft pb-2 font-bold text-fg">
                  <span>REPORTE REGISTRO DE VENTAS</span>
                  <span>TOTAL RECAUDADO (COP)</span>
                </div>

                {salesReport.salesList.length === 0 ? (
                  <div className="py-8 text-center text-fg-muted">
                    [NO HAY VENTAS REGISTRADAS EN EL SISTEMA]
                  </div>
                ) : (
                  <div className="space-y-2">
                    {salesReport.salesList.map((sale) => (
                      <div key={sale.id} className="flex justify-between items-center text-fg-muted p-2 bg-panel rounded border border-line-soft">
                        <div>
                          <div className="text-fg font-bold">
                            VENTA / TICKET #{sale.ticketNumber ? String(sale.ticketNumber).padStart(4, '0') : sale.id.substring(0, 8)}
                          </div>
                          <div className="text-[10px] text-fg-muted">
                            CIERRE CAJA VINCULADO: <span className="text-accent font-mono">{sale.cashierSessionId || 'N/A'}</span>
                          </div>
                        </div>
                        <span className="text-success font-bold">{formatCOP(sale.total)}</span>
                      </div>
                    ))}
                    <div className="flex justify-between font-bold border-t border-line pt-2 text-fg">
                      <span>TOTAL ACUMULADO</span>
                      <span className="text-accent font-mono">{formatCOP(salesReport.totalRevenue)}</span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {selectedReport === 'top-products' && (
            <div className="space-y-4 font-mono text-xs">
              {/* RECHARTS: PIE / DONUT CHART */}
              {salesReport.topProfitableProducts.length > 0 && (
                <div className="bg-surface border border-line-soft rounded p-4 space-y-3">
                  <div className="flex items-center justify-between border-b border-line-soft pb-2 font-bold text-fg">
                    <span className="flex items-center gap-2 text-cyan">
                      <PieChartIcon className="w-4 h-4" />
                      DISTRIBUCIÓN DE RENTABILIDAD POR PRODUCTO TOP
                    </span>
                    <span className="text-[10px] text-fg-muted uppercase">Aporte a Ganancia Neta</span>
                  </div>

                  <div className="h-64 w-full flex items-center justify-center">
                    <ResponsiveContainer width="100%" height="100%">
                      <RechartsPieChart>
                        <Pie
                          data={salesReport.topProfitableProducts.slice(0, 5).map((p) => ({
                            name: p.name,
                            value: p.netProfit,
                          }))}
                          cx="50%"
                          cy="50%"
                          innerRadius={50}
                          outerRadius={85}
                          paddingAngle={5}
                          dataKey="value"
                        >
                          {['#10B981', '#00E5FF', '#FF6A00', '#F59E0B', '#8B5CF6'].map((color, index) => (
                            <Cell key={`cell-${index}`} fill={color} />
                          ))}
                        </Pie>
                        <Tooltip
                          contentStyle={{ backgroundColor: 'var(--bg-panel)', borderColor: 'var(--cyan)', borderRadius: '6px', color: 'var(--text-primary)' }}
                          formatter={(val: any) => [formatCOP(val), 'Ganancia Neta']}
                        />
                        <Legend wrapperStyle={{ fontSize: '11px', color: '#8C8C8C' }} />
                      </RechartsPieChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}

              <div className="bg-surface border border-line-soft rounded p-4 space-y-3">
                <div className="font-bold text-fg border-b border-line-soft pb-2">
                  CATÁLOGO DE PRODUCTOS Y MARGEN DE GANANCIA ({products.length} ITEMS)
                </div>

                {products.length === 0 ? (
                  <div className="py-8 text-center text-fg-muted">
                    [NO HAY PRODUCTOS REGISTRADOS EN EL CATÁLOGO]
                  </div>
                ) : (
                  <div className="space-y-2">
                    {products.slice(0, 10).map((p) => (
                      <div
                        key={p.id}
                        className="flex justify-between items-center p-3 bg-panel rounded border border-line-soft"
                      >
                        <div>
                          <div className="text-fg font-bold">{p.name}</div>
                          <div className="text-fg-muted text-[10px]">SKU: {p.sku || p.id.substring(0, 6)} • CAT: {p.category || 'General'}</div>
                        </div>
                        <div className="text-right">
                          <div className="text-success font-bold">{formatCOP(p.unitPrice)}</div>
                          <div className="text-cyan text-[10px]">MARGEN: {p.margin || 0}%</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {selectedReport === 'audit' && (
            <div className="space-y-4 font-mono text-xs">
              <div className="bg-surface border border-line-soft rounded p-4 space-y-3">
                <div className="font-bold text-fg border-b border-line-soft pb-2">
                  RESUMEN DE AUDITORÍA FISCAL DIAN
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between text-fg-muted">
                    <span>FACTURAS REGISTRADAS EN SISTEMA:</span>
                    <span className="text-success font-bold">{salesReport.totalInvoicesCount}</span>
                  </div>
                  <div className="flex justify-between font-bold border-t border-line pt-2 text-fg">
                    <span>Estado del motor fiscal:</span>
                    <span className="text-success font-mono">Operativo</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="pt-4 border-t border-line-soft">
            <TacticalButton
              variant="primary"
              size="lg"
              className="w-full justify-center"
              onClick={handleDownloadPDF}
              icon={<Download className="w-4 h-4" />}
            >
              GENERAR Y DESCARGAR REPORTE COMPLETO PDF
            </TacticalButton>
          </div>
        </SectionPanel>
      </div>
    </div>
  )
}
