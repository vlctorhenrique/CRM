export const TEMPLATE_VARIABLES = ['nome', 'procedimento', 'clinica', 'data', 'horario'] as const

export type TemplateVariable = (typeof TEMPLATE_VARIABLES)[number]
export type TemplateValues = Partial<Record<TemplateVariable, string>>

export const MAX_TEMPLATE_LENGTH = 1000
export const MAX_RENDERED_LENGTH = 2000
export const MAX_PREVIEW_LENGTH = 280

const PLACEHOLDER_PATTERN = /\{\{\s*([^{}]*?)\s*\}\}/g
const EMPTY_PLACEHOLDER_PATTERN = /\{\{\s*\}\}/
const KNOWN_VARIABLES = new Set<string>(TEMPLATE_VARIABLES)

export type TemplateErrorCode =
  | 'empty_template'
  | 'template_too_long'
  | 'malformed_placeholder'
  | 'unknown_variable'
  | 'missing_value'
  | 'rendered_too_long'

export interface TemplateError {
  code: TemplateErrorCode
  message: string
  variable?: string
}

export interface TemplateRenderResult {
  text: string
  errors: TemplateError[]
  missingVariables: TemplateVariable[]
}

export interface TemplatePreview {
  text: string
  truncated: boolean
}

function templateError(code: TemplateErrorCode, message: string, variable?: string): TemplateError {
  return variable === undefined ? { code, message } : { code, message, variable }
}

export function extractTemplateVariables(template: string): string[] {
  const variables: string[] = []

  for (const match of template.matchAll(PLACEHOLDER_PATTERN)) {
    const name = (match[1] ?? '').trim()

    if (name.length > 0 && !variables.includes(name)) {
      variables.push(name)
    }
  }

  return variables
}

export function renderTemplate(template: string, values: TemplateValues): TemplateRenderResult {
  const missingVariables: TemplateVariable[] = []

  if (template.trim().length === 0) {
    return {
      text: '',
      errors: [templateError('empty_template', 'O template está vazio.')],
      missingVariables,
    }
  }

  const errors: TemplateError[] = []

  if (template.length > MAX_TEMPLATE_LENGTH) {
    errors.push(
      templateError(
        'template_too_long',
        `O template excede o limite de ${MAX_TEMPLATE_LENGTH} caracteres.`,
      ),
    )
  }

  const remaining = template.replace(PLACEHOLDER_PATTERN, '')

  if (
    EMPTY_PLACEHOLDER_PATTERN.test(template) ||
    remaining.includes('{{') ||
    remaining.includes('}}')
  ) {
    errors.push(templateError('malformed_placeholder', 'O template contém placeholder inválido.'))
  }

  for (const name of extractTemplateVariables(template)) {
    if (!KNOWN_VARIABLES.has(name)) {
      errors.push(templateError('unknown_variable', `Variável desconhecida: {{${name}}}`, name))
    }
  }

  const text = template.replace(PLACEHOLDER_PATTERN, (match: string, rawName: string) => {
    const name = rawName.trim()

    if (!KNOWN_VARIABLES.has(name)) {
      return match
    }

    const variable = name as TemplateVariable
    const value = values[variable]

    if (value === undefined || value.trim().length === 0) {
      if (!missingVariables.includes(variable)) {
        missingVariables.push(variable)
        errors.push(
          templateError('missing_value', `Valor ausente para a variável: {{${name}}}`, name),
        )
      }

      return match
    }

    return value
  })

  if (text.length > MAX_RENDERED_LENGTH) {
    errors.push(
      templateError(
        'rendered_too_long',
        `O texto renderizado excede o limite de ${MAX_RENDERED_LENGTH} caracteres.`,
      ),
    )
  }

  return { text, errors, missingVariables }
}

export function previewTemplate(
  template: string,
  values: TemplateValues,
  maxLength = MAX_PREVIEW_LENGTH,
): TemplatePreview {
  const { text } = renderTemplate(template, values)
  const limit = Math.max(1, Math.floor(maxLength))

  if (text.length <= limit) {
    return { text, truncated: false }
  }

  const truncated = text.slice(0, limit - 1).trimEnd()

  return { text: `${truncated}…`, truncated: true }
}
