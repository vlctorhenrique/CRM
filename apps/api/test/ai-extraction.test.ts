import { describe, expect, it } from 'vitest'
import { extractLeadInfo } from '../src/modules/ai/extraction.js'

describe('extração determinística de informações do lead', () => {
  it('extrai harmonização facial, objetivo, região e tratamento anterior', () => {
    const result = extractLeadInfo(
      'Olá, gostaria de fazer harmonização facial, quero rejuvenescer o rosto. Já fiz botox antes.',
    )

    expect(result.procedure).toBe('Harmonização facial')
    expect(result.objective).toBe('Rejuvenescimento')
    expect(result.bodyRegion).toBe('Facial')
    expect(result.previousTreatment).toBe(true)
    expect(result.summary).toBe(
      'Olá, gostaria de fazer harmonização facial, quero rejuvenescer o rosto. Já fiz botox antes.',
    )
  })

  it('identifica botox na testa e nega tratamento anterior', () => {
    const result = extractLeadInfo(
      'Quero aplicar botox na testa para suavizar linhas. Nunca fiz procedimento.',
    )

    expect(result.procedure).toBe('Botox')
    expect(result.objective).toBe('Rejuvenescimento')
    expect(result.bodyRegion).toBe('Facial')
    expect(result.previousTreatment).toBe(false)
  })

  it('identifica preenchimento labial sem inventar objetivo', () => {
    const result = extractLeadInfo(
      'Tenho interesse em preenchimento labial para deixar os lábios mais volumosos.',
    )

    expect(result.procedure).toBe('Preenchimento')
    expect(result.bodyRegion).toBe('Facial')
    expect(result.objective).toBeNull()
  })

  it('identifica lipoaspiração, abdômen e redução de gordura', () => {
    const result = extractLeadInfo(
      'Penso em lipoaspiração no abdômen para reduzir gordura localizada.',
    )

    expect(result.procedure).toBe('Lipoaspiração')
    expect(result.objective).toBe('Redução de gordura')
    expect(result.bodyRegion).toBe('Abdômen')
  })

  it('identifica peeling e clareamento de manchas', () => {
    const result = extractLeadInfo('Queria fazer peeling para tratar manchas no rosto.')

    expect(result.procedure).toBe('Peeling')
    expect(result.objective).toBe('Clareamento de manchas')
    expect(result.bodyRegion).toBe('Facial')
  })

  it('identifica laser e pernas', () => {
    const result = extractLeadInfo('Tenho interesse em depilação a laser nas pernas.')

    expect(result.procedure).toBe('Laser')
    expect(result.bodyRegion).toBe('Pernas')
    expect(result.objective).toBeNull()
  })

  it('identifica limpeza de pele e acne', () => {
    const result = extractLeadInfo('Quero limpeza de pele para acne e cravos.')

    expect(result.procedure).toBe('Limpeza de pele')
    expect(result.objective).toBe('Tratamento de acne')
    expect(result.bodyRegion).toBeNull()
  })

  it('identifica emagrecimento', () => {
    const result = extractLeadInfo('Quero emagrecer e perder peso.')

    expect(result.procedure).toBe('Emagrecimento')
    expect(result.objective).toBe('Emagrecimento')
  })

  it('identifica gordura localizada nos flancos', () => {
    const result = extractLeadInfo('Tenho gordura localizada nos flancos.')

    expect(result.procedure).toBe('Gordura localizada')
    expect(result.objective).toBe('Redução de gordura')
    expect(result.bodyRegion).toBe('Flancos')
  })

  it('identifica flacidez e objetivo de firmeza', () => {
    const result = extractLeadInfo('Sinto flacidez na barriga, quero firmar.')

    expect(result.procedure).toBe('Flacidez')
    expect(result.objective).toBe('Tratamento de flacidez')
    expect(result.bodyRegion).toBe('Abdômen')
  })

  it('identifica acne no rosto', () => {
    const result = extractLeadInfo('Tenho acne no rosto.')

    expect(result.procedure).toBe('Acne')
    expect(result.objective).toBe('Tratamento de acne')
    expect(result.bodyRegion).toBe('Facial')
  })

  it('identifica manchas e melasma', () => {
    const result = extractLeadInfo('Tenho manchas de melasma no rosto e quero clarear.')

    expect(result.procedure).toBe('Manchas')
    expect(result.objective).toBe('Clareamento de manchas')
    expect(result.bodyRegion).toBe('Facial')
  })

  it('ignora acentos na busca por procedimentos', () => {
    const result = extractLeadInfo('Quero harmonizacao facial.')

    expect(result.procedure).toBe('Harmonização facial')
  })

  it('não inventa dados quando o texto é genérico', () => {
    const result = extractLeadInfo('Olá, tudo bem?')

    expect(result.procedure).toBeNull()
    expect(result.objective).toBeNull()
    expect(result.bodyRegion).toBeNull()
    expect(result.previousTreatment).toBeNull()
    expect(result.summary).toBe('Olá, tudo bem?')
    expect(result.confidence).toBeLessThanOrEqual(0.2)
  })

  it('retorna resultado vazio para texto em branco', () => {
    const result = extractLeadInfo('   ')

    expect(result.procedure).toBeNull()
    expect(result.objective).toBeNull()
    expect(result.bodyRegion).toBeNull()
    expect(result.previousTreatment).toBeNull()
    expect(result.summary).toBe('')
    expect(result.confidence).toBe(0)
  })

  it('limita o resumo a 280 caracteres', () => {
    const result = extractLeadInfo('Quero botox '.repeat(40))

    expect(result.summary.length).toBeLessThanOrEqual(280)
    expect(result.summary.endsWith('…')).toBe(true)
  })

  it('normaliza espaços no resumo', () => {
    const result = extractLeadInfo('  Quero   botox\nna testa  ')

    expect(result.summary).toBe('Quero botox na testa')
  })

  it('mantém a confiança entre 0 e 1 e acima de extrações parciais', () => {
    const complete = extractLeadInfo(
      'Quero harmonização facial no rosto para rejuvenescer. Já fiz botox.',
    )
    const partial = extractLeadInfo('Quero botox.')

    expect(complete.confidence).toBeGreaterThan(partial.confidence)
    expect(partial.confidence).toBeGreaterThan(0)
    expect(complete.confidence).toBeLessThanOrEqual(1)
  })
})
