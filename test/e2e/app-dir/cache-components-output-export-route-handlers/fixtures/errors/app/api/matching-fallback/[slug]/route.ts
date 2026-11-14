export const unstable_paramMatching = { slug: 'fallback' } as const

export function generateStaticParams() {
  return [{ slug: 'known' }]
}

export function GET() {
  return new Response('known')
}
