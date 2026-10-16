const { Pool } = require('pg');

async function testConnections() {
  const url1 = 'postgresql://postgres@localhost:5432/pruebas_POS';
  const url2 = 'postgresql://posuser:pospassword@localhost:5432/posdian';

  console.log('--- URL 1 (pruebas_POS) ---');
  try {
    const p1 = new Pool({ connectionString: url1 });
    const res1 = await p1.query('SELECT email FROM "user"');
    console.log('Users in pruebas_POS:', res1.rows);
    const acc1 = await p1.query('SELECT "userId", "providerId" FROM "account"');
    console.log('Accounts in pruebas_POS:', acc1.rows);
    await p1.end();
  } catch (err) {
    console.error('Error url1:', err.message);
  }

  console.log('--- URL 2 (posdian) ---');
  try {
    const p2 = new Pool({ connectionString: url2 });
    const res2 = await p2.query('SELECT email FROM "user"');
    console.log('Users in posdian:', res2.rows);
    const acc2 = await p2.query('SELECT "userId", "providerId" FROM "account"');
    console.log('Accounts in posdian:', acc2.rows);
    await p2.end();
  } catch (err) {
    console.error('Error url2:', err.message);
  }
}

testConnections();
