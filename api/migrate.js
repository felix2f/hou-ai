// 临时迁移端点，建表完成后删除
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
const SECRET = 'hou_migrate_2026_oneshot';

export default async function handler(req, res) {
  if (req.query.secret !== SECRET) return res.status(403).end();

  // 从 URL 提取 project ref: https://<ref>.supabase.co
  const ref = new URL(SUPABASE_URL).hostname.split('.')[0];

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
    const label = sql.trim().split('\n')[0].trim();
    try {
      const r = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${SUPABASE_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query: sql }),
      });
      const body = await r.text();
      results.push({ label, status: r.status, body });
    } catch (e) {
      results.push({ label, error: e.message });
    }
  }

  res.json({ ok: true, results });
}
