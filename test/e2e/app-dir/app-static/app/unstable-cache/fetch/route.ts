import { revalidateTag, unstable_cache } from 'next/cache'

export const dynamic = 'force-dynamic'

const getData = unstable_cache(
  async (address: string): Promise<string> => {
    const res = await fetch(address, {
      cache: 'force-cache',
      next: { tags: ['unstable-cache-inner-fetch'] },
    })

    const data = await res.text()

    return JSON.stringify({
      random: Math.floor(Math.random() * 100).toString(),
      data,
    })
  },
  undefined,
  {
    tags: ['unstable-cache-fetch'],
  }
)

export const GET = async (request: Request): Promise<Response> => {
  const address = request.headers.get('x-test-data-server')
  if (!address) {
    return new Response('Missing address', { status: 400 })
  }

  const data = await getData(address)

  return new Response(data, {
    headers: {
      'Content-Type': 'application/json',
    },
  })
}

export const DELETE = async (request: Request): Promise<Response> => {
  const url = new URL(request.url)
  const tags = url.searchParams.getAll('tag')

  for (const tag of tags) {
    revalidateTag(tag)
  }

  return new Response('OK', { status: 200 })
}
