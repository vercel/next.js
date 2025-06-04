export default async function handler(req, res) {
  const { path } = req.query
  try {
    await res.revalidate(path)
    return res.json({ revalidated: true })
  } catch (err) {
    console.error('Failed to revalidate:', err)
  }

  res.json({ revalidated: false })
}
