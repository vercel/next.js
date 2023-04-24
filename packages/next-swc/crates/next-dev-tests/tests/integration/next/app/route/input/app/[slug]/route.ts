import { type NextRequest } from 'next/server'

export const helloHandler = async (
  request: NextRequest,
  { params }: { params?: Record<string, string | string[]> }
): Promise<Response> => {
  const { pathname } = request.nextUrl

  return new Response(`hello ${params?.slug}`, {
    headers: {
      method: request.method,
      pathname,
    },
  })
}

export const GET = helloHandler
export const HEAD = helloHandler
export const OPTIONS = helloHandler
export const POST = helloHandler
export const PUT = helloHandler
export const DELETE = helloHandler
export const PATCH = helloHandler
