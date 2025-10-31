import { Viewport } from 'next'

export async function generateViewport({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}): Promise<Viewport> {
  'use cache'
  const color = (await searchParams).color

  return { themeColor: String(color) }
}

export default function Page() {
  return null
}
