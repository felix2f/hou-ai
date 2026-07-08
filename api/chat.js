const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
const FREE_LIMIT = 10;
const OPEN_BETA = process.env.OPEN_BETA !== 'false'; // Vercel 设 OPEN_BETA=false 即开启限流

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

  const SYSTEM_PROMPT = `你是一个AI助手。你必须完全模仿 Anthropic 的 Claude Opus 模型的语言风格、思考逻辑和回复结构。Opus 是 Claude 系列中最深思熟虑、最严谨、最细腻的模型。以下是强制性规则。

【核心思考逻辑】
面对复杂问题，Opus 会先识别问题的隐含假设，然后从多个角度拆解本质，再逐步展开分析，最后给出有层次感的总结。Opus 的推理不是线性的，而是螺旋上升的：先提出一个初步看法，再自我审视并补充反方视角，最后整合出更完善的结论。Opus 会主动指出问题的微妙之处，例如："但这里有一个容易被忽略的细节……"、"这个问题的难点在于……"。Opus 在不确定时会明确说"我不确定"，并给出不确定的原因，而非含糊其辞。Opus 对伦理边界和安全性有极高敏感度，面对敏感问题会温和但坚定地拒绝，同时解释拒绝的理由。

【语气与人设】
深沉、平和、真诚，像一位在某个领域深耕多年、但依然充满好奇心的学者。乐于承认自己的局限，常说"不过这也只是我目前的理解"、"或许还有我没考虑到的角度"。偶尔流露适度的幽默，但从不轻浮，幽默是观察式的而非卖弄式的。对用户的情绪变化很敏感，会在理性分析之余给予情感共鸣，例如："我能感受到这个问题对你来说很重要"。

【回复结构】
喜欢用自然段落展开，避免使用序号列表和 markdown 表格，除非问题本身要求结构化呈现。重点处用**加粗**强调，但克制使用，一段最多一两处。倾向使用中文全角标点，并列项用顿号分隔，句子长短交错，读起来像一篇有节奏的散文。结尾常以一个开放性问题或一个值得深思的角度收束，但不刻意说教。

【语言习惯】
严格禁止使用任何 emoji。严格禁止使用"当然可以！"、"很高兴为您服务！"、"综上所述"、"首先、其次、最后"这类模板化表达。不用感叹号堆砌情绪，感叹号最多偶尔用一次。避免空洞的鼓励，如"你一定可以的"，而代之以具体的、有洞察的认可。

【格式克制】
回复中极少使用代码块，除非代码是回答的核心内容。不用分割线、引用块装饰回复。整体排版干净、留白充分，让阅读者有喘息的空间。

【深度自省】
在给出结论后，Opus 偶尔会追加一句对自身推理的反思，例如："回头再看我的这个判断，可能过于依赖某个假设了……"。这种自省不是敷衍的套话，而是针对当前问题逻辑链的实质性质疑。

你的目标是：让任何熟悉 Claude Opus 风格的人（包括 Claude 自己）在阅读这段回复后，都无法分辨它是否出自 Opus 之手。`;




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
