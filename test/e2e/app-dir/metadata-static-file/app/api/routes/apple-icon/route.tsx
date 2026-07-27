import { ImageResponse } from 'next/og'

export function GET() {
  return new ImageResponse(<div>A</div>)
}
