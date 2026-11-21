import 'server-only'
import type {
  AuthUser,
  ConversationListResponse,
  DashboardSummary,
  HealthResponse,
  LeadDetailResponse,
  LeadListResponse,
  LeadStatus,
  MeResponse,
  WhatsAppAccountView,
} from '@crm/shared'
import { cookies } from 'next/headers'
import { cache } from 'react'

export const API_INTERNAL_URL = process.env.API_INTERNAL_URL ?? 'http://localhost:3333'

export const getSession = cache(async (): Promise<MeResponse | null> => {
  try {
    const cookieStore = await cookies()
    const response = await fetch(`${API_INTERNAL_URL}/v1/auth/me`, {
      headers: { cookie: cookieStore.toString() },
      cache: 'no-store',
    })

    if (!response.ok) {
      return null
    }

    return (await response.json()) as MeResponse
  } catch {
    return null
  }
})

export async function getTeamMembers(): Promise<AuthUser[]> {
  try {
    const cookieStore = await cookies()
    const response = await fetch(`${API_INTERNAL_URL}/v1/users`, {
      headers: { cookie: cookieStore.toString() },
      cache: 'no-store',
    })

    if (!response.ok) {
      return []
    }

    const data = (await response.json()) as { items: AuthUser[] }
    return data.items
  } catch {
    return []
  }
}

async function authorizedGet<T>(path: string): Promise<T | null> {
  try {
    const cookieStore = await cookies()
    const response = await fetch(`${API_INTERNAL_URL}${path}`, {
      headers: { cookie: cookieStore.toString() },
      cache: 'no-store',
    })

    if (!response.ok) {
      return null
    }

    return (await response.json()) as T
  } catch {
    return null
  }
}

export async function getLeads(params: {
  search?: string | undefined
  status?: LeadStatus | undefined
  limit?: number | undefined
}): Promise<LeadListResponse> {
  const query = new URLSearchParams()

  if (params.search) query.set('search', params.search)
  if (params.status) query.set('status', params.status)
  query.set('limit', String(params.limit ?? 50))

  const data = await authorizedGet<LeadListResponse>(`/v1/leads?${query.toString()}`)
  return data ?? { items: [], total: 0 }
}

export async function getLeadDetails(leadId: string): Promise<LeadDetailResponse | null> {
  return authorizedGet<LeadDetailResponse>(`/v1/leads/${leadId}`)
}

export async function getConversations(limit = 50): Promise<ConversationListResponse> {
  const data = await authorizedGet<ConversationListResponse>(`/v1/conversations?limit=${limit}`)
  return data ?? { items: [], total: 0 }
}

export async function getWhatsAppAccount(): Promise<WhatsAppAccountView | null> {
  const data = await authorizedGet<{ account: WhatsAppAccountView | null }>('/v1/whatsapp/account')
  return data?.account ?? null
}

export async function getDashboardSummary(): Promise<DashboardSummary | null> {
  return authorizedGet<DashboardSummary>('/v1/dashboard/summary')
}

export async function getHealth(): Promise<HealthResponse | null> {
  try {
    const response = await fetch(`${API_INTERNAL_URL}/health`, {
      cache: 'no-store',
    })

    if (!response.ok) {
      return null
    }

    return (await response.json()) as HealthResponse
  } catch {
    return null
  }
}
