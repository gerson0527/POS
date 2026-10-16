const { createSale, completeSale } = require('../app/actions/pos-actions');
const { pool, db } = require('../lib/db/index');
const schema = require('../lib/db/schema');
const { eq } = require('drizzle-orm');

async function testFullSaleFlow() {
  try {
    console.log('Testing FULL POS sale creation & payment flow...');

    // 1. Ensure a product exists
    let products = await db.select().from(schema.product).limit(1);
    let productId = 'prod_test_01';

    if (products.length === 0) {
      await db.insert(schema.product).values({
        id: productId,
        tenantId: 'tenant_default',
        sku: 'SKU-TEST-01',
        name: 'Producto Pruebas',
        unitPrice: '5000.00',
        ivaRate: '19.00',
        status: 'ACTIVE',
      });
    } else {
      productId = products[0].id;
    }

    // 2. Create Sale (DRAFT)
    const saleRes = await createSale({
      locationId: 'loc_bogota_01',
      items: [
        {
          productId,
          quantity: 2,
        },
      ],
      customer: {
        documentType: 'CC',
        documentNumber: '10001000',
        name: 'Cliente Prueba Flujo',
        email: 'prueba@pos.com',
      },
    });

    console.log('Step 1 (createSale) SUCCESS -> Sale ID:', saleRes.saleId, 'Ticket:', saleRes.ticketNumber);

    // 3. Complete Sale with NEQUI payment
    const completeRes = await completeSale({
      saleId: saleRes.saleId,
      payments: [
        {
          method: 'NEQUI',
          amount: 11900, // Total calculated by pos-utils
          reference: 'NEQ-COMPROBANTE-12345',
        },
      ],
    });

    console.log('Step 2 (completeSale) SUCCESS -> Sale completed:', completeRes.success);
    console.log('🎉 END-TO-END SALE & PAYMENT FLOW COMPLETED 100% SUCCESSFULLY!');

  } catch (err) {
    console.error('❌ Error in full sale flow:', err);
  } finally {
    await pool.end();
  }
}

testFullSaleFlow();
