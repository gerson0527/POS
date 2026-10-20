import { randomUUID } from 'node:crypto'
import { and, eq } from 'drizzle-orm'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { PaymentMethod } from '@/lib/types'

type Role = 'ADMIN' | 'MANAGER' | 'CASHIER' | 'VIEWER'

const authState = vi.hoisted(() => ({
  userId: '',
  tenantId: '',
  role: 'ADMIN' as Role,
}))

const outboxMock = vi.hoisted(() => ({
  enqueue: vi.fn(async () => undefined),
  retry: vi.fn(async () => ({ success: true, message: 'ok' })),
}))

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}))

vi.mock('@/lib/auth/session-context', () => ({
  requireUser: async () => authState.userId,
  requireTenantId: async () => authState.tenantId,
  requireRole: async (_userId: string, roles: string[]) => {
    if (!roles.includes(authState.role)) {
      const error = new Error('FORBIDDEN') as Error & { code: string }
      error.code = 'FORBIDDEN'
      throw error
    }
    return {
      userId: authState.userId,
      tenantId: authState.tenantId,
      role: authState.role,
    }
  },
}))

vi.mock('@/lib/fiscal/outbox', () => ({
  enqueueFiscalEmission: outboxMock.enqueue,
  retryFiscalEmission: outboxMock.retry,
}))

const testDatabaseUrl = process.env.TEST_DATABASE_URL
const shouldRun = process.env.RUN_DB_TESTS === '1' && Boolean(testDatabaseUrl)
const describeDb = shouldRun ? describe : describe.skip

let db: typeof import('@/lib/db').db
let pool: typeof import('@/lib/db').pool
let schema: typeof import('@/lib/db/schema')
let cashierActions: typeof import('@/app/actions/cashier')
let customerActions: typeof import('@/app/actions/customers')
let salesActions: typeof import('@/app/actions/sales')

const createdTenantIds: string[] = []

interface Fixture {
  tenantId: string
  userId: string
  locationId: string
  productId: string
  inventoryId: string
}

function suffix(): string {
  return randomUUID().replace(/-/g, '').slice(0, 16)
}

async function createFixture(
  role: Role = 'CASHIER',
  quantity = '2.00'
): Promise<Fixture> {
  const id = suffix()
  const tenantId = `test_tenant_${id}`
  const userId = `test_user_${id}`
  const locationId = `test_location_${id}`
  const productId = `test_product_${id}`
  const inventoryId = `test_inventory_${id}`

  await db.insert(schema.tenant).values({
    id: tenantId,
    name: 'Test Tenant',
    nit: `TEST-${id}`,
    legalName: 'Test Tenant SAS',
    status: 'ACTIVE',
    factusEnvironment: 'sandbox',
    updatedAt: new Date(),
  })
  createdTenantIds.push(tenantId)

  await db.insert(schema.userTenant).values({
    id: `test_ut_${id}`,
    userId,
    tenantId,
    role,
    status: 'ACTIVE',
  })

  await db.insert(schema.location).values({
    id: locationId,
    tenantId,
    name: 'Test Location',
    code: `L-${id}`,
    status: 'ACTIVE',
    updatedAt: new Date(),
  })

  await db.insert(schema.product).values({
    id: productId,
    tenantId,
    sku: `SKU-${id}`,
    name: 'Test Product',
    unitPrice: '10000.0000',
    ivaRate: '0.00',
    status: 'ACTIVE',
    updatedAt: new Date(),
  })

  await db.insert(schema.inventory).values({
    id: inventoryId,
    tenantId,
    locationId,
    productId,
    quantity,
    available: quantity,
    updatedAt: new Date(),
  })

  authState.userId = userId
  authState.tenantId = tenantId
  authState.role = role

  return { tenantId, userId, locationId, productId, inventoryId }
}

async function addUser(tenantId: string, role: Role): Promise<string> {
  const id = suffix()
  const userId = `test_user_${id}`
  await db.insert(schema.userTenant).values({
    id: `test_ut_${id}`,
    userId,
    tenantId,
    role,
    status: 'ACTIVE',
  })
  return userId
}

