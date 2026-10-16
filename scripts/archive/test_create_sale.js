const { pool, db } = require('../lib/db/index');
const schema = require('../lib/db/schema');
const { eq } = require('drizzle-orm');

async function testCreateSale() {
  try {
    console.log('Testing sale insert with integer ticketNumber...');

    // Find a valid cashier session
    const sessions = await db.select().from(schema.cashierSession).limit(1);
    let sessionId = `cs_${Date.now()}`;
    let tenantId = 'tenant_default';
    let locationId = 'loc_bogota_01';
    let userId = 'user_test';

    if (sessions.length === 0) {
      await db.insert(schema.cashierSession).values({
        id: sessionId,
        tenantId,
        locationId,
        userId,
        status: 'OPEN',
        openingBalance: '50000',
      });
    } else {
      sessionId = sessions[0].id;
      tenantId = sessions[0].tenantId;
      locationId = sessions[0].locationId;
      userId = sessions[0].userId;
    }

    const saleId = `sale_test_${Date.now()}`;
    const ticketNumber = 1; // Pure Integer Number!

    await db.insert(schema.sale).values({
      id: saleId,
      tenantId,
      locationId,
      cashierSessionId: sessionId,
      userId,
      ticketNumber,
      subtotal: '10000',
      taxAmount: '1900',
      total: '11900',
      status: 'DRAFT',
      customerDocType: 'CC',
      customerDocNumber: '222222',
      customerName: 'Cliente Final',
      customerEmail: 'test@example.com',
      customerPhone: '3001234567',
    });

    console.log('SUCCESS: Sale created successfully in PostgreSQL with saleId:', saleId);

    // Clean up test sale
    await db.delete(schema.sale).where(eq(schema.sale.id, saleId));
    console.log('Cleaned up test sale.');
  } catch (err) {
    console.error('ERROR creating test sale:', err);
  } finally {
    await pool.end();
  }
}

testCreateSale();
