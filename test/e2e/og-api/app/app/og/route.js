import { ImageResponse } from '@vercel/og'

export async function GET() {
  return new ImageResponse(<div>hi</div>, {
    width: 1200,
    height: 630,
  })
}

export const runtime = 'edge'
