import { ImageResponse } from 'next/og'
import { getAllSlugs } from '../../data'

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
          fontSize: 88,
          background: 'lavender',
        }}
      >
        Posts: {getAllSlugs().join(', ')}
      </div>
    )
  )
}
