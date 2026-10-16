const { Client } = require('pg');
require('dotenv').config();

async function debugSaleItem() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL || 'postgresql://postgres@localhost:5432/pruebas_POS',
  });

  try {
    await client.connect();
    console.log('Connected to DB');

    // 1. Create a dummy sale row
    const saleId = 'sale_debug_101';
    await client.query(`
      INSERT INTO "sale" ("id", "tenantId", "locationId", "cashierSessionId", "userId", "ticketNumber", "status", "subtotal", "taxAmount", "total")
      VALUES ('${saleId}', 'tenant_default', 'loc_bogota_01', 'cs_dummy', 'user_dummy', 1, 'DRAFT', '2500', '475', '2975')
      ON CONFLICT ("id") DO NOTHING;
    `);

    // 2. Try the exact sale_item insert that failed
    console.log('Attempting insert into sale_item...');
    await client.query(
      `insert into "sale_item" ("id", "saleId", "productId", "quantity", "unitPrice", "ivaRate", "ivaAmount", "lineTotal", "createdAt") values ($1, $2, $3, $4, $5, $6, $7, $8, default)`,
      ['item_debug_202', saleId, 'prod_071', '1', '2500.0000', '19.00', '475', '2975']
    );

    console.log('SUCCESS! sale_item insert succeeded!');

  } catch (err) {
    console.error('EXACT PG ERROR:', err);
  } finally {
    await client.end();
  }
}

debugSaleItem();
