import { describe, expect, it } from 'vitest'
import {
  buildMigrationPlan,
  diffSchema,
  describeDatabase,
  type JournalEntry,
  type AppliedMigration,
} from '@/lib/db/doctor'

const j = (tag: string, when: number, hash: string): JournalEntry => ({ idx: 0, tag, when, hash })
const a = (id: number, when: number, hash: string): AppliedMigration => ({ id, hash, created_at: when })

describe('buildMigrationPlan', () => {
  it('marca todo al día cuando los timestamps coinciden', () => {
    const journal = [j('m1', 100, 'h1'), j('m2', 200, 'h2')]
    const applied = [a(1, 100, 'h1'), a(2, 200, 'h2')]
    const plan = buildMigrationPlan(journal, applied)
    expect(plan.pending).toHaveLength(0)
    expect(plan.upToDate).toBe(true)
  })

  it('detecta migraciones pendientes por timestamp', () => {
    const journal = [j('m1', 100, 'h1'), j('m2', 200, 'h2'), j('m3', 300, 'h3')]
    const applied = [a(1, 100, 'h1'), a(2, 200, 'h2')]
    const plan = buildMigrationPlan(journal, applied)
    expect(plan.pending.map((e) => e.tag)).toEqual(['m3'])
    expect(plan.upToDate).toBe(false)
  })

  it('no marca error si un archivo fue editado después de aplicarse (hash distinto)', () => {
    const journal = [j('m1', 100, 'h1-new')]
    const applied = [a(1, 100, 'h1-old')]
    const plan = buildMigrationPlan(journal, applied)
    expect(plan.pending).toHaveLength(0)
    expect(plan.upToDate).toBe(true)
    expect(plan.modified).toHaveLength(1)
  })

  it('lista filas aplicadas sin coincidencia de hash como unknown', () => {
    const journal = [j('m1', 100, 'h1')]
    const applied = [a(1, 100, 'h1'), a(2, 200, 'ghost')]
    const plan = buildMigrationPlan(journal, applied)
    expect(plan.unknown).toHaveLength(1)
    expect(plan.unknown[0].hash).toBe('ghost')
  })

  it('BD vacía => todas las migraciones pendientes', () => {
    const journal = [j('m1', 100, 'h1'), j('m2', 200, 'h2')]
    const plan = buildMigrationPlan(journal, [])
    expect(plan.pending).toHaveLength(2)
    expect(plan.upToDate).toBe(false)
  })
})

describe('diffSchema', () => {
  it('ok cuando coinciden', () => {
    const expected = [{ name: 't', columns: ['a', 'b'] }]
    const db = new Map([['t', new Set(['a', 'b'])]])
    const diff = diffSchema(expected, db)
    expect(diff.ok).toBe(true)
    expect(diff.missingTables).toHaveLength(0)
    expect(diff.missingColumns).toHaveLength(0)
  })

  it('detecta tabla faltante', () => {
    const expected = [{ name: 't', columns: ['a'] }]
    const db = new Map<string, Set<string>>()
    const diff = diffSchema(expected, db)
    expect(diff.ok).toBe(false)
    expect(diff.missingTables).toEqual(['t'])
  })

  it('detecta columnas faltantes', () => {
    const expected = [{ name: 't', columns: ['a', 'b', 'c'] }]
    const db = new Map([['t', new Set(['a'])]])
    const diff = diffSchema(expected, db)
    expect(diff.ok).toBe(false)
    expect(diff.missingColumns).toEqual([{ table: 't', columns: ['b', 'c'] }])
  })

  it('reporta columnas extra sin romper ok', () => {
    const expected = [{ name: 't', columns: ['a'] }]
    const db = new Map([['t', new Set(['a', 'legacy'])]])
    const diff = diffSchema(expected, db)
    expect(diff.ok).toBe(true)
    expect(diff.extraColumns).toEqual([{ table: 't', columns: ['legacy'] }])
  })
})

describe('describeDatabase', () => {
  it('detecta localhost', () => {
    const info = describeDatabase('postgresql://u:p@localhost:5432/pruebas_POS')
    expect(info.kind).toBe('local')
    expect(info.isLocal).toBe(true)
    expect(info.database).toBe('pruebas_POS')
  })

  it('detecta Neon', () => {
    const info = describeDatabase('postgresql://u:p@ep-x.us-east-1.aws.neon.tech/neondb?sslmode=require')
    expect(info.kind).toBe('neon')
    expect(info.isLocal).toBe(false)
  })

  it('maneja URL inválida sin lanzar', () => {
    const info = describeDatabase('no es url')
    expect(info.host).toBe('URL inválida')
  })
})
