export function generateStaticParams() {
  return [{ slug: 'known' }]
}

export async function generateImageMetadata() {
  'use cache'
  return [{ id: 'one', size: { width: 1, height: 1 } }]
}

export default function Image() {
  return new Response(
    Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jhSEAAAAASUVORK5CYII=',
      'base64'
    ),
    { headers: { 'content-type': 'image/png' } }
  )
}
