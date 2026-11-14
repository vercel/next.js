export const unstable_paramMatching = { slug: 'blocking' } as const

export function generateStaticParams() {
  return [{ slug: 'known' }]
}

export function GET() {
  return new Response('known')
}
