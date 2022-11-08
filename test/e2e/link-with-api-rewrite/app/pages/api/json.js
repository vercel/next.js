export default async function handler(req, res) {
  const from = req.query.from || ''

  return res.json({ from })
}
