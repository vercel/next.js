export default async (req, res) => {
  console.log(req.url, 'query', req.query)
  res.json({
    url: req.url,
    query: req.query,
    // make sure fetch if polyfilled
    example: await fetch('https://example.vercel.sh').then((res) => res.text()),
  })
}
