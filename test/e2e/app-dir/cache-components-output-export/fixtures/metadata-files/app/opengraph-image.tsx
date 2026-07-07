import { ImageResponse } from 'next/og'

export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default function Image() {
  return new ImageResponse(
    <div style={{ fontSize: 96, width: '100%', height: '100%' }}>og-image</div>,
    size
  )
}
