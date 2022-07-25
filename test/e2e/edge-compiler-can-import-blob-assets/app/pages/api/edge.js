export const config = { runtime: 'experimental-edge' }

/**
 * @param {import('next/server').NextRequest} req
 */
export default async (req) => {
  const handlerName = req.nextUrl.searchParams.get('handler')
  const handler = handlers.get(handlerName) || defaultHandler
  return handler()
}

/**
 * @type {Map<string, () => Promise<Response>>}
 */
const handlers = new Map([
  [
    'text-file',
    async () => {
      const url = new URL('../../src/text-file.txt', import.meta.url)
      return fetch(url)
    },
  ],
  [
    'image-file',
    async () => {
      const url = new URL('../../src/vercel.png', import.meta.url)
      return fetch(url)
    },
  ],
  [
    'from-node-module',
    async () => {
      const url = new URL('my-pkg/hello/world.json', import.meta.url)
      return fetch(url)
    },
  ],
  [
    'remote-full',
    async () => {
      const url = new URL('https://example.vercel.sh')
      const response = await fetch(url)
      const headers = new Headers(response.headers)
      headers.delete('content-encoding')
      return new Response(response.body, { headers, status: response.status })
    },
  ],
  [
    'remote-with-base',
    async () => {
      const url = new URL('/', 'https://example.vercel.sh')
      const response = await fetch(url)
      const headers = new Headers(response.headers)
      headers.delete('content-encoding')
      return new Response(response.body, { headers, status: response.status })
    },
  ],
])

const defaultHandler = async () =>
  new Response('Invalid handler', { status: 400 })
