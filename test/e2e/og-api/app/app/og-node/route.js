import { ImageResponse } from 'next/og'

export async function GET() {
  return new ImageResponse(<div>hi</div>, {
    width: 1200,
    height: 630,
  })
}
