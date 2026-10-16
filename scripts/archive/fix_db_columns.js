const { pool } = require('./lib_db_index');
require('dotenv').config();

async function run() {
  const { Client } = require('pg');
  const client = new Client({
    connectionString: process.env.DATABASE_URL || 'postgresql://postgres@localhost:5432/pruebas_POS'
  });

  try {
    await client.connect();
    console.log('Connected to DB');

    // Get current sale table columns
    const res = await client.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'sale';
    `);

    const cols = res.rows.map(r => r.column_name);
    console.log('Current sale table columns in DB:', cols);

    const alterations = [
      'ALTER TABLE "sale" ADD COLUMN IF NOT EXISTS "locationId" text;',
      'ALTER TABLE "sale" ADD COLUMN IF NOT EXISTS "customerDocType" text;',
      'ALTER TABLE "sale" ADD COLUMN IF NOT EXISTS "customerDocNumber" text;',
      'ALTER TABLE "sale" ADD COLUMN IF NOT EXISTS "customerName" text;',
      'ALTER TABLE "sale" ADD COLUMN IF NOT EXISTS "customerEmail" text;',
      'ALTER TABLE "sale" ADD COLUMN IF NOT EXISTS "customerPhone" text;',
      'ALTER TABLE "sale" ADD COLUMN IF NOT EXISTS "customerAddress" text;',
      'ALTER TABLE "sale" ADD COLUMN IF NOT EXISTS "notes" text;',
      'ALTER TABLE "sale" ADD COLUMN IF NOT EXISTS "completedAt" timestamp;',
      'ALTER TABLE "sale" ADD COLUMN IF NOT EXISTS "discountAmount" decimal(12,2) NOT NULL DEFAULT 0;',
      'ALTER TABLE "sale" ADD COLUMN IF NOT EXISTS "discountPercentage" decimal(5,2) NOT NULL DEFAULT 0;',
      'ALTER TABLE "sale" ALTER COLUMN "ticketNumber" DROP NOT NULL;',
    ];

    for (const sql of alterations) {
      try {
        await client.query(sql);
        console.log('Executed:', sql);
      } catch (err) {
        console.error('Error executing:', sql, err.message);
      }
    }

    const resAfter = await client.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'sale';
    `);
    console.log('Updated sale table columns in DB:', resAfter.rows.map(r => r.column_name));

  } catch (err) {
    console.error('DB Error:', err);
  } finally {
    await client.end();
  }
}

run();
