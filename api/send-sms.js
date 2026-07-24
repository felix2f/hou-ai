const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
const RELAY_URL    = (process.env.SMS_RELAY_URL   || '').trim();
const RELAY_SECRET = (process.env.HOU_SMS_SECRET  || '').trim();

const hdrs = {
  'apikey': SUPABASE_KEY,
  'Authorization': `Bearer ${SUPABASE_KEY}`,
  'Content-Type': 'application/json',
  'Prefer': 'return=minimal'
};

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  if (!RELAY_URL)
    return res.status(500).json({ error: 'SMS中转未配置' });

  const { phone } = req.body || {};
  if (!phone || !/^1[3-9]\d{9}$/.test(phone))
    return res.status(400).json({ error: '请输入有效的手机号' });

  // 频率限制：1分钟内只发1次
  try {
    const oneMinAgo = new Date(Date.now() - 60000).toISOString();
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/sms_codes?phone=eq.${encodeURIComponent(phone)}&created_at=gte.${encodeURIComponent(oneMinAgo)}&select=id`,
      { headers: hdrs }
    );
    const recent = await r.json();
    if (Array.isArray(recent) && recent.length >= 1)
      return res.status(429).json({ error: '发送太频繁，请1分钟后再试' });
  } catch (e) { console.error('[rate-check]', e.message); }

  const code = Math.floor(100000 + Math.random() * 900000).toString();
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();

  // 存 Supabase
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/sms_codes`, {
      method: 'POST', headers: hdrs,
      body: JSON.stringify({ phone, code, expires_at: expiresAt, used: false }),
    });
  } catch (e) { console.error('[supabase-save]', e.message); }

  // 调阿里云FC中转发短信
  try {
    const r = await fetch(RELAY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone, code, secret: RELAY_SECRET }),
      signal: AbortSignal.timeout(9000)
    });
    const d = await r.json();
    if (!d.ok) return res.status(500).json({ error: d.error || '发送失败' });
    res.json({ ok: true });
  } catch (e) {
    console.error('[sms-relay]', e.message);
    res.status(500).json({ error: e.message });
  }
}