async function createCustomer(
  tenantId: string,
  balance = '50000.00'
): Promise<{ customerId: string; chargeId: string }> {
  const id = suffix()
  const customerId = `test_customer_${id}`
  const chargeId = `test_charge_${id}`

  await db.insert(schema.customer).values({
    id: customerId,
    tenantId,
    documentType: 'CC',
    documentNumber: `CC-${id}`,
    personType: 'NATURAL',
    name: 'Cliente Test',
    status: 'ACTIVE',
    creditEnabled: 'SI',
    creditLimit: '100000.00',
    creditBalance: balance,
    creditStatus: 'AL_DIA',
    updatedAt: new Date(),
  })

  await db.insert(schema.customerCreditTransaction).values({
    id: chargeId,
    tenantId,
    customerId,
    type: 'CHARGE',
    amount: balance,
    paidAmount: '0.00',
    balanceAfter: balance,
    dueDate: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000),
    status: 'PENDIENTE',
  })

  return { customerId, chargeId }
}

async function getSession(sessionId: string) {
  const rows = await db
    .select()
    .from(schema.cashierSession)
    .where(eq(schema.cashierSession.id, sessionId))
    .limit(1)
  return rows[0]
}

async function getSale(saleId: string) {
  const rows = await db
    .select()
    .from(schema.sale)
    .where(eq(schema.sale.id, saleId))
    .limit(1)
  return rows[0]
}

async function cleanupTenant(tenantId: string): Promise<void> {
  const statements: Array<[string, unknown[]]> = [
    ['delete from cash_movement where "tenantId" = $1', [tenantId]],
    ['delete from customer_credit_transaction where "tenantId" = $1', [tenantId]],
    ['delete from inventory_movement where "tenantId" = $1', [tenantId]],
    [
      'delete from payment where "saleId" in (select id from sale where "tenantId" = $1)',
      [tenantId],
    ],
    [
      'delete from sale_item where "saleId" in (select id from sale where "tenantId" = $1)',
      [tenantId],
    ],
    ['delete from fiscal_document where "tenantId" = $1', [tenantId]],
    ['delete from fiscal_outbox where "tenantId" = $1', [tenantId]],
    ['delete from sale where "tenantId" = $1', [tenantId]],
    ['delete from inventory where "tenantId" = $1', [tenantId]],
    ['delete from customer where "tenantId" = $1', [tenantId]],
    ['delete from product where "tenantId" = $1', [tenantId]],
    ['delete from cashier_session where "tenantId" = $1', [tenantId]],
    ['delete from location where "tenantId" = $1', [tenantId]],
    ['delete from audit_log where "tenantId" = $1', [tenantId]],
    ['delete from event where "tenantId" = $1', [tenantId]],
    ['delete from numeration where "tenantId" = $1', [tenantId]],
    ['delete from user_tenant where "tenantId" = $1', [tenantId]],
    ['delete from tenant where id = $1', [tenantId]],
  ]

  for (const [statement, params] of statements) {
    await pool.query(statement, params)
  }
}

