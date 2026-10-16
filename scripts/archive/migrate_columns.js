const { Client } = require('pg');
require('dotenv').config();

async function runMigration() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL || 'postgresql://postgres@localhost:5432/pruebas_POS',
  });

  try {
    await client.connect();
    console.log('Connected to PostgreSQL database for schema synchronization.');

    const alterStatements = [
      // sale table
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

      // sale_item table
      'ALTER TABLE "sale_item" ADD COLUMN IF NOT EXISTS "createdAt" timestamp DEFAULT NOW();',

      // payment table
      'ALTER TABLE "payment" ADD COLUMN IF NOT EXISTS "reference" text;',
      'ALTER TABLE "payment" ADD COLUMN IF NOT EXISTS "metadata" jsonb;',
      'ALTER TABLE "payment" ADD COLUMN IF NOT EXISTS "createdAt" timestamp DEFAULT NOW();',
      'ALTER TABLE "payment" ADD COLUMN IF NOT EXISTS "processedAt" timestamp;',

      // cashier_session table
      'ALTER TABLE "cashier_session" ADD COLUMN IF NOT EXISTS "notes" text;',
      'ALTER TABLE "cashier_session" ADD COLUMN IF NOT EXISTS "expectedBalance" decimal(12,2);',
      'ALTER TABLE "cashier_session" ADD COLUMN IF NOT EXISTS "difference" decimal(12,2);',
      'ALTER TABLE "cashier_session" ADD COLUMN IF NOT EXISTS "totalSales" decimal(12,2) DEFAULT 0;',
      'ALTER TABLE "cashier_session" ADD COLUMN IF NOT EXISTS "cashSales" decimal(12,2) DEFAULT 0;',
      'ALTER TABLE "cashier_session" ADD COLUMN IF NOT EXISTS "cardSales" decimal(12,2) DEFAULT 0;',
      'ALTER TABLE "cashier_session" ADD COLUMN IF NOT EXISTS "transferSales" decimal(12,2) DEFAULT 0;',
      'ALTER TABLE "cashier_session" ADD COLUMN IF NOT EXISTS "creditSales" decimal(12,2) DEFAULT 0;',
      'ALTER TABLE "cashier_session" ADD COLUMN IF NOT EXISTS "salesCount" integer DEFAULT 0;',
      'ALTER TABLE "cashier_session" ADD COLUMN IF NOT EXISTS "createdAt" timestamp DEFAULT NOW();',

      // customer table
      'ALTER TABLE "customer" ADD COLUMN IF NOT EXISTS "creditEnabled" text NOT NULL DEFAULT \'NO\';',
      'ALTER TABLE "customer" ADD COLUMN IF NOT EXISTS "creditLimit" decimal(12,2) NOT NULL DEFAULT 0;',
      'ALTER TABLE "customer" ADD COLUMN IF NOT EXISTS "creditBalance" decimal(12,2) NOT NULL DEFAULT 0;',
      'ALTER TABLE "customer" ADD COLUMN IF NOT EXISTS "creditStatus" text NOT NULL DEFAULT \'AL_DIA\';',

      // product table
      'ALTER TABLE "product" ADD COLUMN IF NOT EXISTS "cost" decimal(12,2);',
      'ALTER TABLE "product" ADD COLUMN IF NOT EXISTS "categoryId" text;',
      'ALTER TABLE "product" ADD COLUMN IF NOT EXISTS "category" text DEFAULT \'General\';',
      'ALTER TABLE "product" ADD COLUMN IF NOT EXISTS "margin" decimal(5,2) DEFAULT 0;',
    ];

    for (const sql of alterStatements) {
      try {
        await client.query(sql);
        console.log('SUCCESS:', sql);
      } catch (err) {
        console.error('ERROR ON:', sql, '->', err.message);
      }
    }

    console.log('Migration completed successfully.');
  } catch (err) {
    console.error('Failed to connect or migrate:', err);
  } finally {
    await client.end();
  }
}

runMigration();
