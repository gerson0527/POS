const { Client } = require('pg');
require('dotenv').config();

async function fixSaleItemCreatedAt() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL || 'postgresql://postgres@localhost:5432/pruebas_POS',
  });

  try {
    await client.connect();
    console.log('Connected to DB');

    const sqls = [
      'ALTER TABLE "sale_item" ADD COLUMN IF NOT EXISTS "createdAt" timestamp DEFAULT NOW();',
      'ALTER TABLE "sale_item" ALTER COLUMN "createdAt" SET DEFAULT NOW();',
    ];

    for (const sql of sqls) {
      try {
        await client.query(sql);
        console.log('SUCCESS:', sql);
      } catch (err) {
        console.error('ERROR executing:', sql, '->', err.message);
      }
    }

    const cols = await client.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'sale_item';
    `);
    console.log('Updated sale_item columns in DB:', cols.rows.map(r => r.column_name));

  } catch (err) {
    console.error('DB error:', err);
  } finally {
    await client.end();
  }
}

fixSaleItemCreatedAt();
