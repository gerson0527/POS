const { Client } = require('pg');
require('dotenv').config();

async function testQuery() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL || 'postgresql://postgres@localhost:5432/pruebas_POS',
  });

  try {
    await client.connect();
    console.log('Connected to DB');

    const res = await client.query(
      `select "id", "tenantId", "locationId", "cashierSessionId", "userId", "ticketNumber", "status", "subtotal", "taxAmount", "total", "discountAmount", "discountPercentage", "notes", "customerDocType", "customerDocNumber", "customerName", "customerEmail", "customerPhone", "customerAddress", "createdAt", "completedAt" from "sale" where ("sale"."cashierSessionId" = $1 and "sale"."status" = $2)`,
      ['cs_1785545726535', 'COMPLETED']
    );

    console.log('Query result rows:', res.rows.length);
  } catch (err) {
    console.error('EXACT PG ERROR:', err);
  } finally {
    await client.end();
  }
}

testQuery();
