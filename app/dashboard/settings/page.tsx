'use client'

import { useState } from 'react'
import {
  Settings,
  Building,
  MapPin,
  Hash,
  Zap,
  RefreshCw,
  KeyRound,
} from 'lucide-react'
import { TacticalButton } from '@/components/tactical/TacticalButton'
import { PageHeader } from '@/components/ui/PageHeader'
import { Tabs } from '@/components/ui/Tabs'
import { CompanySection } from '@/components/settings/CompanySection'
import { LocationsSection } from '@/components/settings/LocationsSection'
import { NumerationsSection } from '@/components/settings/NumerationsSection'
import { FactusSection } from '@/components/settings/FactusSection'
import { ApiKeysSection } from '@/components/settings/ApiKeysSection'

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState('general')
  const [loading, setLoading] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)

  const tabs = [
    { id: 'general', label: 'GENERAL EMPRESA', icon: Building },
    { id: 'locations', label: 'UBICACIONES / SEDES', icon: MapPin },
    { id: 'numeration', label: 'RESOLUCIONES DIAN', icon: Hash },
    { id: 'factus', label: 'FACTURACIÓN ELECTRÓNICA (PROVEEDOR)', icon: Zap },
    { id: 'api-keys', label: 'API PÚBLICA', icon: KeyRound },
  ]

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <PageHeader
        icon={<Settings className="w-4 h-4" />}
        kicker="SYSTEM CONSOLE // CONFIGURATION"
        title="CONFIGURACIÓN DEL SISTEMA TÁCTICO"
        description="Gestión de parámetros corporativos, numeración de facturas y credenciales de seguridad DIAN."
        actions={
          <TacticalButton
            variant="secondary"
            size="sm"
            onClick={() => setRefreshKey((k) => k + 1)}
            loading={loading}
            icon={<RefreshCw className="w-3.5 h-3.5" />}
          >
            RECARGAR
          </TacticalButton>
        }
      />

      {/* Tabs */}
      <Tabs
        items={tabs.map((tab) => ({ id: tab.id, label: tab.label, icon: tab.icon }))}
        value={activeTab}
        onChange={(id) => {
          setActiveTab(id)
          setLoading(false)
        }}
      />

      {/* Content Area */}
      <div className="space-y-6">
        {activeTab === 'general' && (
          <CompanySection refreshKey={refreshKey} onLoadingChange={setLoading} />
        )}

        {activeTab === 'locations' && (
          <LocationsSection refreshKey={refreshKey} onLoadingChange={setLoading} />
        )}

        {activeTab === 'numeration' && (
          <NumerationsSection refreshKey={refreshKey} onLoadingChange={setLoading} />
        )}

        {activeTab === 'factus' && (
          <FactusSection refreshKey={refreshKey} onLoadingChange={setLoading} />
        )}

        {activeTab === 'api-keys' && (
          <ApiKeysSection refreshKey={refreshKey} onLoadingChange={setLoading} />
        )}
      </div>
    </div>
  )
}
