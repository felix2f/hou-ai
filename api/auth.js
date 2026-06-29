export default function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const { password } = req.body;
  if (password && password === process.env.CODE) {
    res.json({ ok: true });
  } else {
    res.json({ ok: false });
  }
}
