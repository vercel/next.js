import { ImageResponse } from 'next/og'

// The site's default share image: a static route, rendered once per build.
export const alt = 'Northfold Supply'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default function SiteImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#1d2a26',
          color: '#f4f1ea',
          fontSize: 96,
        }}
      >
        Northfold Supply
      </div>
    ),
    size
  )
}
