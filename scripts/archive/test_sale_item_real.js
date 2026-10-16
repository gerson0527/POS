const { pool, db } = require('../lib/db/index');
const schema = require('../lib/db/schema');
const { eq } = require('drizzle-orm');

async function testRealSaleItem() {
  try {
    console.log('Testing insert real sale and real sale_item...');

    const saleId = `sale_real_${Date.now()}`;
    const cashierSessions = await db.select().from(schema.cashierSession).limit(1);

    let sessionId = `cs_${Date.now()}`;
    if (cashierSessions.length > 0) sessionId = cashierSessions[0].id;
    else {
      await db.insert(schema.cashierSession).values({
        id: sessionId,
        tenantId: 'tenant_default',
        locationId: 'loc_bogota_01',
        userId: 'user_test',
        status: 'OPEN',
      });
    }

    await db.insert(schema.sale).values({
      id: saleId,
      tenantId: 'tenant_default',
      locationId: 'loc_bogota_01',
      cashierSessionId: sessionId,
      userId: 'user_test',
      ticketNumber: 1,
      subtotal: '2500.00',
      taxAmount: '475.00',
      total: '2975.00',
      status: 'DRAFT',
    });

    const saleItemId = `item_${Date.now()}_${Math.random()}`;
    await db.insert(schema.saleItem).values({
      id: saleItemId,
      saleId,
      productId: 'prod_071',
      quantity: '1',
      unitPrice: '2500.0000',
      ivaRate: '19.00',
      ivaAmount: '475.00',
      lineTotal: '2975.00',
    });

    console.log('SUCCESS: Real sale and sale_item inserted clean!');

    // Cleanup
    await db.delete(schema.saleItem).where(eq(schema.saleItem.id, saleItemId));
    await db.delete(schema.sale).where(eq(schema.sale.id, saleId));
    console.log('Cleanup completed.');
  } catch (err) {
    console.error('EXACT SALE_ITEM ERROR:', err);
  } finally {
    await pool.end();
  }
}

testRealSaleItem();
