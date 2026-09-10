import { Suspense, type JSX } from 'react'
import { LinkAccordion } from './link-accordion'

export default function Page({
  searchParams,
}: {
  searchParams: Promise<{ slug?: string }>
}): JSX.Element {
  return (
    <Suspense>
      <PrefetchLink searchParams={searchParams} />
    </Suspense>
  )
}

async function PrefetchLink({
  searchParams,
}: {
  searchParams: Promise<{ slug?: string }>
}): Promise<JSX.Element | null> {
  const { slug } = await searchParams
  if (!slug) {
    return null
  }

  return <LinkAccordion href={`/${slug}`} />
}
