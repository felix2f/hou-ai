const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
const FREE_LIMIT = 10;
const OPEN_BETA = true; // 内测期间免费，关闭时改为 false

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { messages } = req.body;
  const token = (req.headers.authorization || '').replace('Bearer ', '').trim();

  if (!token) return res.status(401).json({ error: 'login_required' });

  const h = {
    'apikey': SUPABASE_KEY,
    'Authorization': `Bearer ${SUPABASE_KEY}`,
    'Content-Type': 'application/json',
    'Prefer': 'return=representation'
  };

  // 验证 session
  const now = new Date().toISOString();
  const sessRes = await fetch(
    `${SUPABASE_URL}/rest/v1/sessions?token=eq.${encodeURIComponent(token)}&expires_at=gte.${encodeURIComponent(now)}&select=user_id`,
    { headers: h }
  );
  const sessions = await sessRes.json();
  if (!Array.isArray(sessions) || !sessions.length) {
    return res.status(401).json({ error: 'login_required' });
  }
  const userId = sessions[0].user_id;

  // 获取用户 pro 状态
  const profRes = await fetch(
    `${SUPABASE_URL}/rest/v1/profiles?id=eq.${userId}&select=is_pro,pro_expires_at`,
    { headers: h }
  );
  const profiles = await profRes.json();
  const profile = Array.isArray(profiles) && profiles[0];
  const isPro = profile && profile.is_pro && (!profile.pro_expires_at || new Date(profile.pro_expires_at) > new Date());

  // 免费用户用量检查
  if (!OPEN_BETA && !isPro) {
    const today = new Date().toISOString().split('T')[0];
    const usageRes = await fetch(
      `${SUPABASE_URL}/rest/v1/usage_logs?user_id=eq.${userId}&date=eq.${today}&select=id,message_count`,
      { headers: h }
    );
    const logs = await usageRes.json();
    const used = Array.isArray(logs) && logs.length ? logs[0].message_count : 0;

    if (used >= FREE_LIMIT) {
      return res.status(403).json({ error: 'limit_reached', used, limit: FREE_LIMIT });
    }

    // 递增用量
    if (Array.isArray(logs) && logs.length) {
      await fetch(`${SUPABASE_URL}/rest/v1/usage_logs?id=eq.${logs[0].id}`, {
        method: 'PATCH', headers: h, body: JSON.stringify({ message_count: used + 1 })
      });
    } else {
      await fetch(`${SUPABASE_URL}/rest/v1/usage_logs`, {
        method: 'POST', headers: h,
        body: JSON.stringify({ user_id: userId, date: today, message_count: 1 })
      });
    }
  }

  const SYSTEM_PROMPT = `你是 HOU。你的思考方式、语言风格、回复结构完全复刻 Anthropic 的 Claude——但你同时拥有顶级商业头脑。

---

## 语言风格（严格执行）

**完全模仿 Claude 的表达方式：**
- 开门见山，第一句就是核心判断，不铺垫不寒暄
- 用"我认为……因为……"暴露推理链，不只给结论
- 承认不确定性时直说："我对这个不太确定，但我的判断是……"
- 语气像一个比你聪明、不需要你认可的朋友，不是客服
- 不说"好的！""当然可以！""这是个很好的问题"——直接进入实质
- 措辞精准，不堆砌形容词，不用"非常""极其""超级"
- 复杂问题用 markdown 结构（##标题、**加粗关键词**、- 列表），简单问题纯文字直接回答
- 有时会反问用户一个关键问题，因为缺少这个信息无法给出精准建议

## 商业思维（核心能力）

你拥有 Forbes 前十创业者的商业直觉：
- **第一性原理**：剥掉表象，找到问题的物理层本质
- **资源约束思维**：永远先问"你现在有什么"——资金、时间、人脉、技能，再给方案
- **机会成本**：每个方案背后都有放弃的成本，你会点出来
- **现金流优先**：比起远期收益，更关注用户当下能不能活下去
- **瓶颈识别**：找到限制系统增长的那一个约束，集中攻击它
- **风险分层**：区分"可以承受的风险"和"会让你出局的风险"

## 可行性铁律

**只给当下可执行的方案：**
- 方案必须匹配用户的当前资源（钱、时间、能力、渠道）
- 没有"你可以考虑……"这种废话，只有"你现在具体做什么"
- 如果信息不够无法给精准建议，直接说"我需要知道X才能给你准确答案"
- 不给超出用户当前阶段的建议（没有团队就不谈管理，没有现金流就不谈扩张）

## 精准度

- 数据、平台规则、政策：不确定就说不确定，给判断依据
- 宁可说"我不知道"，不捏造
- 始终简体中文`;


  // 调用 DeepSeek
  try {
    const messagesWithSystem = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...messages
    ];
    const upstream = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ model: 'deepseek-v4-pro', messages: messagesWithSystem, stream: true })
    });

    if (!upstream.ok) {
      const err = await upstream.text();
      return res.status(upstream.status).json({ error: err });
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('X-Accel-Buffering', 'no');

    const reader = upstream.body.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(value);
    }
    res.end();
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
