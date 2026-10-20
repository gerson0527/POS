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
  Terminal } from 'lucide-react'
import { TacticalButton } from '@/components/tactical/TacticalButton'
import { StatusBadge } from '@/components/tactical/StatusBadge'
import { ThemeToggle } from '@/components/ui/ThemeToggle'

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const [isMobileOpen, setIsMobileOpen] = useState(false)
  const router = useRouter()
  const pathname = usePathname()

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
    { href: '/dashboard/users', label: 'Empresas', icon: Building2 },
    { href: '/dashboard', label: 'Resumen', icon: LayoutDashboard },
    { href: '/dashboard/reports', label: 'Reportes', icon: BarChart3 },
    { href: '/dashboard/settings', label: 'Configuración', icon: Settings },
  ]

  const standardNavItems = [
    { href: '/dashboard', label: 'Resumen', icon: LayoutDashboard },
    { href: '/dashboard/pos', label: 'Punto de venta', icon: ShoppingCart },
    { href: '/dashboard/cashier', label: 'Cajas', icon: Wallet },
    { href: '/dashboard/invoices', label: 'Facturas', icon: FileText },
    { href: '/dashboard/inventory', label: 'Inventario', icon: Package },
    { href: '/dashboard/categories', label: 'Categorías', icon: Tags },
    { href: '/dashboard/customers', label: 'Clientes', icon: UserCheck },
    { href: '/dashboard/reports', label: 'Reportes', icon: BarChart3 },
    { href: '/dashboard/users', label: 'Usuarios', icon: Users },
    { href: '/dashboard/settings', label: 'Configuración', icon: Settings },
  ]

  const navItems = isMasterAdmin ? masterNavItems : standardNavItems

  // Breadcrumb text based on current path
  const getBreadcrumb = () => {
    if (isMasterAdmin) {
      if (pathname === '/dashboard/users') return 'Empresas y sucursales'
      if (pathname === '/dashboard' || pathname === '/') return 'Resumen general'
      if (pathname.includes('/reports')) return 'Reportes globales'
      if (pathname.includes('/settings')) return 'Configuración'
      return 'Administración'
    }

    if (pathname === '/dashboard' || pathname === '/') return 'Resumen'
    if (pathname.includes('/pos')) return 'Punto de venta'
    if (pathname.includes('/cashier')) return 'Cajas'
    if (pathname.includes('/invoices')) return 'Facturas'
    if (pathname.includes('/inventory')) return 'Inventario'
    if (pathname.includes('/categories')) return 'Categorías'
    if (pathname.includes('/customers')) return 'Clientes'
    if (pathname.includes('/reports')) return 'Reportes'
    if (pathname.includes('/settings')) return 'Configuración'
    if (pathname.includes('/users')) return 'Usuarios'
    return 'Panel'
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
          <span className="text-sm font-bold text-fg">
            POS DIAN
          </span>
        </div>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <button
            onClick={() => setIsMobileOpen(!isMobileOpen)}
            className="p-1.5 rounded bg-hover border border-line text-fg"
          >
            {isMobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>
      {isMobileOpen && (
        <button
          type="button"
          aria-label="Cerrar menú de navegación"
          onClick={() => setIsMobileOpen(false)}
          className="fixed inset-0 z-30 bg-black/40 md:hidden animate-in fade-in duration-150"
        />
      )}
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
              <div className="w-7 h-7 bg-accent flex items-center justify-center rounded-[4px] text-white font-extrabold text-xs shadow-[0_0_12px_var(--accent)]">
                PD
              </div>
              <div>
                <div className="font-bold text-sm text-fg group-hover:text-accent transition-colors">
                  POS DIAN
                </div>
                <div className="text-[10px] text-fg-muted">
                  v1.0.4
                </div>
              </div>
            </Link>

            <div className="mt-4 pt-3 border-t border-hover">
              <StatusBadge status="online" label="En línea" showPulse />
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
                  className={`flex items-center gap-3 px-3.5 py-2.5 rounded-[4px] text-xs font-medium transition-[background-color,color,box-shadow,transform] duration-150 relative ${isActive
                      ? 'bg-accent text-white shadow-md font-semibold'
                      : 'text-fg-mid hover:bg-hover hover:text-fg'
                    }`}
                >
                  {isActive && (
                    <span className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-5 bg-black/30 rounded-r-sm" />
                  )}
                  <Icon
                    className={`w-4 h-4 shrink-0 ${isActive ? 'text-white' : 'text-fg-muted'
                      }`}
                  />
                  <span className="truncate">{item.label}</span>
                </Link>
              )
            })}
          </nav>
        </div>

        {/* Footer / Logout */}
        <div className="p-4 border-t border-line bg-input">
          <TacticalButton
            variant="danger"
            size="sm"
            className="w-full justify-center"
            icon={<LogOut className="w-3.5 h-3.5" />}
            onClick={handleLogout}
          >
            Cerrar sesión
          </TacticalButton>
        </div>
      </aside>

      {/* Main Content Area Offset for 240px sidebar on Desktop */}
      <div className="flex-1 md:pl-60 flex flex-col min-w-0">
        {/* Top Header Bar */}
        <header className="sticky top-0 z-30 bg-sidebar/95 backdrop-blur-md border-b border-line px-4 md:px-8 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2 font-sans text-xs text-fg-muted overflow-hidden">
            <Terminal className="w-3.5 h-3.5 text-accent shrink-0" />
            <span className="text-fg font-semibold truncate">
              {getBreadcrumb()}
            </span>
          </div>
          <ThemeToggle />
        </header>

        {/* Dynamic Page Container */}
        <main className="flex-1 p-4 md:p-6 w-full flex flex-col min-w-0">
          {children}
        </main>
      </div>
    </div>
  )
}
