// The path is part of the fetch URL, so every route and slug has its own
// fetch cache entry. The revalidate interval also sets the cache lifetime of
// the ISR routes that call this.
export async function getData(path: string) {
  const res = await fetch(`${process.env.DATA_SERVICE_URL}/${path}`, {
    next: { tags: ['data'], revalidate: 3600 },
  })
  return res.text()
}
