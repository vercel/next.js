import { ImageResponse } from 'next/og'

export default function Image() {
  return new ImageResponse(<div>Twitter image</div>)
}

export function generateImageMetadata() {
  return [{ id: 'small', size: { width: 100, height: 100 } }]
}
