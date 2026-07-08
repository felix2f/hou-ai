const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_KEY');
  process.exit(1);
}

const h = {
  apikey: SUPABASE_KEY,
  Authorization: `Bearer ${SUPABASE_KEY}`,
  'Content-Type': 'application/json',
};

async function runSQL(sql) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/exec_sql`, {
    method: 'POST', headers: h,
    body: JSON.stringify({ sql }),
  });
  return { status: r.status, body: await r.text() };
}

const tables = [
  {
    name: 'error_logs',
    sql: `CREATE TABLE IF NOT EXISTS error_logs (
      id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
      message text, source text, line_no int, col_no int,
      stack text, url text, user_agent text, user_id uuid,
      created_at timestamptz DEFAULT now()
    );`
  },
  {
    name: 'events',
    sql: `CREATE TABLE IF NOT EXISTS events (
      id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
      name text NOT NULL, props jsonb, url text, user_id uuid,
      created_at timestamptz DEFAULT now()
    );`
  }
];

for (const t of tables) {
  process.stdout.write(`Creating ${t.name}... `);
  const r = await runSQL(t.sql);
  if (r.status === 200 || r.status === 204) {
    console.log('✓');
  } else {
    console.log(`✗ (${r.status}) ${r.body}`);
  }
}
