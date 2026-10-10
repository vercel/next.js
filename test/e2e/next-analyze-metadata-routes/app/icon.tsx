import { ImageResponse } from 'next/og'

export function generateImageMetadata() {
  return [32, 192].map((px) => ({
    id: String(px),
    size: { width: px, height: px },
    contentType: 'image/png',
  }))
}

export default async function Icon({ id }: { id: Promise<string> }) {
  const px = Number(await id)
  return new ImageResponse(
    <div style={{ width: px, height: px, background: 'black' }} />,
    { width: px, height: px }
  )
}
