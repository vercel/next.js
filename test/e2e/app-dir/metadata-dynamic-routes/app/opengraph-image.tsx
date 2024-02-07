import { ImageResponse } from 'next/og'

export const alt = 'Open Graph'

/* without generateImageMetadata */
export default function og() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 128,
          background: 'lavender',
        }}
      >
        Open Graph
      </div>
    )
  )
}
