export const unstable_paramMatching = { slug: 'not-found' } as const

export function generateStaticParams() {
  return [{ slug: 'known' }, { slug: 'empty' }]
}

export async function generateImageMetadata({
  params,
}: {
  params: { slug: string }
}) {
  'use cache'
  if (params.slug === 'empty') return []
  return ['small', 'large'].map((size) => ({
    id: `${params.slug}-${size}`,
    size: { width: 1, height: 1 },
    contentType: 'image/png',
  }))
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
