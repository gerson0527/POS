import { describe, expect, it } from 'vitest'
import { escapeHtml } from '@/lib/reports/render'

describe('escapeHtml', () => {
  it('escapa los 5 caracteres peligrosos de interpolación HTML', () => {
    expect(escapeHtml('<script>alert("x")</script>')).toBe(
      '&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;'
    )
    expect(escapeHtml("O'Brien & <i>Hijo</i>")).toBe(
      'O&#39;Brien &amp; &lt;i&gt;Hijo&lt;/i&gt;'
    )
  })

  it('valores null/undefined → cadena vacía (no "null")', () => {
    expect(escapeHtml(null)).toBe('')
    expect(escapeHtml(undefined)).toBe('')
    expect(escapeHtml(0)).toBe('0')
  })
})
