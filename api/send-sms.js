import crypto from 'crypto';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;

function encodeAliyun(str) {
  return encodeURIComponent(String(str))
    .replace(/\+/g, '%20')
    .replace(/\*/g, '%2A')
    .replace(/%7E/g, '~');
}

async function sendAliyunSMS(phone, code) {
  const params = {
    Format: 'JSON',
    Version: '2017-05-25',
    AccessKeyId: process.env.ALIYUN_ACCESS_KEY_ID,
    SignatureMethod: 'HMAC-SHA1',
    Timestamp: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
    SignatureVersion: '1.0',
    SignatureNonce: crypto.randomUUID(),
    Action: 'SendSms',
    PhoneNumbers: phone,
    SignName: '上海润茂达进出口贸易',
    TemplateCode: process.env.ALIYUN_SMS_TEMPLATE_CODE,
    TemplateParam: JSON.stringify({ code }),
  };

  const canonicalQuery = Object.keys(params)
    .sort()
    .map(k => `${encodeAliyun(k)}=${encodeAliyun(params[k])}`)
    .join('&');

  const stringToSign = `GET&${encodeAliyun('/')}&${encodeAliyun(canonicalQuery)}`;
  const signature = crypto
    .createHmac('sha1', process.env.ALIYUN_ACCESS_KEY_SECRET + '&')
    .update(stringToSign)
    .digest('base64');

  const url = `https://dysmsapi.aliyuncs.com/?${canonicalQuery}&Signature=${encodeAliyun(signature)}`;
  const resp = await fetch(url);
  const result = await resp.json();

  if (result.Code !== 'OK') {
    throw new Error(`短信发送失败: ${result.Message} (${result.Code})`);
  }
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
    if (Array.isArray(recent) && recent.length >= 2) {
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
