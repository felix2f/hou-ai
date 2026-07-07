const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;

const FC_URL = 'https://sms-relay-iuebrugwep.cn-shanghai.fcapp.run';
const FC_SECRET = 'hou_sms_relay_2026';

async function sendAliyunSMS(phone, code) {
  const resp = await fetch(FC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone, code, secret: FC_SECRET }),
    signal: AbortSignal.timeout(12000),
  });
  const result = await resp.json();
  if (!result.ok) throw new Error(result.error || '短信发送失败');
  return result;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { phone } = req.body || {};
  if (!phone || !/^1[3-9]\d{9}$/.test(phone)) {
    return res.status(400).json({ error: '请输入有效的手机号' });
  }

  const headers = {
    'apikey': SUPABASE_KEY,
    'Authorization': `Bearer ${SUPABASE_KEY}`,
    'Content-Type': 'application/json',
    'Prefer': 'return=minimal'
  };

  try {
    const oneMinAgo = new Date(Date.now() - 60000).toISOString();
    const checkRes = await fetch(
      `${SUPABASE_URL}/rest/v1/sms_codes?phone=eq.${encodeURIComponent(phone)}&created_at=gte.${encodeURIComponent(oneMinAgo)}&select=id`,
      { headers }
    );
    const recent = await checkRes.json();
    if (Array.isArray(recent) && recent.length >= 1) {
      return res.status(429).json({ error: '发送太频繁，请1分钟后再试' });
    }

    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();

    await fetch(`${SUPABASE_URL}/rest/v1/sms_codes`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ phone, code, expires_at: expiresAt, used: false }),
    });

    await sendAliyunSMS(phone, code);

    res.json({ ok: true });
  } catch (e) {
    console.error('send-sms error:', e);
    res.status(500).json({ error: '服务器错误，请重试' });
  }
}
