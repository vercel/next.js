export default async function handler(req, res) {
  try {
    await res.revalidate(req.query.path)
    return res.json({ revalidated: true, now: Date.now() })
  } catch (err) {
    console.error('Failed to revalidate', req.query, err)
    return res.json({ revalidated: false })
  }
}
