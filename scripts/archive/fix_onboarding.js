const { Pool } = require('pg');

const urls = [
  'postgresql://postgres@localhost:5432/pruebas_POS',
  'postgresql://posuser:pospassword@localhost:5432/posdian'
];

async function fixOnboarding() {
  for (const url of urls) {
    console.log(`Updating onboarding status in ${url}...`);
    try {
      const pool = new Pool({ connectionString: url });
      const res = await pool.query(`
        UPDATE "tenant" 
        SET "onboardingCompleted" = 'SI', 
            "onboardingCompletedAt" = NOW(), 
            "onboardingCompletedBy" = 'admin@posdian.com'
        WHERE "onboardingCompleted" != 'SI' OR "onboardingCompleted" IS NULL;
      `);
      console.log(`✅ Updated ${res.rowCount} tenant(s) in ${url}`);
      await pool.end();
    } catch (err) {
      console.error(`❌ Error updating ${url}:`, err.message);
    }
  }
}

fixOnboarding();
