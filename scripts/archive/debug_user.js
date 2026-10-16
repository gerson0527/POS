require('dotenv').config();
const { pool } = require('../lib/db');

async function checkUsers() {
  try {
    const resUsers = await pool.query('SELECT id, name, email FROM "user"');
    console.log('=== USERS IN DATABASE ===');
    console.table(resUsers.rows);

    const resAcc = await pool.query('SELECT id, "userId", "providerId", "accountId" FROM "account"');
    console.log('=== ACCOUNTS IN DATABASE ===');
    console.table(resAcc.rows);

    const resUt = await pool.query('SELECT * FROM "user_tenant"');
    console.log('=== USER_TENANT IN DATABASE ===');
    console.table(resUt.rows);

  } catch (err) {
    console.error('Error querying database:', err);
  } finally {
    await pool.end();
  }
}

checkUsers();
