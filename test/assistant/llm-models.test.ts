import { describe, expect, it } from 'vitest'
import {
  FREE_CHAT_COMPLETION_MODELS,
  freeModelCandidates,
  isAutoRotateModel,
  nextFreeModel,
} from '@/lib/assistant/llm-models'

describe('isAutoRotateModel', () => {
  it('trata vacío y aliases como rotación', () => {
    expect(isAutoRotateModel('')).toBe(true)
    expect(isAutoRotateModel(null)).toBe(true)
    expect(isAutoRotateModel('auto')).toBe(true)
    expect(isAutoRotateModel('FREE')).toBe(true)
    expect(isAutoRotateModel('rotate')).toBe(true)
    expect(isAutoRotateModel('deepseek-v4.1-flash-free')).toBe(false)
  })
})

describe('FREE_CHAT_COMPLETION_MODELS', () => {
  it('incluye los 7 modelos gratis de OpenCode', () => {
    expect(FREE_CHAT_COMPLETION_MODELS).toEqual([
      'beam-free',
      'deepseek-v4.1-flash-free',
      'flint-40b-free',
      'glm-5.3-flash-free',
      'mimo-v2.6-flash-free',
      'nemotron-3.5-lightning-free',
      'nemotron-3.5-super-vl-free',
    ])
  })
})

describe('freeModelCandidates', () => {
  it('devuelve hasta max candidatos del pool', () => {
    const a = freeModelCandidates([...FREE_CHAT_COMPLETION_MODELS], 3)
    expect(a).toHaveLength(3)
    for (const id of a) {
      expect(FREE_CHAT_COMPLETION_MODELS).toContain(id)
    }
  })

  it('nextFreeModel elige del pool', () => {
    const pool = ['a', 'b', 'c']
    expect(pool).toContain(nextFreeModel(pool))
  })
})
