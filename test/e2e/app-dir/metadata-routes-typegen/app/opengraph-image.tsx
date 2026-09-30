import { ImageResponse } from 'next/og'

export const alt = 'Open Graph image'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default function OpengraphImage() {
  return new ImageResponse(<div style={{ display: 'flex' }}>hello</div>, size)
}
