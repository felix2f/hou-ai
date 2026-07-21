const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
const ADMIN_KEY = process.env.CODE;

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();

  const key = (req.headers['x-admin-key'] || '').trim();
  if (!ADMIN_KEY || key !== ADMIN_KEY) return res.status(403).json({ error: 'forbidden' });

  const h = {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
  };

  try {
    const ago30 = new Date(Date.now() - 30 * 60 * 1000).toISOString();

    const [pRes, uRes, eRes, fRes] = await Promise.all([
      fetch(`${SUPABASE_URL}/rest/v1/profiles?select=id,phone,is_pro,pro_expires_at,created_at&order=created_at.desc&limit=1000`, { headers: h }),
      fetch(`${SUPABASE_URL}/rest/v1/usage_logs?select=user_id,message_count&limit=5000`, { headers: h }),
      fetch(`${SUPABASE_URL}/rest/v1/events?created_at=gte.${encodeURIComponent(ago30)}&select=user_id&limit=2000`, { headers: h }),
      fetch(`${SUPABASE_URL}/rest/v1/events?name=eq.feedback&select=user_id,props,created_at&order=created_at.desc&limit=200`, { headers: h }),
    ]);

    const profiles = (await pRes.json().catch(() => [])) || [];
    const usageLogs = (await uRes.json().catch(() => [])) || [];
    const onlineEvents = (await eRes.json().catch(() => [])) || [];
    const feedbacks = (await fRes.json().catch(() => [])) || [];

    // 用量汇总
    const usageMap = {};
    if (Array.isArray(usageLogs)) {
      usageLogs.forEach(u => {
        usageMap[u.user_id] = (usageMap[u.user_id] || 0) + (u.message_count || 0);
      });
    }
    const totalMessages = Object.values(usageMap).reduce((a, b) => a + b, 0);

    // 在线用户（最近30分钟有事件）
    const onlineSet = new Set();
    if (Array.isArray(onlineEvents)) {
      onlineEvents.forEach(e => { if (e.user_id) onlineSet.add(e.user_id); });
    }

    // 手机号 map（用于 feedback 关联）
    const phoneMap = {};
    profiles.forEach(p => { phoneMap[p.id] = p.phone; });

    // 用户列表
    const userList = profiles.map(p => {
      const isPro = p.is_pro && (!p.pro_expires_at || new Date(p.pro_expires_at) > new Date());
      return {
        id: p.id,
        phone: p.phone,
        is_pro: isPro,
        created_at: p.created_at,
        messages: usageMap[p.id] || 0,
        online: onlineSet.has(p.id),
      };
    });

    const proCount = userList.filter(u => u.is_pro).length;

    const feedbackList = feedbacks.map(f => ({
      phone: f.user_id ? (phoneMap[f.user_id] || '未知') : '游客',
      content: f.props?.content || '',
      created_at: f.created_at,
    }));

    res.json({
      overview: {
        online: onlineSet.size,
        total_users: userList.length,
        pro_users: proCount,
        free_users: userList.length - proCount,
        total_messages: totalMessages,
        total_revenue: proCount * 9.9,
      },
      users: userList,
      feedbacks: feedbackList,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
