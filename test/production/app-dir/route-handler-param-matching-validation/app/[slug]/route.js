export const unstable_paramMatching = { slug: 'not-found' }
export function generateStaticParams() {
  return [{ slug: 'allowed' }]
}
export function GET() {
  return new Response('allowed')
}
