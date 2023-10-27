const helloHandler = async () => {
  if (typeof WebSocket === 'undefined') {
    throw new Error('missing WebSocket constructor!!')
  }

  return new Response('hello, world')
}

export const GET = helloHandler
export const HEAD = helloHandler
export const OPTIONS = helloHandler
export const POST = helloHandler
export const PUT = helloHandler
export const DELETE = helloHandler
export const PATCH = helloHandler
