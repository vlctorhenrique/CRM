import type { UserRole } from '@crm/shared'
import { jwtVerify, SignJWT } from 'jose'
import type { AppConfig } from '../config/env.js'

const ISSUER = 'crm-clinicas'
const AUDIENCE = 'crm-web'

export interface AccessTokenPayload {
  userId: string
  tenantId: string
  role: UserRole
}

export interface SignedAccessToken {
  token: string
  expiresAt: Date
}

function signingKey(secret: string): Uint8Array {
  return new TextEncoder().encode(secret)
}

export async function signAccessToken(
  config: AppConfig,
  payload: AccessTokenPayload,
): Promise<SignedAccessToken> {
  const issuedAt = new Date()
  const expiresAt = new Date(issuedAt.getTime() + config.accessTokenTtlSeconds * 1000)

  const token = await new SignJWT({
    tid: payload.tenantId,
    role: payload.role,
  })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setSubject(payload.userId)
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt(Math.floor(issuedAt.getTime() / 1000))
    .setJti(crypto.randomUUID())
    .setExpirationTime(Math.floor(expiresAt.getTime() / 1000))
    .sign(signingKey(config.jwtSecret))

  return { token, expiresAt }
}

export async function verifyAccessToken(
  config: AppConfig,
  token: string,
): Promise<AccessTokenPayload | null> {
  try {
    const { payload } = await jwtVerify(token, signingKey(config.jwtSecret), {
      issuer: ISSUER,
      audience: AUDIENCE,
      algorithms: ['HS256'],
    })

    const userId = payload.sub
    const tenantId = payload.tid
    const role = payload.role

    if (
      typeof userId !== 'string' ||
      typeof tenantId !== 'string' ||
      (role !== 'admin' && role !== 'manager' && role !== 'sdr')
    ) {
      return null
    }

    return { userId, tenantId, role }
  } catch {
    return null
  }
}
