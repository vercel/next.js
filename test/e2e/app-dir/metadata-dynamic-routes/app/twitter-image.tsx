import { ImageResponse } from '@vercel/og'

export const alt = 'Twitter'
export const size = { width: 1600, height: 900 }

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
        Twitter Image
      </div>
    ),
    size
  )
}
