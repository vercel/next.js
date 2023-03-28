export const config = { runtime: 'edge' }

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
      return fetch(url)
    },
  ],
  [
    'remote-with-base',
    async () => {
      const url = new URL('/', 'https://example.vercel.sh')
      return fetch(url)
    },
  ],
])

const defaultHandler = async () =>
  new Response('Invalid handler', { status: 400 })
