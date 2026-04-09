import { ImageResponse } from 'next/og'

export const alt = 'Open Graph'

export default async function og({ params }) {
  const { size } = await params
  const big = size === 'big'
  const background = big ? 'orange' : '#000'
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
        }}
      >
        <div
          style={{
            width: 200,
            height: 200,
            background,
          }}
        />
      </div>
    ),
    {
      width: big === true ? 1200 : 600,
      height: big === true ? 630 : 315,
    }
  )
}
