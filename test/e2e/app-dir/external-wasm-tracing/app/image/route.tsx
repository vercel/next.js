import { ImageResponse } from '@takumi-rs/image-response'

export async function GET() {
  return new ImageResponse(<div>Hello, world!</div>, {
    width: 1200,
    height: 630,
    format: 'webp',
  })
}
