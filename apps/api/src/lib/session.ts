import type {
  AuthUser,
  BusinessHours,
  SessionResponse,
  TenantSummary,
  UserRole,
  UserStatus,
} from '@crm/shared'

export interface UserShape {
  id: string
  name: string
  email: string
  role: UserRole
  status: UserStatus
  lastLoginAt: Date | null
  createdAt: Date
}

export interface TenantShape {
  id: string
  name: string
  slug: string
  timezone: string
  businessHours: BusinessHours
  isActive: boolean
}

export function toAuthUser(user: UserShape): AuthUser {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    status: user.status,
    lastLoginAt: user.lastLoginAt ? user.lastLoginAt.toISOString() : null,
    createdAt: user.createdAt.toISOString(),
  }
}

export function toTenantSummary(tenant: TenantShape): TenantSummary {
  return {
    id: tenant.id,
    name: tenant.name,
    slug: tenant.slug,
    timezone: tenant.timezone,
    businessHours: tenant.businessHours,
    isActive: tenant.isActive,
  }
}

export function toSession(
  user: UserShape,
  tenant: TenantShape,
  accessTokenExpiresAt: Date,
): SessionResponse {
  return {
    user: toAuthUser(user),
    tenant: toTenantSummary(tenant),
    accessTokenExpiresAt: accessTokenExpiresAt.toISOString(),
  }
}
