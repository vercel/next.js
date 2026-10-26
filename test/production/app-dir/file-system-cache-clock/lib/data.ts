// Each caller passes its own name, so every page and route has its own fetch
// cache entry.
export async function getData(name: string) {
  const res = await fetch(`${process.env.DATA_SERVICE_URL}${name}`, {
    cache: 'force-cache',
    next: { tags: ['data'] },
  })
  return res.text()
}
