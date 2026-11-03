import { ImageResponse } from 'next/og'

export function generateImageMetadata() {
  if (process.env.NEXT_PHASE === 'phase-production-build') {
    return [
      {
        id: 'image',
        size: { width: 1200, height: 630 },
        contentType: 'image/png',
      },
    ]
  }

  throw new Error('unrendered slot image metadata error')
}

export default function OpenGraphImage() {
  return new ImageResponse(<div>image error slot</div>)
}
