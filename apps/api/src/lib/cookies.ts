import type { FastifyReply } from 'fastify'
import type { AppConfig } from '../config/env.js'

export const ACCESS_COOKIE = 'crm_access'
export const REFRESH_COOKIE = 'crm_refresh'

function cookieBase(config: AppConfig): {
  path: string
  httpOnly: boolean
  secure: boolean
  sameSite: 'lax'
  domain?: string
} {
  const base: {
    path: string
    httpOnly: boolean
    secure: boolean
    sameSite: 'lax'
    domain?: string
  } = {
    path: '/',
    httpOnly: true,
    secure: config.cookieSecure,
    sameSite: 'lax',
  }

  if (config.cookieDomain) {
    base.domain = config.cookieDomain
  }

  return base
}

export function setAccessCookie(
  reply: FastifyReply,
  config: AppConfig,
  token: string,
  expiresAt: Date,
): void {
  reply.setCookie(ACCESS_COOKIE, token, {
    ...cookieBase(config),
    expires: expiresAt,
  })
}

export function setRefreshCookie(
  reply: FastifyReply,
  config: AppConfig,
  token: string,
  expiresAt: Date,
): void {
  reply.setCookie(REFRESH_COOKIE, token, {
    ...cookieBase(config),
    expires: expiresAt,
  })
}

export function clearAuthCookies(reply: FastifyReply, config: AppConfig): void {
  const base = cookieBase(config)
  reply.clearCookie(ACCESS_COOKIE, base)
  reply.clearCookie(REFRESH_COOKIE, base)
}
