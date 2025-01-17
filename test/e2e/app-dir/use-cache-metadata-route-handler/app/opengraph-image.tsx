import { ImageResponse } from 'next/og'

export const alt = 'About Acme'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

async function fetchPostData() {
  'use cache'

  return { title: 'Test', created: Date.now() }
}

export default async function Image() {
  const post = await fetchPostData()

  return new ImageResponse(
    (
      <div
        style={{
          fontSize: 48,
          background: 'white',
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'column',
        }}
      >
        <h1>{post.title}</h1>
        <p style={{ fontSize: 32 }}>
          {new Date(post.created).toLocaleTimeString()}
        </p>
      </div>
    ),
    size
  )
}
