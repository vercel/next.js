export default async function handler(req, res) {
  const { pathname, onlyGenerated = false } = req.body || {}
  if (
    req.method !== 'POST' ||
    typeof pathname !== 'string' ||
    !/^\/(fr\/)?pages-victim\//.test(pathname)
  )
    return res.status(400).end()
  await res.revalidate(pathname, { unstable_onlyGenerated: onlyGenerated })
  res.json({ revalidated: true })
}
