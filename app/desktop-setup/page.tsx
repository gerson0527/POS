'use client'

import { useEffect, useState } from 'react'
import { AlertCircle, ArrowRight, Building2, Loader2, LockKeyhole, Mail, ShieldCheck, UserRound } from 'lucide-react'

export default function DesktopSetupPage() {
  const [companyName, setCompanyName] = useState('')
  const [companyNit, setCompanyNit] = useState('')
  const [adminName, setAdminName] = useState('')
  const [adminEmail, setAdminEmail] = useState('')
  const [adminPassword, setAdminPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [checking, setChecking] = useState(true)
  const [canSetup, setCanSetup] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    fetch('/api/setup')
      .then(async response => {
        const status = await response.json()
        if (!response.ok || !status.dbConnected) {
          throw new Error(status.error || 'No se pudo conectar con la base privada del POS.')
        }
        if (!status.setupRequired) window.location.replace('/')
        else if (active) setCanSetup(true)
      })
      .catch(err => {
        if (active) setError(err instanceof Error ? err.message : 'No se pudo verificar el estado del sistema.')
      })
      .finally(() => {
        if (active) setChecking(false)
      })
    return () => { active = false }
  }, [])

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
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
      setError(err instanceof Error ? err.message : 'No se pudo completar la configuración inicial.')
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
          <h1 className="text-2xl font-bold tracking-tight pt-2">Configura tu POS</h1>
          <p className="text-sm text-fg-muted">
            Registra tu empresa y crea la cuenta administradora. Tus datos se guardarán en la base privada de este equipo.
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
            <Loader2 className="w-4 h-4 animate-spin" /> Verificando la base privada...
          </div>
        ) : canSetup ? (
          <form onSubmit={handleSubmit} className="space-y-5">
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

            <button
              type="submit"
              disabled={loading || checking}
              className="w-full bg-accent hover:bg-accent-hover disabled:bg-accent/50 text-white font-semibold text-sm py-3 rounded-lg flex items-center justify-center gap-2 transition-all shadow-lg shadow-accent/20 disabled:cursor-not-allowed"
            >
              {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Configurando...</> : <>Crear cuenta y continuar <ArrowRight className="w-4 h-4" /></>}
            </button>
          </form>
        ) : null}
      </section>
    </main>
  )
}
