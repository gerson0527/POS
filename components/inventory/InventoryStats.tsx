'use client'

import { Package, AlertTriangle, Truck, TrendingUp } from 'lucide-react'
import { MetricCard } from '@/components/tactical/MetricCard'
import { formatCOP } from '@/lib/utils/pos-utils'

interface InventoryStatsData {
  totalProducts: number
  totalStockValue: number
  lowStockCount: number
  pendingPOsCount: number
}

export function InventoryStats({ stats }: { stats: InventoryStatsData }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <MetricCard
        title="PRODUCTOS ACTIVOS"
        value={stats.totalProducts.toString()}
        subtext="SKUs Registrados DB"
        trend={stats.totalProducts > 0 ? `${stats.totalProducts} ITEMS` : 'SIN PRODUCTOS'}
        trendType={stats.totalProducts > 0 ? 'positive' : 'neutral'}
        accentColor="blue"
        icon={<Package className="w-4 h-4 text-blue" />}
      />
      <MetricCard
        title="VALOR STOCK TOTAL"
        value={formatCOP(stats.totalStockValue)}
        subtext="Valorización en COP"
        trend="SISTEMA"
        trendType={stats.totalStockValue > 0 ? 'positive' : 'neutral'}
        accentColor="green"
        icon={<TrendingUp className="w-4 h-4 text-success" />}
      />
      <MetricCard
        title="ALERTAS DE STOCK BAJO"
        value={stats.lowStockCount.toString()}
        subtext="Reorden Requerido (< 10)"
        trend={stats.lowStockCount > 0 ? 'REVISIÓN URGENTE' : 'SIN ALERTAS'}
        trendType={stats.lowStockCount > 0 ? 'warning' : 'positive'}
        accentColor="orange"
        icon={<AlertTriangle className="w-4 h-4 text-warning" />}
      />
      <MetricCard
        title="ÓRDENES PENDIENTES"
        value={stats.pendingPOsCount.toString()}
        subtext="En Tránsito Proveedor"
        trend={stats.pendingPOsCount > 0 ? `${stats.pendingPOsCount} ACTIVAS` : '0 PENDIENTES'}
        trendType="neutral"
        accentColor="neutral"
        icon={<Truck className="w-4 h-4 text-fg-muted" />}
      />
    </div>
  )
}
