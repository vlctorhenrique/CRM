export class AppError extends Error {
  readonly statusCode: number
  readonly code: string
  readonly details?: unknown

  constructor(statusCode: number, code: string, message: string, details?: unknown) {
    super(message)
    this.name = 'AppError'
    this.statusCode = statusCode
    this.code = code
    this.details = details
  }
}

export function unauthenticated(message = 'Sessão inválida ou expirada.'): AppError {
  return new AppError(401, 'UNAUTHENTICATED', message)
}

export function forbidden(message = 'Você não tem permissão para esta ação.'): AppError {
  return new AppError(403, 'FORBIDDEN', message)
}

export function notFound(message = 'Registro não encontrado.'): AppError {
  return new AppError(404, 'NOT_FOUND', message)
}
