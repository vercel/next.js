export default function Page(req, res) {
  const { slug } = req.query
  res.end('slug: ' + slug)
}
