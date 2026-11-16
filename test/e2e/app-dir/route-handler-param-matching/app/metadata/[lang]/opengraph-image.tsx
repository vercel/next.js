import { ImageResponse } from 'next/og'

export const unstable_paramMatching = { lang: 'not-found' }

export function generateStaticParams() {
  return [{ lang: 'en' }]
}

export default async function Image({
  params,
}: {
  params: Promise<{ lang: string }>
}) {
  const { lang } = await params
  return new ImageResponse(
    <div style={{ display: 'flex', fontSize: 32 }}>Language: {lang}</div>,
    { width: 240, height: 80 }
  )
}
