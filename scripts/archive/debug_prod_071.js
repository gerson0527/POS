const { Client } = require('pg');
require('dotenv').config();

async function debugProd() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL || 'postgresql://postgres@localhost:5432/pruebas_POS',
  });

  try {
    await client.connect();
    console.log('Connected to DB');

    // 1. Check if prod_071 exists
    const prodRes = await client.query(`SELECT * FROM "product" WHERE id = 'prod_071' OR sku = 'prod_071';`);
    console.log('prod_071 in DB:', prodRes.rows);

    // 2. Check foreign keys on sale_item
    const fkRes = await client.query(`
      SELECT
        tc.constraint_name, 
        kcu.column_name, 
        ccu.table_name AS foreign_table_name,
        ccu.column_name AS foreign_column_name 
      FROM 
        information_schema.table_constraints AS tc 
        JOIN information_schema.key_column_usage AS kcu
          ON tc.constraint_name = kcu.constraint_name
          AND tc.table_schema = kcu.table_schema
        JOIN information_schema.constraint_column_usage AS ccu
          ON ccu.constraint_name = tc.constraint_name
          AND ccu.table_schema = tc.table_schema
      WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_name='sale_item';
    `);
    console.log('Foreign key constraints on sale_item:', fkRes.rows);

    // 3. Try to insert sale_item directly with a valid sale and prod_071
    const saleId = 'sale_test_fk_' + Date.now();
    await client.query(`
      INSERT INTO "sale" ("id", "tenantId", "locationId", "cashierSessionId", "userId", "ticketNumber", "status", "subtotal", "taxAmount", "total")
      VALUES ('${saleId}', 'tenant_default', 'loc_bogota_01', 'cs_dummy', 'user_dummy', 1, 'DRAFT', '2500', '475', '2975');
    `);

    console.log('Inserting sale_item for saleId:', saleId, 'and productId: prod_071');
    await client.query(
      `insert into "sale_item" ("id", "saleId", "productId", "quantity", "unitPrice", "ivaRate", "ivaAmount", "lineTotal", "createdAt") values ($1, $2, $3, $4, $5, $6, $7, $8, default)`,
      ['item_fk_test_' + Date.now(), saleId, 'prod_071', '1', '2500.0000', '19.00', '475', '2975']
    );

    console.log('INSERT SUCCESSFUL!');

  } catch (err) {
    console.error('EXACT PG ERROR:', err);
  } finally {
    await client.end();
  }
}

debugProd();
