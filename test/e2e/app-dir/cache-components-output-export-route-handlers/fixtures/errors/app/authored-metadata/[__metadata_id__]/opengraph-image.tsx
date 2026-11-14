export function generateStaticParams() {
  return [{ __metadata_id__: 'known' }]
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
