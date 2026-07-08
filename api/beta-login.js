const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;

const hdrs = (extra = {}) => ({
  'apikey': SUPABASE_KEY,
  'Authorization': `Bearer ${SUPABASE_KEY}`,
  'Content-Type': 'application/json',
  'Prefer': 'return=representation',
  ...extra,
});

async function dbGet(path) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: hdrs() });
  return r.json();
}

async function dbPost(path, body) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method: 'POST', headers: hdrs(), body: JSON.stringify(body),
  });
  return r.json();
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { phone } = req.body || {};
  if (!phone || !/^1[3-9]\d{9}$/.test(phone)) {
    return res.status(400).json({ error: '请输入有效手机号' });
  }

  try {
    let profiles = await dbGet(`profiles?phone=eq.${encodeURIComponent(phone)}&select=*`);
    let profile;
    const isNew = !Array.isArray(profiles) || !profiles.length;

    if (!isNew) {
      profile = profiles[0];
      // 频率限制：同一用户 60 秒内最多 3 次
      const oneMinAgo = new Date(Date.now() - 60000).toISOString();
      const recent = await dbGet(
        `sessions?user_id=eq.${profile.id}&created_at=gte.${encodeURIComponent(oneMinAgo)}&select=id`
      );
      if (Array.isArray(recent) && recent.length >= 3) {
        return res.status(429).json({ error: '操作太频繁，请稍后再试' });
      }
    } else {
      const created = await dbPost('profiles', { phone });
      profile = Array.isArray(created) ? created[0] : created;
    }

    const token = crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '');
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    await dbPost('sessions', { user_id: profile.id, token, expires_at: expiresAt });

    res.json({ ok: true, token, user: { phone: profile.phone, is_pro: profile.is_pro } });
  } catch (e) {
    console.error('beta-login error:', e.message);
    res.status(500).json({ error: e.message });
  }
}
