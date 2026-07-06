const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;

const headers = (extra = {}) => ({
  'apikey': SUPABASE_KEY,
  'Authorization': `Bearer ${SUPABASE_KEY}`,
  'Content-Type': 'application/json',
  'Prefer': 'return=representation',
  ...extra
});

async function dbGet(path) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: headers() });
  return r.json();
}

async function dbPost(path, body) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method: 'POST', headers: headers(), body: JSON.stringify(body)
  });
  return r.json();
}

async function dbPatch(path, body) {
  await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method: 'PATCH', headers: headers({ 'Prefer': 'return=minimal' }), body: JSON.stringify(body)
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { phone, code } = req.body || {};
  if (!phone || !code) return res.status(400).json({ error: '参数缺失' });

  try {
    // 1. 验证码校验
    const now = new Date().toISOString();
    const codes = await dbGet(
      `sms_codes?phone=eq.${encodeURIComponent(phone)}&code=eq.${encodeURIComponent(code)}&used=eq.false&expires_at=gte.${encodeURIComponent(now)}&order=created_at.desc&limit=1`
    );
    if (!Array.isArray(codes) || !codes.length) {
      return res.status(400).json({ error: '验证码错误或已过期' });
    }

    // 2. 标记已使用
    await dbPatch(`sms_codes?id=eq.${codes[0].id}`, { used: true });

    // 3. 查找或创建用户
    let profiles = await dbGet(`profiles?phone=eq.${encodeURIComponent(phone)}&select=*`);
    let profile;
    if (!Array.isArray(profiles) || !profiles.length) {
      const created = await dbPost('profiles', { phone });
      profile = Array.isArray(created) ? created[0] : created;
    } else {
      profile = profiles[0];
    }

    // 4. 创建 session
    const token = crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '');
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    await dbPost('sessions', { user_id: profile.id, token, expires_at: expiresAt });

    res.json({
      ok: true,
      token,
      user: { phone: profile.phone, is_pro: profile.is_pro }
    });
  } catch (e) {
    console.error('verify-sms error:', e);
    res.status(500).json({ error: '服务器错误' });
  }
}
