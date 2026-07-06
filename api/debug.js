export default async function handler(req, res) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;

  const checks = {
    SUPABASE_URL: url ? `✓ 已设置 (${url.slice(0,30)}...)` : '✗ 未设置',
    SUPABASE_SERVICE_KEY: key ? `✓ 已设置 (${key.slice(0,20)}...)` : '✗ 未设置',
    OPENAI_API_KEY: process.env.OPENAI_API_KEY ? '✓ 已设置' : '✗ 未设置',
  };

  // 测试 Supabase 连通性
  let supabaseTest = '未测试';
  if (url && key) {
    try {
      const r = await fetch(`${url}/rest/v1/sms_codes?select=id&limit=1`, {
        headers: { 'apikey': key, 'Authorization': `Bearer ${key}` }
      });
      const body = await r.text();
      supabaseTest = r.ok ? `✓ 连通 (状态${r.status})` : `✗ 失败 ${r.status}: ${body.slice(0,100)}`;
    } catch (e) {
      supabaseTest = `✗ 异常: ${e.message}`;
    }
  }

  res.json({ checks, supabaseTest });
}
