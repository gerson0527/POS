const { Client } = require('pg');
require('dotenv').config();

async function fixSaleUpdatedAt() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL || 'postgresql://postgres@localhost:5432/pruebas_POS',
  });

  try {
    await client.connect();
    console.log('Connected to DB');

    const sqls = [
      'ALTER TABLE "sale" ADD COLUMN IF NOT EXISTS "updatedAt" timestamp DEFAULT NOW();',
      'ALTER TABLE "sale" ALTER COLUMN "updatedAt" SET DEFAULT NOW();',
      'ALTER TABLE "sale" ALTER COLUMN "updatedAt" DROP NOT NULL;',
    ];

    for (const sql of sqls) {
      try {
        await client.query(sql);
        console.log('SUCCESS:', sql);
      } catch (err) {
        console.error('ERROR:', sql, err.message);
      }
    }
  } catch (err) {
    console.error('DB error:', err);
  } finally {
    await client.end();
  }
}

fixSaleUpdatedAt();
