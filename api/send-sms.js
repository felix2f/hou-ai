const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;

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
    // 频率限制：1分钟内最多2条
    const oneMinAgo = new Date(Date.now() - 60000).toISOString();
    const checkRes = await fetch(
      `${SUPABASE_URL}/rest/v1/sms_codes?phone=eq.${encodeURIComponent(phone)}&created_at=gte.${encodeURIComponent(oneMinAgo)}&select=id`,
      { headers }
    );
    const recent = await checkRes.json();
    if (Array.isArray(recent) && recent.length >= 2) {
      return res.status(429).json({ error: '发送太频繁，请1分钟后再试' });
    }

    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();

    await fetch(`${SUPABASE_URL}/rest/v1/sms_codes`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ phone, code, expires_at: expiresAt, used: false })
    });

    // TODO: 接入真实短信服务（阿里云/腾讯云）
    // const smsResult = await sendAliyunSMS(phone, code);

    // 开发模式：响应中返回验证码，上线后删除 _dev_code
    res.json({ ok: true, _dev_code: code });
  } catch (e) {
    console.error('send-sms error:', e);
    res.status(500).json({ error: '服务器错误，请重试' });
  }
}
