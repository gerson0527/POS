'use client'

import { useEffect, useState } from 'react'
import { AlertCircle, ArrowRight, Building2, Cloud, Database, HardDrive, Loader2, LockKeyhole, Mail, Server, ShieldCheck, UserRound } from 'lucide-react'

type SetupStep = 'database' | 'company'
type DatabaseMode = 'system-local' | 'bundled' | 'remote'
type SetupStatus = {
  databaseConfigured: boolean
  dbConnected: boolean
  setupRequired: boolean
  error?: string
  databaseError?: string
}
type DesktopWindow = Window & {
  __TAURI__?: {
    core?: {
      invoke?: (command: string, args?: Record<string, string | null>) => Promise<unknown>
    }
  }
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) return error.message
  if (typeof error === 'string' && error.trim()) return error
  if (error && typeof error === 'object' && 'message' in error &&
      typeof error.message === 'string' && error.message) return error.message
  if (error && typeof error === 'object') {
    try {
      const serialized = JSON.stringify(error)
      if (serialized && serialized !== '{}') return serialized
    } catch {}
  }
  return fallback
}

export default function DesktopSetupPage() {
  const [companyName, setCompanyName] = useState('')
  const [companyNit, setCompanyNit] = useState('')
  const [adminName, setAdminName] = useState('')
  const [adminEmail, setAdminEmail] = useState('')
  const [adminPassword, setAdminPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [databaseMode, setDatabaseMode] = useState<DatabaseMode>('system-local')
  const [databaseName, setDatabaseName] = useState('POS')
  const [databaseHost, setDatabaseHost] = useState('127.0.0.1')
  const [databasePort, setDatabasePort] = useState('5432')
  const [databaseUsername, setDatabaseUsername] = useState('postgres')
  const [databasePassword, setDatabasePassword] = useState('')
  const [databaseUrl, setDatabaseUrl] = useState('')
  const [step, setStep] = useState<SetupStep>('database')
  const [loading, setLoading] = useState(false)
  const [checking, setChecking] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    fetch('/api/setup')
      .then(async response => {
        const status = await response.json() as SetupStatus
        if (!response.ok) throw new Error(status.error || 'No se pudo verificar el estado del sistema.')
        if (!active) return
        if (!status.databaseConfigured) {
          setStep('database')
          return
        }
        if (!status.dbConnected) {
          throw new Error(status.databaseError || status.error || 'No se pudo conectar con la base de datos configurada.')
        }
        if (!status.setupRequired) window.location.replace('/')
        else setStep('company')
      })
      .catch(err => {
        if (active) setError(getErrorMessage(err, 'No se pudo verificar el estado del sistema.'))
      })
      .finally(() => {
        if (active) setChecking(false)
      })
    return () => { active = false }
  }, [])

  async function handleDatabaseSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    if (databaseMode !== 'remote' && !/^[A-Za-z_][A-Za-z0-9_]{0,62}$/.test(databaseName)) {
      setError('El nombre debe iniciar con letra o _ y contener solo letras, números y _ (máximo 63 caracteres).')
      return
    }
    if (databaseMode === 'system-local' &&
        (!databaseHost.trim() || !/^\d{1,5}$/.test(databasePort) ||
         Number(databasePort) < 1 || Number(databasePort) > 65535 || !databaseUsername.trim())) {
      setError('Revisa el host, puerto y usuario del PostgreSQL instalado.')
      return
    }
    if (databaseMode === 'remote' && !/^postgres(?:ql)?:\/\//i.test(databaseUrl.trim())) {
      setError('Ingresa una URL válida de conexión PostgreSQL.')
      return
    }

    setLoading(true)
    try {
      const invoke = (window as DesktopWindow).__TAURI__?.core?.invoke
      if (!invoke) throw new Error('La configuración de base de datos solo está disponible en la aplicación de escritorio.')
      await invoke('configure_database', {
        mode: databaseMode,
        databaseName: databaseMode !== 'remote' ? databaseName.trim() : null,
        host: databaseMode === 'system-local' ? databaseHost.trim() : null,
        port: databaseMode === 'system-local' ? databasePort.trim() : null,
        username: databaseMode === 'system-local' ? databaseUsername.trim() : null,
        password: databaseMode === 'system-local' ? databasePassword : null,
        databaseUrl: databaseMode === 'remote' ? databaseUrl.trim() : null,
      })
      const response = await fetch('/api/setup')
      const status = await response.json() as SetupStatus
      if (!response.ok || !status.dbConnected) {
        throw new Error(status.databaseError || status.error || 'No se pudo conectar con la base de datos. Revisa la URL, credenciales, base existente y acceso de red.')
      }
      if (!status.setupRequired) {
        window.location.replace('/')
        return
      }
      setStep('company')
    } catch (err) {
      setError(getErrorMessage(err, 'No se pudo configurar la base de datos.'))
    } finally {
      setLoading(false)
    }
  }

  async function handleCompanySubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    if (adminPassword.length < 12) {
      setError('La contraseña debe tener al menos 12 caracteres.')
      return
    }
    if (adminPassword !== confirmPassword) {
      setError('Las contraseñas no coinciden.')
      return
    }

    setLoading(true)
    try {
      const response = await fetch('/api/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyName, companyNit, adminName, adminEmail, adminPassword }),
      })
      const result = await response.json()
      if (!response.ok || !result.ok) throw new Error(result.error || 'No se pudo completar la configuración.')
      window.location.replace('/login')
    } catch (err) {
      setError(getErrorMessage(err, 'No se pudo completar la configuración inicial.'))
    } finally {
      setLoading(false)
    }
  }

  const fieldClass = 'w-full bg-input border border-line-soft focus:border-accent rounded-lg px-3.5 py-2.5 text-sm text-fg placeholder-fg-dim outline-none transition-colors'

  return (
    <main className="min-h-screen bg-app text-fg font-sans flex items-center justify-center p-4 sm:p-6 relative overflow-hidden">
      <div
        className="absolute inset-0 opacity-15 pointer-events-none"
        style={{
          backgroundImage: 'radial-gradient(var(--accent) 1px, transparent 1px)',
          backgroundSize: '40px 40px',
        }}
      />
      <section className="w-full max-w-xl bg-veil border border-line-soft rounded-xl p-6 sm:p-8 space-y-6 shadow-2xl relative z-10">
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-accent via-accent-hover to-accent rounded-t-xl" />
        <header className="space-y-2">
          <div className="flex items-center gap-2 text-accent">
            <ShieldCheck className="w-6 h-6" />
            <span className="text-[11px] font-semibold bg-accent/10 px-2 py-0.5 rounded border border-accent/20">POS DIAN</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight pt-2">
            {step === 'database' ? 'Configura tu base de datos' : 'Configura tu POS'}
          </h1>
          <p className="text-sm text-fg-muted">
            {step === 'database'
              ? 'Elige dónde se guardará la información. Esta selección se realiza antes de iniciar la base de datos.'
              : 'Registra tu empresa y crea la cuenta administradora.'}
          </p>
        </header>

        {error && (
          <div role="alert" className="bg-alert/10 border border-alert/40 rounded-lg p-3 text-sm text-alert flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {checking ? (
          <div className="flex items-center justify-center gap-2 py-8 text-sm text-fg-muted">
            <Loader2 className="w-4 h-4 animate-spin" /> Verificando el sistema...
          </div>
        ) : step === 'database' ? (
          <form onSubmit={handleDatabaseSubmit} className="space-y-5">
            <fieldset disabled={loading} className="space-y-3">
              <legend className="text-sm font-semibold text-fg-soft mb-3">Ubicación de la base de datos</legend>
              <label className={`flex gap-3 p-4 rounded-lg border cursor-pointer transition-colors ${databaseMode === 'system-local' ? 'border-accent bg-accent/5' : 'border-line-soft'}`}>
                <input type="radio" name="databaseMode" value="system-local" checked={databaseMode === 'system-local'} onChange={() => { setDatabaseMode('system-local'); setError(null) }} className="mt-1 accent-orange-600" />
                <HardDrive className="w-5 h-5 text-accent shrink-0" />
                <span className="space-y-1">
                  <span className="block text-sm font-semibold">PostgreSQL instalado en este equipo</span>
                  <span className="block text-xs text-fg-muted">Conecta tu servicio local existente, por ejemplo el que usas desde pgAdmin.</span>
                </span>
              </label>
              <label className={`flex gap-3 p-4 rounded-lg border cursor-pointer transition-colors ${databaseMode === 'bundled' ? 'border-accent bg-accent/5' : 'border-line-soft'}`}>
                <input type="radio" name="databaseMode" value="bundled" checked={databaseMode === 'bundled'} onChange={() => { setDatabaseMode('bundled'); setError(null) }} className="mt-1 accent-orange-600" />
                <Server className="w-5 h-5 text-accent shrink-0" />
                <span className="space-y-1">
                  <span className="block text-sm font-semibold">PostgreSQL privado incluido</span>
                  <span className="block text-xs text-fg-muted">Crea un motor aislado que administra el POS y guarda los datos solo en este equipo.</span>
                </span>
              </label>
              <label className={`flex gap-3 p-4 rounded-lg border cursor-pointer transition-colors ${databaseMode === 'remote' ? 'border-accent bg-accent/5' : 'border-line-soft'}`}>
                <input type="radio" name="databaseMode" value="remote" checked={databaseMode === 'remote'} onChange={() => { setDatabaseMode('remote'); setError(null) }} className="mt-1 accent-orange-600" />
                <Cloud className="w-5 h-5 text-accent shrink-0" />
                <span className="space-y-1">
                  <span className="block text-sm font-semibold">PostgreSQL remoto o en la nube</span>
                  <span className="block text-xs text-fg-muted">Conecta una base PostgreSQL existente, accesible desde este equipo.</span>
                </span>
              </label>
            </fieldset>

            {databaseMode === 'system-local' ? (
              <div className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <label className="block space-y-1.5">
                    <span className="text-xs font-semibold text-fg-soft">Host</span>
                    <input className={fieldClass} required value={databaseHost} onChange={event => setDatabaseHost(event.target.value)} placeholder="127.0.0.1" />
                  </label>
                  <label className="block space-y-1.5">
                    <span className="text-xs font-semibold text-fg-soft">Puerto</span>
                    <input className={fieldClass} type="number" min={1} max={65535} required value={databasePort} onChange={event => setDatabasePort(event.target.value)} />
                  </label>
                  <label className="block space-y-1.5">
                    <span className="text-xs font-semibold text-fg-soft">Usuario PostgreSQL</span>
                    <input className={fieldClass} required autoComplete="username" value={databaseUsername} onChange={event => setDatabaseUsername(event.target.value)} />
                  </label>
                  <label className="block space-y-1.5">
                    <span className="text-xs font-semibold text-fg-soft">Contraseña PostgreSQL</span>
                    <input className={fieldClass} type="password" autoComplete="current-password" value={databasePassword} onChange={event => setDatabasePassword(event.target.value)} />
                  </label>
                </div>
                <label className="block space-y-1.5">
                  <span className="flex items-center gap-1.5 text-xs font-semibold text-fg-soft"><Database className="w-3.5 h-3.5 text-accent" /> Base de datos existente</span>
                  <input className={fieldClass} required maxLength={63} pattern="[A-Za-z_][A-Za-z0-9_]{0,62}" value={databaseName} onChange={event => setDatabaseName(event.target.value)} placeholder="POS" />
                  <span className="block text-xs text-fg-muted">Usa el nombre exacto que aparece en pgAdmin. Se necesita permiso para aplicar las tablas del POS. Si PostgreSQL usa autenticación por contraseña, ingrésala arriba.</span>
                </label>
              </div>
            ) : databaseMode === 'bundled' ? (
              <label className="block space-y-1.5">
                <span className="flex items-center gap-1.5 text-xs font-semibold text-fg-soft"><Database className="w-3.5 h-3.5 text-accent" /> Nombre de la base de datos</span>
                <input className={fieldClass} required maxLength={63} pattern="[A-Za-z_][A-Za-z0-9_]{0,62}" value={databaseName} onChange={event => setDatabaseName(event.target.value)} />
                <span className="block text-xs text-fg-muted">Solo letras, números y _. El motor es privado del POS; los datos anteriores no se eliminan.</span>
              </label>
            ) : (
              <label className="block space-y-1.5">
                <span className="flex items-center gap-1.5 text-xs font-semibold text-fg-soft"><Database className="w-3.5 h-3.5 text-accent" /> URL de conexión PostgreSQL</span>
                <input className={fieldClass} type="password" autoComplete="off" required value={databaseUrl} onChange={event => setDatabaseUrl(event.target.value)} placeholder="postgresql://usuario:contraseña@servidor:5432/base" />
                <span className="block text-xs text-fg-muted">La URL incluye el nombre de la base. Se requiere acceso de red y permiso para aplicar migraciones.</span>
              </label>
            )}

            <button type="submit" disabled={loading} className="w-full bg-accent hover:bg-accent-hover disabled:bg-accent/50 text-white font-semibold text-sm py-3 rounded-lg flex items-center justify-center gap-2 transition-all shadow-lg shadow-accent/20 disabled:cursor-not-allowed">
              {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Conectando...</> : <>Continuar <ArrowRight className="w-4 h-4" /></>}
            </button>
          </form>
        ) : (
          <form onSubmit={handleCompanySubmit} className="space-y-5">
            <fieldset disabled={loading} className="space-y-4">
              <legend className="text-sm font-semibold text-fg-soft mb-3">Datos de la empresa</legend>
              <label className="block space-y-1.5">
                <span className="flex items-center gap-1.5 text-xs font-semibold text-fg-soft"><Building2 className="w-3.5 h-3.5 text-accent" /> Nombre o razón social</span>
                <input className={fieldClass} required maxLength={160} autoComplete="organization" value={companyName} onChange={event => setCompanyName(event.target.value)} placeholder="Mi Empresa S.A.S." />
              </label>
              <label className="block space-y-1.5">
                <span className="text-xs font-semibold text-fg-soft">NIT</span>
                <input className={fieldClass} required maxLength={30} value={companyNit} onChange={event => setCompanyNit(event.target.value)} placeholder="901234567-8" />
              </label>
            </fieldset>

            <fieldset disabled={loading} className="space-y-4 border-t border-line-soft pt-4">
              <legend className="text-sm font-semibold text-fg-soft mb-3">Cuenta administradora</legend>
              <label className="block space-y-1.5">
                <span className="flex items-center gap-1.5 text-xs font-semibold text-fg-soft"><UserRound className="w-3.5 h-3.5 text-accent" /> Nombre completo</span>
                <input className={fieldClass} required maxLength={120} autoComplete="name" value={adminName} onChange={event => setAdminName(event.target.value)} placeholder="Nombre del administrador" />
              </label>
              <label className="block space-y-1.5">
                <span className="flex items-center gap-1.5 text-xs font-semibold text-fg-soft"><Mail className="w-3.5 h-3.5 text-accent" /> Correo electrónico</span>
                <input className={fieldClass} type="email" required maxLength={254} autoComplete="email" value={adminEmail} onChange={event => setAdminEmail(event.target.value)} placeholder="tu@empresa.com" />
              </label>
              <label className="block space-y-1.5">
                <span className="flex items-center gap-1.5 text-xs font-semibold text-fg-soft"><LockKeyhole className="w-3.5 h-3.5 text-accent" /> Contraseña (mínimo 12 caracteres)</span>
                <input className={fieldClass} type="password" required minLength={12} autoComplete="new-password" value={adminPassword} onChange={event => setAdminPassword(event.target.value)} />
              </label>
              <label className="block space-y-1.5">
                <span className="text-xs font-semibold text-fg-soft">Confirmar contraseña</span>
                <input className={fieldClass} type="password" required minLength={12} autoComplete="new-password" value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)} />
              </label>
            </fieldset>

            <button type="submit" disabled={loading} className="w-full bg-accent hover:bg-accent-hover disabled:bg-accent/50 text-white font-semibold text-sm py-3 rounded-lg flex items-center justify-center gap-2 transition-all shadow-lg shadow-accent/20 disabled:cursor-not-allowed">
              {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Configurando...</> : <>Crear cuenta y continuar <ArrowRight className="w-4 h-4" /></>}
            </button>
          </form>
        )}
      </section>
    </main>
  )
}
