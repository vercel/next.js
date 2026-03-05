export function GET() {
  return new Response('explicit sitemap markdown route\n', {
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
    },
  })
}
