import { ImageResponse } from 'next/og'
import { connection } from 'next/server'

export async function GET() {
  // Render at request time, so that the image isn't prerendered during the build
  await connection()
  return new ImageResponse(
    <div style={{ display: 'flex', background: 'red', fontSize: 64 }}>hi</div>,
    { width: 600, height: 315 }
  )
}
