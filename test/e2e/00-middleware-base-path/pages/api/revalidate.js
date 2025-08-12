export default async function handler(req, res) {
  await res.revalidate(req.query.urlPath)
  res.json({ revalidated: true })
}
