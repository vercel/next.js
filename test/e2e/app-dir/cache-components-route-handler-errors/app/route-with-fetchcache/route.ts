export const fetchCache = 'force-cache'

export async function GET(request: Request) {
  return new Response('route GET with fetchCache')
}
