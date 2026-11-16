export async function generateImageMetadata() {
  const response = await fetch(`${process.env.CC_EXPORT_DATA_URL}/image`, {
    cache: 'no-store',
  })
  return response.json()
}

export default function Image() {
  return new Response('image')
}
