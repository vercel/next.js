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
])

const defaultHandler = async () =>
  new Response('Invalid handler', { status: 400 })
