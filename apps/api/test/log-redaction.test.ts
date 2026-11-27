import { describe, expect, it } from 'vitest'
import { redactRequestUrl } from '../src/lib/log-redaction.js'

describe('redactRequestUrl', () => {
  it('redactiona o token de verificação do webhook', () => {
    const result = redactRequestUrl(
      '/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=segredo123&hub.challenge=abc',
    )

    expect(result).toContain('hub.verify_token=%5Bredacted%5D')
    expect(result).not.toContain('segredo123')
    expect(result).toContain('hub.challenge=abc')
  })

  it('redactiona a variante com underscore e access_token', () => {
    const result = redactRequestUrl(
      '/webhooks/whatsapp?hub_verify_token=abc123&access_token=xyz789',
    )

    expect(result).not.toContain('abc123')
    expect(result).not.toContain('xyz789')
  })

  it('preserva caminho e parâmetros sem segredos', () => {
    expect(redactRequestUrl('/v1/leads?limit=20&status=new')).toBe('/v1/leads?limit=20&status=new')
  })

  it('retorna placeholder para URL inválida', () => {
    expect(redactRequestUrl('http://[::1')).toBe('[invalid-url]')
  })
})
