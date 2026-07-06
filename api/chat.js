const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
const FREE_LIMIT = 10;
const OPEN_BETA = true; // 内测期间免费，关闭时改为 false

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { messages } = req.body;
  const token = (req.headers.authorization || '').replace('Bearer ', '').trim();

  if (!token) return res.status(401).json({ error: 'login_required' });

  const h = {
    'apikey': SUPABASE_KEY,
    'Authorization': `Bearer ${SUPABASE_KEY}`,
    'Content-Type': 'application/json',
    'Prefer': 'return=representation'
  };

  // 验证 session
  const now = new Date().toISOString();
  const sessRes = await fetch(
    `${SUPABASE_URL}/rest/v1/sessions?token=eq.${encodeURIComponent(token)}&expires_at=gte.${encodeURIComponent(now)}&select=user_id`,
    { headers: h }
  );
  const sessions = await sessRes.json();
  if (!Array.isArray(sessions) || !sessions.length) {
    return res.status(401).json({ error: 'login_required' });
  }
  const userId = sessions[0].user_id;

  // 获取用户 pro 状态
  const profRes = await fetch(
    `${SUPABASE_URL}/rest/v1/profiles?id=eq.${userId}&select=is_pro,pro_expires_at`,
    { headers: h }
  );
  const profiles = await profRes.json();
  const profile = Array.isArray(profiles) && profiles[0];
  const isPro = profile && profile.is_pro && (!profile.pro_expires_at || new Date(profile.pro_expires_at) > new Date());

  // 免费用户用量检查
  if (!OPEN_BETA && !isPro) {
    const today = new Date().toISOString().split('T')[0];
    const usageRes = await fetch(
      `${SUPABASE_URL}/rest/v1/usage_logs?user_id=eq.${userId}&date=eq.${today}&select=id,message_count`,
      { headers: h }
    );
    const logs = await usageRes.json();
    const used = Array.isArray(logs) && logs.length ? logs[0].message_count : 0;

    if (used >= FREE_LIMIT) {
      return res.status(403).json({ error: 'limit_reached', used, limit: FREE_LIMIT });
    }

    // 递增用量
    if (Array.isArray(logs) && logs.length) {
      await fetch(`${SUPABASE_URL}/rest/v1/usage_logs?id=eq.${logs[0].id}`, {
        method: 'PATCH', headers: h, body: JSON.stringify({ message_count: used + 1 })
      });
    } else {
      await fetch(`${SUPABASE_URL}/rest/v1/usage_logs`, {
        method: 'POST', headers: h,
        body: JSON.stringify({ user_id: userId, date: today, message_count: 1 })
      });
    }
  }

  // 调用 DeepSeek
  try {
    const upstream = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ model: 'deepseek-v4-pro', messages, stream: true })
    });

    if (!upstream.ok) {
      const err = await upstream.text();
      return res.status(upstream.status).json({ error: err });
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('X-Accel-Buffering', 'no');

    const reader = upstream.body.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(value);
    }
    res.end();
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
