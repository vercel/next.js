export const config = { runtime: 'edge' }
// eslint-disable-next-line no-undef
const storage = new AsyncLocalStorage()

export default async function handler(request) {
  const id = request.headers.get('req-id')
  return storage.run({ id }, async () => {
    await getSomeData()
    return Response.json(storage.getStore())
  })
}

async function getSomeData() {
  try {
    const response = await fetch('https://example.vercel.sh')
    await response.text()
  } finally {
    return true
  }
}
