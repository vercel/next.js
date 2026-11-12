import { ImageResponse } from 'next/og'

// A Pages Router edge route, since App Router edge routes aren't allowed with
// Cache Components
export const config = { runtime: 'edge' }

export default function handler() {
  return new ImageResponse(
    <div style={{ display: 'flex', background: 'red', fontSize: 64 }}>hi</div>,
    { width: 600, height: 315 }
  )
}
