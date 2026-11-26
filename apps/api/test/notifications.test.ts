import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { TenantRecord, UserRecord } from '../src/db/schema/index.js'
import { notifications } from '../src/db/schema/index.js'
import { createTestContext, loginAs, seedTenant, seedUser, type TestContext } from './helpers.js'

describe('notificações', () => {
  let context: TestContext
  let tenant: TenantRecord
  let admin: UserRecord
  let sdr: UserRecord
  let adminCookie: string
  let sdrCookie: string
  let notificationId: string

  beforeAll(async () => {
    context = await createTestContext()
    tenant = await seedTenant(context.db, { slug: 'notifications-test' })
    admin = await seedUser(context.db, { tenantId: tenant.id, role: 'admin' })
    sdr = await seedUser(context.db, { tenantId: tenant.id, role: 'sdr' })
    adminCookie = (await loginAs(context.app, admin.email)).cookie
    sdrCookie = (await loginAs(context.app, sdr.email)).cookie

    notificationId = randomUUID()
    await context.db.insert(notifications).values([
      {
        id: notificationId,
        tenantId: tenant.id,
        userId: admin.id,
        type: 'system',
        title: 'Primeira',
        body: 'Notificação de teste',
        createdAt: new Date(),
      },
      {
        id: randomUUID(),
        tenantId: tenant.id,
        userId: admin.id,
        type: 'system',
        title: 'Segunda',
        body: 'Outra notificação',
        createdAt: new Date(),
      },
      {
        id: randomUUID(),
        tenantId: tenant.id,
        userId: sdr.id,
        type: 'system',
        title: 'SDR',
        body: 'Somente do SDR',
        createdAt: new Date(),
      },
    ])
  })

  afterAll(async () => {
    await context.close()
  })

  it('lista apenas notificações do usuário', async () => {
    const adminList = await context.app.inject({
      method: 'GET',
      url: '/v1/notifications',
      headers: { cookie: adminCookie },
    })
    expect(adminList.statusCode).toBe(200)
    expect(adminList.json().total).toBe(2)
    expect(adminList.json().unreadCount).toBe(2)

    const sdrList = await context.app.inject({
      method: 'GET',
      url: '/v1/notifications',
      headers: { cookie: sdrCookie },
    })
    expect(sdrList.json().total).toBe(1)
    expect(sdrList.json().items[0].title).toBe('SDR')
  })

  it('filtra não lidas e marca como lidas', async () => {
    const unread = await context.app.inject({
      method: 'GET',
      url: '/v1/notifications?unreadOnly=true',
      headers: { cookie: adminCookie },
    })
    expect(unread.json().total).toBe(2)

    const marked = await context.app.inject({
      method: 'POST',
      url: '/v1/notifications/read',
      headers: { cookie: adminCookie },
      payload: { ids: [notificationId] },
    })
    expect(marked.statusCode).toBe(200)
    expect(marked.json().updated).toBe(1)

    const count = await context.app.inject({
      method: 'GET',
      url: '/v1/notifications/unread-count',
      headers: { cookie: adminCookie },
    })
    expect(count.json().unreadCount).toBe(1)

    const blocked = await context.app.inject({
      method: 'POST',
      url: '/v1/notifications/read',
      headers: { cookie: sdrCookie },
      payload: { ids: [notificationId] },
    })
    expect(blocked.statusCode).toBe(404)
  })
})
