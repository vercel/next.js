import { ImageResponse } from 'next/og'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { getAllSlugs, posts } from '../../../lib/posts'

export const alt = 'Post share card'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default async function Image({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const post = posts[slug]
  const brandFont = await readFile(join(process.cwd(), 'assets', 'brand.ttf'))
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#0f172a',
          color: '#f8fafc',
          fontFamily: 'Brand',
        }}
      >
        <div style={{ fontSize: 72 }}>{post.title}</div>
        <div style={{ fontSize: 32, color: '#94a3b8' }}>{post.excerpt}</div>
      </div>
    ),
    {
      ...size,
      fonts: [{ name: 'Brand', data: brandFont, style: 'normal' }],
    }
  )
}

export function generateStaticParams() {
  return getAllSlugs().map((slug) => ({ slug }))
}
