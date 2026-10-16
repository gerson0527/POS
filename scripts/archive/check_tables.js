const { Client } = require('pg');
require('dotenv').config();

async function checkTables() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL || 'postgresql://postgres@localhost:5432/pruebas_POS'
  });

  try {
    await client.connect();
    console.log('Connected to database:', process.env.POSTGRES_DB || 'pruebas_POS');

    const res = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
      ORDER BY table_name;
    `);

    console.log(`Found ${res.rows.length} tables in schema public:`);
    res.rows.forEach((r) => console.log(' - ' + r.table_name));

    const userCount = await client.query('SELECT COUNT(*) FROM "user";').catch((e) => ({ rows: [{ count: 'Error: ' + e.message }] }));
    const productCount = await client.query('SELECT COUNT(*) FROM "product";').catch((e) => ({ rows: [{ count: 'Error: ' + e.message }] }));
    const customerCount = await client.query('SELECT COUNT(*) FROM "customer";').catch((e) => ({ rows: [{ count: 'Error: ' + e.message }] }));

    console.log('\nRecord Counts:');
    console.log(' - Users:', userCount.rows[0].count);
    console.log(' - Products:', productCount.rows[0].count);
    console.log(' - Customers:', customerCount.rows[0].count);
  } catch (err) {
    console.error('Error checking tables:', err);
  } finally {
    await client.end();
  }
}

checkTables();
