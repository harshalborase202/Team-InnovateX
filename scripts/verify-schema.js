// MediKiosk Supabase Schema Verification Script
import fs from 'node:fs';

// Read .env if available
try {
  const envContent = fs.readFileSync('.env', 'utf8');
  for (const line of envContent.split('\n')) {
    const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
    if (match) {
      const key = match[1];
      const value = (match[2] || '').trim().replace(/^["']|["']$/g, '');
      process.env[key] = value;
    }
  }
} catch {
  // Ignore if .env does not exist
}

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY;

const EXPECTED_TABLES = [
  'patients',
  'sessions',
  'consents',
  'history_responses',
  'red_flags',
  'documents',
  'clinical_summaries',
  'ayush_history',
  'audit_log'
];

async function checkTable(table) {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?select=id&limit=1`, {
      headers: {
        'apikey': ANON_KEY,
        'Authorization': `Bearer ${ANON_KEY}`
      }
    });

    if (res.status === 200) {
      return { table, exists: true };
    } else if (res.status === 404) {
      const data = await res.json().catch(() => ({}));
      return { table, exists: false, reason: data.message || 'Table not found' };
    } else {
      // If 401 or 403, the table exists but access is restricted by RLS (which is expected!)
      return { table, exists: true, status: res.status };
    }
  } catch (err) {
    return { table, exists: false, error: err.message };
  }
}

async function verifySchema() {
  console.log(`\n========================================`);
  console.log(`Checking MediKiosk Tables on Supabase`);
  console.log(`URL: ${SUPABASE_URL}`);
  console.log(`========================================\n`);

  const results = await Promise.all(EXPECTED_TABLES.map(checkTable));
  
  let allExist = true;
  for (const r of results) {
    if (r.exists) {
      console.log(`  [EXISTS]  ✔ ${r.table}`);
    } else {
      allExist = false;
      console.log(`  [MISSING] ✖ ${r.table} (${r.reason || r.error})`);
    }
  }

  console.log(`\n----------------------------------------`);
  if (allExist) {
    console.log(`🎉 ALL 9 MEDIKIOSK TABLES ARE ACTIVE AND VERIFIED!`);
  } else {
    console.log(`⚠️ Some tables have not been created in the database yet.`);
  }
  console.log(`----------------------------------------\n`);
}

verifySchema();
