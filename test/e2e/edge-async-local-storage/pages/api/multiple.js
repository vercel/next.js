export const config = { runtime: 'edge' }
// eslint-disable-next-line no-undef
const topStorage = new AsyncLocalStorage()

export default async function handler(request) {
  const id = request.headers.get('req-id')
  return topStorage.run({ id }, async () => {
    const nested = await getSomeData(id)
    return Response.json({ ...nested, ...topStorage.getStore() })
  })
}

async function getSomeData(id) {
  // eslint-disable-next-line no-undef
  const nestedStorage = new AsyncLocalStorage()
  return nestedStorage.run('nested-' + id, async () => {
    try {
      const response = await fetch('https://example.vercel.sh')
      await response.text()
    } finally {
      return { nestedId: nestedStorage.getStore() }
    }
  })
}
