const { Client } = require('pg');
require('dotenv').config();

async function debugPaymentInsert() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL || 'postgresql://postgres@localhost:5432/pruebas_POS',
  });

  try {
    await client.connect();
    console.log('Connected to DB');

    // 1. Check columns in payment table
    const cols = await client.query(`
      SELECT column_name, data_type, is_nullable, column_default 
      FROM information_schema.columns 
      WHERE table_name = 'payment';
    `);
    console.log('Payment table columns in DB:', cols.rows);

    // 2. Try the exact insert query
    const saleId = 'sale_debug_pay_101';
    await client.query(`
      INSERT INTO "sale" ("id", "tenantId", "locationId", "cashierSessionId", "userId", "ticketNumber", "status", "subtotal", "taxAmount", "total")
      VALUES ('${saleId}', 'tenant_default', 'loc_bogota_01', 'cs_dummy', 'user_dummy', 1, 'DRAFT', '363000', '0', '363000')
      ON CONFLICT ("id") DO NOTHING;
    `);

    console.log('Attempting insert into payment table...');
    await client.query(
      `insert into "payment" ("id", "saleId", "method", "amount", "status", "reference", "metadata", "createdAt", "processedAt") values ($1, $2, $3, $4, $5, default, default, default, $6)`,
      ['pay_test_101', saleId, 'CASH', '363000', 'PROCESSED', new Date()]
    );

    console.log('SUCCESS! Payment insert succeeded!');

  } catch (err) {
    console.error('EXACT PG PAYMENT ERROR:', err);
  } finally {
    await client.end();
  }
}

debugPaymentInsert();
