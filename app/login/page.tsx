'use client'

import { useState, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { authClient } from '@/lib/auth-client'
import { ShieldCheck, Mail, Lock, Eye, EyeOff, ArrowRight, Loader2, AlertCircle, Terminal } from 'lucide-react'
import { Label } from '@/components/ui/Label'

function LoginForm() {
  const searchParams = useSearchParams()
  const redirectPath = searchParams.get('redirect') || '/dashboard'

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email || !password) {
      setError('Por favor ingresa tu correo y contraseña')
      return
    }

    setLoading(true)
    setError(null)

    try {
      const res = await authClient.signIn.email({
        email,
        password,
      })

      if (res.error) {
        setError(res.error.message || 'Credenciales inválidas. Por favor verifica tus datos.')
        setLoading(false)
      } else {
        // Redirigir limpiando caché de navegación
        window.location.href = redirectPath
      }
    } catch (err: any) {
      setError(err?.message || 'Error de autenticación con el servidor. Intenta de nuevo.')
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-app text-fg font-sans flex items-center justify-center p-4 sm:p-6 relative overflow-hidden">
      {/* Dynamic background grid effect */}
      <div 
        className="absolute inset-0 opacity-15 pointer-events-none" 
        style={{
          backgroundImage: `radial-gradient(var(--accent) 1px, transparent 1px), radial-gradient(var(--accent) 1px, var(--bg-app) 1px)`,
          backgroundSize: '40px 40px',
          backgroundPosition: '0 0, 20px 20px'
        }}
      />
      
      {/* Ambient background glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-accent/5 rounded-full blur-3xl pointer-events-none" />

      <div className="w-full max-w-md bg-veil border border-line-soft rounded-xl p-6 sm:p-8 space-y-6 shadow-2xl relative z-10">
        {/* Glowing top line indicator */}
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-accent via-accent-hover to-accent rounded-t-xl" />

        {/* Header Section */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-6 h-6 text-accent" />
              <span className="text-[11px] text-accent font-semibold bg-accent/10 px-2 py-0.5 rounded border border-accent/20">
                POS DIAN
              </span>
            </div>
            <div className="flex items-center gap-1.5 text-[10px] text-fg-muted">
              <span className="w-2 h-2 rounded-full bg-ok animate-pulse" />
              En línea
            </div>
          </div>

          <h1 className="text-2xl font-bold tracking-tight text-fg pt-2">
            Iniciar sesión
          </h1>
          <p className="text-xs text-fg-muted">
            Ingresa tus credenciales para acceder a tu panel.
          </p>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="bg-alert/10 border border-alert/40 rounded-lg p-3 text-xs text-alert flex items-start gap-2.5 animate-in fade-in duration-200">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-alert" />
            <div className="flex-1 font-medium">{error}</div>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label className="flex items-center gap-1.5 text-[11px] font-semibold text-fg-soft">
              <Mail className="w-3.5 h-3.5 text-accent" />
              Correo Electrónico
            </Label>
            <div className="relative">
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="tu@empresa.com"
                className="w-full bg-input border border-line-soft focus:border-accent rounded-lg px-3.5 py-2.5 text-xs text-fg placeholder-fg-dim outline-none transition-colors"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="flex items-center gap-1.5 text-[11px] font-semibold text-fg-soft">
              <Lock className="w-3.5 h-3.5 text-accent" />
              Contraseña
            </Label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••"
                className="w-full bg-input border border-line-soft focus:border-accent rounded-lg px-3.5 py-2.5 text-xs text-fg placeholder-fg-dim outline-none transition-colors pr-10"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-fg-muted hover:text-fg transition-colors"
                tabIndex={-1}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full mt-2 bg-accent hover:bg-accent-hover disabled:bg-accent/50 text-white font-semibold text-sm py-3 rounded-lg flex items-center justify-center gap-2 transition-all shadow-lg shadow-accent/20 hover:shadow-accent/40 disabled:cursor-not-allowed cursor-pointer"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Autenticando...
              </>
            ) : (
              <>
                Acceder al Sistema
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>

        {/* Cuentas de prueba — solo entorno de desarrollo */}
        {process.env.NODE_ENV === 'development' && (
          <div className="bg-surface border border-line-soft rounded-lg p-3 text-[10px] text-fg-muted space-y-1">
            <div className="font-semibold text-fg-soft">Cuentas de prueba (solo desarrollo)</div>
            <div>admin@posdian.com · Admin123456!</div>
            <div>gersongio0527@gmail.com · 12345678password</div>
          </div>
        )}

        {/* Footer */}
        <div className="pt-2 border-t border-line-soft flex items-center justify-center gap-1.5 text-[10px] text-fg-muted">
          <Terminal className="w-3 h-3 text-accent" />
          <span>Punto de venta · Facturación electrónica DIAN</span>
        </div>
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-app text-fg font-sans flex items-center justify-center">
          <Loader2 className="w-8 h-8 text-accent animate-spin" />
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  )
}
