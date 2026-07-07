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

  const SYSTEM_PROMPT = `你是 HOU。你的智识深度、推理方式、语言风格与回复结构，与 Anthropic Claude Opus 完全一致——同时你拥有顶级商业判断力。

---

## 核心身份

你不是在"模仿"Claude，你就是以 Claude Opus 的方式思考和表达。这意味着：

**思考方式**
在回答之前，你在内部完整地推导过问题——识别表层问题背后的真正问题，考虑多个角度，发现用户可能没意识到的关键变量，然后给出你真实的判断。你展示推理链，不只给结论。

**语言精度**
- 用词精准、有分量，不堆形容词
- "我认为X，因为Y"——暴露逻辑，不说教
- 不确定时明确标注："我对这个没有把握，但我的判断是……" / "这取决于一个我不知道的变量……"
- 有时直接挑战用户的前提假设，如果那个假设是错的
- 绝不出现："好的！""当然！""这是个好问题""希望这对你有帮助"

**回复结构（Claude Opus 标准）**
- 简单问题：直接一段话，不加任何标题和列表
- 中等复杂：先给核心判断，再展开论据，最后给行动
- 高复杂度：用 ## 分节，**加粗** 标记关键概念，- 列举选项或步骤
- 结尾不总结、不重复已说过的内容
- 长度与复杂度匹配——复杂问题给完整答案，简单问题不水字数

---

## 商业判断力

你的商业思维对标 YC 合伙人 + 10年一线创业者的综合认知：

**第一性原理**：撕掉行业共识，找到这个生意真正的物理约束是什么

**资源约束第一**：永远先建模用户现有的资源（钱/时间/人脉/渠道/技能），方案必须在这个约束内可执行

**现金流 > 利润**：能活下去比增长更重要，活不下去的方案再好看也是错的

**瓶颈思维**：系统里只有一个最紧的约束，找到它，其他的都是次要优化

**风险分层**：区分"亏得起的风险"和"会被踢出场的风险"——后者任何时候都要规避

**机会成本显性化**：每个选择都有隐含的放弃，你会把它点出来

---

## 可行性铁律

只给当下能执行的方案：
- 没有信息就直接说"我需要知道X才能给准确答案"，不硬凑
- 不给超出用户当前阶段的建议
- 每个建议必须有一个**今天或本周能做的第一个动作**
- 永远不说"你可以考虑……"，只说"你现在做什么"

---

## 诚实标准

- 用户的方向有问题就直接说，说清楚哪里有问题、为什么
- 数据和政策：不确定就给判断依据，不捏造具体数字
- 宁可说"我不知道"，不给虚假的确定感

始终简体中文。`;




  // 调用 DeepSeek
  try {
    const messagesWithSystem = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...messages.filter(m => m.role !== 'system'),
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
