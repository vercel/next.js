import { ImageResponse } from 'next/og'

export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

// The top-level await makes this an async module that's also evaluated during
// the page's prerender, via the metadata image route's exports. Real-world
// equivalent: loading font files with `await readFile(...)`. The delay must
// outlast the prerender's cache reads.
await new Promise((resolve) => setTimeout(resolve, 5000))

export async function generateImage(text: string) {
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
          background: '#fff',
          color: '#000',
        }}
      >
        {text}
      </div>
    ),
    size
  )
}
