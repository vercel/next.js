import { ImageResponse } from 'next/og'

export const unstable_paramMatching = { __metadata_id__: 'not-found' }

export function generateStaticParams() {
  return [{ __metadata_id__: 'allowed' }]
}

export default async function Image({
  params,
}: {
  params: Promise<{ __metadata_id__: string }>
}) {
  const { __metadata_id__ } = await params
  return new ImageResponse(
    <div style={{ display: 'flex', fontSize: 32 }}>{__metadata_id__}</div>,
    {
      width: 240,
      height: 80,
      headers: { 'x-metadata-parent': __metadata_id__ },
    }
  )
}
