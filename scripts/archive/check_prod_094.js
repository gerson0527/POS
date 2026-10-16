const { Client } = require('pg');
require('dotenv').config();

async function checkProd094() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL || 'postgresql://postgres@localhost:5432/pruebas_POS',
  });

  try {
    await client.connect();
    console.log('Connected to DB');

    // 1. Query prod_094
    const prodRes = await client.query(`SELECT * FROM "product" WHERE id = 'prod_094';`);
    console.log('prod_094 in product table:', prodRes.rows);

    // 2. Query all products count
    const countRes = await client.query(`SELECT count(*) FROM "product";`);
    console.log('Total products in DB:', countRes.rows[0].count);

    // 3. Query all product IDs
    const allProds = await client.query(`SELECT id, sku, name, tenantId FROM "product" LIMIT 20;`);
    console.log('Sample product IDs in DB:', allProds.rows);

  } catch (err) {
    console.error('DB Error:', err);
  } finally {
    await client.end();
  }
}

checkProd094();
