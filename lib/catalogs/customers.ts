// Catálogos de documentos y regímenes tributarios (Fase 3.21 — §21 lib/catalogs).
// Antes duplicados en customers/page.tsx y pos/page.tsx.

export interface CatalogOption {
  code: string
  label: string
}

/** Documentos de identidad — etiquetas cortas (listas y tablas). */
export const DOC_TYPES: CatalogOption[] = [
  { code: 'CC', label: 'C.C.' },
  { code: 'NIT', label: 'NIT' },
  { code: 'CE', label: 'C.E.' },
  { code: 'TI', label: 'T.I.' },
  { code: 'PAS', label: 'PAS' },
  { code: 'RC', label: 'R.C.' },
  { code: 'PEP', label: 'PEP' },
  { code: 'DE', label: 'D.E.' },
]

/** Documentos de identidad — etiquetas descriptivas (select del POS). */
export const POS_DOC_TYPES: CatalogOption[] = [
  { code: 'CC', label: 'C.C. — Cédula de Ciudadanía' },
  { code: 'NIT', label: 'NIT — Número de Identificación Tributaria' },
  { code: 'CE', label: 'C.E. — Cédula de Extranjería' },
  { code: 'TI', label: 'T.I. — Tarjeta de Identidad' },
  { code: 'PAS', label: 'PAS — Pasaporte' },
  { code: 'RC', label: 'R.C. — Registro Civil' },
  { code: 'PEP', label: 'PEP — Permiso Especial Permanencia' },
  { code: 'DE', label: 'D.E. — Documento Extranjero' },
]

export const TAX_REGIMES: CatalogOption[] = [
  { code: 'SIMPLIFIED', label: 'Régimen Simplificado' },
  { code: 'COMMON', label: 'Responsable de IVA (Común)' },
  { code: 'EXEMPT', label: 'Exento de IVA' },
  { code: 'NOT_APPLICABLE', label: 'No Aplica' },
]
