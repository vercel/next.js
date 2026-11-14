export function generateImageMetadata() {
  return [{ id: 'generated' }]
}

export default function Image() {
  return new Response('generated image')
}
