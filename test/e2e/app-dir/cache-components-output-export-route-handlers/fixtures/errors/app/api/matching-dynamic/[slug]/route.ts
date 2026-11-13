export const unstable_paramMatching = { slug: 'dynamic' } as const

export function generateStaticParams() {
  return [{ slug: 'known' }]
}

export function GET() {
  return new Response('known')
}
