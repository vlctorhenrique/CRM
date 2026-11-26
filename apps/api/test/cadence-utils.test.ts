import { type BusinessHours, DEFAULT_BUSINESS_HOURS } from '@crm/shared'
import { describe, expect, it } from 'vitest'
import {
  formatZonedDateKey,
  getZonedDateParts,
  isBusinessDay,
  isHoliday,
  isWithinBusinessHours,
  nextAllowedTime,
} from '../src/modules/cadences/business-hours.js'
import {
  extractTemplateVariables,
  MAX_RENDERED_LENGTH,
  MAX_TEMPLATE_LENGTH,
  previewTemplate,
  renderTemplate,
  TEMPLATE_VARIABLES,
} from '../src/modules/cadences/template-render.js'

const hours = DEFAULT_BUSINESS_HOURS

describe('horário comercial', () => {
  it('converte instantes para o fuso America/Sao_Paulo', () => {
    const parts = getZonedDateParts(new Date('2026-01-05T15:00:00.000Z'))

    expect(parts).toMatchObject({
      year: 2026,
      month: 1,
      day: 5,
      hour: 12,
      minute: 0,
      weekday: 1,
      dateKey: '2026-01-05',
    })
  })

  it('formata a data local corretamente na virada do dia', () => {
    expect(formatZonedDateKey(new Date('2026-01-05T02:00:00.000Z'))).toBe('2026-01-04')
  })

  it('considera aberto do início até antes do fim', () => {
    expect(isWithinBusinessHours(new Date('2026-01-05T11:00:00.000Z'), hours)).toBe(true)
    expect(isWithinBusinessHours(new Date('2026-01-05T20:59:00.000Z'), hours)).toBe(true)
    expect(isWithinBusinessHours(new Date('2026-01-05T21:00:00.000Z'), hours)).toBe(false)
    expect(isWithinBusinessHours(new Date('2026-01-05T10:59:00.000Z'), hours)).toBe(false)
  })

  it('trata sábado e domingo como fechados', () => {
    expect(isBusinessDay(new Date('2026-01-10T15:00:00.000Z'), hours)).toBe(false)
    expect(isBusinessDay(new Date('2026-01-11T15:00:00.000Z'), hours)).toBe(false)
  })

  it('respeita feriados configurados', () => {
    const withHoliday: BusinessHours = { ...DEFAULT_BUSINESS_HOURS, holidays: ['2026-01-05'] }

    expect(isHoliday(new Date('2026-01-05T15:00:00.000Z'), withHoliday)).toBe(true)
    expect(isBusinessDay(new Date('2026-01-05T15:00:00.000Z'), withHoliday)).toBe(false)
    expect(isWithinBusinessHours(new Date('2026-01-05T15:00:00.000Z'), withHoliday)).toBe(false)
  })

  it('retorna o mesmo instante quando já está dentro do horário', () => {
    const now = new Date('2026-01-05T15:00:00.000Z')

    expect(nextAllowedTime(now, hours).toISOString()).toBe(now.toISOString())
  })

  it('avança para a abertura do mesmo dia quando chega antes', () => {
    expect(nextAllowedTime(new Date('2026-01-05T10:00:00.000Z'), hours).toISOString()).toBe(
      '2026-01-05T11:00:00.000Z',
    )
  })

  it('avança para o próximo dia útil após o fechamento', () => {
    expect(nextAllowedTime(new Date('2026-01-05T22:00:00.000Z'), hours).toISOString()).toBe(
      '2026-01-06T11:00:00.000Z',
    )
  })

  it('pula o fim de semana', () => {
    expect(nextAllowedTime(new Date('2026-01-09T22:00:00.000Z'), hours).toISOString()).toBe(
      '2026-01-12T11:00:00.000Z',
    )
  })

  it('pula feriado até o próximo dia útil', () => {
    const withHoliday: BusinessHours = { ...DEFAULT_BUSINESS_HOURS, holidays: ['2026-01-06'] }

    expect(nextAllowedTime(new Date('2026-01-05T22:00:00.000Z'), withHoliday).toISOString()).toBe(
      '2026-01-07T11:00:00.000Z',
    )
  })

  it('rejeita data inválida', () => {
    expect(() => nextAllowedTime(new Date('invalid'), hours)).toThrow(TypeError)
  })

  it('rejeita horário mal formatado', () => {
    const invalid: BusinessHours = {
      ...DEFAULT_BUSINESS_HOURS,
      days: DEFAULT_BUSINESS_HOURS.days.map((day) =>
        day.weekday === 1 ? { ...day, start: '8:00' } : day,
      ),
    }

    expect(() => isWithinBusinessHours(new Date('2026-01-05T15:00:00.000Z'), invalid)).toThrow(
      RangeError,
    )
  })
})

