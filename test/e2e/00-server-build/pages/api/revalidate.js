export default async function handler(req, res) {
  try {
    console.log('revalidating', req.query.urlPath)
    await res.revalidate(req.query.urlPath)
    return res.json({ revalidated: true })
  } catch (err) {
    console.error(err)
    return res.json({ revalidated: false })
  }
}
