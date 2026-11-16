import { ImageResponse } from 'next/og'

export async function Image({
  params,
  id,
}: {
  params: Promise<{ slug: string }>
  id: Promise<string>
}) {
  const { slug } = await params
  const imageId = await id
  return new ImageResponse(
    (
      <div style={{ display: 'flex', background: 'white', color: 'black' }}>
        {slug}:{imageId}
      </div>
    ),
    {
      width: 64,
      height: 64,
      headers: {
        'x-metadata-parent': slug,
        'x-metadata-id': imageId,
      },
    }
  )
}
