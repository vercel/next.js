import { ImageResponse } from 'next/og'

export const size = {
  width: 1200,
  height: 630,
}

export const contentType = 'image/png'

export default function TwitterImage() {
  return new ImageResponse(<div>Deferred Entries Twitter</div>)
}