describeDb('cash, credit and sales integration', () => {
  beforeAll(async () => {
    if (!testDatabaseUrl) throw new Error('TEST_DATABASE_URL is required')
    process.env.DATABASE_URL = testDatabaseUrl

    vi.resetModules()
    const dbModule = await import('@/lib/db')
    db = dbModule.db
    pool = dbModule.pool
    schema = await import('@/lib/db/schema')
    cashierActions = await import('@/app/actions/cashier')
    customerActions = await import('@/app/actions/customers')
    salesActions = await import('@/app/actions/sales')
  })

  beforeEach(() => {
    authState.userId = ''
    authState.tenantId = ''
    authState.role = 'ADMIN'
    outboxMock.enqueue.mockClear()
    outboxMock.retry.mockClear()
  })

  afterEach(async () => {
    const tenantIds = createdTenantIds.splice(0)
    for (const tenantId of tenantIds) {
      await cleanupTenant(tenantId)
    }
  })

  afterAll(async () => {
    await pool.end()
  })

  it('allows one open cash session per user and independent sessions per cashier', async () => {
    const fixture = await createFixture('CASHIER')

    const first = await cashierActions.openCashierSession(0)
    await expect(cashierActions.openCashierSession(0)).rejects.toThrow(
      'ya tiene una caja abierta'
    )

    const otherUserId = await addUser(fixture.tenantId, 'CASHIER')
    authState.userId = otherUserId
    const second = await cashierActions.openCashierSession(0)

    expect(second.sessionId).not.toBe(first.sessionId)
    const sessions = await db
      .select()
      .from(schema.cashierSession)
      .where(eq(schema.cashierSession.tenantId, fixture.tenantId))
    expect(sessions).toHaveLength(2)
  })

  it('closes the previous open session and supports audited admin override', async () => {
    const fixture = await createFixture('ADMIN')
    const previous = await cashierActions.openCashierSession(1000)

    await db
      .update(schema.cashierSession)
      .set({ businessDate: '2020-01-01' })
      .where(eq(schema.cashierSession.id, previous.sessionId))

    await expect(cashierActions.openCashierSession(0)).rejects.toThrow(
      'Debe cerrarlo antes de abrir uno nuevo'
    )

    await expect(
      cashierActions.openCashierSession(0, undefined, undefined, {
        override: { reason: 'x' },
      })
    ).rejects.toThrow('mínimo 5')

    const current = await cashierActions.openCashierSession(500, 'Continuidad', undefined, {
      override: { reason: 'Continuidad operativa autorizada' },
    })

    expect(current.sessionId).not.toBe(previous.sessionId)
    const sessions = await db
      .select()
      .from(schema.cashierSession)
      .where(eq(schema.cashierSession.tenantId, fixture.tenantId))
    const previousRow = sessions.find((session) => session.id === previous.sessionId)
    const currentRow = sessions.find((session) => session.id === current.sessionId)
    expect(previousRow?.status).toBe('OPEN')
    expect(currentRow?.isOverride).toBe(true)
    expect(currentRow?.authorizedBy).toBe(fixture.userId)
    expect(currentRow?.overrideReason).toContain('Continuidad operativa')

    const closed = await cashierActions.closeCashierSession(previous.sessionId, 1000)
    expect(closed.zReport.businessDate).toBe('2020-01-01')

    const refreshed = await getSession(previous.sessionId)
    expect(refreshed.status).toBe('CLOSED')
    expect(refreshed.businessDate).toBeTruthy()
    expect(refreshed.closedAt).toBeTruthy()
  })

  it('records cash movements and reconciles expected cash on close', async () => {
    await createFixture('CASHIER')
    const { sessionId } = await cashierActions.openCashierSession(0)

    await cashierActions.registerCashMovement({
      type: 'INGRESO',
      concept: 'Fondo adicional',
      amount: 5000,
    })
    await cashierActions.registerCashMovement({
      type: 'EGRESO',
      concept: 'Domicilio',
      amount: 2000,
    })
    await expect(
      cashierActions.registerCashMovement({
        type: 'OTRO',
        concept: 'Inválido',
        amount: 1000,
      })
    ).rejects.toThrow('inválido')

    const closed = await cashierActions.closeCashierSession(sessionId, 3000)
    expect(closed.zReport.expectedCash).toBe(3000)

    const session = await getSession(sessionId)
    expect(session.status).toBe('CLOSED')
    expect(Number(session.expectedBalance)).toBe(3000)
    expect(Number(session.difference)).toBe(0)

    const movements = await db
      .select()
      .from(schema.cashMovement)
      .where(eq(schema.cashMovement.cashierSessionId, sessionId))
    expect(movements).toHaveLength(2)
  })

  it('prevents a cashier from registering movements in another user session', async () => {
    const fixture = await createFixture('CASHIER')
    const { sessionId } = await cashierActions.openCashierSession(0)

    const otherUserId = await addUser(fixture.tenantId, 'CASHIER')
    authState.userId = otherUserId

    await expect(
      cashierActions.registerCashMovement({
        type: 'INGRESO',
        concept: 'Ajeno',
        amount: 1000,
      })
    ).rejects.toThrow('No hay una caja abierta autorizada')

    const movements = await db
      .select()
      .from(schema.cashMovement)
      .where(eq(schema.cashMovement.cashierSessionId, sessionId))
    expect(movements).toHaveLength(0)
  })

  it('creates sales with the current user session and never reuses another cashier session', async () => {
    const fixture = await createFixture('CASHIER')
    await cashierActions.openCashierSession(0)

    const saleA = await salesActions.createSale({
      locationId: fixture.locationId,
      items: [{ productId: fixture.productId, quantity: 1 }],
    })
    const saleARow = await getSale(saleA.saleId)
    const sessionA = await getSession(saleARow.cashierSessionId)
    expect(sessionA.userId).toBe(fixture.userId)

    const otherUserId = await addUser(fixture.tenantId, 'CASHIER')
    authState.userId = otherUserId
    await cashierActions.openCashierSession(0)
    const saleB = await salesActions.createSale({
      locationId: fixture.locationId,
      items: [{ productId: fixture.productId, quantity: 1 }],
    })
    const saleBRow = await getSale(saleB.saleId)
    const sessionB = await getSession(saleBRow.cashierSessionId)

    expect(sessionB.id).not.toBe(sessionA.id)
    expect(sessionB.userId).toBe(otherUserId)
  })

  it('completes a sale, discounts stock and closes the session with cash sales', async () => {
    const fixture = await createFixture('CASHIER')
    await cashierActions.openCashierSession(0)
    const sale = await salesActions.createSale({
      locationId: fixture.locationId,
      items: [{ productId: fixture.productId, quantity: 1 }],
    })

    const completed = await salesActions.completeSale({
      saleId: sale.saleId,
      payments: [{ method: PaymentMethod.CASH, amount: 10000 }],
    })
    expect(completed.success).toBe(true)

    const inventory = await db
      .select()
      .from(schema.inventory)
      .where(eq(schema.inventory.id, fixture.inventoryId))
    expect(Number(inventory[0].quantity)).toBe(1)

    const saleRow = await getSale(sale.saleId)
    const session = await getSession(saleRow.cashierSessionId)
    const closed = await cashierActions.closeCashierSession(session.id, 10000)

    expect(closed.zReport.cashSales).toBe(10000)
    expect(closed.zReport.expectedCash).toBe(10000)
    expect(Number((await getSession(session.id)).difference)).toBe(0)
  })

  it('does not oversell the last unit when two sales complete concurrently', async () => {
    const fixture = await createFixture('CASHIER', '1.00')
    await cashierActions.openCashierSession(0)
    const saleA = await salesActions.createSale({
      locationId: fixture.locationId,
      items: [{ productId: fixture.productId, quantity: 1 }],
    })
    const saleB = await salesActions.createSale({
      locationId: fixture.locationId,
      items: [{ productId: fixture.productId, quantity: 1 }],
    })

    const results = await Promise.allSettled([
      salesActions.completeSale({
        saleId: saleA.saleId,
        payments: [{ method: PaymentMethod.CASH, amount: 10000 }],
      }),
      salesActions.completeSale({
        saleId: saleB.saleId,
        payments: [{ method: PaymentMethod.CASH, amount: 10000 }],
      }),
    ])

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1)
    const inventory = await db
      .select()
      .from(schema.inventory)
      .where(eq(schema.inventory.id, fixture.inventoryId))
    expect(Number(inventory[0].quantity)).toBe(0)
    const completed = await db
      .select()
      .from(schema.sale)
      .where(
        and(
          eq(schema.sale.tenantId, fixture.tenantId),
          eq(schema.sale.status, 'COMPLETED')
        )
      )
    expect(completed).toHaveLength(1)
  })

  it('credits a cash payment to the open session and blocks cash credit payments without a session', async () => {
    const fixture = await createFixture('CASHIER')
    const { sessionId } = await cashierActions.openCashierSession(0)
    const { customerId, chargeId } = await createCustomer(fixture.tenantId)

    const payment = await customerActions.payCustomerCredit({
      customerId,
      amount: 20000,
      paymentMethod: 'CASH',
    })
    expect(payment.newBalance).toBe(30000)

    const customer = await db
      .select()
      .from(schema.customer)
      .where(eq(schema.customer.id, customerId))
    expect(Number(customer[0].creditBalance)).toBe(30000)

    const charge = await db
      .select()
      .from(schema.customerCreditTransaction)
      .where(eq(schema.customerCreditTransaction.id, chargeId))
    expect(Number(charge[0].paidAmount)).toBe(20000)
    expect(charge[0].status).toBe('PENDIENTE')

    const movements = await db
      .select()
      .from(schema.cashMovement)
      .where(eq(schema.cashMovement.cashierSessionId, sessionId))
    expect(movements).toHaveLength(1)
    expect(movements[0].type).toBe('INGRESO')
    expect(Number(movements[0].amount)).toBe(20000)

    await cashierActions.closeCashierSession(sessionId, 20000)
    await expect(
      customerActions.payCustomerCredit({
        customerId,
        amount: 1000,
        paymentMethod: 'CASH',
      })
    ).rejects.toThrow('No hay una caja abierta')

    const unchanged = await db
      .select()
      .from(schema.customer)
      .where(eq(schema.customer.id, customerId))
    expect(Number(unchanged[0].creditBalance)).toBe(30000)
  })
})
