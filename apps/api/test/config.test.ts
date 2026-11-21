import { describe, expect, it } from 'vitest'
import { toAppConfig } from '../src/config/env.js'

const baseEnv = {
  NODE_ENV: 'test',
  DATABASE_URL: 'postgresql://crm:crm@localhost:5432/crm',
  JWT_SECRET: 'a-secret-with-at-least-thirty-two-characters',
}

describe('configuração da API', () => {
  it('exige variáveis essenciais', () => {
    expect(() => toAppConfig({})).toThrow(/DATABASE_URL/)
    expect(() => toAppConfig({ ...baseEnv, JWT_SECRET: 'curto' })).toThrow(/JWT_SECRET/)
  })

  it('aplica valores padrão e converte tipos', () => {
    const config = toAppConfig({
      ...baseEnv,
      API_PORT: '4000',
      COOKIE_SECURE: 'true',
      ENABLE_API_DOCS: 'true',
      REDIS_URL: 'redis://localhost:6379',
    })

    expect(config.port).toBe(4000)
    expect(config.cookieSecure).toBe(true)
    expect(config.enableApiDocs).toBe(true)
    expect(config.redisUrl).toBe('redis://localhost:6379')
    expect(config.accessTokenTtlSeconds).toBe(1800)
    expect(config.webOrigin).toBe('http://localhost:3000')
    expect(config.whatsappMode).toBe('disabled')
  })

  it('exige credenciais completas no modo live', () => {
    expect(() =>
      toAppConfig({
        ...baseEnv,
        WHATSAPP_MODE: 'live',
      }),
    ).toThrow(/WHATSAPP_VERIFY_TOKEN/)

    expect(() =>
      toAppConfig({
        ...baseEnv,
        WHATSAPP_MODE: 'live',
        WHATSAPP_VERIFY_TOKEN: 'verify-token-123',
        WHATSAPP_APP_SECRET: 'app-secret-123',
      }),
    ).toThrow(/WHATSAPP_ACCESS_TOKEN/)

    const config = toAppConfig({
      ...baseEnv,
      WHATSAPP_MODE: 'live',
      WHATSAPP_VERIFY_TOKEN: 'verify-token-123',
      WHATSAPP_APP_SECRET: 'app-secret-123',
      WHATSAPP_ACCESS_TOKEN: 'access-token-123',
      WHATSAPP_PHONE_NUMBER_ID: 'phone-id',
    })

    expect(config.whatsappMode).toBe('live')
    expect(config.whatsappPhoneNumberId).toBe('phone-id')
  })
})
