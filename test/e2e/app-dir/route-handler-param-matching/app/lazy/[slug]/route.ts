console.log('lazy-handler-loaded')

export function generateStaticParams() {
  return [{ slug: 'allowed' }]
}

export function GET() {
  return new Response('cached handler')
}
