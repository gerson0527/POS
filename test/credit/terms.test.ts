import { describe, expect, it } from 'vitest'
import {
  computeCreditDueDate,
  DEFAULT_CREDIT_TERM_DAYS,
  normalizeCreditTermDays,
} from '@/lib/credit/terms'

describe('credit terms', () => {
  it('normalizes invalid values to default', () => {
    expect(normalizeCreditTermDays(undefined)).toBe(DEFAULT_CREDIT_TERM_DAYS)
    expect(normalizeCreditTermDays(0)).toBe(1)
    expect(normalizeCreditTermDays(999)).toBe(30)
    expect(normalizeCreditTermDays(31)).toBe(30)
    expect(normalizeCreditTermDays(30.9)).toBe(30)
  })

  it('sets the due date to the chosen day of the next month', () => {
    const from = new Date(2026, 0, 1, 12, 0, 0) // 1 ene 2026, 12:00 local
    const due = computeCreditDueDate(10, from)
    expect(due.getFullYear()).toBe(2026)
    expect(due.getMonth()).toBe(1) // febrero
    expect(due.getDate()).toBe(10)
    expect(due.getHours()).toBe(23)
    expect(due.getMinutes()).toBe(59)
  })

  it('clamps to the last day when the next month is shorter', () => {
    const from = new Date(2026, 0, 15, 12, 0, 0) // 15 ene 2026
    const due = computeCreditDueDate(30, from)
    expect(due.getMonth()).toBe(1) // febrero 2026 (28 días)
    expect(due.getDate()).toBe(28)
  })

  it('rolls over to January when invoicing in December', () => {
    const from = new Date(2026, 11, 20, 12, 0, 0) // 20 dic 2026
    const due = computeCreditDueDate(5, from)
    expect(due.getFullYear()).toBe(2027)
    expect(due.getMonth()).toBe(0)
    expect(due.getDate()).toBe(5)
  })
})
