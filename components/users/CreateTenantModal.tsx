'use client'

import { useState } from 'react'
import {
  Building2,
  Users,
  Check,
  CheckCircle2,
} from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { TacticalButton } from '@/components/tactical/TacticalButton'
import { Input } from '@/components/ui/Input'
import { Label } from '@/components/ui/Label'
import { useToast } from '@/components/ui/ToastProvider'
import { createTenantWithAdmin } from '@/app/actions/pos-actions'

const EMPTY_TENANT_FORM = {
  adminName: '',
  adminEmail: '',
  adminPassword: '',
  companyName: '',
  companyLegalName: '',
  companyNit: '',
  companyDv: '',
  companyTradeName: '',
  companyEmail: '',
  companyPhone: '',
  companyAddress: '',
  companyCity: '',
  companyDepartment: '',
  companyCountry: 'Colombia',
  companyLegalRepresentative: '',
  companyLegalRepDocNumber: '',
  companyEconomicActivity: '',
  companyWebsite: '',
}

function validateTenantStep(step: number, tenantForm: any): string | null {
  if (step === 0) {
    if (!tenantForm.adminName?.trim()) return 'El nombre del administrador es obligatorio.'
    if (!tenantForm.adminEmail?.trim()) return 'El email del administrador es obligatorio.'
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(tenantForm.adminEmail)) {
      return 'Email del administrador no tiene formato válido.'
    }
    if (!tenantForm.adminPassword || tenantForm.adminPassword.length < 8) {
      return 'La contraseña debe tener al menos 8 caracteres.'
    }
  }
  if (step === 1) {
    if (!tenantForm.companyName?.trim()) return 'El nombre comercial es obligatorio.'
    if (!tenantForm.companyLegalName?.trim()) return 'La razón social es obligatoria.'
    if (!tenantForm.companyNit?.trim()) return 'El NIT es obligatorio.'
  }
  return null
}

interface CreateTenantModalProps {
  open: boolean
  onClose: () => void
  onSubmitted: () => void
}

