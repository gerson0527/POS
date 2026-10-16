'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Building2,
  ArrowRight,
  ArrowLeft,
  Check,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Mail,
  Phone,
  MapPin,
  Hash,
  FileText,
  Globe,
  User,
} from 'lucide-react'
import { completeTenantOnboarding, getOnboardingStatus } from '@/app/actions/pos-actions'
import { Input } from '@/components/ui/Input'
import { Label } from '@/components/ui/Label'

type Step = 0 | 1 | 2

interface FormData {
  // Paso 1
  name: string
  legalName: string
  tradeName: string
  nit: string
  dv: string
  // Paso 2
  email: string
  phone: string
  address: string
  city: string
  department: string
  country: string
  // Paso 3
  legalRepresentative: string
  legalRepDocNumber: string
  economicActivity: string
  website: string
}

const EMPTY_FORM: FormData = {
  name: '',
  legalName: '',
  tradeName: '',
  nit: '',
  dv: '',
  email: '',
  phone: '',
  address: '',
  city: '',
  department: '',
  country: 'Colombia',
  legalRepresentative: '',
  legalRepDocNumber: '',
  economicActivity: '',
  website: '',
}

export default function OnboardingPage() {
  const router = useRouter()
  const [step, setStep] = useState<Step>(0)
  const [form, setForm] = useState<FormData>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [isAdmin, setIsAdmin] = useState(false)
  const [alreadyCompleted, setAlreadyCompleted] = useState(false)
  const [tenantHint, setTenantHint] = useState<{ name: string | null; nit: string | null }>({ name: null, nit: null })

  useEffect(() => {
    let mounted = true
    ;(async () => {
      try {
        const status = await getOnboardingStatus()
        if (!mounted) return
        setIsAdmin(status.isAdmin)
        setAlreadyCompleted(status.completed)
        setTenantHint({ name: status.tenantName, nit: status.tenantNit })
        if (status.completed) {
          // Ya completado: redirigir al dashboard
          router.push('/dashboard')
          return
        }
        if (!status.isAdmin) {
          // No es admin: no puede completar el wizard
          router.push('/dashboard')
          return
        }
        // Pre-llenar con los datos existentes del tenant
        setForm((prev) => ({
          ...prev,
          name: status.tenantName || prev.name,
          nit: status.tenantNit || prev.nit,
        }))
      } catch (err) {
        if (!mounted) return
        setError('No se pudo cargar el estado del tenant. Intenta recargar la página.')
      } finally {
        if (mounted) setLoading(false)
      }
    })()
    return () => {
      mounted = false
    }
  }, [router])

  function validateStep(target: Step): string | null {
    if (target === 1) {
      if (!form.name.trim()) return 'El nombre comercial es obligatorio.'
      if (!form.legalName.trim()) return 'La razón social es obligatoria.'
      const nitClean = form.nit.replace(/[\s.-]/g, '')
      if (!nitClean) return 'El NIT es obligatorio.'
      if (nitClean.length < 8 || nitClean.length > 16) {
        return 'El NIT debe tener entre 8 y 16 dígitos (sin contar el DV).'
      }
    }
    if (target === 2) {
      if (!form.email.trim()) return 'El email es obligatorio.'
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) return 'El email no tiene formato válido.'
      if (!form.phone.trim()) return 'El teléfono es obligatorio.'
      if (form.phone.replace(/\D/g, '').length < 7) return 'El teléfono debe tener al menos 7 dígitos.'
      if (!form.address.trim()) return 'La dirección es obligatoria.'
      if (!form.city.trim()) return 'La ciudad es obligatoria.'
      if (!form.department.trim()) return 'El departamento es obligatorio.'
    }
    return null
  }

  function next() {
    setError(null)
    const err = validateStep((step + 1) as Step)
    if (err) {
      setError(err)
      return
    }
    setStep((step + 1) as Step)
  }

  function back() {
    setError(null)
    setStep((step - 1) as Step)
  }

  async function finish() {
    setError(null)
    const err = validateStep(2)
    if (err) {
      setError(err)
      setStep(2)
      return
    }
    setSaving(true)
    try {
      await completeTenantOnboarding(form)
      router.push('/dashboard')
    } catch (err: any) {
      setError(err.message || 'No se pudo guardar la información. Intenta nuevamente.')
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-app font-mono">
        <div className="flex items-center gap-2 text-accent text-sm">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span>CARGANDO WIZARD DE ONBOARDING...</span>
        </div>
      </div>
    )
  }

  if (!isAdmin || alreadyCompleted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-app font-mono p-6">
        <div className="bg-panel border border-line rounded-[6px] p-6 max-w-md text-center">
          <AlertCircle className="w-10 h-10 text-warning mx-auto mb-3" />
          <h2 className="text-fg font-bold uppercase text-sm mb-2">
            Wizard no disponible
          </h2>
          <p className="text-fg-muted text-xs">
            El wizard de onboarding solo está disponible para administradores en su primer inicio
            de sesión. Serás redirigido al dashboard.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-app font-mono py-8 px-4 flex items-center justify-center">
      <div className="w-full max-w-3xl space-y-6">
        {/* Header Banner */}
        <div className="bg-gradient-to-r from-panel via-veil to-ember border border-accent/30 rounded-[8px] p-6 border-l-4 border-l-accent shadow-2xl">
          <div className="flex items-center gap-3 mb-1.5">
            <Building2 className="w-5 h-5 text-accent" />
            <span className="text-accent font-bold uppercase tracking-wider text-[10px]">
              CONFIGURACIÓN INICIAL DEL SISTEMA
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white uppercase">
            BIENVENIDO AL POS RETAIL
          </h1>
          <p className="text-xs text-fg-soft font-sans mt-1.5">
            Antes de operar, necesitamos los datos básicos de la empresa. Solo se solicita <strong className="text-accent">una vez</strong>.
            {tenantHint.name && (
              <span className="text-fg-faint"> · Detectamos: <span className="text-fg font-bold">{tenantHint.name}</span></span>
            )}
          </p>
        </div>

        {/* Stepper */}
        <div className="flex items-center justify-between gap-2">
          {[
            { idx: 0, label: 'EMPRESA', icon: Building2 },
            { idx: 1, label: 'CONTACTO', icon: MapPin },
            { idx: 2, label: 'REPRESENTANTE', icon: User },
          ].map((s) => {
            const isActive = step === s.idx
            const isComplete = step > s.idx
            const Icon = s.icon
            return (
              <div
                key={s.idx}
                className={`flex-1 flex items-center gap-2 p-3 rounded border transition-all ${
                  isActive
                    ? 'bg-accent/10 border-accent text-fg'
                    : isComplete
                    ? 'bg-ok-dim border-ok-line text-ok'
                    : 'bg-surface border-line-soft text-fg-muted'
                }`}
              >
                <div
                  className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
                    isActive
                      ? 'bg-accent text-white'
                      : isComplete
                      ? 'bg-ok text-white'
                      : 'bg-line-soft text-fg-muted'
                  }`}
                >
                  {isComplete ? <Check className="w-4 h-4" /> : s.idx + 1}
                </div>
                <div className="flex items-center gap-1.5">
                  <Icon className="w-3.5 h-3.5" />
                  <span className="text-[10px] font-bold uppercase tracking-wider">{s.label}</span>
                </div>
              </div>
            )
          })}
        </div>

        {/* Form Body */}
        <div className="bg-veil border border-line-soft rounded-[8px] p-6 space-y-5 min-h-[420px]">
          {step === 0 && (
            <>
              <div className="flex items-center gap-2 text-[#10px] text-fg-muted font-bold uppercase tracking-widest">
                <Building2 className="w-3 h-3 text-accent" />
                Paso 1 · Identidad de la empresa
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field
                  icon={<Hash className="w-3.5 h-3.5" />}
                  label="NIT *"
                  help="Incluye dígito de verificación. Ej: 900123456-7"
                >
                  <Input
                    type="text"
                    value={form.nit}
                    onChange={(e) => setForm({ ...form, nit: e.target.value })}
                    placeholder="900123456-7"
                    className="px-3 py-2.5 font-mono text-xs outline-none"
                  />
                </Field>
                <Field icon={<Hash className="w-3.5 h-3.5" />} label="DV (opcional, ya incluido en el NIT)">
                  <Input
                    type="text"
                    maxLength={1}
                    value={form.dv}
                    onChange={(e) => setForm({ ...form, dv: e.target.value.replace(/\D/g, '') })}
                    placeholder="7"
                    className="px-3 py-2.5 font-mono text-xs outline-none"
                  />
                </Field>
                <Field icon={<Building2 className="w-3.5 h-3.5" />} label="Razón social *">
                  <Input
                    type="text"
                    value={form.legalName}
                    onChange={(e) => setForm({ ...form, legalName: e.target.value })}
                    placeholder="Razón social registrada en cámara de comercio"
                    className="px-3 py-2.5 font-mono text-xs outline-none"
                  />
                </Field>
                <Field icon={<Building2 className="w-3.5 h-3.5" />} label="Nombre comercial *">
                  <Input
                    type="text"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="Cómo te conocen tus clientes"
                    className="px-3 py-2.5 font-mono text-xs outline-none"
                  />
                </Field>
                <Field icon={<FileText className="w-3.5 h-3.5" />} label="Razón social comercial (opcional)">
                  <Input
                    type="text"
                    value={form.tradeName}
                    onChange={(e) => setForm({ ...form, tradeName: e.target.value })}
                    placeholder="Si difiere de la razón social"
                    className="px-3 py-2.5 font-mono text-xs outline-none"
                  />
                </Field>
              </div>
            </>
          )}

          {step === 1 && (
            <>
              <div className="flex items-center gap-2 text-[10px] text-fg-muted font-bold uppercase tracking-widest">
                <MapPin className="w-3 h-3 text-accent" />
                Paso 2 · Contacto y ubicación
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field icon={<Mail className="w-3.5 h-3.5" />} label="Email corporativo *">
                  <Input
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    placeholder="contacto@empresa.com"
                    className="px-3 py-2.5 font-mono text-xs outline-none"
                  />
                </Field>
                <Field icon={<Phone className="w-3.5 h-3.5" />} label="Teléfono *">
                  <Input
                    type="tel"
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    placeholder="+57 601 123 4567"
                    className="px-3 py-2.5 font-mono text-xs outline-none"
                  />
                </Field>
                <Field icon={<MapPin className="w-3.5 h-3.5" />} label="Dirección *">
                  <Input
                    type="text"
                    value={form.address}
                    onChange={(e) => setForm({ ...form, address: e.target.value })}
                    placeholder="Calle 100 # 15-20"
                    className="px-3 py-2.5 font-mono text-xs outline-none"
                  />
                </Field>
                <Field icon={<MapPin className="w-3.5 h-3.5" />} label="Ciudad / Municipio *">
                  <Input
                    type="text"
                    value={form.city}
                    onChange={(e) => setForm({ ...form, city: e.target.value })}
                    placeholder="Bogotá D.C."
                    className="px-3 py-2.5 font-mono text-xs outline-none"
                  />
                </Field>
                <Field icon={<MapPin className="w-3.5 h-3.5" />} label="Departamento *">
                  <Input
                    type="text"
                    value={form.department}
                    onChange={(e) => setForm({ ...form, department: e.target.value })}
                    placeholder="Cundinamarca"
                    className="px-3 py-2.5 font-mono text-xs outline-none"
                  />
                </Field>
                <Field icon={<Globe className="w-3.5 h-3.5" />} label="País">
                  <Input
                    type="text"
                    value={form.country}
                    onChange={(e) => setForm({ ...form, country: e.target.value })}
                    className="px-3 py-2.5 font-mono text-xs outline-none"
                  />
                </Field>
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <div className="flex items-center gap-2 text-[10px] text-fg-muted font-bold uppercase tracking-widest">
                <User className="w-3 h-3 text-accent" />
                Paso 3 · Representante legal (opcional, recomendado)
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field icon={<User className="w-3.5 h-3.5" />} label="Nombre completo">
                  <Input
                    type="text"
                    value={form.legalRepresentative}
                    onChange={(e) => setForm({ ...form, legalRepresentative: e.target.value })}
                    placeholder="Nombre del representante legal"
                    className="px-3 py-2.5 font-mono text-xs outline-none"
                  />
                </Field>
                <Field icon={<Hash className="w-3.5 h-3.5" />} label="Cédula del representante">
                  <Input
                    type="text"
                    value={form.legalRepDocNumber}
                    onChange={(e) => setForm({ ...form, legalRepDocNumber: e.target.value })}
                    placeholder="1234567890"
                    className="px-3 py-2.5 font-mono text-xs outline-none"
                  />
                </Field>
                <Field
                  icon={<FileText className="w-3.5 h-3.5" />}
                  label="Actividad económica (CIIU)"
                  help="Ej: 4711 — Comercio al por menor"
                >
                  <Input
                    type="text"
                    value={form.economicActivity}
                    onChange={(e) => setForm({ ...form, economicActivity: e.target.value })}
                    placeholder="4711"
                    className="px-3 py-2.5 font-mono text-xs outline-none"
                  />
                </Field>
                <Field icon={<Globe className="w-3.5 h-3.5" />} label="Sitio web">
                  <Input
                    type="url"
                    value={form.website}
                    onChange={(e) => setForm({ ...form, website: e.target.value })}
                    placeholder="https://empresa.com"
                    className="px-3 py-2.5 font-mono text-xs outline-none"
                  />
                </Field>
              </div>

              <div className="bg-input border border-line-soft rounded p-3 text-[10px] text-fg-muted flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-ok shrink-0 mt-0.5" />
                <div>
                  <div className="text-ok font-bold uppercase tracking-wider mb-1">
                    Listo para activar
                  </div>
                  Al guardar, se marcará esta empresa como <strong>onboarding completado</strong> y no volverás a ver este wizard. Los demás
                  administradores que ingresen después serán dirigidos directamente al dashboard.
                </div>
              </div>
            </>
          )}

          {error && (
            <div className="flex items-start gap-2 p-3 rounded text-[11px] font-bold bg-alert-dim border border-alert-line text-danger">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              {error}
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div className="flex items-center justify-between">
          {step > 0 ? (
            <button
              type="button"
              onClick={back}
              className="flex items-center gap-2 px-4 py-2.5 bg-raised border border-line hover:border-line-strong text-fg font-bold uppercase text-[10px] tracking-wider rounded transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              ATRÁS
            </button>
          ) : (
            <div />
          )}

          {step < 2 ? (
            <button
              type="button"
              onClick={next}
              className="flex items-center gap-2 px-5 py-2.5 bg-accent text-white font-bold uppercase text-[10px] tracking-wider rounded hover:bg-accent-hover transition-colors"
            >
              SIGUIENTE
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          ) : (
            <button
              type="button"
              onClick={finish}
              disabled={saving}
              className="flex items-center gap-2 px-5 py-2.5 bg-ok text-white font-bold uppercase text-[10px] tracking-wider rounded hover:bg-ok-strong transition-colors disabled:opacity-50"
            >
              {saving ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  GUARDANDO...
                </>
              ) : (
                <>
                  <Check className="w-3.5 h-3.5" />
                  COMPLETAR ONBOARDING
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function Field({
  icon,
  label,
  help,
  children,
}: {
  icon: React.ReactNode
  label: string
  help?: string
  children: React.ReactNode
}) {
  return (
    <div className="space-y-1.5">
      <Label className="flex items-center gap-1.5">
        {icon}
        {label}
      </Label>
      {children}
      {help && <p className="text-[10px] text-fg-faint font-mono">{help}</p>}
    </div>
  )
}
