import { isValidPhone, normalizePhone } from '@crm/shared'
import { describe, expect, it } from 'vitest'

describe('normalização de telefone', () => {
  it('normaliza números brasileiros para E.164', () => {
    expect(normalizePhone('(11) 99999-9999')).toBe('+5511999999999')
    expect(normalizePhone('11999999999')).toBe('+5511999999999')
    expect(normalizePhone('+55 11 99999-9999')).toBe('+5511999999999')
    expect(normalizePhone('0 11 99999-9999')).toBe('+5511999999999')
    expect(normalizePhone('')).toBe('')
  })

  it('valida o formato E.164', () => {
    expect(isValidPhone('+5511999999999')).toBe(true)
    expect(isValidPhone('11999999999')).toBe(false)
    expect(isValidPhone('+1')).toBe(false)
  })
})
