import { ImageResponse } from 'next/og'

export async function Image({
  params,
  id,
}: {
  params: Promise<Record<string, string>>
  id: Promise<string>
}) {
  const values = await params
  const imageId = await id
  return new ImageResponse(
    (
      <div style={{ display: 'flex', background: 'white', color: 'black' }}>
        {Object.values(values).join(':')}:{imageId}
      </div>
    ),
    {
      width: 48,
      height: 48,
      headers: { 'x-metadata-id': imageId },
    }
  )
}
