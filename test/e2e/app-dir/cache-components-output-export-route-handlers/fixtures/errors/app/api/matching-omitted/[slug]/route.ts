export function generateStaticParams() {
  return [{ slug: 'known' }]
}

export function GET() {
  return new Response('known')
}
