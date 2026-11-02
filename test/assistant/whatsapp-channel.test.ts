import { describe, expect, it } from 'vitest'
import {
  buildWhatsappLinkInstruction,
  extractWhatsappPhoneNumberId,
  verifyWhatsappHubToken,
} from '@/lib/channels/whatsapp'

describe('whatsapp channel helpers', () => {
  it('extracts phone_number_id from Meta webhook payload', () => {
    const id = extractWhatsappPhoneNumberId({
      entry: [
        {
          changes: [
            {
              value: {
                metadata: { phone_number_id: '10987654321' },
                messages: [{ from: '57300', id: 'wamid.1', type: 'text', text: { body: 'hola' } }],
              },
            },
          ],
        },
      ],
    })
    expect(id).toBe('10987654321')
  })

  it('returns null when metadata missing', () => {
    expect(extractWhatsappPhoneNumberId({})).toBeNull()
  })

  it('builds wa.me deep link when display phone present', () => {
    const { deepLink, instruction } = buildWhatsappLinkInstruction('57 300 123 4567', 'AB12CD34')
    expect(deepLink).toBe(
      'https://wa.me/573001234567?text=' + encodeURIComponent('/vincular AB12CD34')
    )
    expect(instruction).toContain('/vincular AB12CD34')
  })

  it('falls back to plain instruction without display phone', () => {
    const { deepLink, instruction } = buildWhatsappLinkInstruction(null, 'ZZ99')
    expect(deepLink).toBeNull()
    expect(instruction).toContain('/vincular ZZ99')
  })

  it('verifies hub token', () => {
    expect(verifyWhatsappHubToken('secret', 'secret')).toBe(true)
    expect(verifyWhatsappHubToken('wrong', 'secret')).toBe(false)
    expect(verifyWhatsappHubToken(null, '')).toBe(true)
  })
})
