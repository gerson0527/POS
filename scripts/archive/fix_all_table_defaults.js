const { Client } = require('pg');
require('dotenv').config();

async function fixAllTableDefaults() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL || 'postgresql://postgres@localhost:5432/pruebas_POS',
  });

  try {
    await client.connect();
    console.log('Connected to DB for setting defaults.');

    const sqls = [
      // sale table defaults
      'ALTER TABLE "sale" ALTER COLUMN "subtotal" SET DEFAULT 0;',
      'ALTER TABLE "sale" ALTER COLUMN "taxAmount" SET DEFAULT 0;',
      'ALTER TABLE "sale" ALTER COLUMN "total" SET DEFAULT 0;',
      'ALTER TABLE "sale" ALTER COLUMN "discountAmount" SET DEFAULT 0;',
      'ALTER TABLE "sale" ALTER COLUMN "discountPercentage" SET DEFAULT 0;',
      'ALTER TABLE "sale" ALTER COLUMN "status" SET DEFAULT \'DRAFT\';',

      // sale_item table defaults
      'ALTER TABLE "sale_item" ALTER COLUMN "quantity" SET DEFAULT 1;',
      'ALTER TABLE "sale_item" ALTER COLUMN "unitPrice" SET DEFAULT 0;',
      'ALTER TABLE "sale_item" ALTER COLUMN "ivaRate" SET DEFAULT 19;',
      'ALTER TABLE "sale_item" ALTER COLUMN "ivaAmount" SET DEFAULT 0;',
      'ALTER TABLE "sale_item" ALTER COLUMN "lineTotal" SET DEFAULT 0;',
      'ALTER TABLE "sale_item" ADD COLUMN IF NOT EXISTS "createdAt" timestamp DEFAULT NOW();',
      'ALTER TABLE "sale_item" ALTER COLUMN "createdAt" SET DEFAULT NOW();',

      // payment table defaults
      'ALTER TABLE "payment" ALTER COLUMN "amount" SET DEFAULT 0;',
      'ALTER TABLE "payment" ALTER COLUMN "status" SET DEFAULT \'PROCESSED\';',
      'ALTER TABLE "payment" ADD COLUMN IF NOT EXISTS "createdAt" timestamp DEFAULT NOW();',
      'ALTER TABLE "payment" ALTER COLUMN "createdAt" SET DEFAULT NOW();',
      'ALTER TABLE "payment" ADD COLUMN IF NOT EXISTS "processedAt" timestamp DEFAULT NOW();',
      'ALTER TABLE "payment" ALTER COLUMN "processedAt" SET DEFAULT NOW();',
    ];

    for (const sql of sqls) {
      try {
        await client.query(sql);
        console.log('SUCCESS:', sql);
      } catch (err) {
        console.error('ERROR executing:', sql, '->', err.message);
      }
    }

    console.log('All table defaults updated successfully in PostgreSQL.');
  } catch (err) {
    console.error('DB error:', err);
  } finally {
    await client.end();
  }
}

fixAllTableDefaults();
