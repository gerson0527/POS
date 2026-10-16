const { Client } = require('pg');
require('dotenv').config();

async function cleanOpenSessions() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL || 'postgresql://postgres@localhost:5432/pruebas_POS',
  });

  try {
    await client.connect();
    console.log('Connected to DB');

    // 1. Get all cashier sessions
    const sessions = await client.query(`SELECT id, "tenantId", "userId", status, "openedAt" FROM "cashier_session";`);
    console.log('Current cashier_session records in DB:', sessions.rows);

    // 2. Close all currently OPEN sessions or mark them CLOSED
    const updateRes = await client.query(`
      UPDATE "cashier_session"
      SET status = 'CLOSED', "closedAt" = NOW(), "closingBalance" = 0, "expectedBalance" = 0, "difference" = 0, notes = 'Cierre automático por limpieza de sesiones duplicadas'
      WHERE status = 'OPEN';
    `);

    console.log(`Successfully closed ${updateRes.rowCount} open session(s).`);

    const sessionsAfter = await client.query(`SELECT id, status, "openedAt" FROM "cashier_session";`);
    console.log('Updated cashier_session status in DB:', sessionsAfter.rows);

  } catch (err) {
    console.error('DB error:', err);
  } finally {
    await client.end();
  }
}

cleanOpenSessions();
