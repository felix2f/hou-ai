const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
const FREE_LIMIT = 10;

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();

  const token = (req.headers.authorization || '').replace('Bearer ', '').trim();
  if (!token) return res.status(401).json({ error: '未登录' });

  const h = { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` };

  try {
    const now = new Date().toISOString();
    const sessRes = await fetch(
      `${SUPABASE_URL}/rest/v1/sessions?token=eq.${encodeURIComponent(token)}&expires_at=gte.${encodeURIComponent(now)}&select=user_id`,
      { headers: h }
    );
    const sessions = await sessRes.json();
    if (!Array.isArray(sessions) || !sessions.length) {
      return res.status(401).json({ error: '登录已过期' });
    }
    const userId = sessions[0].user_id;

    const profRes = await fetch(
      `${SUPABASE_URL}/rest/v1/profiles?id=eq.${userId}&select=*`,
      { headers: h }
    );
    const profiles = await profRes.json();
    if (!Array.isArray(profiles) || !profiles.length) {
      return res.status(404).json({ error: '用户不存在' });
    }
    const profile = profiles[0];

    const today = new Date().toISOString().split('T')[0];
    const usageRes = await fetch(
      `${SUPABASE_URL}/rest/v1/usage_logs?user_id=eq.${userId}&date=eq.${today}&select=message_count`,
      { headers: h }
    );
    const logs = await usageRes.json();
    const usedToday = Array.isArray(logs) && logs.length ? logs[0].message_count : 0;

    const isPro = profile.is_pro && (!profile.pro_expires_at || new Date(profile.pro_expires_at) > new Date());

    res.json({
      phone: profile.phone,
      is_pro: isPro,
      used_today: usedToday,
      remaining: isPro ? null : Math.max(0, FREE_LIMIT - usedToday),
      limit: FREE_LIMIT
    });
  } catch (e) {
    console.error('me error:', e);
    res.status(500).json({ error: '服务器错误' });
  }
}
