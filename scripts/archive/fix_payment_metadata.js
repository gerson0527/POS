const { Client } = require('pg');
require('dotenv').config();

async function fixPaymentMetadata() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL || 'postgresql://postgres@localhost:5432/pruebas_POS',
  });

  try {
    await client.connect();
    console.log('Connected to DB');

    const sqls = [
      'ALTER TABLE "payment" ADD COLUMN IF NOT EXISTS "metadata" jsonb;',
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

    const cols = await client.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'payment';
    `);
    console.log('Updated payment columns in DB:', cols.rows.map(r => r.column_name));

  } catch (err) {
    console.error('DB error:', err);
  } finally {
    await client.end();
  }
}

fixPaymentMetadata();
