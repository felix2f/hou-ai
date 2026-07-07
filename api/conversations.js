const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;

const h = {
  'apikey': SUPABASE_KEY,
  'Authorization': `Bearer ${SUPABASE_KEY}`,
  'Content-Type': 'application/json',
};

async function getUserId(token) {
  const now = new Date().toISOString();
  const r = await fetch(
    `${SUPABASE_URL}/rest/v1/sessions?token=eq.${encodeURIComponent(token)}&expires_at=gte.${encodeURIComponent(now)}&select=user_id`,
    { headers: h }
  );
  const rows = await r.json();
  return Array.isArray(rows) && rows.length ? rows[0].user_id : null;
}

export default async function handler(req, res) {
  const token = (req.headers.authorization || '').replace('Bearer ', '').trim();
  if (!token) return res.status(401).json({ error: 'login_required' });

  let userId;
  try {
    userId = await getUserId(token);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
  if (!userId) return res.status(401).json({ error: 'login_required' });

  // GET — load all conversations
  if (req.method === 'GET') {
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/conversations?user_id=eq.${userId}&order=updated_at.desc&select=id,title,messages,updated_at`,
      { headers: h }
    );
    const data = await r.json();
    return res.json(Array.isArray(data) ? data : []);
  }

  // POST — upsert a conversation
  if (req.method === 'POST') {
    const { id, title, messages, updatedAt } = req.body || {};
    if (!id || !Array.isArray(messages)) return res.status(400).json({ error: 'missing fields' });

    const r = await fetch(`${SUPABASE_URL}/rest/v1/conversations`, {
      method: 'POST',
      headers: { ...h, 'Prefer': 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({
        id,
        user_id: userId,
        title: title || '新对话',
        messages,
        updated_at: new Date(updatedAt || Date.now()).toISOString(),
      }),
    });
    if (!r.ok) {
      const err = await r.text();
      return res.status(500).json({ error: err });
    }
    return res.json({ ok: true });
  }

  // DELETE — remove a conversation
  if (req.method === 'DELETE') {
    const id = req.query?.id;
    if (!id) return res.status(400).json({ error: 'missing id' });

    await fetch(
      `${SUPABASE_URL}/rest/v1/conversations?id=eq.${encodeURIComponent(id)}&user_id=eq.${userId}`,
      { method: 'DELETE', headers: h }
    );
    return res.json({ ok: true });
  }

  res.status(405).end();
}
