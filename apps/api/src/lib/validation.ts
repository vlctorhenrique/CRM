import type { z } from 'zod'
import { AppError } from './errors.js'

export function parseInput<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value)

  if (!result.success) {
    throw new AppError(
      422,
      'VALIDATION_ERROR',
      'Dados inválidos.',
      result.error.issues.map((issue) => ({
        field: issue.path.join('.'),
        message: issue.message,
      })),
    )
  }

  return result.data
}
