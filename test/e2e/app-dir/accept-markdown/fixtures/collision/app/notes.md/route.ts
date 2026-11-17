export const dynamic = 'force-static'

export function GET() {
  return new Response('# User notes route\n', {
    headers: { 'content-type': 'text/markdown; charset=utf-8' },
  })
}
