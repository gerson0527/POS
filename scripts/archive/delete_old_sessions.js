const { Client } = require('pg');
require('dotenv').config();

async function deleteOldSessions() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL || 'postgresql://postgres@localhost:5432/pruebas_POS',
  });

  try {
    await client.connect();
    console.log('Connected to DB for cleanup.');

    await client.query(`DELETE FROM "payment";`);
    await client.query(`DELETE FROM "sale_item";`);
    await client.query(`DELETE FROM "sale";`);
    await client.query(`DELETE FROM "cashier_session";`);

    console.log('Successfully deleted all old test sessions, sales, and payments.');

    const sessionsAfter = await client.query(`SELECT count(*) FROM "cashier_session";`);
    console.log('Remaining cashier_session count:', sessionsAfter.rows[0].count);

  } catch (err) {
    console.error('DB error during deletion:', err);
  } finally {
    await client.end();
  }
}

deleteOldSessions();
