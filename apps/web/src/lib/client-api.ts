import type { ApiErrorBody } from '@crm/shared'

export class ApiClientError extends Error {
  readonly code: string
  readonly status: number

  constructor(message: string, code: string, status: number) {
    super(message)
    this.name = 'ApiClientError'
    this.code = code
    this.status = status
  }
}

const PROXY_BASE = '/api/backend'

async function send(path: string, init: RequestInit): Promise<Response> {
  return fetch(`${PROXY_BASE}${path}`, {
    ...init,
    credentials: 'include',
    headers: {
      'content-type': 'application/json',
      ...init.headers,
    },
  })
}

export async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  let response = await send(path, init)

  if (response.status === 401 && !path.startsWith('/v1/auth/')) {
    const refreshed = await fetch(`${PROXY_BASE}/v1/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
    })

    if (refreshed.ok) {
      response = await send(path, init)
    }
  }

  if (response.status === 204) {
    return undefined as T
  }

  if (!response.ok) {
    let message = 'Não foi possível concluir a operação.'
    let code = 'REQUEST_FAILED'

    try {
      const body = (await response.json()) as ApiErrorBody
      message = body.error.message
      code = body.error.code
    } catch {
      message = 'Não foi possível concluir a operação.'
    }

    throw new ApiClientError(message, code, response.status)
  }

  return (await response.json()) as T
}

export async function updateLeadStatus(leadId: string, status: string): Promise<void> {
  await apiRequest(`/v1/leads/${leadId}`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  })
}

export async function logoutRequest(): Promise<void> {
  await fetch(`${PROXY_BASE}/v1/auth/logout`, {
    method: 'POST',
    credentials: 'include',
  })
}
