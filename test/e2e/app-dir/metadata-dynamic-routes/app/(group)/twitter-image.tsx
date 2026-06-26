import { ImageResponse } from 'next/og'

export const alt = 'Twitter'
export const size = { width: 1200, height: 675 }

export default function twitter() {
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
        group route twitter
      </div>
    ),
    size
  )
}

export const runtime = 'edge'
