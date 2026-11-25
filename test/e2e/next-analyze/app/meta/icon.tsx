import { ImageResponse } from 'next/og'

// `generateImageMetadata` makes this a `/meta/icon/[__metadata_id__]` route in
// the routes manifest, while the analyzer writes its data under `/meta/icon`.
export function generateImageMetadata() {
  return [
    { id: 'small', size: { width: 32, height: 32 }, contentType: 'image/png' },
    { id: 'large', size: { width: 64, height: 64 }, contentType: 'image/png' },
  ]
}

export default async function Icon({ id }: { id: Promise<string> }) {
  const iconId = await id
  return new ImageResponse(<div>{iconId}</div>, { width: 32, height: 32 })
}