const values = {
  nome: 'Ana',
  procedimento: 'Botox',
  clinica: 'Clínica Bella',
  data: '12/02/2026',
  horario: '14:30',
}

describe('renderização de template de cadência', () => {
  it('expõe as variáveis suportadas', () => {
    expect(TEMPLATE_VARIABLES).toEqual(['nome', 'procedimento', 'clinica', 'data', 'horario'])
  })

  it('extrai variáveis únicas na ordem de aparição', () => {
    expect(extractTemplateVariables('{{nome}} {{procedimento}} {{nome}}')).toEqual([
      'nome',
      'procedimento',
    ])
  })

  it('renderiza todas as variáveis', () => {
    const result = renderTemplate(
      'Olá {{nome}}, sua avaliação de {{procedimento}} na {{clinica}} é {{data}} às {{horario}}.',
      values,
    )

    expect(result.errors).toEqual([])
    expect(result.missingVariables).toEqual([])
    expect(result.text).toBe(
      'Olá Ana, sua avaliação de Botox na Clínica Bella é 12/02/2026 às 14:30.',
    )
  })

  it('aceita espaços internos nos placeholders', () => {
    const result = renderTemplate('Olá {{ nome }}!', values)

    expect(result.text).toBe('Olá Ana!')
    expect(result.errors).toEqual([])
  })

  it('sinaliza variável desconhecida e mantém o placeholder', () => {
    const result = renderTemplate('{{nome}} {{email}}', values)

    expect(result.text).toBe('Ana {{email}}')
    expect(result.errors).toEqual([
      {
        code: 'unknown_variable',
        message: 'Variável desconhecida: {{email}}',
        variable: 'email',
      },
    ])
  })

  it('sinaliza valor ausente', () => {
    const result = renderTemplate('Olá {{nome}}, fale sobre {{procedimento}}.', { nome: 'Ana' })

    expect(result.text).toBe('Olá Ana, fale sobre {{procedimento}}.')
    expect(result.missingVariables).toEqual(['procedimento'])
    expect(result.errors).toEqual([
      {
        code: 'missing_value',
        message: 'Valor ausente para a variável: {{procedimento}}',
        variable: 'procedimento',
      },
    ])
  })

  it('trata valor vazio como ausente', () => {
    const result = renderTemplate('Olá {{nome}}!', { nome: '   ' })

    expect(result.text).toBe('Olá {{nome}}!')
    expect(result.missingVariables).toEqual(['nome'])
  })

  it('rejeita template vazio', () => {
    const result = renderTemplate('   ', {})

    expect(result.text).toBe('')
    expect(result.errors.map((error) => error.code)).toContain('empty_template')
  })

  it('rejeita template acima do tamanho máximo', () => {
    const result = renderTemplate('a'.repeat(MAX_TEMPLATE_LENGTH + 1), {})

    expect(result.errors.map((error) => error.code)).toContain('template_too_long')
  })

  it('rejeita texto renderizado acima do tamanho máximo', () => {
    const result = renderTemplate('{{nome}}', { nome: 'a'.repeat(MAX_RENDERED_LENGTH + 1) })

    expect(result.errors.map((error) => error.code)).toContain('rendered_too_long')
  })

  it('rejeita placeholder malformado', () => {
    const result = renderTemplate('Olá {{nome', {})

    expect(result.errors.map((error) => error.code)).toContain('malformed_placeholder')
  })

  it('rejeita placeholder sem nome', () => {
    const result = renderTemplate('Olá {{}}!', {})

    expect(result.errors.map((error) => error.code)).toContain('malformed_placeholder')
  })

  it('gera preview truncado para textos longos', () => {
    const preview = previewTemplate('{{nome}}', { nome: 'a'.repeat(500) })

    expect(preview.truncated).toBe(true)
    expect(preview.text.length).toBeLessThanOrEqual(280)
    expect(preview.text.endsWith('…')).toBe(true)
  })

  it('não trunca previews curtos', () => {
    const preview = previewTemplate('Olá {{nome}}!', values)

    expect(preview).toEqual({ text: 'Olá Ana!', truncated: false })
  })
})
