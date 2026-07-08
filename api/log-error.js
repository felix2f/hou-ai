const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  res.setHeader('Access-Control-Allow-Origin', '*');

  const { message, source, line_no, col_no, stack, url } = req.body || {};
  const user_agent = req.headers['user-agent'] || '';

  // 鉴权（可选，有 token 就记录 user_id）
  let user_id = null;
  const token = (req.headers.authorization || '').replace('Bearer ', '').trim();
  if (token) {
    try {
      const now = new Date().toISOString();
      const r = await fetch(
        `${SUPABASE_URL}/rest/v1/sessions?token=eq.${encodeURIComponent(token)}&expires_at=gte.${encodeURIComponent(now)}&select=user_id`,
        { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } }
      );
      const sess = await r.json();
      if (Array.isArray(sess) && sess[0]) user_id = sess[0].user_id;
    } catch {}
  }

  try {
    await fetch(`${SUPABASE_URL}/rest/v1/error_logs`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({ message, source, line_no, col_no, stack, url, user_agent, user_id }),
    });
    res.status(204).end();
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
