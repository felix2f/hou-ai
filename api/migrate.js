// 临时迁移端点，建表完成后删除
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
const SECRET = 'hou_migrate_2026_oneshot';

export default async function handler(req, res) {
  if (req.query.secret !== SECRET) return res.status(403).end();

  const h = {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
    'Content-Type': 'application/json',
    Prefer: 'return=minimal',
  };

  const sqls = [
    `CREATE TABLE IF NOT EXISTS error_logs (
      id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
      message text, source text, line_no int, col_no int,
      stack text, url text, user_agent text, user_id uuid,
      created_at timestamptz DEFAULT now()
    )`,
    `CREATE TABLE IF NOT EXISTS events (
      id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
      name text NOT NULL, props jsonb, url text, user_id uuid,
      created_at timestamptz DEFAULT now()
    )`,
  ];

  const results = [];
  for (const sql of sqls) {
    try {
      const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/exec_sql`, {
        method: 'POST', headers: h,
        body: JSON.stringify({ sql }),
      });
      results.push({ sql: sql.split('\n')[0].trim(), status: r.status, body: await r.text() });
    } catch (e) {
      results.push({ sql: sql.split('\n')[0].trim(), error: e.message });
    }
  }

  res.json({ ok: true, results });
}
