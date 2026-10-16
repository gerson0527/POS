const { pool, db } = require('../lib/db/index');
const schema = require('../lib/db/schema');

async function testSaleItem() {
  try {
    console.log('Testing insert into sale_item...');

    const saleItemId = `item_test_${Date.now()}`;

    await db.insert(schema.saleItem).values({
      id: saleItemId,
      saleId: 'sale_dummy_id',
      productId: 'prod_dummy_id',
      quantity: '1',
      unitPrice: '2500.0000',
      ivaRate: '19.00',
      ivaAmount: '475.00',
      lineTotal: '2975.00',
    });

    console.log('SUCCESS: Sale item inserted without error!');
  } catch (err) {
    console.error('EXACT POSTGRES SALE_ITEM ERROR:', err);
  } finally {
    await pool.end();
  }
}

testSaleItem();
