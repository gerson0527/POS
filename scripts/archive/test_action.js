const { pool, db } = require('../lib/db/index');
const schema = require('../lib/db/schema');
const { eq, and } = require('drizzle-orm');

async function testFullFlow() {
  try {
    console.log('1. Testing select from sale...');
    const sales = await db.select().from(schema.sale).limit(5);
    console.log('Sales count in DB:', sales.length);

    console.log('2. Testing select from cashier_session...');
    const sessions = await db.select().from(schema.cashierSession).limit(5);
    console.log('Sessions count in DB:', sessions.length);

    console.log('SUCCESS: All queries executed cleanly without any PostgreSQL role or schema error!');
  } catch (err) {
    console.error('ERROR in testFullFlow:', err);
  } finally {
    await pool.end();
  }
}

testFullFlow();
