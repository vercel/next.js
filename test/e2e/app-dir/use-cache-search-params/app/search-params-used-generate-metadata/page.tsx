import { Metadata } from 'next'

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}): Promise<Metadata> {
  'use cache'
  const title = (await searchParams).title

  return { title: String(title) }
}

export default function Page() {
  return null
}
