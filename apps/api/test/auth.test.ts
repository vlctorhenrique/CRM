import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  cookieValueFrom,
  createTestContext,
  loginAs,
  seedTenant,
  seedUser,
  TEST_PASSWORD,
  type TestContext,
} from './helpers.js'

describe('autenticação e RBAC', () => {
  let ctx: TestContext

  beforeAll(async () => {
    ctx = await createTestContext()
  })

  afterAll(async () => {
    await ctx.close()
  })

  it('autentica o usuário, define cookies seguros e retorna a sessão', async () => {
    const tenant = await seedTenant(ctx.db, { name: 'Clínica Login' })
    const user = await seedUser(ctx.db, {
      tenantId: tenant.id,
      email: 'admin.login@clinica.demo',
      name: 'Admin Login',
      role: 'admin',
    })

    const response = await ctx.app.inject({
      method: 'POST',
      url: '/v1/auth/login',
      payload: { email: user.email, password: TEST_PASSWORD },
    })

    expect(response.statusCode).toBe(200)
    const body = response.json()
    expect(body.user.email).toBe(user.email)
    expect(body.tenant.slug).toBe(tenant.slug)

    const setCookie = response.headers['set-cookie']
    const cookieHeaders = Array.isArray(setCookie) ? setCookie : [setCookie ?? '']
    expect(cookieHeaders.join(';')).toContain('HttpOnly')
    expect(cookieHeaders.join(';')).toContain('SameSite=Lax')

    const me = await ctx.app.inject({
      method: 'GET',
      url: '/v1/auth/me',
      headers: {
        cookie: response.cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join('; '),
      },
    })

    expect(me.statusCode).toBe(200)
    expect(me.json().user.id).toBe(user.id)
  })

  it('rejeita credenciais inválidas e dados malformados', async () => {
    const tenant = await seedTenant(ctx.db)
    const user = await seedUser(ctx.db, { tenantId: tenant.id, email: 'admin.erro@clinica.demo' })

    const invalid = await loginAs(ctx.app, user.email, 'SenhaErrada123')
    expect(invalid.statusCode).toBe(401)

    const malformed = await ctx.app.inject({
      method: 'POST',
      url: '/v1/auth/login',
      payload: { email: 'não-é-email' },
    })

    expect(malformed.statusCode).toBe(422)
    expect(malformed.json().error.code).toBe('VALIDATION_ERROR')
  })

  it('renova o token de acesso e revoga a sessão no logout', async () => {
    const tenant = await seedTenant(ctx.db)
    const user = await seedUser(ctx.db, {
      tenantId: tenant.id,
      email: 'admin.refresh@clinica.demo',
    })

    const loginResponse = await ctx.app.inject({
      method: 'POST',
      url: '/v1/auth/login',
      payload: { email: user.email, password: TEST_PASSWORD },
    })

    const refreshToken = cookieValueFrom(loginResponse, 'crm_refresh')
    expect(refreshToken).toBeTruthy()

    const refreshResponse = await ctx.app.inject({
      method: 'POST',
      url: '/v1/auth/refresh',
      headers: { cookie: `crm_refresh=${refreshToken}` },
    })

    expect(refreshResponse.statusCode).toBe(200)
    expect(refreshResponse.json().user.id).toBe(user.id)

    const logoutResponse = await ctx.app.inject({
      method: 'POST',
      url: '/v1/auth/logout',
      headers: { cookie: `crm_refresh=${refreshToken}` },
    })

    expect(logoutResponse.statusCode).toBe(204)

    const reused = await ctx.app.inject({
      method: 'POST',
      url: '/v1/auth/refresh',
      headers: { cookie: `crm_refresh=${refreshToken}` },
    })

    expect(reused.statusCode).toBe(401)
  })

  it('aplica permissões por perfil', async () => {
    const tenant = await seedTenant(ctx.db)
    await seedUser(ctx.db, { tenantId: tenant.id, email: 'admin.rbac@clinica.demo', role: 'admin' })
    const manager = await seedUser(ctx.db, {
      tenantId: tenant.id,
      email: 'gerente.rbac@clinica.demo',
      role: 'manager',
    })
    const sdr = await seedUser(ctx.db, {
      tenantId: tenant.id,
      email: 'sdr.rbac@clinica.demo',
      role: 'sdr',
    })

    const anonymous = await ctx.app.inject({ method: 'GET', url: '/v1/users' })
    expect(anonymous.statusCode).toBe(401)

    const managerLogin = await loginAs(ctx.app, manager.email)
    const managerList = await ctx.app.inject({
      method: 'GET',
      url: '/v1/users',
      headers: { cookie: managerLogin.cookie },
    })
    expect(managerList.statusCode).toBe(200)
    expect(managerList.json().items).toHaveLength(3)

    const sdrLogin = await loginAs(ctx.app, sdr.email)
    const sdrList = await ctx.app.inject({
      method: 'GET',
      url: '/v1/users',
      headers: { cookie: sdrLogin.cookie },
    })
    expect(sdrList.statusCode).toBe(403)
  })

  it('permite ao administrador criar um usuário', async () => {
    const tenant = await seedTenant(ctx.db)
    const admin = await seedUser(ctx.db, {
      tenantId: tenant.id,
      email: 'admin.criar@clinica.demo',
      role: 'admin',
    })

    const adminLogin = await loginAs(ctx.app, admin.email)

    const created = await ctx.app.inject({
      method: 'POST',
      url: '/v1/users',
      headers: { cookie: adminLogin.cookie },
      payload: {
        name: 'Nova SDR',
        email: 'nova.sdr@clinica.demo',
        password: 'SenhaNova123',
        role: 'sdr',
      },
    })

    expect(created.statusCode).toBe(201)
    expect(created.json().user.role).toBe('sdr')

    const login = await loginAs(ctx.app, 'nova.sdr@clinica.demo', 'SenhaNova123')
    expect(login.statusCode).toBe(200)
  })

  it('impede que o administrador desative o próprio usuário', async () => {
    const tenant = await seedTenant(ctx.db)
    const admin = await seedUser(ctx.db, {
      tenantId: tenant.id,
      email: 'admin.auto@clinica.demo',
      role: 'admin',
    })
    const adminLogin = await loginAs(ctx.app, admin.email)

    const response = await ctx.app.inject({
      method: 'PATCH',
      url: `/v1/users/${admin.id}`,
      headers: { cookie: adminLogin.cookie },
      payload: { status: 'disabled' },
    })

    expect(response.statusCode).toBe(400)
    expect(response.json().error.code).toBe('SELF_DISABLE_NOT_ALLOWED')
  })

  it('isola os dados entre clínicas', async () => {
    const tenantA = await seedTenant(ctx.db, { name: 'Clínica A' })
    const tenantB = await seedTenant(ctx.db, { name: 'Clínica B' })
    const adminA = await seedUser(ctx.db, {
      tenantId: tenantA.id,
      email: 'admin.a@clinica.demo',
      role: 'admin',
    })
    await seedUser(ctx.db, {
      tenantId: tenantA.id,
      email: 'gerente.a@clinica.demo',
      role: 'manager',
    })
    const adminB = await seedUser(ctx.db, {
      tenantId: tenantB.id,
      email: 'admin.b@clinica.demo',
      role: 'admin',
    })

    const loginA = await loginAs(ctx.app, adminA.email)
    const listA = await ctx.app.inject({
      method: 'GET',
      url: '/v1/users',
      headers: { cookie: loginA.cookie },
    })

    expect(listA.statusCode).toBe(200)
    expect(listA.json().items).toHaveLength(2)
    const emailsA = listA.json().items.map((item: { email: string }) => item.email)
    expect(emailsA).toContain('admin.a@clinica.demo')
    expect(emailsA).toContain('gerente.a@clinica.demo')
    expect(emailsA).not.toContain('admin.b@clinica.demo')

    const loginB = await loginAs(ctx.app, adminB.email)
    const listB = await ctx.app.inject({
      method: 'GET',
      url: '/v1/users',
      headers: { cookie: loginB.cookie },
    })

    expect(listB.statusCode).toBe(200)
    expect(listB.json().items).toHaveLength(1)
    expect(listB.json().items[0].email).toBe('admin.b@clinica.demo')
  })

  it('permite ao usuário alterar a própria senha', async () => {
    const tenant = await seedTenant(ctx.db)
    const user = await seedUser(ctx.db, {
      tenantId: tenant.id,
      email: 'admin.senha@clinica.demo',
      role: 'admin',
    })
    const login = await loginAs(ctx.app, user.email)
    const newPassword = 'NovaSenhaForte456'

    const wrongCurrent = await ctx.app.inject({
      method: 'POST',
      url: '/v1/auth/change-password',
      headers: { cookie: login.cookie },
      payload: { currentPassword: 'SenhaErrada123', newPassword },
    })

    expect(wrongCurrent.statusCode).toBe(400)
    expect(wrongCurrent.json().error.code).toBe('INVALID_CURRENT_PASSWORD')

    const changed = await ctx.app.inject({
      method: 'POST',
      url: '/v1/auth/change-password',
      headers: { cookie: login.cookie },
      payload: { currentPassword: TEST_PASSWORD, newPassword },
    })

    expect(changed.statusCode).toBe(204)

    const oldLogin = await loginAs(ctx.app, user.email, TEST_PASSWORD)
    expect(oldLogin.statusCode).toBe(401)

    const newLogin = await loginAs(ctx.app, user.email, newPassword)
    expect(newLogin.statusCode).toBe(200)
  })

  it('atualiza configurações da clínica apenas com perfil autorizado', async () => {
    const tenant = await seedTenant(ctx.db)
    const admin = await seedUser(ctx.db, {
      tenantId: tenant.id,
      email: 'admin.tenant@clinica.demo',
      role: 'admin',
    })
    const sdr = await seedUser(ctx.db, {
      tenantId: tenant.id,
      email: 'sdr.tenant@clinica.demo',
      role: 'sdr',
    })

    const adminLogin = await loginAs(ctx.app, admin.email)
    const updated = await ctx.app.inject({
      method: 'PATCH',
      url: '/v1/tenants/current',
      headers: { cookie: adminLogin.cookie },
      payload: { name: 'Clínica Renomeada' },
    })

    expect(updated.statusCode).toBe(200)
    expect(updated.json().tenant.name).toBe('Clínica Renomeada')

    const sdrLogin = await loginAs(ctx.app, sdr.email)
    const forbidden = await ctx.app.inject({
      method: 'PATCH',
      url: '/v1/tenants/current',
      headers: { cookie: sdrLogin.cookie },
      payload: { name: 'Alteração indevida' },
    })

    expect(forbidden.statusCode).toBe(403)
  })
})