export function CreateTenantModal({ open, onClose, onSubmitted }: CreateTenantModalProps) {
  const { toast } = useToast()
  const [tenantForm, setTenantForm] = useState<any>(EMPTY_TENANT_FORM)
  const [tenantStep, setTenantStep] = useState(0)
  const [saving, setSaving] = useState(false)
  const [tenantError, setTenantError] = useState<string | null>(null)
  const [createdTenant, setCreatedTenant] = useState<any | null>(null)

  function nextTenantStep() {
    setTenantError(null)
    const err = validateTenantStep(tenantStep, tenantForm)
    if (err) {
      setTenantError(err)
      return
    }
    setTenantStep((tenantStep + 1) as 0 | 1 | 2)
  }

  function prevTenantStep() {
    setTenantError(null)
    setTenantStep((tenantStep - 1) as 0 | 1 | 2)
  }

  async function handleCreateTenant(e: React.FormEvent) {
    e.preventDefault()
    setTenantError(null)

    const err1 = validateTenantStep(0, tenantForm)
    if (err1) {
      setTenantError(err1)
      setTenantStep(0)
      return
    }
    const err2 = validateTenantStep(1, tenantForm)
    if (err2) {
      setTenantError(err2)
      setTenantStep(1)
      return
    }

    setSaving(true)
    try {
      const res = await createTenantWithAdmin(tenantForm)
      setCreatedTenant(res)
      setTenantStep(2) // pantalla de éxito
      toast(`✅ Empresa "${tenantForm.companyName}" creada.`)
      onSubmitted()
    } catch (err: any) {
      setTenantError(err.message || 'Error desconocido al crear la empresa.')
      setSaving(false)
    } finally {
      setSaving(false)
    }
  }

  function closeTenantModal() {
    onClose()
    setTenantForm(EMPTY_TENANT_FORM)
    setTenantStep(0)
    setTenantError(null)
    setCreatedTenant(null)
    setSaving(false)
  }

  return (
    <Modal
      open={open}
      onClose={closeTenantModal}
      title={createdTenant ? 'EMPRESA CREADA EXITOSAMENTE' : 'NUEVA EMPRESA + ADMINISTRADOR'}
      icon={<Building2 className="w-4 h-4" />}
      size="2xl"
    >
      {createdTenant ? (
        // PANTALLA DE ÉXITO
        <div className="space-y-4">
          <div className="bg-ok-dim border border-ok-line rounded p-4 flex items-start gap-3">
            <CheckCircle2 className="w-6 h-6 text-ok shrink-0 mt-0.5" />
            <div className="flex-1">
              <div className="text-success font-bold uppercase tracking-wider text-xs mb-1">
                Empresa "{tenantForm.companyName}" creada
              </div>
              <div className="text-fg-muted text-xs">
                El administrador <strong className="text-fg">{tenantForm.adminName}</strong> ya puede
                iniciar sesión y completar el wizard de onboarding de su empresa.
              </div>
            </div>
          </div>

          <div className="bg-input border border-line-soft rounded p-3 font-mono text-[11px] space-y-1.5">
            <div className="flex justify-between">
              <span className="text-fg-muted">Slug de base de datos:</span>
              <code className="text-blue font-bold">{createdTenant.dbSlug}</code>
            </div>
            <div className="flex justify-between">
              <span className="text-fg-muted">Tenant ID:</span>
              <code className="text-ok text-[10px]">{createdTenant.tenantId}</code>
            </div>
            <div className="flex justify-between">
              <span className="text-fg-muted">Email del admin:</span>
              <code className="text-fg">{tenantForm.adminEmail}</code>
            </div>
          </div>

          <div className="bg-alert-dim border border-alert-line rounded p-3 text-[11px] text-danger">
            <strong>IMPORTANTE:</strong> La contraseña NO se muestra por seguridad. Si la pierdes,
            reseteala desde el listado de empresas.
          </div>

          <div className="flex justify-end pt-3 border-t border-line-dim">
            <TacticalButton variant="primary" size="sm" onClick={closeTenantModal}>
              CERRAR
            </TacticalButton>
          </div>
        </div>
      ) : (
        // WIZARD
        <form onSubmit={handleCreateTenant} className="space-y-3 text-xs">
          {/* Stepper */}
          <div className="flex items-center gap-1 border-b border-line-soft -mx-2 px-2">
            {[
              { idx: 0, label: 'ADMIN', icon: Users },
              { idx: 1, label: 'EMPRESA', icon: Building2 },
              { idx: 2, label: 'CONFIRMAR', icon: CheckCircle2 },
            ].map((s) => {
              const isActive = tenantStep === s.idx
              const isComplete = tenantStep > s.idx
              const Icon = s.icon
              return (
                <div
                  key={s.idx}
                  className={`flex-1 flex items-center gap-2 p-2 rounded transition-all ${
                    isActive
                      ? 'bg-accent/10 text-accent'
                      : isComplete
                      ? 'bg-ok-dim text-ok'
                      : 'text-fg-muted'
                  }`}
                >
                  <div
                    className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold ${
                      isActive
                        ? 'bg-accent text-white'
                        : isComplete
                        ? 'bg-ok text-white'
                        : 'bg-line-soft text-fg-muted'
                    }`}
                  >
                    {isComplete ? <Check className="w-3 h-3" /> : s.idx + 1}
                  </div>
                  <Icon className="w-3 h-3" />
                  <span className="text-[10px] font-bold uppercase tracking-wider">{s.label}</span>
                </div>
              )
            })}
          </div>

          {/* STEP 0: ADMIN */}
          {tenantStep === 0 && (
            <>
              <div className="text-[10px] text-fg-muted font-bold uppercase tracking-widest flex items-center gap-1.5 pt-1">
                <Users className="w-3 h-3 text-accent" />
                Paso 1 · Datos del administrador de la empresa
              </div>
              <div>
                <Label>
                  Nombre del administrador *
                </Label>
                <Input
                  type="text"
                  required
                  placeholder="Ej: Carlos Gómez Rivera"
                  value={tenantForm.adminName}
                  onChange={(e) => setTenantForm({ ...tenantForm, adminName: e.target.value })}
                />
              </div>
              <div>
                <Label>
                  Email del administrador *
                </Label>
                <Input
                  type="email"
                  required
                  placeholder="carlos.gomez@miempresa.com"
                  value={tenantForm.adminEmail}
                  onChange={(e) => setTenantForm({ ...tenantForm, adminEmail: e.target.value })}
                  className="font-bold"
                />
              </div>
              <div>
                <Label>
                  Contraseña de acceso *
                </Label>
                <Input
                  type="password"
                  required
                  minLength={8}
                  placeholder="Mínimo 8 caracteres"
                  value={tenantForm.adminPassword}
                  onChange={(e) => setTenantForm({ ...tenantForm, adminPassword: e.target.value })}
                />
              </div>
            </>
          )}

          {/* STEP 1: EMPRESA */}
          {tenantStep === 1 && (
            <>
              <div className="text-[10px] text-fg-muted font-bold uppercase tracking-widest flex items-center gap-1.5 pt-1">
                <Building2 className="w-3 h-3 text-accent" />
                Paso 2 · Datos de la empresa
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="sm:col-span-2">
                  <Label>
                    Nombre comercial *
                  </Label>
                  <Input
                    type="text"
                    required
                    placeholder="Mi Empresa S.A.S."
                    value={tenantForm.companyName}
                    onChange={(e) => setTenantForm({ ...tenantForm, companyName: e.target.value })}
                  />
                </div>
                <div>
                  <Label>
                    NIT *
                  </Label>
                  <Input
                    type="text"
                    required
                    placeholder="900123456-7"
                    value={tenantForm.companyNit}
                    onChange={(e) => setTenantForm({ ...tenantForm, companyNit: e.target.value })}
                    className="font-mono"
                  />
                </div>
                <div>
                  <Label>
                    Razón social *
                  </Label>
                  <Input
                    type="text"
                    required
                    placeholder="Mi Empresa S.A.S."
                    value={tenantForm.companyLegalName}
                    onChange={(e) =>
                      setTenantForm({ ...tenantForm, companyLegalName: e.target.value })
                    }
                  />
                </div>
                <div>
                  <Label>
                    Nombre comercial (opcional)
                  </Label>
                  <Input
                    type="text"
                    placeholder="Como te conocen los clientes"
                    value={tenantForm.companyTradeName}
                    onChange={(e) =>
                      setTenantForm({ ...tenantForm, companyTradeName: e.target.value })
                    }
                  />
                </div>
                <div>
                  <Label>
                    Email corporativo
                  </Label>
                  <Input
                    type="email"
                    placeholder="contacto@miempresa.com"
                    value={tenantForm.companyEmail}
                    onChange={(e) => setTenantForm({ ...tenantForm, companyEmail: e.target.value })}
                  />
                </div>
                <div>
                  <Label>
                    Teléfono
                  </Label>
                  <Input
                    type="tel"
                    placeholder="+57 601 123 4567"
                    value={tenantForm.companyPhone}
                    onChange={(e) => setTenantForm({ ...tenantForm, companyPhone: e.target.value })}
                  />
                </div>
                <div className="sm:col-span-2">
                  <Label>
                    Dirección
                  </Label>
                  <Input
                    type="text"
                    placeholder="Calle 100 # 15-20"
                    value={tenantForm.companyAddress}
                    onChange={(e) =>
                      setTenantForm({ ...tenantForm, companyAddress: e.target.value })
                    }
                  />
                </div>
                <div>
                  <Label>
                    Ciudad
                  </Label>
                  <Input
                    type="text"
                    placeholder="Bogotá D.C."
                    value={tenantForm.companyCity}
                    onChange={(e) => setTenantForm({ ...tenantForm, companyCity: e.target.value })}
                  />
                </div>
                <div>
                  <Label>
                    Departamento
                  </Label>
                  <Input
                    type="text"
                    placeholder="Cundinamarca"
                    value={tenantForm.companyDepartment}
                    onChange={(e) =>
                      setTenantForm({ ...tenantForm, companyDepartment: e.target.value })
                    }
                  />
                </div>
              </div>
            </>
          )}

          {/* STEP 2: CONFIRMAR */}
          {tenantStep === 2 && (
            <>
              <div className="text-[10px] text-fg-muted font-bold uppercase tracking-widest flex items-center gap-1.5 pt-1">
                <CheckCircle2 className="w-3 h-3 text-accent" />
                Paso 3 · Confirmar y crear
              </div>
              <div className="bg-input border border-line-soft rounded p-3 text-[11px] space-y-2">
                <div className="font-bold text-ok mb-2 uppercase tracking-wider">
                  Resumen
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <div className="text-fg-muted uppercase text-[10px] font-bold">
                      Administrador
                    </div>
                    <div className="text-fg font-bold">{tenantForm.adminName}</div>
                    <div className="text-ok text-[10px]">{tenantForm.adminEmail}</div>
                  </div>
                  <div>
                    <div className="text-fg-muted uppercase text-[10px] font-bold">
                      Empresa
                    </div>
                    <div className="text-fg font-bold">{tenantForm.companyName}</div>
                    <div className="text-ok text-[10px]">
                      NIT: {tenantForm.companyNit}
                    </div>
                  </div>
                </div>
              </div>
              <div className="bg-input border border-line-soft rounded p-3 text-[10px] text-fg-muted">
                <div className="font-bold text-warning mb-1 uppercase tracking-wider">
                  ⚠ Al hacer clic en CREAR:
                </div>
                <ul className="space-y-1 list-disc list-inside ml-2">
                  <li>Se crea un nuevo tenant en la base de datos</li>
                  <li>Se asigna un slug único (basado en el nombre)</li>
                  <li>El admin podrá iniciar sesión y completar el onboarding</li>
                  <li>El admin NO verá los datos de otras empresas</li>
                </ul>
              </div>
            </>
          )}

          {tenantError && (
            <div className="bg-alert-dim border border-alert-line rounded p-2.5 text-[11px] text-danger font-bold">
              {tenantError}
            </div>
          )}

          {/* Footer */}
          <div className="flex items-center justify-between pt-3 border-t border-line-dim">
            <div className="flex items-center gap-1.5">
              {([0, 1, 2] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setTenantStep(s)}
                  className={`w-2 h-2 rounded-full ${
                    tenantStep === s ? 'bg-accent' : 'bg-line'
                  }`}
                />
              ))}
              <span className="text-[10px] text-fg-muted ml-2 uppercase">
                Paso {tenantStep + 1} / 3
              </span>
            </div>
            <div className="flex gap-2">
              <TacticalButton
                type="button"
                variant="secondary"
                size="sm"
                onClick={closeTenantModal}
              >
                CANCELAR
              </TacticalButton>
              {tenantStep < 2 ? (
                <>
                  {tenantStep > 0 && (
                    <TacticalButton
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={prevTenantStep}
                    >
                      ← ATRÁS
                    </TacticalButton>
                  )}
                  <TacticalButton
                    type="button"
                    variant="primary"
                    size="sm"
                    onClick={nextTenantStep}
                  >
                    SIGUIENTE →
                  </TacticalButton>
                </>
              ) : (
                <>
                  <TacticalButton
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={prevTenantStep}
                  >
                    ← ATRÁS
                  </TacticalButton>
                  <TacticalButton
                    type="submit"
                    variant="primary"
                    size="sm"
                    loading={saving}
                  >
                    CREAR EMPRESA
                  </TacticalButton>
                </>
              )}
            </div>
          </div>
        </form>
      )}
    </Modal>
  )
}
