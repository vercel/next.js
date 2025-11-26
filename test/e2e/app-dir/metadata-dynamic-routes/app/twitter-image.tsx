import { ImageResponse } from 'next/og'
import { ImageResponse as ImageResponse2 } from '@vercel/og'

// Node.js: Using @vercel/og external package, and should be aliased to "next/server" ImageResponse
// @ts-ignore
if (ImageResponse2.displayName !== ImageResponse.displayName)
  // @ts-ignore
  throw new Error('ImageResponse mismatch: ' + ImageResponse2.displayName)

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
