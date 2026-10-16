'use client'

import { authClient } from '@/lib/auth-client'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useState, useEffect } from 'react'
import {
  LayoutDashboard,
  ShoppingCart,
  Package,
  FileText,
  BarChart3,
  Building2,
  Settings,
  Users,
  UserCheck,
  Wallet,
  Tags,
  LogOut,
  Menu,
  X,
  Activity,
  Terminal } from 'lucide-react'
import { TacticalButton } from '@/components/tactical/TacticalButton'
import { StatusBadge } from '@/components/tactical/StatusBadge'

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const [isMobileOpen, setIsMobileOpen] = useState(false)
  const [timeString, setTimeString] = useState<string>('')
  const router = useRouter()
  const pathname = usePathname()

  useEffect(() => {
    const updateTime = () => {
      const now = new Date()
      setTimeString(
        now.toISOString().replace('T', ' ').substring(0, 19) + ' UTC'
      )
    }
    updateTime()
    const timer = setInterval(updateTime, 1000)
    return () => clearInterval(timer)
  }, [])

  // Guard de onboarding: si el usuario es admin y el tenant aún no completó
  // el wizard de primera vez, redirigir a /dashboard/onboarding.
  // Esta verificación se hace una vez por sesión y solo afecta admins.
  useEffect(() => {
    if (pathname === '/dashboard/onboarding') return
    let mounted = true
    ;(async () => {
      try {
        const { getOnboardingStatus } = await import('@/app/actions/pos-actions')
        const status = await getOnboardingStatus()
        if (!mounted) return
        if (status.isAdmin && !status.completed) {
          router.push('/dashboard/onboarding')
        }
      } catch (err) {
        // Silenciar errores de guard — el dashboard carga normal
      }
    })()
    return () => {
      mounted = false
    }
  }, [pathname, router])

  const handleLogout = async () => {
    await authClient.signOut({
      fetchOptions: {
        onSuccess: () => {
          router.push('/login')
        },
      },
    })
  }

  const { data: session } = authClient.useSession()
  const userEmail = session?.user?.email || ''
  const isMasterAdmin = userEmail === 'admin@posdian.com' || userEmail.endsWith('@posdian.com')

  const masterNavItems = [
    { href: '/dashboard/users', label: 'EMPRESAS / SAS', icon: Building2 },
    { href: '/dashboard', label: 'SOC COMMAND HUB', icon: LayoutDashboard },
    { href: '/dashboard/reports', label: 'MÉTRICAS GLOBAL', icon: BarChart3 },
    { href: '/dashboard/settings', label: 'CONFIGURACIÓN', icon: Settings },
  ]

  const standardNavItems = [
    { href: '/dashboard', label: 'OPERATIONS HUB', icon: LayoutDashboard },
    { href: '/dashboard/pos', label: 'POS TERMINAL', icon: ShoppingCart },
    { href: '/dashboard/cashier', label: 'CAJAS', icon: Wallet },
    { href: '/dashboard/invoices', label: 'FACTURAS', icon: FileText },
    { href: '/dashboard/inventory', label: 'INVENTARIO', icon: Package },
    { href: '/dashboard/categories', label: 'CATEGORÍAS', icon: Tags },
    { href: '/dashboard/customers', label: 'CLIENTES', icon: UserCheck },
    { href: '/dashboard/reports', label: 'REPORTES', icon: BarChart3 },
    { href: '/dashboard/users', label: 'USUARIOS', icon: Users },
    { href: '/dashboard/settings', label: 'CONFIGURACIÓN', icon: Settings },
  ]

  const navItems = isMasterAdmin ? masterNavItems : standardNavItems

  // Breadcrumb text based on current path
  const getBreadcrumb = () => {
    if (isMasterAdmin) {
      if (pathname === '/dashboard/users') return 'SOC COMMAND // GESTIÓN DE EMPRESAS SAS & TENANTS'
      if (pathname === '/dashboard' || pathname === '/') return 'SOC COMMAND // MONITOR CENTRAL MULTI-TENANT'
      if (pathname.includes('/reports')) return 'SOC COMMAND // MÉTRICAS Y ANALÍTICA GLOBAL'
      if (pathname.includes('/settings')) return 'SOC COMMAND // CONFIGURACIÓN DEL SISTEMA MASTER'
      return 'SOC COMMAND // MASTER CONTROL'
    }

    if (pathname === '/dashboard' || pathname === '/') return 'SYSTEM // OPERATIONS HUB'
    if (pathname === '/pos') return 'MODULE // POS TERMINAL'
    if (pathname.includes('/cashier')) return 'MODULE // CASHIER CONTROL'
    if (pathname.includes('/invoices')) return 'MODULE // INVOICE MANAGEMENT'
    if (pathname.includes('/inventory')) return 'MODULE // INVENTORY CONTROL'
    if (pathname.includes('/categories')) return 'MODULE // PRODUCT TAXONOMY'
    if (pathname.includes('/customers')) return 'MODULE // CUSTOMER RELATIONS'
    if (pathname.includes('/reports')) return 'MODULE // AUDIT & REPORTS'
    if (pathname.includes('/settings')) return 'MODULE // SYSTEM SETTINGS'
    if (pathname.includes('/users')) return 'MODULE // ACCESS & USERS'
    return 'MODULE // DASHBOARD'
  }

  // El wizard de onboarding se renderiza SIN el sidebar del dashboard
  if (pathname === '/dashboard/onboarding') {
    return <>{children}</>
  }

  return (
    <div className="min-h-screen bg-app text-fg flex flex-col md:flex-row">
      {/* Mobile Header Bar */}
      <div className="md:hidden flex items-center justify-between px-4 py-3 bg-sidebar border-b border-line">
        <div className="flex items-center gap-2">
          <Terminal className="w-5 h-5 text-accent" />
          <span className="font-mono text-sm font-bold tracking-wider text-fg">
            POS DIAN // SOC
          </span>
        </div>
        <button
          onClick={() => setIsMobileOpen(!isMobileOpen)}
          className="p-1.5 rounded bg-hover border border-line text-fg"
        >
          {isMobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </div>

      {/* Desktop Fixed Sidebar (approx 240px / w-60) */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 w-60 bg-sidebar border-r border-line flex flex-col justify-between transition-transform duration-200 ease-in-out md:translate-x-0 ${isMobileOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
          }`}
      >
        <div>
          {/* Logo & Technical Header */}
          <div className="p-5 border-b border-line">
            <Link
              href="/dashboard"
              className="flex items-center gap-2.5 group"
              onClick={() => setIsMobileOpen(false)}
            >
              <div className="w-7 h-7 bg-accent flex items-center justify-center rounded-[4px] font-mono text-black font-extrabold text-sm shadow-[0_0_12px_rgba(255,106,0,0.4)]">
                &gt;_
              </div>
              <div>
                <div className="font-mono font-bold text-sm tracking-wider text-white group-hover:text-accent transition-colors">
                  POS DIAN
                </div>
                <div className="font-mono text-[10px] text-fg-muted tracking-widest uppercase">
                  v1.0.4-TACTICAL
                </div>
              </div>
            </Link>

            <div className="mt-4 pt-3 border-t border-hover flex items-center justify-between">
              <StatusBadge status="online" label="SOC ONLINE" showPulse />
              <Activity className="w-3.5 h-3.5 text-fg-faint" />
            </div>
          </div>

          {/* Nav Links */}
          <nav className="p-3 space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon
              const isActive =
                item.href === '/dashboard'
                  ? pathname === '/dashboard' || pathname === '/'
                  : pathname.startsWith(item.href)

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setIsMobileOpen(false)}
                  className={`flex items-center gap-3 px-3.5 py-2.5 rounded-[4px] font-mono text-xs font-bold tracking-wider transition-all duration-150 relative ${isActive
                      ? 'bg-accent text-black shadow-md font-extrabold'
                      : 'text-fg-mid hover:bg-hover hover:text-white'
                    }`}
                >
                  {isActive && (
                    <span className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-5 bg-black rounded-r-sm" />
                  )}
                  <Icon
                    className={`w-4 h-4 shrink-0 ${isActive ? 'text-black' : 'text-fg-muted'
                      }`}
                  />
                  <span className="truncate">{item.label}</span>
                </Link>
              )
            })}
          </nav>
        </div>

        {/* Footer / System Status & Logout */}
        <div className="p-4 border-t border-line bg-input space-y-3">
          <div className="font-mono text-[10px] text-fg-muted space-y-0.5">
            <div className="flex justify-between">
              <span>ENV:</span>
              <span className="text-success">PRODUCTION</span>
            </div>
            <div className="flex justify-between">
              <span>SECURITY:</span>
              <span className="text-success">OK</span>
            </div>
          </div>

          <TacticalButton
            variant="danger"
            size="sm"
            className="w-full justify-center"
            icon={<LogOut className="w-3.5 h-3.5" />}
            onClick={handleLogout}
          >
            SIGNOUT
          </TacticalButton>
        </div>
      </aside>

      {/* Main Content Area Offset for 240px sidebar on Desktop */}
      <div className="flex-1 md:pl-60 flex flex-col min-w-0">
        {/* Top Header Bar */}
        <header className="sticky top-0 z-30 bg-sidebar/95 backdrop-blur-md border-b border-line px-4 md:px-8 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2 font-mono text-xs text-fg-muted overflow-hidden">
            <Terminal className="w-3.5 h-3.5 text-accent shrink-0" />
            <span className="hidden sm:inline text-fg-faint">SYS //</span>
            <span className="text-fg font-bold truncate">
              {getBreadcrumb()}
            </span>
          </div>

          <div className="flex items-center gap-4 shrink-0 font-mono text-xs">
            <div className="hidden lg:flex items-center gap-2 text-fg-muted bg-panel px-3 py-1 rounded border border-line">
              <span className="w-1.5 h-1.5 rounded-full bg-success" />
              <span className="text-[11px]">{timeString || '11:20:00 UTC'}</span>
            </div>

            <div className="flex items-center gap-2">
              <StatusBadge status="active" label="LIVE" />
            </div>
          </div>
        </header>

        {/* Dynamic Page Container */}
        <main className="flex-1 p-4 md:p-6 w-full flex flex-col min-w-0">
          {children}
        </main>
      </div>
    </div>
  )
}
