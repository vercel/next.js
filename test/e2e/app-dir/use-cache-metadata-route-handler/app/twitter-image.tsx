import { cookies } from 'next/headers'
import { ImageResponse } from 'next/og'

export const contentType = 'image/png'
export const alt = 'Twitter'
export const size = { width: 1600, height: 900 }

export default function twitterImage() {
  return new ImageResponse(<AsyncTwitterImage />, size)
}

async function AsyncTwitterImage() {
  const cookieStore = await cookies()
  const numCookies = cookieStore.getAll().length

  const data = await fetch(
    'https://next-data-api-endpoint.vercel.app/api/random'
  ).then((res) => res.text())

  return (
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
      {data} {numCookies}
    </div>
  )
}
