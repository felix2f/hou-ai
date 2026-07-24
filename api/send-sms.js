import crypto from 'crypto';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
const AK_ID  = (process.env.ALIYUN_ACCESS_KEY_ID  || '').trim();
const AK_SEC = (process.env.ALIYUN_ACCESS_KEY_SECRET || '').trim();
const SIGN_NAME    = '上海润茂达进出口贸易';
const TEMPLATE_CODE = 'SMS_508920243';

function pct(s) {
  return encodeURIComponent(s).replace(/\+/g,'%20').replace(/\*/g,'%2A').replace(/%7E/g,'~');
}

async function sendSMS(phone, code) {
  const params = {
    AccessKeyId:      AK_ID,
    Action:           'SendSms',
    Format:           'JSON',
    PhoneNumbers:     phone,
    SignName:         SIGN_NAME,
    SignatureMethod:  'HMAC-SHA1',
    SignatureNonce:   crypto.randomUUID().replace(/-/g,''),
    SignatureVersion: '1.0',
    TemplateCode:     TEMPLATE_CODE,
    TemplateParam:    JSON.stringify({ code }),
    Timestamp:        new Date().toISOString().replace(/\.\d{3}Z$/,'Z'),
    Version:          '2017-05-25',
  };

  const sorted = Object.keys(params).sort();
  const qs = sorted.map(k => `${pct(k)}=${pct(params[k])}`).join('&');
  const toSign = `GET&${pct('/')}&${pct(qs)}`;
  const sig = crypto.createHmac('sha1', `${AK_SEC}&`).update(toSign).digest('base64');

  const url = `https://dysmsapi.aliyuncs.com/?${qs}&Signature=${pct(sig)}`;
  const resp = await fetch(url, { signal: AbortSignal.timeout(10000) });
  const json = await resp.json();
  if (json.Code !== 'OK') throw new Error(json.Message || json.Code || '发送失败');
  return json;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  if (!AK_ID || !AK_SEC)
    return res.status(500).json({ error: 'SMS配置缺失，请联系管理员' });

  const { phone } = req.body || {};
  if (!phone || !/^1[3-9]\d{9}$/.test(phone))
    return res.status(400).json({ error: '请输入有效的手机号' });

  const hdrs = {
    'apikey': SUPABASE_KEY,
    'Authorization': `Bearer ${SUPABASE_KEY}`,
    'Content-Type': 'application/json',
    'Prefer': 'return=minimal'
  };

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

  // 发短信
  try {
    await sendSMS(phone, code);
    res.json({ ok: true });
  } catch (e) {
    console.error('[aliyun-sms]', e.message);
    res.status(500).json({ error: e.message });
  }
}
