const { pool, db } = require('../lib/db/index');
const schema = require('../lib/db/schema');
const { eq } = require('drizzle-orm');

async function testPaymentFull() {
  try {
    console.log('Testing end-to-end payment insertion...');

    const saleId = `sale_test_pay_${Date.now()}`;
    const payId = `pay_test_${Date.now()}`;

    // 1. Insert sale
    await db.insert(schema.sale).values({
      id: saleId,
      tenantId: 'tenant_default',
      locationId: 'loc_bogota_01',
      cashierSessionId: 'cs_dummy',
      userId: 'user_dummy',
      ticketNumber: 99,
      subtotal: '209000',
      taxAmount: '0',
      total: '209000',
      status: 'DRAFT',
    });

    // 2. Insert payment
    await db.insert(schema.payment).values({
      id: payId,
      saleId,
      method: 'CASH',
      amount: '209000',
      status: 'PROCESSED',
      processedAt: new Date(),
    });

    console.log('SUCCESS: Sale and Payment created 100% cleanly in PostgreSQL!');

    // Cleanup
    await db.delete(schema.payment).where(eq(schema.payment.id, payId));
    await db.delete(schema.sale).where(eq(schema.sale.id, saleId));
    console.log('Cleanup completed.');

  } catch (err) {
    console.error('FULL PAYMENT TEST ERROR:', err);
  } finally {
    await pool.end();
  }
}

testPaymentFull();
